// -----------------------------------------------------------------------------
// The pure parts: Husqvarna JSON -> mowers, local time, live events, error
// codes, configuration, devices and states.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyEvent,
  documentShape,
  isMowerItem,
  keptAttributes,
  mowerItemRejection,
  mowerOf,
  parseMessage,
  wallClockMs,
  wallClockToInstant,
} from '../src/automower/model.js';
import { KNOWN_CODES, errorText } from '../src/automower/codes.js';
import { normalizeConfig } from '../src/config.js';
import { DOCK_STATE } from '../src/constants.js';
import {
  FEATURE,
  buildMowerDevice,
  dockStateOf,
  mowerStates,
  parseExternalId,
  runModeOf,
} from '../src/devices.js';
import { FIXTURE_NOW, PELOUSE, fixture } from './helpers/fakeFetch.js';

const PARIS = { timeZone: 'Europe/Paris' };
const items = () => fixture('mowers.json').data;
const event = (name) => parseMessage(JSON.stringify(fixture('events.json')[name]));

test('a mower of GET /mowers becomes a plain mower, local times read in the Gladys time zone', () => {
  const [pelouse, jardin] = items().map((item) => mowerOf(item, PARIS));
  assert.equal(pelouse.id, PELOUSE);
  assert.equal(pelouse.name, 'Pelouse');
  assert.equal(pelouse.model, '430X');
  assert.equal(pelouse.serial, '192800001');
  assert.equal(pelouse.battery, 100);
  assert.equal(pelouse.activity, 'parked_in_cs');
  assert.equal(pelouse.state, 'restricted');
  assert.equal(pelouse.mode, 'main_area');
  assert.equal(pelouse.restrictedReason, 'week_schedule');
  assert.equal(pelouse.errorCode, 0);
  assert.equal(pelouse.errorAt, null);
  assert.equal(pelouse.connected, true);
  // 10:00 on the mower's clock is 08:00 UTC in Paris (summer time).
  assert.equal(pelouse.nextStartLocal, '2026-10-14 10:00');
  assert.equal(pelouse.nextStartAt, '2026-10-14T08:00:00.000Z');
  assert.equal(jardin.activity, 'mowing');
  assert.equal(jardin.workAreaName, 'Back lawn');
  assert.equal(jardin.nextStartAt, null, '0 means no next start');
  assert.equal(jardin.capabilities.workAreas, true);
});

test('local timestamps: seconds or milliseconds, and the DST changes', () => {
  assert.equal(wallClockMs(1792054800), 1792054800000, 'seconds (websocket)');
  assert.equal(wallClockMs(1792054800000), 1792054800000, 'milliseconds (REST)');
  assert.equal(wallClockMs(0), null);
  assert.equal(wallClockMs(undefined), null);
  const winter = wallClockToInstant(Date.UTC(2026, 11, 1, 9, 0), 'Europe/Paris');
  assert.equal(new Date(winter).toISOString(), '2026-12-01T08:00:00.000Z');
  // 03:30 on 25 October 2026 happens after the clocks went back (UTC+1).
  const after = wallClockToInstant(Date.UTC(2026, 9, 25, 3, 30), 'Europe/Paris');
  assert.equal(new Date(after).toISOString(), '2026-10-25T02:30:00.000Z');
  const utc = wallClockToInstant(Date.UTC(2026, 9, 14, 10, 0), 'UTC');
  assert.equal(new Date(utc).toISOString(), '2026-10-14T10:00:00.000Z');
});

test('the invalid "0-0" mower and other JSON:API items are left out', () => {
  const [one] = items();
  assert.equal(isMowerItem(one), true);
  assert.equal(isMowerItem({ ...one, id: '0-0' }), false);
  assert.equal(isMowerItem({ ...one, type: 'workArea' }), false);
  assert.equal(isMowerItem({ id: 'x' }), false);
  // The reasons name the shape only: no id, name or serial number.
  assert.equal(mowerItemRejection(one), null);
  assert.equal(mowerItemRejection({ ...one, id: '0-0' }), 'id "0-0" (placeholder)');
  assert.equal(mowerItemRejection({ ...one, type: 'workArea' }), 'type "workArea"');
  // Only a schema word is echoed: anything else (spaces, quotes, too long) is not.
  assert.equal(mowerItemRejection({ ...one, type: 'a b' }), 'type (unexpected type)');
  assert.equal(mowerItemRejection({ ...one, type: 'x'.repeat(41) }), 'type (unexpected type)');
  assert.equal(mowerItemRejection({ ...one, type: 7 }), 'type (unexpected type)');
  assert.equal(mowerItemRejection({ id: 'x' }), 'no attributes');
  assert.equal(mowerItemRejection({ attributes: {} }), 'no id');
  assert.equal(mowerItemRejection(null), 'not an object (null)');
  assert.equal(mowerItemRejection('mower'), 'not an object (string)');
});

test('the shape of a GET /mowers answer, for the log, without its contents', () => {
  assert.equal(documentShape({ data: [] }), 'keys [data], data array of 0, 11 bytes');
  assert.equal(
    documentShape({ data: { id: 'secret' }, meta: {} }),
    'keys [data, meta], data object, 34 bytes',
  );
  assert.equal(documentShape({ errors: [] }), 'keys [errors], data absent, 13 bytes');
  assert.equal(documentShape({ data: null }), 'keys [data], data null, 13 bytes');
  assert.equal(documentShape(undefined), 'undefined instead of a JSON:API document');
  assert.equal(documentShape('[]'), 'string instead of a JSON:API document');
});

test('websocket messages: the pong, the ready message, v2 events', () => {
  assert.deepEqual(parseMessage(''), { kind: 'pong' });
  assert.deepEqual(parseMessage(JSON.stringify(fixture('events.json').connection)), {
    kind: 'ready',
    ready: true,
  });
  const mower = event('mower');
  assert.equal(mower.kind, 'event');
  assert.equal(mower.type, 'mower-event-v2');
  assert.equal(mower.id, PELOUSE);
  assert.equal(parseMessage('not json').kind, 'other');
  assert.equal(parseMessage('[1]').kind, 'other');
});

test('v2 events merge into the mower attributes without touching the input', () => {
  const [item] = items();
  const before = JSON.stringify(item.attributes);
  const leaving = applyEvent(item.attributes, event('mower'), FIXTURE_NOW);
  assert.equal(JSON.stringify(item.attributes), before);
  assert.equal(leaving.mower.activity, 'LEAVING');
  assert.equal(leaving.mower.mode, 'MAIN_AREA');
  assert.equal(leaving.metadata.statusTimestamp, FIXTURE_NOW, 'an event proves the connection');
  assert.equal(leaving.system.name, 'Pelouse', 'the rest is kept');
  assert.equal(
    applyEvent(item.attributes, event('battery'), FIXTURE_NOW).battery.batteryPercent,
    77,
  );
  // The websocket sends the local timestamps in seconds.
  const planned = applyEvent(item.attributes, event('planner'), FIXTURE_NOW);
  assert.equal(
    mowerOf({ id: PELOUSE, attributes: planned }, PARIS).nextStartLocal,
    '2026-10-15 09:00',
  );
  assert.equal(
    applyEvent(item.attributes, event('cuttingHeight'), FIXTURE_NOW).settings.cuttingHeight,
    6,
  );
  const lights = applyEvent(item.attributes, event('headlights'), FIXTURE_NOW);
  assert.equal(lights.settings.headlight.mode, 'ALWAYS_ON');
  const legacy = { ...event('headlights'), attributes: { headlights: { mode: 'ALWAYS_OFF' } } };
  assert.equal(
    applyEvent(item.attributes, legacy, FIXTURE_NOW).settings.headlight.mode,
    'ALWAYS_OFF',
  );
  assert.equal(
    applyEvent(item.attributes, event('position'), FIXTURE_NOW),
    undefined,
    'no GPS kept',
  );
  assert.equal('positions' in keptAttributes(item), false);
  assert.equal(keptAttributes(item).system.name, 'Pelouse');
  assert.equal(applyEvent(item.attributes, event('message'), FIXTURE_NOW), undefined);
});

test('the error codes, in English and French', () => {
  assert.deepEqual(errorText(9), { en: 'Trapped', fr: 'Coincée' });
  assert.deepEqual(errorText(1), { en: 'Outside working area', fr: 'Hors de la zone de travail' });
  assert.equal(errorText(58).en, 'Temporary battery problem');
  assert.equal(errorText(724).fr, 'Le logiciel de la carte de communication doit être mis à jour');
  assert.deepEqual(errorText(999), { en: 'Error 999', fr: 'Erreur 999' });
  // The documented list skips some numbers: they stay unknown.
  for (const missing of [0, 140, 146, 150, 164, 718]) {
    assert.ok(!KNOWN_CODES.includes(missing), `${missing} is not documented`);
  }
  // The documented list (2026-10-14) has 180 codes besides 0, the table all of them.
  assert.equal(KNOWN_CODES.length, 180);
});

test('the configuration is normalized', () => {
  assert.deepEqual(normalizeConfig(), {
    appKey: '',
    appSecret: '',
    startMinutes: 180,
    resyncMinutes: 30,
    language: 'fr',
  });
  const config = normalizeConfig({
    app_key: ' "abc" ',
    app_secret: 'def ',
    start_minutes: 5,
    resync_minutes: 999,
    language: 'EN',
  });
  assert.equal(config.appKey, 'abc');
  assert.equal(config.appSecret, 'def');
  assert.equal(config.startMinutes, 10, 'at least 10 minutes');
  assert.equal(config.resyncMinutes, 120, 'at most 2 hours');
  assert.equal(config.language, 'en');
  assert.equal(normalizeConfig({ language: 'de', start_minutes: '' }).language, 'fr');
  assert.equal(normalizeConfig({ start_minutes: '' }).startMinutes, 180);
});

test('the Gladys state of a mower, as the device widget shows it', () => {
  const base = mowerOf(items()[0], PARIS);
  const at = (o) => dockStateOf({ ...base, ...o });
  assert.equal(at({}), DOCK_STATE.DOCKED);
  assert.equal(at({ activity: 'mowing', state: 'in_operation' }), DOCK_STATE.RUNNING);
  assert.equal(at({ activity: 'leaving', state: 'in_operation' }), DOCK_STATE.RUNNING);
  assert.equal(at({ activity: 'going_home' }), DOCK_STATE.RETURNING);
  assert.equal(at({ activity: 'charging' }), DOCK_STATE.CHARGING);
  assert.equal(at({ activity: 'stopped_in_garden' }), DOCK_STATE.STOPPED);
  assert.equal(at({ activity: 'mowing', state: 'paused' }), DOCK_STATE.PAUSED);
  assert.equal(at({ activity: 'mowing', state: 'fatal_error' }), DOCK_STATE.ERROR);
  assert.equal(runModeOf({ ...base, activity: 'mowing', state: 'in_operation' }), 1);
  assert.equal(runModeOf(base), 0);
});

test('one device per mower, its feature keys and its states', () => {
  const gladys = { externalId: (suffix) => `ext:automower:${suffix}` };
  const mower = mowerOf(items()[0], PARIS);
  const device = buildMowerDevice(gladys, mower);
  assert.equal(device.external_id, `ext:automower:mower:${PELOUSE}`);
  assert.deepEqual(parseExternalId(device.external_id), { kind: 'mower', id: PELOUSE });
  assert.equal(parseExternalId('ext:automower:other:1'), undefined);
  assert.deepEqual(
    device.features.map((f) => f.external_id.split(':').at(-1)),
    Object.values(FEATURE),
  );
  const runMode = device.features.find((f) => f.external_id.endsWith(':run_mode'));
  assert.equal(runMode.category, 'vacuum-cleaner');
  assert.equal(runMode.read_only, false);
  assert.deepEqual(
    runMode.supported_options.map((o) => o.value),
    [0, 1],
  );
  const fr = Object.fromEntries(
    mowerStates(device.external_id, mower, 'fr').map((s) => [
      s.device_feature_external_id.split(':').at(-1),
      s.text ?? s.state,
    ]),
  );
  assert.deepEqual(fr, {
    state: DOCK_STATE.DOCKED,
    run_mode: 0,
    battery: 100,
    activity: 'Garée à la station',
    mode: 'Zone principale',
    error_code: 0,
    error: '—',
    connected: 1,
    next_start: '2026-10-14 10:00',
  });
  const trapped = { ...mower, state: 'error', errorCode: 9, activity: 'stopped_in_garden' };
  const en = mowerStates(device.external_id, trapped, 'en');
  assert.ok(en.some((s) => s.text === 'Trapped'));
  assert.ok(en.some((s) => s.text === 'Stopped in the garden'));
  assert.ok(en.some((s) => s.device_feature_external_id.endsWith(':error_code') && s.state === 9));
});
