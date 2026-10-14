# gladys-automower

[Gladys Assistant](https://gladysassistant.com) external integration for
**Husqvarna Automower® robotic mowers**, through the official
[Automower Connect API](https://developer.husqvarnagroup.cloud/apis/automower-connect-api):
status, battery, start, park, pause, error scene triggers and a dashboard
widget. **Unofficial, not affiliated with Husqvarna.**

User documentation: [docs/en.md](docs/en.md) · [docs/fr.md](docs/fr.md).

## How it works

```
Gladys ⇄ SDK ⇄ src/app.js (AutomowerApp)
                 ├─ src/automower/auth.js    client credentials token (in memory), revoke
                 ├─ src/automower/client.js  api.amc.husqvarna.dev/v1: mowers, actions, spacing
                 ├─ src/automower/events.js  wss://ws.openapi.husqvarna.dev/v1: v2 events, keepalive
                 ├─ src/automower/model.js   JSON:API / events -> plain mowers, local time (pure)
                 ├─ src/automower/codes.js   the error codes, English and French (pure)
                 ├─ src/devices.js           the mower device, feature keys, states (pure)
                 ├─ src/triggers.js          two readings -> scene events (pure)
                 └─ src/widget.js            the "mower" widget (pure)
```

- **Authentication**: the user's own Developer Portal application
  (application key and secret, client credentials grant); the token lives in
  memory and is renewed 5 minutes before its hour is up.
- **Discovery** offers one device per mower (`mower:<id>`).
- **Reading**: `GET /mowers` at start, then the websocket events (battery,
  mower, planner, calendar, settings) are merged into the mowers and
  published at once; a full read every `resync_minutes` (30), every 10
  minutes while the websocket is down. Two REST calls are at least a second
  apart.
- **Commands** (run mode, dock, scene actions, widget buttons) are
  `POST /mowers/{id}/actions`, read back 30 seconds later.
- **Triggers** come from two consecutive readings of a mower: the first
  reading fires nothing, every transition fires once.

## Development

```bash
npm install
npm test                                        # node --test, no network
npm run lint && npm run format:check
npx github:GladysAssistant/integration-store .  # store admission checks
```

The fixtures in `test/fixtures/` follow the OpenAPI and AsyncAPI documents of
the Developer Portal (the module was built without a Husqvarna account); the
error answers are real. See [TODO.md](TODO.md) for what remains to confirm.

## Releasing

**Actions → Release → Run workflow** (patch / minor / major): bumps the
version in `package.json` and the manifest, rolls `CHANGELOG.md`, tags, builds
the multi-arch image to GHCR and publishes the GitHub Release.

## License

Apache-2.0. Automower is a trademark of Husqvarna AB.
