# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Every read logs "Husqvarna: N mower(s) listed, M kept", with the reason each
  other item is dropped (its type, no id, no attributes) or, for an empty list,
  the shape of the answer (keys, type and size of `data`): no id, name, serial
  number or position in the line (issue #3).

### Fixed

- The "no mower" status explains the client credentials rule: the key and the
  secret reach the mowers of the Husqvarna account that created the application
  on the Developer Portal, which must be the Automower Connect account where the
  mower is paired (issue #3); the docs' troubleshooting says the same.
- A 400 on a read is reported as "Husqvarna refused the request" with a 10-minute
  retry, no longer as "refused the command" or "Husqvarna is unreachable".
- The token revocation asks for `Accept: */*`, as the reference clients do.
- The key and secret fields, the docs: "kept by Gladys in its database, never
  shown again, only sent to Husqvarna" instead of a protection Gladys does not
  give (a test keeps the word out of every text).

## [0.1.2] - 2026-10-24

### Fixed

- Automower Connect calls send `Accept: application/vnd.api+json`: Husqvarna answered
  `Accept: application/json` with 400 "Not Acceptable", so no mower was ever read (issue #1).
- Docs: the outputs of the scene actions come from the variable list
  (`{{<step>.<action>.<key>}}`), not `{{<key>}}`.

## [0.1.1] - 2026-10-14

### Added

- Husqvarna Automower robotic mowers through the official Automower Connect
  API, with the user's own Developer Portal application (application key and
  secret, client credentials token kept in memory).
- One device per mower: operational state (Gladys vacuum-cleaner states:
  running, returning to dock, charging, docked, paused, error, stopped),
  battery, activity, mode, error code and text, cloud connection and next
  start; a mow / pause select and a return to dock (park) button.
- Live events over the Automower Connect websocket (v2 events), with a
  keepalive, a watchdog and a reconnection before the 2-hour limit; a full
  refresh every 30 minutes (configurable), every 10 minutes while the live
  link is down.
- Scene triggers "error" (code, English and French texts, time), "activity
  changed", "mowing finished" (session length) and "disconnected".
- Scene actions "start mowing" (duration), "park" (until the next schedule,
  until further notice or for a duration), "pause" and "resume the
  schedule", for one mower or all of them.
- A "Robotic mower" dashboard widget: battery, next start, activity, state,
  mode, error, connection, and Start / Park / Pause / Resume buttons.
- A "Test Husqvarna" button.

[Unreleased]: https://github.com/LM1LC3N7/gladys-automower/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/LM1LC3N7/gladys-automower/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/LM1LC3N7/gladys-automower/releases/tag/v0.1.1
