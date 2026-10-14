// -----------------------------------------------------------------------------
// The integration itself: the account read, discovery, the live events, the
// paced REST loop, the commands (run mode, dock), the scene triggers and
// actions, the "mower" widget and the test button. index.js only wires the
// SDK handlers to it.
//
// Pace (see CLAUDE.md for the weekly budget): GET /mowers at start, then the
// websocket carries the live state; a full REST resynchronization every
// `resync_minutes` while it is up, every 10 minutes while it is down. A
// command is read back once (GET /mowers/{id}) 30 seconds later. A loop tick
// every minute decides; most ticks make no call.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import {
  COMMAND_SETTLE,
  FALLBACK_INTERVAL,
  MAX_DURATION_MINUTES,
  PARK_MODES,
  RATE_LIMIT_PAUSE,
  RESYNC_AFTER_GAP,
  RUN_MODE,
  TICK_INTERVAL,
  WIDGETS,
  WIDGET_ACTIONS,
} from './constants.js';
import {
  FEATURE,
  buildMowerDevice,
  featureKeyOf,
  ids,
  mowerStates,
  parseExternalId,
} from './devices.js';
import { T } from './i18n.js';
import { TokenManager } from './automower/auth.js';
import { AutomowerClient, AutomowerError } from './automower/client.js';
import { EventStream } from './automower/events.js';
import {
  EVENT_TYPES,
  applyEvent,
  fold,
  isMowerItem,
  keptAttributes,
  messageOf,
  mowerOf,
} from './automower/model.js';
import { mowerEvents, nextReading } from './triggers.js';
import { mowerWidget } from './widget.js';

const defaultTimers = { setTimeout, clearTimeout, setInterval, clearInterval };

export class AutomowerApp {
  constructor({
    gladys,
    logger = createLogger({ name: 'automower' }),
    now = Date.now,
    timers = defaultTimers,
    sleep,
    socketFactory,
    // Gladys hands its time zone to the container (TZ): the mower's local
    // timestamps are read in it.
    timeZone = process.env.TZ || 'UTC',
  }) {
    this.gladys = gladys;
    this.logger = logger;
    this.now = now;
    this.timers = timers;
    this.sleep = sleep ?? ((ms) => new Promise((resolve) => this.timers.setTimeout(resolve, ms)));
    this.socketFactory = socketFactory;
    this.timeZone = timeZone;
    this.config = normalizeConfig();
    this.tokens = undefined;
    this.client = undefined;
    this.stream = undefined;
    this.generation = 0;
    this.tickTimer = undefined;
    this.ticking = undefined;
    this.lastStatus = undefined;
    this.queue = Promise.resolve();
    this.reset();
  }

  reset() {
    /** mower id -> the raw JSON:API attributes, live events merged in */
    this.raw = new Map();
    /** mower id -> the plain mower (model.js) */
    this.mowers = new Map();
    /** mower id -> the last reading (the triggers compare with it) */
    this.readings = new Map();
    /** mower id -> the read back timer after a command */
    this.settleTimers = new Map();
    this.lastReadAt = -Infinity;
    this.healthy = false;
    this.pausedUntil = 0;
    this.fatal = undefined;
    this.startedAt = this.now();
    /** The websocket connected at least once since the start. */
    this.liveSeen = false;
  }

  // --- Lifecycle -------------------------------------------------------------

  /**
   * (Re)start with a configuration. `resume`: the user saved the
   * configuration, so a refused key may be tried once more; a mere
   * reconnection to Gladys never retries it (repeated failures lock the
   * Husqvarna account for 30 minutes).
   */
  async start(raw = {}, { resume = false } = {}) {
    this.stop();
    const generation = ++this.generation;
    this.config = normalizeConfig(raw);
    const { appKey, appSecret } = this.config;
    if (!this.tokens || !this.tokens.matches(appKey, appSecret)) {
      // New credentials: the old token is useless, give it back.
      this.tokens?.revoke().catch(() => {});
      this.tokens = new TokenManager({ appKey, appSecret, now: this.now });
    } else if (resume) {
      this.tokens.refused = undefined;
    }
    this.client = new AutomowerClient({ tokens: this.tokens, now: this.now, sleep: this.sleep });
    this.reset();
    if (!appKey || !appSecret) {
      await this.setStatus(false, T.noCredentials);
      return;
    }
    try {
      await this.readAll();
    } catch (err) {
      await this.reportError(err);
      if (this.fatal) {
        return;
      }
    }
    if (generation !== this.generation) {
      return;
    }
    this.stream = new EventStream({
      tokens: this.tokens,
      logger: this.logger,
      timers: this.timers,
      now: this.now,
      onEvent: (event) =>
        this.handleEvent(event).catch((err) => this.logger.warn(`Event failed: ${err.message}`)),
      onStatus: (connected) => this.liveChanged(connected),
      ...(this.socketFactory ? { socketFactory: this.socketFactory } : {}),
    });
    this.stream.start();
    this.tickTimer = this.timers.setInterval(
      () => this.tick().catch((err) => this.reportError(err)),
      TICK_INTERVAL,
    );
    if (this.healthy) {
      await this.reportOk();
    }
  }

  stop() {
    this.generation += 1;
    this.timers.clearInterval(this.tickTimer);
    this.tickTimer = undefined;
    this.stream?.stop();
    this.stream = undefined;
    for (const timer of this.settleTimers.values()) {
      this.timers.clearTimeout(timer);
    }
    this.settleTimers.clear();
  }

  /** The container stops: close everything and give the token back. */
  async shutdown() {
    this.stop();
    await this.tokens?.revoke();
  }

  /** A refused key or a missing scope: nothing more until the configuration changes. */
  halt(err) {
    this.fatal = err;
    this.timers.clearInterval(this.tickTimer);
    this.tickTimer = undefined;
    this.stream?.stop();
  }

  /** One read or event at a time: a REST answer never overwrites a newer event midway. */
  exclusive(fn) {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }

  async setStatus(connected, message) {
    const key = JSON.stringify([connected, message ?? null]);
    if (key === this.lastStatus) {
      return;
    }
    this.lastStatus = key;
    await this.gladys
      .setConnectionStatus(connected, message)
      .catch((err) => this.logger.warn(`setConnectionStatus failed: ${err.message}`));
  }

  async reportOk() {
    if (this.mowers.size === 0) {
      await this.setStatus(true, T.noMower);
      return;
    }
    let live = 'on';
    if (!this.stream?.connected) {
      // Right after a start the websocket is still connecting: not "down" yet.
      live = this.liveSeen || this.now() - this.startedAt > 2 * 60_000 ? 'down' : 'connecting';
    }
    await this.setStatus(
      true,
      T.ok({ mowers: this.mowers.size, live, resyncMinutes: this.config.resyncMinutes }),
    );
  }

  async reportError(err) {
    this.healthy = false;
    this.logger.warn(`Husqvarna: ${err.message}`);
    const code = err instanceof AutomowerError ? err.code : undefined;
    if (code === 'no_credentials') {
      await this.setStatus(false, T.noCredentials);
    } else if (code === 'refused' || code === 'scope') {
      this.halt(err);
      await this.setStatus(false, code === 'refused' ? T.refused : T.scope);
    } else if (code === 'rate_limited') {
      this.pausedUntil = this.now() + (err.retryAfterMs ?? RATE_LIMIT_PAUSE);
      await this.setStatus(false, T.rateLimited(new Date(this.pausedUntil).toISOString()));
    } else if (code === 'forbidden') {
      await this.setStatus(false, T.forbidden(err.message));
    } else {
      await this.setStatus(false, T.unreachable(err.message));
    }
  }

  // --- Reading -----------------------------------------------------------------------

  /** GET /mowers: every mower, published (the attempt counts, a failure waits its turn). */
  readAll() {
    return this.exclusive(async () => {
      this.lastReadAt = this.now();
      const items = (await this.client.mowers()).filter(isMowerItem);
      this.healthy = true;
      const before = [...this.raw.keys()].sort().join('|');
      const seen = new Set();
      for (const item of items) {
        const id = String(item.id);
        seen.add(id);
        this.raw.set(id, keptAttributes(item));
      }
      for (const id of [...this.raw.keys()]) {
        if (!seen.has(id)) {
          this.raw.delete(id);
          this.mowers.delete(id);
          this.readings.delete(id);
        }
      }
      await this.publish([...seen]);
      if ([...seen].sort().join('|') !== before) {
        await this.publishDevices();
      }
    });
  }

  /** GET /mowers/{id}: one mower, after a command. */
  readOne(mowerId) {
    return this.exclusive(async () => {
      const item = await this.client.mower(mowerId);
      if (isMowerItem(item)) {
        this.raw.set(String(item.id), keptAttributes(item));
        await this.publish([String(item.id)]);
      }
    });
  }

  tick() {
    if (!this.ticking) {
      this.ticking = this.doTick().finally(() => {
        this.ticking = undefined;
      });
    }
    return this.ticking;
  }

  async doTick() {
    const now = this.now();
    if (this.fatal || now < this.pausedUntil) {
      return;
    }
    if (this.pausedUntil) {
      // The pause is over: read at once.
      this.pausedUntil = 0;
      this.lastReadAt = -Infinity;
    }
    // A failed read is retried at the fallback pace, live link or not.
    const interval =
      this.stream?.connected && this.healthy
        ? this.config.resyncMinutes * 60_000
        : FALLBACK_INTERVAL;
    if (now - this.lastReadAt >= interval) {
      await this.readAll();
    }
    if (this.healthy) {
      // Also reports a live link that dropped since the last tick.
      await this.reportOk();
    }
  }

  /** Readings, states of the created devices, scene events, widget nudge. No API call. */
  async publish(mowerIds = [...this.raw.keys()]) {
    const now = this.now();
    const created = new Set((this.gladys.devices ?? []).map((d) => d.external_id));
    const states = [];
    const events = [];
    for (const id of mowerIds) {
      const attributes = this.raw.get(id);
      if (!attributes) {
        continue;
      }
      const mower = mowerOf({ id, attributes }, { timeZone: this.timeZone });
      this.mowers.set(id, mower);
      const previous = this.readings.get(id);
      const reading = nextReading(previous, mower, now);
      this.readings.set(id, reading);
      const deviceId = ids.mower(this.gladys, id);
      if (created.has(deviceId)) {
        states.push(...mowerStates(deviceId, reading, this.config.language));
      }
      events.push(...mowerEvents(deviceId, previous, reading));
    }
    let changed = 0;
    if (states.length > 0) {
      try {
        const result = await this.gladys.publishChangedStates(states, { heartbeat: 60 * 60_000 });
        changed = result?.count ?? 0;
      } catch (err) {
        this.logger.warn(`States failed: ${err.message}`);
      }
    }
    for (const event of events) {
      await this.gladys
        .publishSceneEvent(event.key, event.data)
        .catch((err) => this.logger.warn(`Scene event ${event.key} failed: ${err.message}`));
    }
    if (changed > 0 || events.length > 0) {
      this.gladys.requestWidgetRefresh(WIDGETS.MOWER);
    }
  }

  // --- Live events ---------------------------------------------------------------------

  /** A v2 event of the websocket: merged into the mower, published at once. */
  handleEvent(event) {
    if (event.type === EVENT_TYPES.MESSAGE) {
      const message = messageOf(event);
      this.logger.debug?.(
        `Mower message ${message?.code ?? '?'} (${message?.severity ?? '?'}) on ${event.id}`,
      );
      return Promise.resolve();
    }
    return this.exclusive(async () => {
      const attributes = this.raw.get(event.id);
      if (!attributes) {
        // A mower paired since the last read: read the account (not too often).
        if (this.now() - this.lastReadAt >= RESYNC_AFTER_GAP && this.now() >= this.pausedUntil) {
          this.queueRead();
        }
        return;
      }
      const updated = applyEvent(attributes, event, this.now());
      if (updated) {
        this.raw.set(event.id, updated);
        await this.publish([event.id]);
      }
    });
  }

  /** A read outside the queue being run (an event handler cannot wait for itself). */
  queueRead() {
    this.lastReadAt = this.now();
    this.readAll().catch((err) => this.reportError(err));
  }

  /** The websocket came up or went down. */
  liveChanged(connected) {
    if (!connected) {
      return; // the next tick reports it and falls back to polling
    }
    this.liveSeen = true;
    const gap = this.now() - this.lastReadAt;
    if (gap >= RESYNC_AFTER_GAP && this.now() >= this.pausedUntil && !this.fatal) {
      // Events may have been missed while it was down.
      this.queueRead();
    } else if (this.healthy) {
      this.reportOk().catch(() => {});
    }
  }

  // --- Discovery -------------------------------------------------------------------

  async publishDevices() {
    await this.gladys.publishDiscoveredDevices(
      [...this.mowers.values()].map((mower) => buildMowerDevice(this.gladys, mower)),
    );
  }

  /** The user asked for a scan: read the account again (a new mower, a renamed one). */
  async scan() {
    await this.readAll();
    await this.publishDevices();
  }

  /** A device was created: the SDK forgot its states, publish them now. */
  async deviceCreated() {
    await this.publish();
  }

  // --- Lookups ------------------------------------------------------------------------

  async ensureMowers() {
    if (this.fatal) {
      throw this.fatal;
    }
    if (this.mowers.size === 0) {
      await this.readAll();
    }
  }

  /** A mower from its device external id, its Husqvarna id or its name. */
  mowerFor(value) {
    const parsed = parseExternalId(value);
    const id = parsed ? parsed.id : String(value ?? '').trim();
    const mower =
      this.mowers.get(id) ?? [...this.mowers.values()].find((m) => id && fold(m.name) === fold(id));
    if (!mower) {
      throw new Error(T.unknownMower(value ?? '').en);
    }
    return mower;
  }

  /** The mowers a scene action targets: the one chosen, or all of them. */
  async targets(value) {
    await this.ensureMowers();
    const list = value ? [this.mowerFor(value)] : [...this.mowers.values()];
    if (list.length === 0) {
      throw new Error(T.noMowerForCommand.en);
    }
    return list;
  }

  /** Minutes from a field: whole, 1 to 65,000, the fallback when empty. */
  minutesOf(value, fallback) {
    const n = Number(value);
    return value !== '' && value !== null && value !== undefined && Number.isFinite(n) && n > 0
      ? Math.min(MAX_DURATION_MINUTES, Math.max(1, Math.round(n)))
      : fallback;
  }

  // --- Commands ------------------------------------------------------------------------

  /** Read a mower back COMMAND_SETTLE after a command (one timer per mower). */
  settle(mowerId) {
    this.timers.clearTimeout(this.settleTimers.get(mowerId));
    const timer = this.timers.setTimeout(() => {
      this.settleTimers.delete(mowerId);
      return this.readOne(mowerId).catch((err) =>
        this.logger.warn(`Read back failed: ${err.message}`),
      );
    }, COMMAND_SETTLE);
    this.settleTimers.set(mowerId, timer);
  }

  /** One command to one mower: `what` is start | park_next | park_notice | park_for | pause | resume. */
  async command(mower, what, minutes) {
    const id = mower.id;
    switch (what) {
      case 'start':
        await this.client.start(id, minutes);
        break;
      case 'park_next':
        await this.client.parkUntilNextSchedule(id);
        break;
      case 'park_notice':
        await this.client.parkUntilFurtherNotice(id);
        break;
      case 'park_for':
        await this.client.parkFor(id, minutes);
        break;
      case 'pause':
        await this.client.pause(id);
        break;
      case 'resume':
        await this.client.resumeSchedule(id);
        break;
      default:
        throw new Error(`Unknown command ${what}`);
    }
    this.logger.info(`${mower.name}: ${what}${minutes ? ` (${minutes} min)` : ''}`);
    this.settle(id);
  }

  /** Gladys command: the run mode select (idle: pause, clean: mow) or the dock button (park). */
  async setValue(device, feature, value) {
    if (parseExternalId(device.external_id)?.kind === undefined) {
      throw new Error(`${device.external_id} is not a mower`);
    }
    await this.ensureMowers();
    const mower = this.mowerFor(device.external_id);
    const key = featureKeyOf(feature.external_id);
    if (key === FEATURE.RUN_MODE) {
      const mode = Number(value);
      if (mode === RUN_MODE.CLEANING) {
        await this.command(mower, 'start', this.config.startMinutes);
      } else if (mode === RUN_MODE.IDLE) {
        await this.command(mower, 'pause');
      } else {
        throw new Error(`Run mode ${value} is not supported by a mower`);
      }
      // Gladys shows the requested mode at once: let the read back re-send the
      // real one if the mower did not follow (it leaves only once charged).
      this.gladys.forgetPublishedStates(feature.external_id);
    } else if (key === FEATURE.DOCK) {
      await this.command(mower, 'park_next');
    } else {
      throw new Error(`${feature.external_id} is not a command`);
    }
  }

  // --- Scene actions ---------------------------------------------------------------

  async run(fields, what, minutes) {
    const list = await this.targets(fields.mower);
    for (const mower of list) {
      await this.command(mower, what, minutes);
    }
    return { mower_name: list.map((m) => m.name).join(', '), count: list.length };
  }

  async startMowing(fields = {}) {
    const minutes = this.minutesOf(fields.duration, this.config.startMinutes);
    return { ...(await this.run(fields, 'start', minutes)), minutes };
  }

  async park(fields = {}) {
    const mode = Object.values(PARK_MODES).includes(fields.mode)
      ? fields.mode
      : PARK_MODES.NEXT_SCHEDULE;
    if (mode === PARK_MODES.DURATION) {
      const minutes = this.minutesOf(fields.duration, null);
      if (minutes === null) {
        throw new Error(T.durationRequired.en);
      }
      return { ...(await this.run(fields, 'park_for', minutes)), mode, minutes };
    }
    const what = mode === PARK_MODES.FURTHER_NOTICE ? 'park_notice' : 'park_next';
    return { ...(await this.run(fields, what)), mode, minutes: null };
  }

  pause(fields = {}) {
    return this.run(fields, 'pause');
  }

  resumeSchedule(fields = {}) {
    return this.run(fields, 'resume');
  }

  // --- Widget ----------------------------------------------------------------------

  async getWidget({ settings = {}, language } = {}) {
    let mower;
    try {
      mower = settings.mower ? this.mowerFor(settings.mower) : [...this.mowers.values()][0];
    } catch {
      mower = undefined;
    }
    return mowerWidget({
      reading: mower ? this.readings.get(mower.id) : undefined,
      startMinutes: this.config.startMinutes,
      language: language === 'fr' ? 'fr' : 'en',
    });
  }

  async widgetAction(actionKey, params = {}) {
    try {
      await this.ensureMowers();
      const mower = this.mowerFor(params.mower);
      switch (actionKey) {
        case WIDGET_ACTIONS.START:
          await this.command(mower, 'start', this.config.startMinutes);
          return T.widget.started(mower.name, this.config.startMinutes);
        case WIDGET_ACTIONS.PARK:
          await this.command(mower, 'park_next');
          return T.widget.parked(mower.name);
        case WIDGET_ACTIONS.PAUSE:
          await this.command(mower, 'pause');
          return T.widget.paused(mower.name);
        case WIDGET_ACTIONS.RESUME:
          await this.command(mower, 'resume');
          return T.widget.resumed(mower.name);
        default:
          throw new Error(`unknown action ${actionKey}`);
      }
    } catch (err) {
      return T.widget.failed(err.message);
    }
  }

  // --- Configuration screen button --------------------------------------------------

  async testConnection() {
    if (!this.config.appKey || !this.config.appSecret) {
      return T.noCredentials;
    }
    // A click is a user action: a refused key may be tried once more.
    this.tokens.refused = undefined;
    const wasFatal = Boolean(this.fatal);
    try {
      await this.readAll();
      if (wasFatal) {
        // The application was fixed on the portal: start for real.
        await this.start(this.gladys.config ?? {}, { resume: true });
      }
      return T.test({ mowers: [...this.mowers.values()], live: Boolean(this.stream?.connected) });
    } catch (err) {
      const code = err instanceof AutomowerError ? err.code : undefined;
      if (code === 'refused') {
        return T.refused;
      }
      if (code === 'scope') {
        return T.scope;
      }
      if (code === 'forbidden') {
        return T.forbidden(err.message);
      }
      return T.unreachable(err.message);
    }
  }
}
