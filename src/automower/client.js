// -----------------------------------------------------------------------------
// The Automower Connect REST client (https://api.amc.husqvarna.dev/v1), as
// raw JSON:API documents: turning them into values is model.js's job. Every
// endpoint and request body of the integration lives here.
//
//   GET  /mowers                 every mower of the account
//   GET  /mowers/{id}            one mower (the read back after a command)
//   POST /mowers/{id}/actions    { data: { type, attributes? } } -> 202
//        Start {duration}, Park {duration}, ParkUntilNextSchedule,
//        ParkUntilFurtherNotice, Pause, ResumeSchedule
//
// Headers: Authorization: Bearer <token>, X-Api-Key: <application key>,
// Authorization-Provider: husqvarna, Content-Type: application/vnd.api+json.
// Two calls are at least REQUEST_SPACING apart (published limit: 120 per
// minute and 21,000 per week and application key).
// -----------------------------------------------------------------------------

import { API_URL, REQUEST_SPACING } from '../constants.js';
import { HttpError, request } from '../http.js';

export class AutomowerError extends Error {
  /**
   * `code`: no_credentials | refused | scope (final until the configuration
   * changes) | unauthorized | forbidden | rate_limited | not_found |
   * bad_request | http | timeout | network.
   */
  constructor(code, message, status, retryAfterMs) {
    super(message);
    this.name = 'AutomowerError';
    this.code = code;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }

  get final() {
    return ['no_credentials', 'refused', 'scope'].includes(this.code);
  }
}

/** A failure before any HTTP status: a timeout or a network error. */
export function transportError(err, what) {
  if (err instanceof AutomowerError) {
    return err;
  }
  const timeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
  return new AutomowerError(
    timeout ? 'timeout' : 'network',
    timeout ? `${what} did not answer in time` : `network error (${err?.message ?? err})`,
  );
}

/** The message of a JSON:API error document, or of the API gateway's { message }. */
export function apiErrorOf(body) {
  if (typeof body === 'string') {
    return body.slice(0, 200) || undefined;
  }
  const error = Array.isArray(body?.errors) ? body.errors[0] : undefined;
  const text = error?.detail ?? error?.title ?? body?.message;
  return text ? String(text).slice(0, 200) : undefined;
}

const retryAfterOf = (headers) => {
  const value = typeof headers?.get === 'function' ? headers.get('retry-after') : null;
  const seconds = Number(value);
  return value !== null && Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
};

export class AutomowerClient {
  constructor({
    tokens,
    baseUrl = API_URL,
    now = Date.now,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    spacing = REQUEST_SPACING,
  }) {
    this.tokens = tokens;
    this.baseUrl = baseUrl;
    this.now = now;
    this.sleep = sleep;
    this.spacing = spacing;
    /** REST calls made (the tests and the budget logs count them). */
    this.calls = 0;
    this.lastAt = -Infinity;
    this.gate = Promise.resolve();
  }

  /** Wait for our turn: two calls never start closer than `spacing`. */
  async slot() {
    const previous = this.gate;
    let release;
    this.gate = new Promise((resolve) => {
      release = resolve;
    });
    try {
      await previous;
      const wait = this.lastAt + this.spacing - this.now();
      if (wait > 0) {
        await this.sleep(wait);
      }
      this.lastAt = this.now();
    } finally {
      release();
    }
  }

  async call(path, { method = 'GET', body } = {}, retry = true) {
    const token = await this.tokens.get();
    await this.slot();
    this.calls += 1;
    try {
      const answer = await request(`${this.baseUrl}/${path}`, {
        method,
        body,
        contentType: 'application/vnd.api+json',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Api-Key': this.tokens.appKey,
          'Authorization-Provider': 'husqvarna',
        },
      });
      return answer.data;
    } catch (err) {
      if (!(err instanceof HttpError)) {
        throw transportError(err, 'Husqvarna');
      }
      const detail = apiErrorOf(err.body);
      if (err.status === 401 && retry) {
        // An expired or revoked token: one new token, one more try.
        this.tokens.invalidate();
        return this.call(path, { method, body }, false);
      }
      if (err.status === 401) {
        throw new AutomowerError('unauthorized', 'Husqvarna refused the access token', 401);
      }
      if (err.status === 429 || (err.status === 403 && /limit|quota/i.test(detail ?? ''))) {
        throw new AutomowerError(
          'rate_limited',
          'Husqvarna API limit reached',
          err.status,
          retryAfterOf(err.headers),
        );
      }
      if (err.status === 403) {
        throw new AutomowerError(
          'forbidden',
          `Husqvarna refused the request${detail ? ` (${detail})` : ''}`,
          403,
        );
      }
      if (err.status === 404) {
        throw new AutomowerError('not_found', 'Unknown mower at Husqvarna', 404);
      }
      if (err.status === 400) {
        throw new AutomowerError(
          'bad_request',
          `Husqvarna refused the command${detail ? `: ${detail}` : ''}`,
          400,
        );
      }
      throw new AutomowerError(
        'http',
        detail ? `${err.message}: ${detail}` : err.message,
        err.status,
      );
    }
  }

  // --- Reading -----------------------------------------------------------------------------

  /** Every mower of the account: the `data` array of GET /mowers. */
  async mowers() {
    const document = await this.call('mowers');
    return Array.isArray(document?.data) ? document.data : [];
  }

  /** One mower: the `data` object of GET /mowers/{id}. */
  async mower(mowerId) {
    const document = await this.call(`mowers/${encodeURIComponent(mowerId)}`);
    return document?.data ?? undefined;
  }

  // --- Commands (202 Accepted: queued for the mower, not executed yet) ------------------

  action(mowerId, type, attributes) {
    return this.call(`mowers/${encodeURIComponent(mowerId)}/actions`, {
      method: 'POST',
      body: { data: attributes ? { type, attributes } : { type } },
    });
  }

  /** Mow for `minutes`, overriding the schedule (leaves the station once charged). */
  start(mowerId, minutes) {
    return this.action(mowerId, 'Start', { duration: minutes });
  }

  /** Park for `minutes`, overriding the schedule. */
  parkFor(mowerId, minutes) {
    return this.action(mowerId, 'Park', { duration: minutes });
  }

  parkUntilNextSchedule(mowerId) {
    return this.action(mowerId, 'ParkUntilNextSchedule');
  }

  /** Park until started again: the mode becomes HOME. */
  parkUntilFurtherNotice(mowerId) {
    return this.action(mowerId, 'ParkUntilFurtherNotice');
  }

  pause(mowerId) {
    return this.action(mowerId, 'Pause');
  }

  /** Remove any override: back to the calendar. */
  resumeSchedule(mowerId) {
    return this.action(mowerId, 'ResumeSchedule');
  }
}
