# TODO

## Before announcing

- [ ] Test on a real Gladys 5.1+ with a real Automower Connect account
      (testers wanted on the forum): the application key and secret, the
      discovery, the device card (state, mow / pause select, dock button),
      the widget and its four buttons, the four scene actions, and the four
      triggers over a mowing day (an error: lift the mower).
- [ ] Watch the application's **Usage Quota** on the Developer Portal over
      a week to confirm the budget in CLAUDE.md.
- [ ] Check the vacuum-cleaner device card with a mower: the labels, the run
      mode select limited to Idle / Clean by `supported_options`, the dock
      button. Ask on the forum whether a lawn mower category is wanted in
      Gladys.
- [ ] Reserve "Husqvarna Automower" in the forum thread t/10385, then add the
      `gladys-assistant-integration` topic to publish in the store.
- [ ] Turn on "Private vulnerability reporting" (SECURITY.md points there).

## To confirm with a real account (built blind)

- [ ] The token answer carries `scope` with `amc:api` once the application
      is connected to the Automower Connect API (the README example shows
      `iam:read` only; Home Assistant checks `amc:api`).
- [ ] The token endpoint's answer to a wrong **secret** for an existing key
      (400 `invalid_client`? 401?): both are taken as a final refusal. The
      real answer to an unknown key is 400 `invalid_client` /
      `client.not.found`.
- [ ] What the API gateway answers past the weekly quota and the rate limit
      (429 "Limit Exceeded" / "Too Many Requests"? 403?), and whether a
      `Retry-After` comes with it.
- [ ] The websocket: the `{ ready, connectionId }` message on connection;
      the empty message answered by an empty message (the watchdog relies on
      it; without the answer the connection is replaced every 3 minutes);
      the close code at 2 hours.
- [ ] Node's global WebSocket (undici) against the real server: the
      `Authorization` header passes the handshake (401 without, 403 with a
      refused token, checked with curl on 2026-10-14).
- [ ] `errorCodeTimestamp` and `nextStartTimestamp` in milliseconds over
      REST and in seconds in the websocket, both in the mower's local time;
      `nextStartTimestamp` 0 when parked until further notice.
- [ ] `errorCode` goes back to 0 once the error is cleared (the trigger
      re-arms on it).
- [ ] `headlights-event-v2`: `attributes.headlight` (AsyncAPI) or
      `attributes.headlights` (aioautomower); both are read.
- [ ] `metadata.connected` false while the mower is out of reach, and back
      to true with the next status; a mower event in between is taken as a
      proof of connection.
- [ ] A Start sent to a mower in its station: `activity` stays `CHARGING` /
      `PARKED_IN_CS` until it is full (the run mode select then shows Idle
      again after the read back).

## To check (issue #3: connected, no mower)

- [ ] `GET /mowers` answers 200 with an empty `data` when the Developer
      Portal account is not the Automower Connect account where the mower
      is paired: the client credentials token is "for your own user (the
      user who created the Developer Portal application)" (Authentication
      API README) and `/mowers` lists "mowers linked to the user associated
      with the access token" (OpenAPI). Home Assistant (`husqvarna_automower`
      config flow) aborts with "No mowers connected to this account" on the
      same empty answer. Confirm with the reporter which e-mail created the
      application.
- [ ] An application not connected to the "Automower Connect API" product:
      the token comes without `amc:api` (handled before any REST call); if
      a token without it reaches the gateway, the OpenAPI only says 403
      "Forbidden" (handled as `forbidden`), the code is not documented.
- [ ] A mower without Automower Connect (Bluetooth only, older models) is
      never listed: the README requires "at least one connected
      Automower". No region or marketplace condition is documented.
- [ ] The log line "Husqvarna: N mower(s) listed, M kept" from a real
      account (issue #3): the shape of the empty answer.

## Ideas

- Work areas (EPOS, Ceora, NERA): `StartInWorkArea` as a scene action field,
  the current work area as a text feature (`mower.workAreaId`, `workAreas`).
- The settings: cutting height (1 to 9) and headlight mode as features.
- Confirm a non-fatal error (`POST /mowers/{id}/errors/confirm`, when
  `isErrorConfirmable`) as a widget button and a scene action.
- A "message" trigger from `message-event-v2` (warnings and info the mower
  sends besides its error state).
- Statistics as features (blade usage time, with the reset endpoint;
  charging cycles; total cutting time), read with the full refresh.
- `Park` with an `externalReason` (200,000 to 299,999) so the Automower
  Connect app shows "parked by the Developer Portal".
