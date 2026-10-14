// -----------------------------------------------------------------------------
// Two readings -> scene events: the first reading fires nothing, every
// transition fires once.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mowerOf } from '../src/automower/model.js';
import { SCENE_TRIGGERS } from '../src/constants.js';
import { mowerEvents, nextReading } from '../src/triggers.js';
import { FIXTURE_NOW, fixture } from './helpers/fakeFetch.js';

const MINUTE = 60_000;
const DEVICE = 'ext:automower:mower:x';
const base = mowerOf(fixture('mowers.json').data[0], { timeZone: 'Europe/Paris' });

/** Feed successive mowers (overrides of the fixture) and collect the events. */
function play(...steps) {
  let previous;
  const all = [];
  steps.forEach(([minutes, overrides], i) => {
    const reading = nextReading(
      previous,
      { ...base, ...overrides },
      FIXTURE_NOW + minutes * MINUTE,
    );
    const events = mowerEvents(DEVICE, previous, reading);
    all.push(...events.map((e) => ({ ...e, step: i })));
    previous = reading;
  });
  return all;
}

const keys = (events) => events.map((e) => e.key);

test('the first reading fires nothing, an unchanged reading neither', () => {
  assert.deepEqual(play([0, { activity: 'mowing', state: 'error', errorCode: 9 }]), []);
  assert.deepEqual(play([0, {}], [5, {}], [10, { battery: 80 }]), []);
});

test('an activity change fires activity_changed once', () => {
  const events = play(
    [0, {}],
    [1, { activity: 'leaving', state: 'in_operation' }],
    [2, { activity: 'leaving', state: 'in_operation', battery: 99 }],
  );
  assert.deepEqual(keys(events), [SCENE_TRIGGERS.ACTIVITY]);
  assert.deepEqual(events[0].data, {
    mower: DEVICE,
    mower_name: 'Pelouse',
    activity: 'leaving',
    previous_activity: 'parked_in_cs',
    state: 'in_operation',
    battery: 100,
  });
});

test('mowing_finished: the end of a session, with its length when it was seen starting', () => {
  const events = play(
    [0, {}],
    [1, { activity: 'leaving', state: 'in_operation' }],
    [3, { activity: 'mowing', state: 'in_operation', battery: 60 }],
    [80, { activity: 'going_home', state: 'in_operation', battery: 15 }],
    [85, { activity: 'charging', state: 'in_operation', battery: 16 }],
    [140, { activity: 'parked_in_cs', state: 'restricted', battery: 100 }],
  );
  const finished = events.filter((e) => e.key === SCENE_TRIGGERS.FINISHED);
  assert.equal(finished.length, 1, 'going home to charge is not the end');
  assert.equal(finished[0].data.minutes, 139);
  assert.equal(finished[0].data.activity, 'parked_in_cs');
  assert.equal(finished[0].data.battery, 100);
  assert.equal(finished[0].data.error_code, 0);
  assert.equal(finished[0].data.finished_at, new Date(FIXTURE_NOW + 140 * MINUTE).toISOString());
  // A session already running at the first reading: its length is unknown.
  const unknown = play(
    [0, { activity: 'mowing', state: 'in_operation' }],
    [30, { activity: 'stopped_in_garden', state: 'stopped' }],
  ).find((e) => e.key === SCENE_TRIGGERS.FINISHED);
  assert.equal(unknown.data.minutes, null);
});

test('mower_error: once per error, a new code or a later occurrence fires again', () => {
  const trapped = (at) => ({
    activity: 'stopped_in_garden',
    state: 'error',
    errorCode: 9,
    errorAt: new Date(FIXTURE_NOW + at * MINUTE).toISOString(),
  });
  const events = play(
    [0, { activity: 'mowing', state: 'in_operation' }],
    [1, trapped(1)],
    [2, trapped(1)],
    [3, { ...trapped(1), errorCode: 10 }],
    [4, { activity: 'mowing', state: 'in_operation' }],
    [5, trapped(5)],
    [20, trapped(20)],
  ).filter((e) => e.key === SCENE_TRIGGERS.ERROR);
  assert.deepEqual(
    events.map((e) => [e.step, e.data.code]),
    [
      [1, 9],
      [3, 10],
      [5, 9],
      [6, 9],
    ],
  );
  assert.equal(events[0].data.error_en, 'Trapped');
  assert.equal(events[0].data.error_fr, 'Coincée');
  assert.equal(events[0].data.state, 'error');
  assert.equal(events[0].data.error_at, new Date(FIXTURE_NOW + MINUTE).toISOString());
  // An error state without a code: its text is the state's.
  const fatal = play([0, {}], [1, { state: 'fatal_error' }]).find(
    (e) => e.key === SCENE_TRIGGERS.ERROR,
  );
  assert.equal(fatal.data.code, 0);
  assert.equal(fatal.data.error_en, 'Fatal error');
  assert.equal(fatal.data.error_fr, 'Erreur fatale');
});

test('mower_disconnected when the cloud loses the mower, once', () => {
  const statusAt = new Date(FIXTURE_NOW).toISOString();
  const events = play(
    [0, {}],
    [30, { connected: false, statusAt }],
    [60, { connected: false, statusAt }],
    [90, {}],
  );
  assert.deepEqual(keys(events), [SCENE_TRIGGERS.DISCONNECTED]);
  assert.deepEqual(events[0].data, {
    mower: DEVICE,
    mower_name: 'Pelouse',
    last_seen: statusAt,
    activity: 'parked_in_cs',
  });
});

test('the reading remembers the last error for the widget', () => {
  const first = nextReading(undefined, { ...base, state: 'error', errorCode: 2 }, FIXTURE_NOW);
  const second = nextReading(first, base, FIXTURE_NOW + MINUTE);
  assert.deepEqual(second.lastError, { code: 2, state: 'error', at: null, wall: null });
  assert.equal(nextReading(undefined, base, FIXTURE_NOW).lastError, null);
});
