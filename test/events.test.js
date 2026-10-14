// -----------------------------------------------------------------------------
// The websocket: the bearer on the handshake, the keepalive and its
// watchdog, the 2-hour recycling, the reconnection backoff.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventStream } from '../src/automower/events.js';
import { AutomowerError } from '../src/automower/client.js';
import { FIXTURE_NOW, fixture } from './helpers/fakeFetch.js';
import { createFakeTimers } from './helpers/fakeTimers.js';
import { createSocketFactory } from './helpers/fakeSocket.js';

const MINUTE = 60_000;
const quiet = { info() {}, warn() {}, error() {}, debug() {} };

function setup({ tokens } = {}) {
  const timers = createFakeTimers();
  const sockets = createSocketFactory();
  const clock = { now: FIXTURE_NOW };
  const received = [];
  const statuses = [];
  const fakeTokens = tokens ?? {
    invalidated: 0,
    get: async () => 'tok-1',
    invalidate() {
      this.invalidated += 1;
    },
  };
  const stream = new EventStream({
    tokens: fakeTokens,
    logger: quiet,
    socketFactory: sockets.factory,
    timers,
    now: () => clock.now,
    onEvent: (event) => received.push(event),
    onStatus: (connected) => statuses.push(connected),
  });
  return { stream, timers, sockets, clock, received, statuses, tokens: fakeTokens };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));
const timeouts = (timers) => timers.timeouts().map((t) => t.ms);

test('the bearer on the handshake, events relayed, an empty message every minute', async () => {
  const { stream, timers, sockets, received, statuses, clock } = setup();
  stream.start();
  await settle();
  const socket = sockets.last();
  assert.equal(socket.url, 'wss://ws.openapi.husqvarna.dev/v1');
  assert.equal(socket.headers.Authorization, 'Bearer tok-1');
  socket.open();
  assert.deepEqual(statuses, [true]);
  socket.receive(fixture('events.json').connection);
  socket.receive(fixture('events.json').battery);
  assert.equal(received.length, 1);
  assert.equal(received[0].type, 'battery-event-v2');
  clock.now += MINUTE;
  await timers.runIntervals();
  assert.deepEqual(socket.sent, ['']);
  socket.receive('');
  clock.now += MINUTE;
  await timers.runIntervals();
  assert.deepEqual(socket.sent, ['', '']);
  stream.stop();
  assert.equal(socket.closed, true);
  assert.deepEqual(statuses, [true, false]);
});

test('a silent connection is replaced after 3 minutes', async () => {
  const { stream, timers, sockets, clock } = setup();
  stream.start();
  await settle();
  sockets.last().open({ pong: false });
  for (let i = 0; i < 4; i += 1) {
    clock.now += MINUTE;
    await timers.runIntervals();
  }
  assert.equal(sockets.sockets[0].closed, true, 'no answer to three keepalives');
  assert.deepEqual(timeouts(timers), [5_000]);
  await timers.runTimeouts();
  await settle();
  assert.equal(sockets.sockets.length, 2);
});

test('recycled before the 2-hour limit, back one second later', async () => {
  const { stream, timers, sockets, statuses } = setup();
  stream.start();
  await settle();
  sockets.last().open();
  const recycle = timers.timeouts().find((t) => t.ms === 115 * MINUTE);
  assert.ok(recycle, 'recycle timer armed');
  timers.pending.delete(recycle.id);
  await recycle.fn();
  assert.equal(sockets.sockets[0].closed, true);
  assert.deepEqual(timeouts(timers), [1_000]);
  await timers.runTimeouts();
  await settle();
  sockets.last().open();
  assert.deepEqual(statuses, [true, false, true]);
});

test('refused handshakes: backoff 5 s then 10 s, a fresh token after two', async () => {
  const { stream, timers, sockets, tokens, clock } = setup();
  stream.start();
  await settle();
  sockets.last().drop(1006);
  assert.deepEqual(timeouts(timers), [5_000]);
  await timers.runTimeouts();
  await settle();
  sockets.last().drop(1006);
  assert.deepEqual(timeouts(timers), [10_000]);
  assert.equal(tokens.invalidated, 1);
  // A connection that lived a while resets the backoff.
  await timers.runTimeouts();
  await settle();
  const socket = sockets.last();
  socket.open();
  clock.now += 2 * MINUTE;
  socket.drop(1001);
  assert.deepEqual(timeouts(timers), [5_000]);
  stream.stop();
  assert.equal(timers.pending.size, 0);
});

test('a refused key: no socket, no retry', async () => {
  const { stream, timers, sockets } = setup({
    tokens: {
      get: async () => {
        throw new AutomowerError('refused', 'Husqvarna refused the application key or secret');
      },
    },
  });
  stream.start();
  await settle();
  assert.equal(sockets.sockets.length, 0);
  assert.equal(timers.pending.size, 0);
});
