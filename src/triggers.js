// -----------------------------------------------------------------------------
// Two consecutive readings of a mower -> scene events. Pure. Nothing fires on
// the first reading (no transition without a previous value), and a
// transition fires once: the next reading compares with the new state.
// -----------------------------------------------------------------------------

import { SCENE_TRIGGERS } from './constants.js';
import { errorActive, errorLabel } from './devices.js';

/** The activities of a mowing session (charging: it wants to mow, it must charge first). */
const SESSION = new Set(['mowing', 'leaving', 'going_home', 'charging']);
/** The activities that end a session. */
const ENDED = new Set(['parked_in_cs', 'stopped_in_garden', 'not_applicable']);
/** The same code timestamped more than this later is a new occurrence. */
const NEW_ERROR_AFTER = 60_000;

/**
 * The reading of a mower: the plain mower, when the session began (null
 * when it began before the integration saw it) and the last error seen.
 */
export function nextReading(previous, mower, now) {
  let sessionStartedAt = null;
  if (SESSION.has(mower.activity) && previous) {
    sessionStartedAt = SESSION.has(previous.activity) ? previous.sessionStartedAt : now;
  }
  const lastError = errorActive(mower)
    ? { code: mower.errorCode, state: mower.state, at: mower.errorAt, wall: mower.errorWall }
    : (previous?.lastError ?? null);
  return { ...mower, readAt: now, sessionStartedAt, lastError };
}

function newError(previous, current) {
  if (!errorActive(previous) || previous.errorCode !== current.errorCode) {
    return true;
  }
  const before = Date.parse(previous.errorAt ?? '');
  const after = Date.parse(current.errorAt ?? '');
  return Number.isFinite(before) && Number.isFinite(after) && after - before > NEW_ERROR_AFTER;
}

/**
 * The events of a mower between two readings. `deviceId` is the device
 * external id (the `mower` field of every trigger).
 */
export function mowerEvents(deviceId, previous, current) {
  const events = [];
  if (!previous) {
    return events;
  }
  const base = { mower: deviceId, mower_name: current.name };

  if (errorActive(current) && newError(previous, current)) {
    const text = errorLabel(current);
    events.push({
      key: SCENE_TRIGGERS.ERROR,
      data: {
        ...base,
        code: current.errorCode,
        error_en: text.en,
        error_fr: text.fr,
        error_at: current.errorAt,
        state: current.state,
      },
    });
  }

  if (current.activity !== previous.activity) {
    events.push({
      key: SCENE_TRIGGERS.ACTIVITY,
      data: {
        ...base,
        activity: current.activity,
        previous_activity: previous.activity,
        state: current.state,
        battery: current.battery,
      },
    });
  }

  if (SESSION.has(previous.activity) && ENDED.has(current.activity)) {
    const start = previous.sessionStartedAt;
    events.push({
      key: SCENE_TRIGGERS.FINISHED,
      data: {
        ...base,
        activity: current.activity,
        minutes: start === null ? null : Math.max(0, Math.round((current.readAt - start) / 60_000)),
        battery: current.battery,
        error_code: errorActive(current) ? current.errorCode : 0,
        finished_at: new Date(current.readAt).toISOString(),
      },
    });
  }

  if (previous.connected && !current.connected) {
    events.push({
      key: SCENE_TRIGGERS.DISCONNECTED,
      data: { ...base, last_seen: current.statusAt, activity: current.activity },
    });
  }
  return events;
}
