# Husqvarna Automower

**Unofficial connector, not affiliated with Husqvarna.** It brings Husqvarna
Automower® robotic mowers into Gladys through the official
[Automower Connect API](https://developer.husqvarnagroup.cloud/apis/automower-connect-api),
with an application you create yourself on the Husqvarna Developer Portal.
Automower is a trademark of Husqvarna AB.

## What you get

| Surface              | Content                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| One device per mower | operational state, battery, activity, mode, error code and error text, connection to the Husqvarna cloud, next start, a **mow / pause** select and a **return to dock** button |
| Scene triggers       | **error**, **activity changed**, **mowing finished**, **disconnected**                                                                                                         |
| Scene actions        | **start mowing** (for a duration), **park** (until the next schedule, until further notice or for a duration), **pause**, **resume the schedule**                              |
| Dashboard widget     | **Robotic mower**: battery, next start, activity, state, mode, error, connection, and Start / Park / Pause / Resume buttons                                                    |
| Configuration screen | a **Test Husqvarna** button listing your mowers                                                                                                                                |

## Setup

1. Open the [Husqvarna Developer Portal](https://developer.husqvarnagroup.cloud/)
   and sign in with your **Automower Connect** account (the one of the
   phone app, where your mowers are paired).
2. **Create an application**: any name, and `http://localhost:8080` as the
   redirect URL (it is not used).
3. In the application, **connect** it to the **Authentication API** and to
   the **Automower Connect API**. Without the second one, Husqvarna refuses
   every request.
4. Copy the **application key** and the **application secret** into the
   configuration of the integration in Gladys, and save.
5. Open **Discovery** and add your mowers.
6. Put the **Robotic mower** widget on a dashboard.

The key and the secret are stored encrypted by Gladys and only sent to
Husqvarna. If Husqvarna refuses them, the integration stops trying until you
save the configuration again: repeated failed logins lock the Husqvarna
account for 30 minutes.

## The device

Gladys has no robotic mower category yet: the state and the two commands
use the **robot vacuum** category, the only one describing a robot that
runs, docks and charges. The device card therefore shows:

- **State**: Running (mowing or leaving the station), Returning to dock,
  Charging, Docked, Paused, Error, Stopped;
- **Mowing (idle: pause)**: a select whose "Clean" choice starts mowing for
  the configured duration (3 hours by default) and "Idle" pauses the mower;
- **Park until the next schedule**: the "Return to dock" button.

The other features are the battery (%), the activity and the mode (texts in
the language chosen in the configuration), the error code (0: none) and its
text, the connection to the Husqvarna cloud and the next start, in the
mower's own time.

A start command does not make a mower leave its station at once: Husqvarna
says it leaves once **fully charged**.

## Scenes

- **Automower error**: once per error (trapped, lifted, outside the working
  area...). Variables: the code, the text in English and in French, the
  time, the mower state.
- **Automower activity changed**: optionally for one activity (mowing,
  going home, charging, leaving, parked, stopped in the garden...).
  Variables: the new and the previous activity, the state, the battery.
- **Automower mowing finished**: the mower ended a session (parked in its
  station, stopped in the garden or waiting for a manual start). Going home
  to charge in the middle of a session does not count. Variables: where it
  ended, the session length in minutes (empty when the session began before
  Gladys saw it), the battery, the error code.
- **Automower disconnected**: the mower lost its connection to the Husqvarna
  cloud. Husqvarna only reports it in a full refresh: up to 30 minutes late
  by default.

The actions **start mowing**, **park**, **pause** and **resume the
schedule** act on the chosen mower, or on every mower when the field is
empty. They give `mower_name` and `count` to the following actions of the
scene, which find them in their variable list (written
`{{<step>.<action>.<key>}}`, for instance `{{0.0.count}}` when this action
is the first of the scene).

## How often Husqvarna is called

Husqvarna allows 21,000 requests per week and application. The integration
reads all the mowers once at start, then follows them through the live
events of the Automower Connect websocket. It reads everything again every
30 minutes (option **Full refresh interval**), and every 10 minutes while
the live link is down. A command is read back once, 30 seconds later. A
typical week uses about 2 % of the allowance.

## Troubleshooting

- **"Husqvarna refused the application key or secret"**: copy them again
  from the portal (My applications), then save the configuration.
- **"The application is not connected to the Automower Connect API"**:
  connect it on the portal (step 3), then save the configuration again.
- **No live events** while REST works: Husqvarna advises renewing the
  application secret on the portal.
- **The next start is one hour off**: the mower sends its own local time;
  the integration reads it in the time zone of Gladys.
- Logs: the integration's log level is set with the `LOG_LEVEL` variable.

## Privacy

The integration uses the state of your mowers only: the GPS positions
Husqvarna sends along are dropped at once, never stored nor shown. The application key and secret go to Husqvarna
only, and never appear in a log, a status or a scene.
