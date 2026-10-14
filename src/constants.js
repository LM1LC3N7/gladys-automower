// -----------------------------------------------------------------------------
// Constants of the Husqvarna Automower integration.
// -----------------------------------------------------------------------------

/** Husqvarna Group Authentication API (client credentials grant). */
export const AUTH_URL = 'https://api.authentication.husqvarnagroup.dev/v1';
/** Automower Connect REST API (https://developer.husqvarnagroup.cloud). */
export const API_URL = 'https://api.amc.husqvarna.dev/v1';
/** Automower Connect WebSocket API (events v2). */
export const WS_URL = 'wss://ws.openapi.husqvarna.dev/v1';

export const USER_AGENT = 'gladys-automower/0.1 (+https://github.com/LM1LC3N7/gladys-automower)';
export const HTTP_TIMEOUT = 15_000;

/** The scope a token needs for the Automower Connect API and its websocket. */
export const REQUIRED_SCOPE = 'amc:api';

// --- Pacing ------------------------------------------------------------------------
// The Automower Connect README (read on 2026-10-14): 21,000 requests per week
// and application key, 120 per minute. The websocket carries the live state;
// REST only starts, resynchronizes and replaces the websocket while it is
// down. See CLAUDE.md for the weekly budget.

/** An access token lives an hour: renew it 5 minutes before it expires. */
export const TOKEN_MARGIN = 5 * 60_000;
/** Two REST calls are at least that far apart (commands included). */
export const REQUEST_SPACING = 1_000;
/** The loop wakes up every minute; most ticks make no call at all. */
export const TICK_INTERVAL = 60_000;
/** The REST read of every mower while the websocket is down. */
export const FALLBACK_INTERVAL = 10 * 60_000;
/** After a websocket reconnection, resynchronize only if REST is older than that. */
export const RESYNC_AFTER_GAP = 5 * 60_000;
/** A command is queued by Husqvarna (202): read the mower back after that. */
export const COMMAND_SETTLE = 30_000;
/** A 429 without Retry-After: no background call for that long. */
export const RATE_LIMIT_PAUSE = 60 * 60_000;

/** The websocket: Husqvarna answers an empty message with an empty message. */
export const WS_PING_INTERVAL = 60_000;
/** Nothing received for that long (not even the empty answers): reconnect. */
export const WS_WATCHDOG = 3 * 60_000;
/** The server cuts a connection after 2 hours: recycle it just before. */
export const WS_MAX_AGE = 115 * 60_000;
/** Reconnection backoff; Husqvarna allows one new connection per second. */
export const WS_RECONNECT = { base: 5_000, max: 10 * 60_000, afterRecycle: 1_000 };

// --- Limits of the Automower Connect API ---------------------------------------------

/** Start and Park take a duration in minutes, 1 to 65,000. */
export const MAX_DURATION_MINUTES = 65_000;
/** A mower id the API sends for an invalid pairing (aioautomower skips it). */
export const INVALID_MOWER_ID = '0-0';

// --- Gladys ------------------------------------------------------------------------------

/**
 * VACUUM_CLEANER_STATE of Gladys (server/utils/constants.js); the SDK exports
 * the category and types but not this enum. The device widget labels them
 * Stopped, Running, Paused, Error, Returning to dock, Charging, Docked.
 */
export const DOCK_STATE = {
  STOPPED: 0,
  RUNNING: 1,
  PAUSED: 2,
  ERROR: 3,
  RETURNING: 4,
  CHARGING: 5,
  DOCKED: 6,
};
/** VACUUM_CLEANER_MODE of Gladys: the run mode select (IDLE pauses, CLEANING mows). */
export const RUN_MODE = { IDLE: 0, CLEANING: 1 };

export const LANGUAGES = ['fr', 'en'];

// --- Manifest keys (forever: stored in user scenes and dashboards) --------------------

export const ACTIONS = { TEST: 'test_connection' };
export const SCENE_ACTIONS = {
  START: 'start',
  PARK: 'park',
  PAUSE: 'pause',
  RESUME: 'resume_schedule',
};
export const SCENE_TRIGGERS = {
  ERROR: 'mower_error',
  ACTIVITY: 'activity_changed',
  FINISHED: 'mowing_finished',
  DISCONNECTED: 'mower_disconnected',
};
export const WIDGETS = { MOWER: 'mower' };

/** The actions of the buttons of the "mower" widget (forever: cached contents). */
export const WIDGET_ACTIONS = {
  START: 'start',
  PARK: 'park',
  PAUSE: 'pause',
  RESUME: 'resume_schedule',
};

/** Values of the `mode` field of the park scene action. */
export const PARK_MODES = {
  NEXT_SCHEDULE: 'next_schedule',
  FURTHER_NOTICE: 'further_notice',
  DURATION: 'duration',
};

/** The activities of the API, lower-cased: the `activity` field of activity_changed. */
export const ACTIVITIES = [
  'mowing',
  'going_home',
  'charging',
  'leaving',
  'parked_in_cs',
  'stopped_in_garden',
  'not_applicable',
  'unknown',
];
