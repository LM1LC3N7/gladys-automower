// -----------------------------------------------------------------------------
// Automower Connect JSON -> plain values. Pure: the time zone and `now` are
// parameters.
//
// Field names come from the OpenAPI and AsyncAPI documents of the Developer
// Portal (read on 2026-10-14) and from aioautomower 3.1.0 (Home Assistant).
// BUILT BLIND: no account was available, every Husqvarna name lives in this
// file and in client.js so that a user report fixes one place.
//
//   GET /mowers -> { data: [{ type: 'mower', id, attributes: {
//     system { name, model, serialNumber },
//     battery { batteryPercent, remainingChargingTime (s) },
//     capabilities { canConfirmError, headlights, position, stayOutZones, workAreas },
//     mower { mode, activity, inactiveReason, state, workAreaId, errorCode,
//             errorCodeTimestamp (ms, LOCAL time), isErrorConfirmable },
//     planner { nextStartTimestamp (ms, LOCAL time, 0: none), override { action },
//               restrictedReason, externalReason },
//     metadata { connected, statusTimestamp (ms, UTC) },
//     settings { cuttingHeight, headlight { mode } }, workAreas [{ workAreaId, name }],
//     calendar, positions, statistics, stayOutZones } }] }
//
//   websocket (v2): { id, type: '<x>-event-v2', attributes: { <x>: {...} } },
//   the same objects, partial; their LOCAL timestamps are in seconds.
// -----------------------------------------------------------------------------

import { INVALID_MOWER_ID } from '../constants.js';

const num = (value) => {
  const n = Number(value);
  return value === null || value === undefined || value === '' || !Number.isFinite(n) ? null : n;
};

const lower = (value, fallback = 'unknown') =>
  typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : fallback;

/** Lower-case, no accents, single spaces: how a typed name is compared. */
export function fold(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// --- Time ---------------------------------------------------------------------------

/**
 * A LOCAL timestamp of the mower (seconds in the websocket, milliseconds in
 * REST) -> milliseconds of the wall clock read as UTC. 0 means none. Above
 * year 3000 in seconds, the value is milliseconds (aioautomower's rule).
 */
export function wallClockMs(value) {
  const n = num(value);
  if (n === null || n <= 0) {
    return null;
  }
  return n > 32_503_680_000 ? Math.round(n) : Math.round(n * 1000);
}

/** The offset (ms) of a time zone at an instant; 0 for an unknown zone. */
function offsetAt(t, timeZone) {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
        .formatToParts(new Date(t))
        .map((p) => [p.type, Number(p.value)]),
    );
    const wall = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    return wall - Math.floor(t / 1000) * 1000;
  } catch {
    return 0;
  }
}

/**
 * A wall clock of `timeZone` (ms, read as UTC) -> the real instant (epoch
 * ms). Two passes: the offset of the guess, then of the real instant (they
 * differ only around a DST change).
 */
export function wallClockToInstant(wall, timeZone) {
  if (wall === null || wall === undefined) {
    return null;
  }
  const guess = wall - offsetAt(wall, timeZone);
  return wall - offsetAt(guess, timeZone);
}

/** "2026-10-15 09:00" from a wall clock (ms read as UTC): the mower's own time. */
export function wallClockText(wall) {
  if (wall === null || wall === undefined) {
    return null;
  }
  return new Date(wall).toISOString().slice(0, 16).replace('T', ' ');
}

// --- Mowers -------------------------------------------------------------------------

/** A JSON:API item that is a real mower (aioautomower skips the "0-0" one). */
export function isMowerItem(item) {
  return Boolean(
    item &&
    typeof item === 'object' &&
    item.id &&
    String(item.id) !== INVALID_MOWER_ID &&
    (item.type === undefined || item.type === 'mower') &&
    item.attributes &&
    typeof item.attributes === 'object',
  );
}

/** The attributes the integration keeps: everything but the GPS positions. */
export function keptAttributes(item) {
  const { positions: _positions, ...kept } = item?.attributes ?? {};
  return kept;
}

/**
 * One mower (a JSON:API item) -> the plain mower. `timeZone` is the time
 * zone of the mower (Gladys' TZ): its local timestamps become instants.
 */
export function mowerOf(item, { timeZone = 'UTC' } = {}) {
  const a = item.attributes ?? {};
  const system = a.system ?? {};
  const mower = a.mower ?? {};
  const planner = a.planner ?? {};
  const metadata = a.metadata ?? {};
  const settings = a.settings ?? {};
  const capabilities = a.capabilities ?? {};
  const errorWall = wallClockMs(mower.errorCodeTimestamp);
  const nextWall = wallClockMs(planner.nextStartTimestamp);
  const iso = (wall) => {
    const t = wallClockToInstant(wall, timeZone);
    return t === null ? null : new Date(t).toISOString();
  };
  const workAreas = (Array.isArray(a.workAreas) ? a.workAreas : [])
    .filter((w) => num(w?.workAreaId) !== null)
    .map((w) => ({ id: num(w.workAreaId), name: String(w.name ?? '').trim() }));
  const workAreaId = num(mower.workAreaId);
  const statusAt = num(metadata.statusTimestamp);
  return {
    id: String(item.id),
    name: String(system.name ?? '').trim() || `Automower ${system.model ?? item.id}`,
    model: system.model ? String(system.model) : null,
    serial: system.serialNumber !== undefined ? String(system.serialNumber) : null,
    battery: num(a.battery?.batteryPercent),
    chargingSeconds: num(a.battery?.remainingChargingTime) || null,
    mode: lower(mower.mode),
    activity: lower(mower.activity),
    state: lower(mower.state),
    inactiveReason: lower(mower.inactiveReason, 'none'),
    errorCode: num(mower.errorCode) ?? 0,
    errorAt: iso(errorWall),
    errorLocal: wallClockText(errorWall),
    errorWall,
    errorConfirmable: mower.isErrorConfirmable === true,
    workAreaId,
    workAreaName: workAreas.find((w) => w.id === workAreaId)?.name || null,
    nextStartAt: iso(nextWall),
    nextStartLocal: wallClockText(nextWall),
    nextStartWall: nextWall,
    override: lower(planner.override?.action, 'not_active'),
    restrictedReason: lower(planner.restrictedReason, 'none'),
    externalReason: num(planner.externalReason),
    // A mower the API says nothing about is taken as connected.
    connected: metadata.connected !== false,
    statusAt: statusAt && statusAt > 0 ? new Date(statusAt).toISOString() : null,
    cuttingHeight: num(settings.cuttingHeight),
    headlight: settings.headlight?.mode ? lower(settings.headlight.mode) : null,
    capabilities: {
      canConfirmError: capabilities.canConfirmError === true,
      headlights: capabilities.headlights === true,
      position: capabilities.position === true,
      stayOutZones: capabilities.stayOutZones === true,
      workAreas: capabilities.workAreas === true,
    },
  };
}

// --- Websocket events -------------------------------------------------------------------

/** The v2 events the integration applies; the others are ignored. */
export const EVENT_TYPES = {
  BATTERY: 'battery-event-v2',
  CALENDAR: 'calendar-event-v2',
  CUTTING_HEIGHT: 'cuttingHeight-event-v2',
  HEADLIGHTS: 'headlights-event-v2',
  MESSAGE: 'message-event-v2',
  MOWER: 'mower-event-v2',
  PLANNER: 'planner-event-v2',
  POSITION: 'position-event-v2',
};

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Deep merge of plain objects (arrays and values replace): aioautomower's rule. */
function merge(target, updates) {
  const out = { ...target };
  for (const [key, value] of Object.entries(updates ?? {})) {
    out[key] = isObject(value) && isObject(out[key]) ? merge(out[key], value) : value;
  }
  return out;
}

/**
 * A websocket message -> { kind: 'ready' | 'event' | 'pong' | 'other', ... }.
 * Husqvarna answers an empty message with an empty message (the "pong").
 */
export function parseMessage(text) {
  if (text === '' || text === undefined || text === null) {
    return { kind: 'pong' };
  }
  let message;
  try {
    message = JSON.parse(String(text));
  } catch {
    return { kind: 'other' };
  }
  if (!isObject(message)) {
    return { kind: 'other' };
  }
  if ('ready' in message && 'connectionId' in message) {
    return { kind: 'ready', ready: message.ready === true };
  }
  if (typeof message.type === 'string' && message.id !== undefined) {
    return {
      kind: 'event',
      type: message.type,
      id: String(message.id),
      attributes: isObject(message.attributes) ? message.attributes : {},
    };
  }
  return { kind: 'other' };
}

/**
 * Apply a v2 event to the raw attributes of a mower; resolves the new
 * attributes (the input is never modified), or undefined when the event
 * changes nothing the integration keeps. Positions are never kept (the
 * integration does not use them), messages are handled by the app.
 */
export function applyEvent(attributes, event, now) {
  const a = event.attributes ?? {};
  switch (event.type) {
    case EVENT_TYPES.MOWER:
    case EVENT_TYPES.BATTERY: {
      const part = event.type === EVENT_TYPES.MOWER ? 'mower' : 'battery';
      if (!isObject(a[part])) {
        return undefined;
      }
      // An event of the mower itself proves it is connected right now.
      return merge(attributes, {
        [part]: a[part],
        metadata: { connected: true, statusTimestamp: now },
      });
    }
    case EVENT_TYPES.PLANNER:
      return isObject(a.planner) ? merge(attributes, { planner: a.planner }) : undefined;
    case EVENT_TYPES.CALENDAR:
      return isObject(a.calendar) ? merge(attributes, { calendar: a.calendar }) : undefined;
    case EVENT_TYPES.CUTTING_HEIGHT: {
      const height = num(a.cuttingHeight?.height ?? a.cuttingHeight);
      return height === null
        ? undefined
        : merge(attributes, { settings: { cuttingHeight: height } });
    }
    case EVENT_TYPES.HEADLIGHTS: {
      // The AsyncAPI document says `headlight`, aioautomower reads `headlights`.
      const mode = (a.headlight ?? a.headlights)?.mode;
      return typeof mode === 'string'
        ? merge(attributes, { settings: { headlight: { mode } } })
        : undefined;
    }
    default:
      return undefined;
  }
}

/** The message of a message-event-v2: { code, severity, wall } or undefined. */
export function messageOf(event) {
  const m = event?.attributes?.message;
  if (!isObject(m) || num(m.code) === null) {
    return undefined;
  }
  return {
    code: num(m.code),
    severity: lower(m.severity),
    wall: wallClockMs(m.time),
  };
}
