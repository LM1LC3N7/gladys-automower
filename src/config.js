// -----------------------------------------------------------------------------
// The configuration the user fills (manifest `config_schema`), normalized.
// -----------------------------------------------------------------------------

import { LANGUAGES } from './constants.js';

// Defaults: they MUST match the `default` values of the manifest.
export const DEFAULTS = {
  start_minutes: 180,
  resync_minutes: 30,
  language: 'fr',
};

/** Bounds of the number fields (also the manifest's `min` / `max`). */
export const BOUNDS = {
  start_minutes: [10, 1440],
  resync_minutes: [15, 120],
};

const number = (value, key) => {
  const [min, max] = BOUNDS[key];
  const n = Number(value);
  return Number.isFinite(n) && value !== '' && value !== null
    ? Math.min(max, Math.max(min, Math.round(n)))
    : DEFAULTS[key];
};

/** A key pasted with spaces or quotes around it is still the key. */
const credential = (value) =>
  typeof value === 'string' ? value.trim().replace(/^["']|["']$/g, '') : '';

export function normalizeConfig(raw = {}) {
  const language = String(raw.language ?? DEFAULTS.language).toLowerCase();
  return {
    appKey: credential(raw.app_key),
    appSecret: credential(raw.app_secret),
    startMinutes: number(raw.start_minutes, 'start_minutes'),
    resyncMinutes: number(raw.resync_minutes, 'resync_minutes'),
    language: LANGUAGES.includes(language) ? language : DEFAULTS.language,
  };
}
