// -----------------------------------------------------------------------------
// A fake Husqvarna for the tests: routes the requests of the authentication
// and Automower Connect APIs to handlers, records every call, and fails
// loudly on an unexpected one. No test touches the network.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { setFetch } from '../../src/http.js';

setFetch(async (url) => {
  throw new Error(`Network call without a fake fetch in a test: ${url}`);
});

export function fixture(name) {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
}

/** 2026-10-14T07:00:00Z: 09:00 in Paris, the morning the fixtures describe. */
export const FIXTURE_NOW = Date.parse('2026-10-14T07:00:00Z');

/** The two mowers of mowers.json. */
export const PELOUSE = 'c7233734-b219-4287-a173-08e3643f89f0';
export const JARDIN = '5a1e91f4-6c2d-4b8e-9f3a-2d7c8b0e4a11';

export const KEY = 'app-key-0123456789';
export const SECRET = 'app-secret-9876543210';

export const json = (body, status = 200, headers = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

/** The mowers.json document with `edit(attributes, id)` applied to each mower. */
export function mowersDocument(edit = () => {}) {
  const document = fixture('mowers.json');
  for (const item of document.data) {
    edit(item.attributes, item.id);
  }
  return document;
}

const SERVICE = {
  'api.authentication.husqvarnagroup.dev': 'auth',
  'api.amc.husqvarna.dev': 'api',
};

/**
 * Install a fake fetch. `routes` is a list of [method, RegExp on
 * "<auth|api>/<path after /v1/>", handler(call)]; a handler returns a
 * Response, or a plain value answered as JSON. `call` is { url, path,
 * method, headers, body } (a form body parsed into an object).
 */
export function installFetch(routes) {
  const calls = [];
  const previous = setFetch(async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const parsed = new URL(url);
    const path = `${SERVICE[parsed.host] ?? parsed.host}/${parsed.pathname.replace(/^\/v1\//, '')}`;
    let body = init.body;
    if (typeof body === 'string') {
      body = init.headers?.['Content-Type']?.includes('form')
        ? Object.fromEntries(new URLSearchParams(body))
        : JSON.parse(body);
    }
    const call = { url, path, method, headers: init.headers ?? {}, body };
    calls.push(call);
    const route = routes.find(([m, pattern]) => m === method && pattern.test(path));
    if (!route) {
      throw new Error(`Unexpected network call in a test: ${method} ${url}`);
    }
    const answer = await route[2](call);
    return answer instanceof Response ? answer : json(answer);
  });
  return { calls, restore: () => setFetch(previous) };
}

/** The routes of a working account; `state.document` is what GET /mowers answers. */
export function husqvarna(state) {
  return [
    ['POST', /^auth\/oauth2\/token$/, () => state.token ?? fixture('token.json')],
    ['POST', /^auth\/oauth2\/revoke$/, () => json({})],
    ['GET', /^api\/mowers$/, () => state.document],
    [
      'GET',
      /^api\/mowers\/[^/]+$/,
      ({ path }) => {
        const id = path.split('/')[2];
        const item = state.document.data.find((m) => m.id === id);
        return item ? { data: item } : json({ errors: [{ title: 'Not found' }] }, 404);
      },
    ],
    [
      'POST',
      /^api\/mowers\/[^/]+\/actions$/,
      () => json({ data: { type: 'control', id: '256b2365-33a7-46fe-a9fb-e67e84f4ac01' } }, 202),
    ],
  ];
}
