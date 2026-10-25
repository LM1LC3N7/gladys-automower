// -----------------------------------------------------------------------------
// The integration against the SDK's fake Gladys, a fake Husqvarna and a fake
// websocket.
// -----------------------------------------------------------------------------

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { AutomowerApp } from '../src/app.js';
import { ACTIONS, SCENE_ACTIONS, SCENE_TRIGGERS, WIDGETS } from '../src/constants.js';
import {
  FIXTURE_NOW,
  JARDIN,
  KEY,
  PELOUSE,
  SECRET,
  fixture,
  husqvarna,
  installFetch,
  json,
  mowersDocument,
} from './helpers/fakeFetch.js';
import { createFakeTimers } from './helpers/fakeTimers.js';
import { createSocketFactory } from './helpers/fakeSocket.js';

let fake;
afterEach(() => fake?.restore());

const MINUTE = 60_000;
const CONFIG = { app_key: KEY, app_secret: SECRET, start_minutes: 180, resync_minutes: 30 };
const DEVICE = `ext:automower:mower:${PELOUSE}`;
const TOKEN = fixture('token.json').access_token;
const EVENTS = fixture('events.json');

const settle = () => new Promise((resolve) => setImmediate(resolve));

async function setup({ config = CONFIG, routes = [], create = true, live = true } = {}) {
  const state = { document: fixture('mowers.json') };
  fake = installFetch([...routes, ...husqvarna(state)]);
  const gladys = createFakeGladys({ selector: 'automower', config });
  const timers = createFakeTimers();
  const sockets = createSocketFactory();
  const clock = { now: FIXTURE_NOW };
  const logs = [];
  const log = (...args) => logs.push(args.map(String).join(' '));
  const app = new AutomowerApp({
    gladys,
    logger: { info: log, warn: log, error: log, debug: log },
    now: () => clock.now,
    timers,
    sleep: async () => {},
    socketFactory: sockets.factory,
    timeZone: 'Europe/Paris',
  });
  // The wiring of index.js.
  gladys.onScanRequest(() => app.scan());
  gladys.onDeviceCreated(() => app.deviceCreated());
  gladys.onSetValue((device, feature, value) => app.setValue(device, feature, value));
  gladys.onSceneAction(SCENE_ACTIONS.START, (f) => app.startMowing(f));
  gladys.onSceneAction(SCENE_ACTIONS.PARK, (f) => app.park(f));
  gladys.onSceneAction(SCENE_ACTIONS.PAUSE, (f) => app.pause(f));
  gladys.onSceneAction(SCENE_ACTIONS.RESUME, (f) => app.resumeSchedule(f));
  gladys.onWidgetGet(WIDGETS.MOWER, (request) => app.getWidget(request));
  gladys.onWidgetAction(WIDGETS.MOWER, (key, params) => app.widgetAction(key, params));
  gladys.onAction(ACTIONS.TEST, () => app.testConnection());
  gladys.handleShutdown(() => app.shutdown());
  await gladys.connect();
  await app.start(config);
  if (create) {
    for (const device of gladys.fake.discoveredDevices ?? []) {
      await gladys.fake.deviceCreated(device);
    }
  }
  await settle();
  if (live && sockets.last()) {
    sockets.last().open();
  }
  return { app, gladys, timers, clock, state, sockets, logs };
}

const made = (from = 0) => fake.calls.slice(from).map((c) => `${c.method} ${c.path}`);
const count = (pattern) => made().filter((line) => pattern.test(line)).length;
const lastState = (gladys, key, id = DEVICE) => gladys.fake.lastState(`${id}:${key}`);
const deviceOf = (gladys, id = DEVICE) =>
  gladys.fake.discoveredDevices.find((d) => d.external_id === id);
const featureOf = (device, key) => device.features.find((f) => f.external_id.endsWith(`:${key}`));

/** A v2 event of the fixture, for a mower, with the attributes edited. */
async function push(sockets, name, edit = (a) => a, id = PELOUSE) {
  const event = structuredClone(EVENTS[name]);
  event.id = id;
  edit(event.attributes);
  sockets.last().receive(event);
  await settle();
}

/** Move the clock minute by minute, running the loop (and the keepalive) each minute. */
async function advance({ clock, timers }, minutes) {
  for (let i = 0; i < minutes; i += 1) {
    clock.now += MINUTE;
    await timers.runIntervals();
    await settle();
  }
}

/** Run the pending timeouts of one delay (the read back is 30 s). */
async function runTimeouts(timers, ms) {
  for (const t of timers.timeouts().filter((x) => x.ms === ms)) {
    timers.pending.delete(t.id);
    await t.fn();
  }
  await settle();
}

test('start: one token, one read, two mowers offered, their states, nothing fired, the websocket', async () => {
  const { gladys, sockets } = await setup();
  assert.deepEqual(made(), ['POST auth/oauth2/token', 'GET api/mowers']);
  const devices = gladys.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((d) => d.name),
    ['Pelouse', 'Jardin arrière'],
  );
  assert.equal(devices[0].features.length, 10);
  assert.equal(lastState(gladys, 'state'), 6, 'docked');
  assert.equal(lastState(gladys, 'run_mode'), 0);
  assert.equal(lastState(gladys, 'battery'), 100);
  assert.equal(lastState(gladys, 'activity'), 'Garée à la station');
  assert.equal(lastState(gladys, 'next_start'), '2026-10-14 10:00');
  assert.equal(lastState(gladys, 'state', `ext:automower:mower:${JARDIN}`), 1, 'mowing');
  assert.equal(gladys.fake.sceneEvents.length, 0, 'nothing on the first reading');
  assert.equal(sockets.sockets.length, 1);
  assert.equal(sockets.last().headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(gladys.fake.connectionStatus.message.en, /2 mowers, live events/);
});

test('live events: states and triggers at once, no REST call, a whole session timed', async () => {
  const { gladys, sockets, clock } = await setup();
  const calls = fake.calls.length;
  clock.now += MINUTE;
  await push(sockets, 'mower');
  assert.equal(lastState(gladys, 'state'), 1);
  assert.equal(lastState(gladys, 'run_mode'), 1);
  assert.equal(lastState(gladys, 'activity'), 'Départ de la station');
  const [changed] = gladys.fake.sceneEvents;
  assert.equal(changed.key, SCENE_TRIGGERS.ACTIVITY);
  assert.equal(changed.data.mower, DEVICE);
  assert.equal(changed.data.activity, 'leaving');
  assert.equal(changed.data.previous_activity, 'parked_in_cs');
  await push(sockets, 'battery');
  assert.equal(lastState(gladys, 'battery'), 77);
  await push(sockets, 'message');
  await push(sockets, 'position');
  const mower = (activity) => (a) => {
    a.mower.activity = activity;
  };
  clock.now += 2 * MINUTE;
  await push(sockets, 'mower', mower('MOWING'));
  clock.now += 70 * MINUTE;
  await push(sockets, 'mower', mower('GOING_HOME'));
  clock.now += 5 * MINUTE;
  await push(sockets, 'mower', (a) => {
    a.mower.activity = 'PARKED_IN_CS';
    a.mower.state = 'RESTRICTED';
  });
  const finished = gladys.fake.sceneEvents.find((e) => e.key === SCENE_TRIGGERS.FINISHED);
  assert.equal(finished.data.minutes, 77);
  assert.equal(finished.data.battery, 77);
  assert.equal(gladys.fake.sceneEvents.filter((e) => e.key === SCENE_TRIGGERS.ACTIVITY).length, 4);
  assert.equal(fake.calls.length, calls, 'the websocket alone');
  assert.ok(gladys.fake.widgetRefreshes.length > 0);
});

test('an error from the mower: one mower_error event, the error features', async () => {
  const { gladys, sockets } = await setup();
  const trapped = (a) => {
    a.mower.activity = 'STOPPED_IN_GARDEN';
    a.mower.state = 'ERROR';
    a.mower.errorCode = 9;
    a.mower.errorCodeTimestamp = Date.UTC(2026, 9, 14, 8, 59) / 1000;
  };
  await push(sockets, 'mower', trapped);
  await push(sockets, 'mower', trapped);
  const errors = gladys.fake.sceneEvents.filter((e) => e.key === SCENE_TRIGGERS.ERROR);
  assert.equal(errors.length, 1);
  assert.deepEqual(errors[0].data, {
    mower: DEVICE,
    mower_name: 'Pelouse',
    code: 9,
    error_en: 'Trapped',
    error_fr: 'Coincée',
    error_at: '2026-10-14T06:59:00.000Z',
    state: 'error',
  });
  assert.equal(lastState(gladys, 'state'), 3);
  assert.equal(lastState(gladys, 'error_code'), 9);
  assert.equal(lastState(gladys, 'error'), 'Coincée');
});

test('the pace: a resync every 30 minutes while live, every 10 minutes while the link is down', async () => {
  const ctx = await setup();
  const { gladys, sockets, state } = ctx;
  await advance(ctx, 120);
  assert.equal(count(/GET api\/mowers$/), 1 + 4);
  assert.ok(sockets.last().sent.length >= 120, 'one keepalive a minute');
  // The cloud loses a mower: only a resync can tell.
  state.document = mowersDocument((a, id) => {
    if (id === PELOUSE) {
      a.metadata.connected = false;
    }
  });
  await advance(ctx, 30);
  assert.equal(lastState(gladys, 'connected'), 0);
  const lost = gladys.fake.sceneEvents.filter((e) => e.key === SCENE_TRIGGERS.DISCONNECTED);
  assert.equal(lost.length, 1);
  assert.equal(lost[0].data.mower, DEVICE);
  assert.equal(lost[0].data.last_seen, new Date(1791961080000).toISOString());
  // The websocket drops and does not come back: REST every 10 minutes.
  sockets.last().drop(1006);
  const before = count(/GET api\/mowers$/);
  await advance(ctx, 60);
  assert.equal(count(/GET api\/mowers$/) - before, 6);
  assert.match(gladys.fake.connectionStatus.message.en, /live link down/);
  // 210 minutes: the token (an hour) renewed 5 minutes ahead, never more.
  assert.equal(count(/token/), 4);
});

test('the device commands: mow / pause select and dock button, read back 30 s later', async () => {
  const { gladys, timers } = await setup();
  const device = deviceOf(gladys);
  const runMode = featureOf(device, 'run_mode');
  assert.equal((await gladys.fake.setValue(device, runMode, 1)).success, true);
  assert.deepEqual(fake.calls.at(-1).body, {
    data: { type: 'Start', attributes: { duration: 180 } },
  });
  assert.equal((await gladys.fake.setValue(device, runMode, 0)).success, true);
  assert.deepEqual(fake.calls.at(-1).body, { data: { type: 'Pause' } });
  await gladys.fake.setValue(device, featureOf(device, 'dock'), 1);
  assert.deepEqual(fake.calls.at(-1).body, { data: { type: 'ParkUntilNextSchedule' } });
  assert.equal(timers.timeouts().filter((t) => t.ms === 30_000).length, 1, 'one read back');
  await runTimeouts(timers, 30_000);
  assert.equal(made().at(-1), `GET api/mowers/${PELOUSE}`);
  assert.equal(lastState(gladys, 'run_mode'), 0, 'the real mode, re-sent');
  const mapping = await gladys.fake.setValue(device, runMode, 2);
  assert.equal(mapping.success, false);
  assert.equal(
    (await gladys.fake.setValue(device, featureOf(device, 'battery'), 1)).success,
    false,
  );
});

test('scene actions: start, park in three ways, pause, resume, on one mower or all', async () => {
  const { gladys } = await setup();
  const action = (key, fields) => gladys.fake.sceneAction(key, fields);
  const bodies = (from) => fake.calls.slice(from).map((c) => c.body?.data);
  let from = fake.calls.length;
  const one = await action(SCENE_ACTIONS.START, { mower: DEVICE, duration: 45 });
  assert.deepEqual(one.data.outputs, { mower_name: 'Pelouse', count: 1, minutes: 45 });
  assert.deepEqual(bodies(from), [{ type: 'Start', attributes: { duration: 45 } }]);
  from = fake.calls.length;
  const all = await action(SCENE_ACTIONS.START, {});
  assert.deepEqual(all.data.outputs, {
    mower_name: 'Pelouse, Jardin arrière',
    count: 2,
    minutes: 180,
  });
  assert.deepEqual(
    fake.calls.slice(from).map((c) => c.path),
    [`api/mowers/${PELOUSE}/actions`, `api/mowers/${JARDIN}/actions`],
  );
  const missing = await action(SCENE_ACTIONS.PARK, { mower: DEVICE, mode: 'duration' });
  assert.equal(missing.success, false);
  from = fake.calls.length;
  const forTwoHours = await action(SCENE_ACTIONS.PARK, {
    mower: DEVICE,
    mode: 'duration',
    duration: 120,
  });
  assert.equal(forTwoHours.data.outputs.minutes, 120);
  await action(SCENE_ACTIONS.PARK, { mower: DEVICE, mode: 'further_notice' });
  const next = await action(SCENE_ACTIONS.PARK, { mower: DEVICE });
  assert.equal(next.data.outputs.mode, 'next_schedule');
  await action(SCENE_ACTIONS.PAUSE, { mower: DEVICE });
  await action(SCENE_ACTIONS.RESUME, { mower: 'pelouse' });
  assert.deepEqual(bodies(from), [
    { type: 'Park', attributes: { duration: 120 } },
    { type: 'ParkUntilFurtherNotice' },
    { type: 'ParkUntilNextSchedule' },
    { type: 'Pause' },
    { type: 'ResumeSchedule' },
  ]);
  const unknown = await action(SCENE_ACTIONS.PAUSE, { mower: 'ext:automower:mower:nope' });
  assert.equal(unknown.success, false);
  assert.match(unknown.error, /Unknown mower/);
  assert.equal(gladys.fake.sceneEvents.length, 0, 'an action fires no event by itself');
});

test('the widget and its four buttons', async () => {
  const { gladys } = await setup({
    routes: [
      [
        'POST',
        /^api\/mowers\/[^/]+\/actions$/,
        ({ body }) =>
          body.data.type === 'Pause'
            ? json({ errors: [{ detail: 'Mower is not connected' }] }, 400)
            : json({ data: { type: 'control', id: 'x' } }, 202),
      ],
    ],
  });
  const widget = await gladys.fake.widgetGet(WIDGETS.MOWER, {
    settings: { mower: `ext:automower:mower:${JARDIN}` },
    language: 'fr',
  });
  const content = widget.data.content;
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.components[0].text, 'Jardin arrière');
  const first = await gladys.fake.widgetGet(WIDGETS.MOWER, { settings: {}, language: 'en' });
  assert.equal(first.data.content.components[0].text, 'Pelouse');
  const act = async (key) =>
    (await gladys.fake.widgetAction(WIDGETS.MOWER, key, { mower: PELOUSE })).data.message;
  assert.match((await act('start')).fr, /Pelouse : tonte pendant 180 min/);
  assert.match((await act('park')).en, /until the next schedule/);
  assert.match((await act('resume_schedule')).en, /back to its schedule/);
  const refused = await act('pause');
  assert.match(
    refused.en,
    /Husqvarna refused: Husqvarna refused the command: Mower is not connected/,
  );
});

test('a refused key: said once, never retried on a reconnection, retried once the configuration is saved', async () => {
  const { app, gladys, timers, sockets } = await setup({
    routes: [
      ['POST', /^auth\/oauth2\/token$/, () => json(fixture('token-invalid-client.json'), 400)],
    ],
  });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /refused the application key or secret/);
  assert.equal(timers.pending.size, 0, 'no loop');
  assert.equal(sockets.sockets.length, 0, 'no websocket');
  await app.start(CONFIG);
  assert.equal(count(/token/), 1, 'a reconnection to Gladys does not try again');
  await app.start(CONFIG, { resume: true });
  assert.equal(count(/token/), 2, 'a saved configuration does');
  // The application exists but is not connected to the Automower Connect API.
  fake.restore();
  fake = installFetch([
    ['POST', /^auth\/oauth2\/token$/, () => ({ ...fixture('token.json'), scope: 'iam:read' })],
  ]);
  await app.start({ ...CONFIG, app_secret: 'another' });
  assert.match(gladys.fake.connectionStatus.message.fr, /pas connectée à l'API Automower Connect/);
  // Fixed on the portal: the Test button tries again and starts for real.
  fake.restore();
  fake = installFetch(husqvarna({ document: fixture('mowers.json') }));
  gladys.fake.config = { ...CONFIG, app_secret: 'another' };
  await gladys.getConfig();
  const fixed = await gladys.fake.action(ACTIONS.TEST);
  assert.match(fixed.data.message.en, /Pelouse \(430X\)/);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.ok(timers.intervals().length > 0, 'the loop runs again');
  // No credentials at all.
  await app.start({});
  assert.match(gladys.fake.connectionStatus.message.en, /No application key or secret/);
});

test('outages: Husqvarna down, then the API limit; the loop retries at its pace', async () => {
  const outage = { status: 503 };
  const ctx = await setup({
    create: false,
    routes: [
      [
        'GET',
        /^api\/mowers$/,
        () =>
          outage.status
            ? json(
                outage.status === 400
                  ? { errors: [{ detail: 'Not Acceptable' }] }
                  : { message: outage.status === 429 ? 'Too Many Requests' : 'Down' },
                outage.status,
                outage.retry ? { 'retry-after': outage.retry } : {},
              )
            : fixture('mowers.json'),
      ],
    ],
  });
  const { gladys, app } = ctx;
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /Husqvarna is unreachable: HTTP 503/);
  // Issue #1: a 400 on the read is not an outage nor a refused command, and nothing stops.
  outage.status = 400;
  await advance(ctx, 10);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(
    gladys.fake.connectionStatus.message.en,
    /^Husqvarna refused the request \(Husqvarna refused the request: Not Acceptable\)\. Retrying every 10 minutes/,
  );
  assert.match(
    gladys.fake.connectionStatus.message.fr,
    /^Husqvarna a refusé la requête \(Husqvarna refused the request: Not Acceptable\)\. Nouvel essai toutes les 10 minutes/,
  );
  assert.equal(app.fatal, undefined, 'not final');
  const refused = count(/GET api\/mowers$/);
  outage.status = 0;
  await advance(ctx, 10);
  assert.equal(count(/GET api\/mowers$/), refused + 1, 'read again 10 minutes later');
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(gladys.fake.discoveredDevices.length, 2);
  outage.status = 429;
  outage.retry = '3600';
  await advance(ctx, 30);
  assert.match(
    gladys.fake.connectionStatus.message.en,
    /limit reached: reading paused until 08:50 UTC/,
  );
  const paused = count(/GET api\/mowers$/);
  outage.status = 0;
  await advance(ctx, 59);
  assert.equal(count(/GET api\/mowers$/), paused, 'nothing while paused');
  await advance(ctx, 2);
  assert.equal(count(/GET api\/mowers$/), paused + 1);
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('no mower kept: the log says how many were listed and why each one is dropped', async () => {
  const document = fixture('mowers.json');
  const ctx = await setup({ create: false, routes: [['GET', /^api\/mowers$/, () => document]] });
  const { gladys, logs } = ctx;
  const listing = () => logs.filter((l) => /mower\(s\) listed/.test(l));
  assert.deepEqual(listing(), ['Husqvarna: 2 mower(s) listed, 2 kept']);
  // Issue #3: an empty list says the shape of the answer, not its contents.
  document.data = [];
  await advance(ctx, 30);
  assert.equal(
    listing().at(-1),
    'Husqvarna: 0 mower(s) listed, 0 kept (answer: keys [data], data array of 0, 11 bytes)',
  );
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(gladys.fake.connectionStatus.message.en, /account has no mower.*same e-mail/);
  assert.match(gladys.fake.connectionStatus.message.fr, /même e-mail/);
  assert.equal(listing().length, 2, 'once per read, not per tick');
  // Items of another type, one without attributes, the "0-0" placeholder.
  const [pelouse, jardin] = fixture('mowers.json').data;
  document.data = [
    { ...pelouse, type: 'workArea' },
    { ...jardin, attributes: undefined },
    { ...pelouse, id: '0-0' },
  ];
  await advance(ctx, 30);
  assert.equal(
    listing().at(-1),
    'Husqvarna: 3 mower(s) listed, 0 kept (dropped: type "workArea"; no attributes; id "0-0" (placeholder))',
  );
  // Not a JSON:API document at all.
  delete document.data;
  document.message = 'ok';
  await advance(ctx, 30);
  assert.equal(
    listing().at(-1),
    'Husqvarna: 0 mower(s) listed, 0 kept (answer: keys [message], data absent, 16 bytes)',
  );
  // One kept, one dropped: the status counts the kept one.
  delete document.message;
  document.data = [pelouse, { ...jardin, type: 'workArea' }];
  await advance(ctx, 30);
  assert.equal(listing().at(-1), 'Husqvarna: 2 mower(s) listed, 1 kept (dropped: type "workArea")');
  assert.match(gladys.fake.connectionStatus.message.en, /1 mower,/);
  const everything = JSON.stringify([logs, gladys.fake.connectionStatuses]);
  for (const leak of [KEY, SECRET, TOKEN, PELOUSE, JARDIN, 'Pelouse', 'Jardin', '192800001']) {
    assert.ok(!everything.includes(leak), `leaked: ${leak}`);
  }
});

test('a mower paired since: its first event reads the account, discovery offers it', async () => {
  const { gladys, sockets, clock, state } = await setup();
  const NEW = '9d0c7e3a-1111-4a2b-8c3d-4e5f6a7b8c9d';
  const document = fixture('mowers.json');
  document.data.push({ ...structuredClone(document.data[0]), id: NEW });
  document.data[2].attributes.system.name = 'Verger';
  state.document = document;
  await push(sockets, 'battery', undefined, NEW);
  assert.equal(count(/GET api\/mowers$/), 1, 'not right after a read');
  clock.now += 6 * MINUTE;
  await push(sockets, 'battery', undefined, NEW);
  await settle();
  assert.equal(count(/GET api\/mowers$/), 2);
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((d) => d.name),
    ['Pelouse', 'Jardin arrière', 'Verger'],
  );
});

test('the Test button, the shutdown, and no secret anywhere', async () => {
  const { gladys, logs } = await setup();
  const result = await gladys.fake.action(ACTIONS.TEST);
  assert.match(
    result.data.message.en,
    /Pelouse \(430X\): Parked in the station, restricted, battery 100 %/,
  );
  assert.match(result.data.message.fr, /Jardin arrière \(450X EPOS\) : Tonte/);
  assert.match(result.data.message.en, /Live events: connected/);
  await gladys.fake.shutdown();
  assert.equal(made().at(-1), 'POST auth/oauth2/revoke');
  const everything = JSON.stringify([
    logs,
    gladys.fake.connectionStatuses,
    gladys.fake.sceneEvents,
    gladys.fake.states,
    gladys.fake.discoveredDevices,
  ]);
  for (const secret of [KEY, SECRET, TOKEN]) {
    assert.ok(!everything.includes(secret), 'a secret leaked');
  }
});
