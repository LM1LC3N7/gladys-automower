// -----------------------------------------------------------------------------
// The access token of the Husqvarna Authentication API, client credentials
// grant (the application key and secret of the user's own Developer Portal
// application):
//
//   POST /oauth2/token  grant_type=client_credentials&client_id=<key>&client_secret=<secret>
//     -> { access_token, scope: 'iam:read amc:api', expires_in: 3600, ... }
//   POST /oauth2/revoke token=<access token>   (Authorization: Bearer <token>)
//
// The token lives in memory only, renewed TOKEN_MARGIN before it expires and
// reused until then: Husqvarna keeps at most 3 tokens per user and client.
// A refused key or secret is FINAL until the configuration changes: 10 bad
// attempts in 5 minutes lock the Husqvarna account for 30 minutes.
// -----------------------------------------------------------------------------

import { AUTH_URL, REQUIRED_SCOPE, TOKEN_MARGIN } from '../constants.js';
import { HttpError, request } from '../http.js';
import { AutomowerError, transportError } from './client.js';

/** The message of an Authentication API error body ({ error, error_description }). */
export function authErrorOf(body) {
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  const text = body.error_description ?? body.error ?? body.message;
  return text ? String(text).slice(0, 200) : undefined;
}

export class TokenManager {
  constructor({ appKey, appSecret, now = Date.now, baseUrl = AUTH_URL }) {
    this.appKey = appKey ?? '';
    this.appSecret = appSecret ?? '';
    this.now = now;
    this.baseUrl = baseUrl;
    this.token = undefined;
    this.expiresAt = 0;
    this.scope = undefined;
    /** The final refusal, kept so that nothing asks again with the same secret. */
    this.refused = undefined;
    this.pending = undefined;
    /** Tokens obtained (the tests and the logs count them). */
    this.issued = 0;
  }

  /** Same credentials: the token can be kept across a restart of the app. */
  matches(appKey, appSecret) {
    return this.appKey === appKey && this.appSecret === appSecret;
  }

  /** A valid access token, obtained or renewed when needed. Single-flight. */
  async get({ force = false } = {}) {
    if (!this.appKey || !this.appSecret) {
      throw new AutomowerError('no_credentials', 'No application key or secret configured');
    }
    if (this.refused) {
      throw this.refused;
    }
    if (!force && this.token && this.now() < this.expiresAt - TOKEN_MARGIN) {
      return this.token;
    }
    if (!this.pending) {
      this.pending = this.fetchToken().finally(() => {
        this.pending = undefined;
      });
    }
    return this.pending;
  }

  async fetchToken() {
    let answer;
    try {
      answer = await request(`${this.baseUrl}/oauth2/token`, {
        method: 'POST',
        form: true,
        body: {
          grant_type: 'client_credentials',
          client_id: this.appKey,
          client_secret: this.appSecret,
        },
      });
    } catch (err) {
      if (err instanceof HttpError && (err.status === 400 || err.status === 401)) {
        const detail = authErrorOf(err.body);
        this.refused = new AutomowerError(
          'refused',
          `Husqvarna refused the application key or secret${detail ? ` (${detail})` : ''}`,
          err.status,
        );
        throw this.refused;
      }
      throw transportError(err, 'the Husqvarna authentication');
    }
    const data = answer.data ?? {};
    if (!data.access_token) {
      throw new AutomowerError('http', 'Husqvarna answered without an access token');
    }
    const scope = typeof data.scope === 'string' ? data.scope : undefined;
    if (scope !== undefined && !scope.split(/\s+/).includes(REQUIRED_SCOPE)) {
      // The application is not connected to the Automower Connect API: every
      // REST call and the websocket would answer 403. Nothing to retry.
      this.refused = new AutomowerError(
        'scope',
        `The token has no "${REQUIRED_SCOPE}" scope: connect the application to the Automower Connect API`,
      );
      throw this.refused;
    }
    this.issued += 1;
    this.token = String(data.access_token);
    this.scope = scope;
    this.expiresAt = this.now() + Math.max(60, Number(data.expires_in) || 3600) * 1000;
    return this.token;
  }

  /** Drop the token (a 401 says it is no longer valid). */
  invalidate() {
    this.token = undefined;
    this.expiresAt = 0;
  }

  /** Revoke the token at Husqvarna, best effort (stop, new credentials). */
  async revoke() {
    const token = this.token;
    this.invalidate();
    if (!token) {
      return false;
    }
    try {
      await request(`${this.baseUrl}/oauth2/revoke`, {
        method: 'POST',
        form: true,
        body: { token },
        headers: { Authorization: `Bearer ${token}` },
        timeout: 5_000,
      });
      return true;
    } catch {
      return false;
    }
  }
}
