// -----------------------------------------------------------------------------
// The Gladys devices and their states. Pure.
//
// External id (forever):  mower:<Husqvarna mower id>   one robotic mower
//
// The operational state and the two commands use Gladys' `vacuum-cleaner`
// category, the only one describing a robot that runs, docks and charges:
// its device widget labels the state Stopped / Running / Paused / Error /
// Returning to dock / Charging / Docked, offers a run mode select (Idle:
// pause, Clean: mow) and a "Return to dock" button (park). See CLAUDE.md.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';
import { DOCK_STATE, RUN_MODE } from './constants.js';
import { errorText } from './automower/codes.js';
import { T as TEXT, pick } from './i18n.js';

export const DEVICE_TYPES = { MOWER: 'mower' };

/** The feature keys (the last segment of the feature external ids). Forever. */
export const FEATURE = {
  STATE: 'state',
  RUN_MODE: 'run_mode',
  DOCK: 'dock',
  BATTERY: 'battery',
  ACTIVITY: 'activity',
  MODE: 'mode',
  ERROR_CODE: 'error_code',
  ERROR: 'error',
  CONNECTED: 'connected',
  NEXT_START: 'next_start',
};

export const ids = {
  mower: (gladys, id) => gladys.externalId(`mower:${id}`),
  feature: (deviceId, key) => `${deviceId}:${key}`,
};

/** { kind: 'mower', id } or undefined. */
export function parseExternalId(externalId) {
  const match = /:mower:([A-Za-z0-9_-]+)$/.exec(String(externalId ?? ''));
  return match ? { kind: DEVICE_TYPES.MOWER, id: match[1] } : undefined;
}

/** The key of a feature external id ("ext:automower:mower:<id>:dock" -> "dock"). */
export const featureKeyOf = (externalId) =>
  String(externalId ?? '')
    .split(':')
    .at(-1);

const ERROR_STATES = new Set(['error', 'fatal_error', 'error_at_power_up']);

/** The mower reports an error: a code, or an error state. */
export const errorActive = (mower) => mower.errorCode > 0 || ERROR_STATES.has(mower.state);

/** The Gladys vacuum-cleaner state of a mower (same rules as Home Assistant's lawn mower). */
export function dockStateOf(mower) {
  if (ERROR_STATES.has(mower.state)) {
    return DOCK_STATE.ERROR;
  }
  if (mower.state === 'paused') {
    return DOCK_STATE.PAUSED;
  }
  switch (mower.activity) {
    case 'mowing':
    case 'leaving':
      return DOCK_STATE.RUNNING;
    case 'going_home':
      return DOCK_STATE.RETURNING;
    case 'charging':
      return DOCK_STATE.CHARGING;
    case 'parked_in_cs':
      return DOCK_STATE.DOCKED;
    default:
      return DOCK_STATE.STOPPED;
  }
}

/** The run mode select: CLEANING while the mower mows (or heads out to), IDLE otherwise. */
export const runModeOf = (mower) =>
  dockStateOf(mower) === DOCK_STATE.RUNNING ? RUN_MODE.CLEANING : RUN_MODE.IDLE;

/** The error of a mower as a text: the code's text, else its error state, else none. */
export function errorLabel(mower) {
  if (!errorActive(mower)) {
    return TEXT.none;
  }
  return mower.errorCode > 0 ? errorText(mower.errorCode) : TEXT.state(mower.state);
}

const feature = (deviceId, key, name, category, type, extra = {}) => ({
  name,
  external_id: ids.feature(deviceId, key),
  category,
  type,
  min: 0,
  max: 1,
  read_only: true,
  has_feedback: false,
  keep_history: true,
  ...extra,
});

const text = (id, key, name) =>
  feature(id, key, name, C.TEXT, T.TEXT.TEXT, { min: 0, max: 0, keep_history: false });

export function buildMowerDevice(gladys, mower) {
  const id = ids.mower(gladys, mower.id);
  return {
    name: mower.name,
    external_id: id,
    features: [
      feature(id, FEATURE.STATE, 'State', C.VACUUM_CLEANER, T.VACUUM_CLEANER.STATE, { max: 6 }),
      feature(
        id,
        FEATURE.RUN_MODE,
        'Mowing (idle: pause)',
        C.VACUUM_CLEANER,
        T.VACUUM_CLEANER.RUN_MODE,
        {
          read_only: false,
          has_feedback: true,
          keep_history: false,
          // No mapping pass for a mower: only Idle and Clean in the select.
          supported_options: [
            { value: RUN_MODE.IDLE, label: 'Pause', sort_order: 1 },
            { value: RUN_MODE.CLEANING, label: 'Mow', sort_order: 2 },
          ],
        },
      ),
      feature(
        id,
        FEATURE.DOCK,
        'Park until the next schedule',
        C.VACUUM_CLEANER,
        T.VACUUM_CLEANER.DOCK,
        {
          read_only: false,
          keep_history: false,
        },
      ),
      feature(id, FEATURE.BATTERY, 'Battery', C.BATTERY, T.BATTERY.INTEGER, {
        unit: U.PERCENT,
        max: 100,
      }),
      text(id, FEATURE.ACTIVITY, 'Activity'),
      text(id, FEATURE.MODE, 'Mode'),
      feature(id, FEATURE.ERROR_CODE, 'Error code (0: none)', C.UNKNOWN, T.SENSOR.INTEGER, {
        max: 1000,
      }),
      text(id, FEATURE.ERROR, 'Error'),
      feature(id, FEATURE.CONNECTED, 'Connected to Husqvarna', C.UNKNOWN, T.SENSOR.BINARY),
      text(id, FEATURE.NEXT_START, 'Next start (mower time)'),
    ],
    params: [
      { name: 'mower_id', value: mower.id },
      { name: 'model', value: mower.model ?? '' },
      { name: 'serial_number', value: mower.serial ?? '' },
    ],
  };
}

const state = (deviceId, key, value) =>
  value === null || value === undefined
    ? []
    : [
        typeof value === 'string'
          ? { device_feature_external_id: ids.feature(deviceId, key), text: value }
          : { device_feature_external_id: ids.feature(deviceId, key), state: value },
      ];

/** The states of a mower device; texts in `language`. */
export function mowerStates(deviceId, mower, language = 'fr') {
  return [
    ...state(deviceId, FEATURE.STATE, dockStateOf(mower)),
    ...state(deviceId, FEATURE.RUN_MODE, runModeOf(mower)),
    ...state(deviceId, FEATURE.BATTERY, mower.battery),
    ...state(deviceId, FEATURE.ACTIVITY, pick(TEXT.activity(mower.activity), language)),
    ...state(deviceId, FEATURE.MODE, pick(TEXT.mode(mower.mode), language)),
    ...state(deviceId, FEATURE.ERROR_CODE, errorActive(mower) ? mower.errorCode : 0),
    ...state(deviceId, FEATURE.ERROR, pick(errorLabel(mower), language)),
    ...state(deviceId, FEATURE.CONNECTED, mower.connected ? 1 : 0),
    ...state(deviceId, FEATURE.NEXT_START, mower.nextStartLocal ?? '—'),
  ];
}
