# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

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
