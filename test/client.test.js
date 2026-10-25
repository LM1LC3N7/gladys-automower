// -----------------------------------------------------------------------------
// The token (client credentials) and the REST client, against a fake
// Husqvarna. The error bodies are the real answers of 2026-10-14.
// -----------------------------------------------------------------------------

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { TokenManager } from '../src/automower/auth.js';
import { AutomowerClient, AutomowerError } from '../src/automower/client.js';
import {
  FIXTURE_NOW,
  KEY,
  PELOUSE,
  SECRET,
  fixture,
  husqvarna,
  installFetch,
  json,
} from './helpers/fakeFetch.js';

let fake;
afterEach(() => fake?.restore());

const MINUTE = 60_000;

function setup({ routes = [], state = { document: fixture('mowers.json') } } = {}) {
  fake = installFetch([...routes, ...husqvarna(state)]);
  const clock = { now: FIXTURE_NOW };
  const waits = [];
  const tokens = new TokenManager({ appKey: KEY, appSecret: SECRET, now: () => clock.now });
  const client = new AutomowerClient({
    tokens,
    now: () => clock.now,
    sleep: async (ms) => {
      waits.push(ms);
    },
  });
  return { tokens, client, clock, waits, state };
}

const made = () => fake.calls.map((c) => `${c.method} ${c.path}`);

test('the token: client credentials, reused until 5 minutes before it expires, single-flight', async () => {
  const { tokens, clock } = setup();
  const [a, b] = await Promise.all([tokens.get(), tokens.get()]);
  assert.equal(a, fixture('token.json').access_token);
  assert.equal(b, a);
  assert.deepEqual(made(), ['POST auth/oauth2/token']);
  assert.deepEqual(fake.calls[0].body, {
    grant_type: 'client_credentials',
    client_id: KEY,
    client_secret: SECRET,
  });
  clock.now += 54 * MINUTE;
  await tokens.get();
  assert.equal(fake.calls.length, 1, 'still valid for 6 minutes');
  clock.now += 2 * MINUTE;
  await tokens.get();
  assert.equal(fake.calls.length, 2, 'renewed 5 minutes ahead');
  assert.equal(tokens.issued, 2);
});

test('a refused key or secret is final: one try, never repeated, nothing secret in the message', async () => {
  const { tokens } = setup({
    routes: [
      ['POST', /^auth\/oauth2\/token$/, () => json(fixture('token-invalid-client.json'), 400)],
    ],
  });
  await assert.rejects(tokens.get(), (err) => {
    assert.ok(err instanceof AutomowerError);
    assert.equal(err.code, 'refused');
    assert.equal(err.final, true);
    assert.match(err.message, /Client not found/);
    assert.ok(!err.message.includes(SECRET) && !err.message.includes(KEY));
    return true;
  });
  await assert.rejects(tokens.get(), /refused/);
  assert.equal(fake.calls.length, 1, 'no second login attempt');
});

test('a token without the amc:api scope: the application is not connected to the API', async () => {
  const { tokens } = setup({
    routes: [
      ['POST', /^auth\/oauth2\/token$/, () => ({ ...fixture('token.json'), scope: 'iam:read' })],
    ],
  });
  await assert.rejects(tokens.get(), (err) => err.code === 'scope' && err.final);
});

test('REST: the three headers, JSON:API, and the action bodies', async () => {
  const { client } = setup();
  const mowers = await client.mowers();
  assert.equal(mowers.length, 2);
  const read = fake.calls.find((c) => c.path === 'api/mowers');
  assert.equal(read.headers.Authorization, `Bearer ${fixture('token.json').access_token}`);
  assert.equal(read.headers['X-Api-Key'], KEY);
  assert.equal(read.headers['Authorization-Provider'], 'husqvarna');
  // Issue #1: Accept: application/json is answered 400 "Not Acceptable".
  assert.equal(read.headers.Accept, 'application/vnd.api+json');
  assert.match(read.headers['User-Agent'], /^gladys-automower\//);
  await client.start(PELOUSE, 180);
  await client.parkFor(PELOUSE, 60);
  await client.parkUntilNextSchedule(PELOUSE);
  await client.parkUntilFurtherNotice(PELOUSE);
  await client.pause(PELOUSE);
  await client.resumeSchedule(PELOUSE);
  const actions = fake.calls.filter((c) => c.path.endsWith('/actions'));
  assert.equal(actions[0].path, `api/mowers/${PELOUSE}/actions`);
  assert.equal(actions[0].headers['Content-Type'], 'application/vnd.api+json');
  assert.equal(actions[0].headers.Accept, 'application/vnd.api+json');
  assert.deepEqual(
    actions.map((c) => c.body),
    [
      { data: { type: 'Start', attributes: { duration: 180 } } },
      { data: { type: 'Park', attributes: { duration: 60 } } },
      { data: { type: 'ParkUntilNextSchedule' } },
      { data: { type: 'ParkUntilFurtherNotice' } },
      { data: { type: 'Pause' } },
      { data: { type: 'ResumeSchedule' } },
    ],
  );
  assert.equal((await client.mower(PELOUSE)).id, PELOUSE);
  assert.equal(client.calls, 8);
});

test('two REST calls are at least a second apart', async () => {
  const { client, waits, clock } = setup();
  await client.mowers();
  await client.pause(PELOUSE);
  assert.deepEqual(waits, [1000]);
  clock.now += 5_000;
  await client.pause(PELOUSE);
  assert.deepEqual(waits, [1000], 'no wait once a second has passed');
});

test('a 401 renews the token once; the real gateway errors become codes', async () => {
  let refusals = 1;
  const { client } = setup({
    routes: [
      [
        'GET',
        /^api\/mowers$/,
        () => (refusals-- > 0 ? json(fixture('unauthorized.json'), 401) : fixture('mowers.json')),
      ],
    ],
  });
  assert.equal((await client.mowers()).length, 2);
  assert.deepEqual(made(), [
    'POST auth/oauth2/token',
    'GET api/mowers',
    'POST auth/oauth2/token',
    'GET api/mowers',
  ]);
  const failing = (status, body, headers) =>
    setup({ routes: [['GET', /^api\/mowers$/, () => json(body, status, headers)]] }).client;
  fake.restore();
  await assert.rejects(
    failing(401, fixture('unauthorized.json')).mowers(),
    (err) => err.code === 'unauthorized',
  );
  fake.restore();
  await assert.rejects(
    failing(429, { message: 'Too Many Requests' }, { 'retry-after': '120' }).mowers(),
    (err) => err.code === 'rate_limited' && err.retryAfterMs === 120_000,
  );
  fake.restore();
  await assert.rejects(
    failing(403, { message: 'Limit Exceeded' }).mowers(),
    (err) => err.code === 'rate_limited',
  );
  fake.restore();
  await assert.rejects(
    failing(403, { message: 'Forbidden' }).mowers(),
    (err) => err.code === 'forbidden' && /Forbidden/.test(err.message),
  );
  fake.restore();
  // Issue #1: a 400 on a read is "the request", on an action "the command".
  await assert.rejects(
    failing(400, {
      errors: [{ detail: 'Not Acceptable. Likley an invalid Accept header' }],
    }).mowers(),
    (err) =>
      err.code === 'bad_request' &&
      err.message ===
        'Husqvarna refused the request: Not Acceptable. Likley an invalid Accept header' &&
      err.detail === 'Not Acceptable. Likley an invalid Accept header',
  );
  fake.restore();
  await assert.rejects(
    setup({
      routes: [
        ['POST', /\/actions$/, () => json({ errors: [{ detail: 'Mower is not connected' }] }, 400)],
      ],
    }).client.pause(PELOUSE),
    (err) =>
      err.code === 'bad_request' &&
      err.message === 'Husqvarna refused the command: Mower is not connected',
  );
  fake.restore();
  await assert.rejects(
    failing(503, { errors: [{ title: 'Service Unavailable' }] }).mowers(),
    (err) => err.code === 'http' && /503 on \/v1\/mowers: Service Unavailable/.test(err.message),
  );
});

test('the token is revoked at Husqvarna, with itself as the bearer', async () => {
  const { tokens } = setup();
  const token = await tokens.get();
  assert.equal(await tokens.revoke(), true);
  const revoke = fake.calls.at(-1);
  assert.equal(revoke.path, 'auth/oauth2/revoke');
  assert.deepEqual(revoke.body, { token });
  assert.equal(revoke.headers.Authorization, `Bearer ${token}`);
  assert.equal(revoke.headers.Accept, '*/*', 'no JSON asked for: no reference client does');
  assert.equal(await tokens.revoke(), false, 'nothing left to revoke');
});
