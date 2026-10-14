# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for
human contributors.

## What this is

A Gladys Assistant **external integration** of type `device`: a Node.js
service (Node 22+, ESM, no build step) in its own sandboxed Docker container,
talking to Gladys through `@gladysassistant/integration-sdk` (v0.15). It
reads **Husqvarna Automower** robotic mowers through the official
**Automower Connect API** (REST + websocket), with the user's own Developer
Portal application (application key + secret, client credentials grant),
and exposes one device per mower with a mow / pause select and a dock
button, scene triggers, scene actions and a dashboard widget. Unofficial:
not affiliated with Husqvarna. Next to Worx Landroid (someone else's module).

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/app.test.js              # one file
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npm run audit                             # npm audit --omit=dev
npx github:GladysAssistant/integration-store .   # store admission checks
```

Run `format:check`, `lint`, `test` and `audit` before every commit.

## Architecture

```
index.js                  SDK wiring only (handlers registered before connect())
src/app.js                AutomowerApp: lifecycle, REST loop, live events,
                          commands, scene actions, widget, test button
src/automower/auth.js     the access token: client credentials, renewal, revoke
src/automower/client.js   the REST client: headers, spacing, endpoints, action
                          bodies, AutomowerError
src/automower/events.js   the websocket: bearer, keepalive, watchdog, recycling,
                          backoff, socket factory
src/automower/model.js    JSON:API mowers and v2 events -> plain mowers, local
                          time -> instants (pure)
src/automower/codes.js    the error codes, English and French (pure)
src/devices.js            the mower device, feature keys, states (pure)
src/triggers.js           readings, transitions -> scene events (pure)
src/widget.js             the "mower" widget (pure)
src/config.js             config_schema normalized (DEFAULTS, BOUNDS)
src/constants.js          endpoints, pacing, Gladys enums, manifest keys
src/i18n.js               runtime texts (en/fr)
src/http.js               the only HTTP access (fetch, timeout, headers kept)
test/fixtures/            mowers and events shaped after the OpenAPI / AsyncAPI
                          documents; the error answers are real (2026-10-14)
test/helpers/             fake Husqvarna (fetch), fake socket, fake timers;
                          Gladys is the SDK's fake
```

## Rules

- **Unofficial.** Every user-facing surface says "unofficial connector, not
  affiliated with Husqvarna". Never use the Husqvarna or Automower logos.
- **Keys are forever**: the manifest keys and the widget button actions
  (`src/constants.js`), the `activity` values of `activity_changed`
  (`ACTIVITIES`), the park modes (`PARK_MODES`), the feature keys (`FEATURE`
  in `src/devices.js`) and the external id shape `mower:<Husqvarna mower id>`
  are stored in user scenes and dashboards. Never rename them.
- **The key and the secret are secrets**: the secret goes to the
  authentication API only (form body), the key in the `X-Api-Key` header,
  the token in `Authorization`; none of them in a URL, a log line, an error,
  a status or a scene event (`test/app.test.js` checks it).
- **A refused key or secret is final** (`AutomowerError.final`): 10 failed
  logins in 5 minutes lock the Husqvarna account for 30 minutes. Nothing is
  retried until the user saves the configuration (the `resume` option of
  `start`) or clicks Test; a mere reconnection to Gladys never retries. Same
  for a token without the `amc:api` scope (application not connected to the
  Automower Connect API).
- **The token stays in memory**, reused until 5 minutes before its hour is
  up (Husqvarna keeps at most 3 tokens per user and client), kept across a
  restart with the same credentials, revoked on shutdown and when the
  credentials change.
- **Be polite with Husqvarna: the weekly budget.** The Automower Connect
  README (read on 2026-10-14) allows **21,000 requests per week** and
  application key and **120 per minute** (the module brief said about 1 per
  second and 10,000 a month: the README is the truth). Hence:
  - REST at start (`GET /mowers`), then the **websocket** carries the live
    state; a full read every `resync_minutes` (default 30, 15 to 120) while
    it is up, every 10 minutes (`FALLBACK_INTERVAL`) while it is down or the
    last read failed; after a reconnection, a read only if the last one is
    older than 5 minutes (`RESYNC_AFTER_GAP`);
  - a command: one `POST /mowers/{id}/actions` + one `GET /mowers/{id}` 30 s
    later (`COMMAND_SETTLE`, one per mower even for a burst);
  - two REST calls at least 1 s apart (`REQUEST_SPACING`), commands included;
  - a 429 (or a 403 "Limit Exceeded"): no background call for `Retry-After`,
    an hour without it (`RATE_LIMIT_PAUSE`);
  - budget: a quiet week at 30 minutes is 7 × 48 = 336 reads, plus 2 calls
    per command (10 a day: 140), about 2.4 % of the allowance (some 2,000
    calls a month); a whole week without websocket is 1,008 reads (5 %); at
    15 minutes, 672 (3.2 %).
  - the websocket: one connection, an empty message every minute (Husqvarna
    answers it with an empty message), replaced after 3 silent minutes
    (`WS_WATCHDOG`), recycled at 115 minutes (the server cuts at 2 hours),
    backoff 5 s to 10 minutes, 1 s after a recycle (1 connection per second
    and 10 at most per user). The token endpoint is called about once an
    hour.
- **One event per transition** (`src/triggers.js`): the first reading fires
  nothing; `mower_error` once per error (a new code, or the same one
  timestamped more than a minute later); `mowing_finished` when a session
  (mowing, leaving, going home, charging) ends parked, stopped in the garden
  or waiting for a manual start; `mower_disconnected` on `metadata.connected`
  true → false (REST only: the websocket has no connection event). No event
  from a scene action by itself.
- **The Gladys category**: the state, the run mode and the dock button use
  `vacuum-cleaner` (decided for this module: the only category of a robot
  that runs, docks and charges, with a device widget Gladys already renders;
  its labels Running / Returning to dock / Charging / Docked fit a mower, its
  run mode "Clean" means mow). Should Gladys add a lawn mower category, add
  its features next to these, never instead (keys are forever).
- **Local time**: `errorCodeTimestamp`, `nextStartTimestamp` and the message
  times are the mower's wall clock (ms in REST, seconds in the websocket);
  they become instants in the Gladys time zone (`TZ`, handed to the
  container); the texts show the wall clock as is.
- **No GPS**: the positions are dropped on reception (`keptAttributes`,
  `applyEvent`), never stored, logged or published.
- **Built blind**: no Husqvarna account was available. The documents of the
  Developer Portal (OpenAPI, AsyncAPI, README, WebSocket page, error codes)
  and aioautomower 3.1.0 are the reference; every Husqvarna name lives in
  `src/automower/`, so a user report fixes one place. `TODO.md` lists what
  to confirm.
- **Node 22's global WebSocket** sends the `Authorization` header given in
  `{ headers }` (undici 6.23, checked on Node 22.22.0): no `ws` dependency.
- **Read-only rootfs**: write nothing on disk.
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag.
- **Changelog**: every user-visible change adds a line under
  `## [Unreleased]` in `CHANGELOG.md`.
- **Manifest texts** are `{ en, fr }` objects; the catalog description holds
  10 to 100 characters per language; `test/manifest.test.js` ties the
  manifest to the code (keys, defaults, bounds, options, trigger fields and
  variables against the events the code fires).
- **User-facing text** is bilingual, `docs/en.md` and `docs/fr.md` kept in
  sync. Comments explain why, in English.
- **Tests never touch the network** (`installFetch` replaces `fetch`, the
  event stream takes a socket factory); the widget contents pass the SDK's
  `validateWidgetContent`.

## CI and pushes

- Group the commits and push **at most once a day**, unless the maintainer
  explicitly asks otherwise: the GitHub Actions quota is limited.
- If every CI job fails in under 2 seconds, the quota is exhausted: it is
  not a bug in the code.
- The Docker image cannot be built in the Claude Code cloud container (no
  network for `apk` inside `docker build`): the CI builds it.

## Checking a field against the real API

The documents are public JSON / YAML / Markdown behind the portal:

```bash
curl -s https://api.developer.husqvarnagroup.cloud/v1/public-apis      # the documents of each API
B=https://docs.developer.husqvarnagroup.cloud/automower-connect-api
curl -s $B/swagger.yml; curl -s $B/websocket-api.yml; curl -s $B/README.md
```

With an application (never commit the key, the secret or a token):

```bash
TOKEN=$(curl -s -d grant_type=client_credentials -d client_id=$KEY -d client_secret=$SECRET \
  https://api.authentication.husqvarnagroup.dev/v1/oauth2/token | python3 -c 'import json,sys;print(json.load(sys.stdin)["access_token"])')
curl -s -H "Authorization: Bearer $TOKEN" -H "X-Api-Key: $KEY" -H 'Authorization-Provider: husqvarna' \
  https://api.amc.husqvarna.dev/v1/mowers | python3 -m json.tool | less
npx wscat -c wss://ws.openapi.husqvarna.dev/v1 -H "Authorization: Bearer $TOKEN"
```

Anonymize an answer (ids, names, serial numbers, positions) before it
becomes a fixture.
