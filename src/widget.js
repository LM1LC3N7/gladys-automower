// -----------------------------------------------------------------------------
// The "mower" dashboard widget: one mower, its battery, next start, activity,
// state, mode, error and connection, and four buttons (start, park, pause,
// resume the schedule). Pure.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { DOCK_STATE, WIDGET_ACTIONS } from './constants.js';
import { dockStateOf, errorActive, errorLabel } from './devices.js';
import { errorText } from './automower/codes.js';
import { T, pick } from './i18n.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "15/10 09:00" (fr) or "15 Oct 09:00" (en) from a wall clock of the mower
 * (ms read as UTC): the time the mower itself shows, at most 12 characters.
 */
export function shortWall(wall, language = 'fr') {
  if (wall === null || wall === undefined) {
    return null;
  }
  const d = new Date(wall);
  const two = (n) => String(n).padStart(2, '0');
  const time = `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
  return language === 'fr'
    ? `${two(d.getUTCDate())}/${two(d.getUTCMonth() + 1)} ${time}`
    : `${two(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${time}`;
}

const ACTIVITY_COLOR = {
  [DOCK_STATE.RUNNING]: WIDGET_COLORS.SUCCESS,
  [DOCK_STATE.RETURNING]: WIDGET_COLORS.INFO,
  [DOCK_STATE.CHARGING]: WIDGET_COLORS.INFO,
  [DOCK_STATE.DOCKED]: WIDGET_COLORS.NEUTRAL,
  [DOCK_STATE.PAUSED]: WIDGET_COLORS.WARNING,
  [DOCK_STATE.STOPPED]: WIDGET_COLORS.WARNING,
  [DOCK_STATE.ERROR]: WIDGET_COLORS.DANGER,
};

const cut = (text, max) => String(text).slice(0, max);

function batteryTile(reading) {
  const tile = {
    type: 'value',
    label: T.widget.battery,
    icon: reading.activity === 'charging' ? 'battery-charging' : 'battery',
  };
  if (reading.battery === null) {
    return { ...tile, value: '—', color: WIDGET_COLORS.NEUTRAL };
  }
  let color = WIDGET_COLORS.SUCCESS;
  if (reading.battery < 20) {
    color = WIDGET_COLORS.DANGER;
  } else if (reading.battery < 50) {
    color = WIDGET_COLORS.WARNING;
  }
  return { ...tile, value: reading.battery, unit: '%', color };
}

function errorRow(reading, language) {
  if (errorActive(reading)) {
    const when = shortWall(reading.errorWall, language);
    const text = pick(errorLabel(reading), language);
    return {
      label: T.widget.error,
      value: cut(when ? `${text} · ${when}` : text, 40),
      icon: 'alert-triangle',
      color: WIDGET_COLORS.DANGER,
    };
  }
  if (reading.lastError) {
    const { code, state, wall } = reading.lastError;
    const text = pick(code > 0 ? errorText(code) : T.state(state), language);
    const when = shortWall(wall, language);
    return {
      label: T.widget.lastError,
      value: cut(when ? `${text} · ${when}` : text, 40),
      icon: 'alert-triangle',
      color: WIDGET_COLORS.NEUTRAL,
    };
  }
  return {
    label: T.widget.error,
    value: pick(T.widget.noError, language),
    icon: 'check-circle',
    color: WIDGET_COLORS.NEUTRAL,
  };
}

/** `reading` is the app's reading of the mower (triggers.js nextReading). */
export function mowerWidget({ reading, startMinutes = 180, language = 'fr' }) {
  if (!reading) {
    return {
      ttl_seconds: 300,
      components: [{ type: 'text', text: T.widget.noMower, variant: 'body' }],
    };
  }
  const dock = dockStateOf(reading);
  const restricted = reading.state === 'restricted' ? T.restricted(reading.restrictedReason) : null;
  const state = pick(T.state(reading.state), language);
  const rows = [
    {
      label: T.widget.activity,
      value: cut(pick(T.activity(reading.activity), language), 40),
      icon: 'activity',
      color: ACTIVITY_COLOR[dock],
    },
    {
      label: T.widget.state,
      value: cut(restricted ? `${state} · ${pick(restricted, language)}` : state, 40),
      icon: 'info',
    },
    { label: T.widget.mode, value: cut(pick(T.mode(reading.mode), language), 40), icon: 'map' },
    errorRow(reading, language),
    reading.connected
      ? {
          label: T.widget.connection,
          value: pick(T.widget.connected, language),
          icon: 'wifi',
          color: WIDGET_COLORS.SUCCESS,
        }
      : {
          label: T.widget.connection,
          value: pick(T.widget.disconnected, language),
          icon: 'wifi-off',
          color: WIDGET_COLORS.DANGER,
        },
  ];
  const params = { mower: reading.id };
  const button = (label, icon, style, key) => ({
    type: 'button',
    label,
    icon,
    style,
    action: { key, params },
  });
  return {
    ttl_seconds: dock === DOCK_STATE.RUNNING || dock === DOCK_STATE.RETURNING ? 60 : 300,
    components: [
      { type: 'text', text: cut(reading.name, 40), variant: 'heading' },
      batteryTile(reading),
      {
        type: 'value',
        label: T.widget.nextStart,
        value: shortWall(reading.nextStartWall, language) ?? '—',
        icon: 'calendar',
        color: WIDGET_COLORS.NEUTRAL,
      },
      { type: 'status', items: rows },
      button(T.widget.start(startMinutes), 'play', 'primary', WIDGET_ACTIONS.START),
      button(T.widget.park, 'home', 'secondary', WIDGET_ACTIONS.PARK),
      button(T.widget.pause, 'pause', 'secondary', WIDGET_ACTIONS.PAUSE),
      button(T.widget.resume, 'calendar', 'secondary', WIDGET_ACTIONS.RESUME),
    ],
  };
}
