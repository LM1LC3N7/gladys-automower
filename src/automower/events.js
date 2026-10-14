// -----------------------------------------------------------------------------
// The Automower Connect websocket (wss://ws.openapi.husqvarna.dev/v1): the
// live events of every mower of the account, one connection.
//
// What the Developer Portal says (WebSocket page, read on 2026-10-14):
//   - authenticate with "Authorization: Bearer <token>" on the handshake
//     (no application key); 401 without it, 403 with a refused token;
//   - the server cuts a connection after 2 hours: we recycle it at 115
//     minutes (WS_MAX_AGE), one second apart (1 new connection per second
//     per user, 10 at most);
//   - an empty message is answered by an empty message: sent every minute,
//     it keeps the connection alive and proves it is (WS_WATCHDOG);
//   - { ready, connectionId } once connected, then { id, type, attributes }
//     events (v2 format, see model.js).
//
// Node 22's global WebSocket (undici) sends the Authorization header given
// in `headers` (checked on Node 22.22.0). The socket comes from a factory so
// the tests play Husqvarna's side.
// -----------------------------------------------------------------------------

import {
  USER_AGENT,
  WS_MAX_AGE,
  WS_PING_INTERVAL,
  WS_RECONNECT,
  WS_URL,
  WS_WATCHDOG,
} from '../constants.js';
import { parseMessage } from './model.js';

/** A connection open for that long resets the backoff when it ends. */
const STABLE_AFTER = 60_000;

function defaultSocketFactory(url, { headers }) {
  return new globalThis.WebSocket(url, { headers });
}

export class EventStream {
  constructor({
    tokens,
    url = WS_URL,
    onEvent = () => {},
    onStatus = () => {},
    logger = console,
    socketFactory = defaultSocketFactory,
    timers = { setTimeout, clearTimeout, setInterval, clearInterval },
    now = Date.now,
  }) {
    this.tokens = tokens;
    this.url = url;
    this.onEvent = onEvent;
    this.onStatus = onStatus;
    this.logger = logger;
    this.socketFactory = socketFactory;
    this.timers = timers;
    this.now = now;
    this.socket = undefined;
    this.opening = false;
    this.stopped = true;
    this.connected = false;
    this.attempts = 0;
    /** Handshakes refused in a row (the token is renewed after two). */
    this.refusals = 0;
    this.openedAt = 0;
    this.lastMessageAt = 0;
    this.retryTimer = undefined;
    this.pingTimer = undefined;
    this.recycleTimer = undefined;
  }

  start() {
    if (!this.stopped) {
      return;
    }
    this.stopped = false;
    this.attempts = 0;
    this.open();
  }

  stop() {
    this.stopped = true;
    this.timers.clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.close();
  }

  async open() {
    if (this.stopped || this.socket || this.opening) {
      return;
    }
    let token;
    this.opening = true;
    try {
      token = await this.tokens.get();
    } catch (err) {
      if (err?.final) {
        // The app reports a refused key: no point in reconnecting with it.
        this.logger.warn(`Websocket not opened: ${err.message}`);
        return;
      }
      this.logger.warn(`Websocket token failed: ${err?.message ?? err}`);
      this.scheduleReconnect();
      return;
    } finally {
      this.opening = false;
    }
    if (this.stopped || this.socket) {
      return;
    }
    let socket;
    try {
      socket = this.socketFactory(this.url, {
        headers: { Authorization: `Bearer ${token}`, 'User-Agent': USER_AGENT },
      });
    } catch (err) {
      this.logger.warn(`Websocket failed to open: ${err.message}`);
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    let opened = false;
    socket.onopen = () => {
      if (this.socket !== socket) {
        return;
      }
      opened = true;
      this.opened(socket);
    };
    socket.onmessage = (event) => {
      if (this.socket === socket) {
        this.handle(event?.data);
      }
    };
    socket.onerror = (event) => {
      this.logger.debug?.(`Websocket error: ${event?.message ?? 'unknown'}`);
    };
    socket.onclose = (event) => {
      if (this.socket === socket) {
        this.closed(event?.code, opened);
      }
    };
  }

  opened(socket) {
    this.openedAt = this.now();
    this.lastMessageAt = this.now();
    this.refusals = 0;
    this.pingTimer = this.timers.setInterval(() => this.ping(socket), WS_PING_INTERVAL);
    this.recycleTimer = this.timers.setTimeout(() => {
      this.recycleTimer = undefined;
      this.logger.debug?.('Websocket recycled before the 2-hour limit');
      this.reconnect(WS_RECONNECT.afterRecycle);
    }, WS_MAX_AGE);
    this.setConnected(true);
  }

  handle(data) {
    this.lastMessageAt = this.now();
    const message = parseMessage(typeof data === 'string' ? data : String(data ?? ''));
    if (message.kind === 'ready' && !message.ready) {
      this.logger.warn('Websocket not ready: reconnecting');
      this.reconnect();
    } else if (message.kind === 'event') {
      this.onEvent(message);
    }
  }

  /** The keepalive, and the watchdog: a silent connection is replaced. */
  ping(socket) {
    if (this.socket !== socket) {
      return;
    }
    if (this.now() - this.lastMessageAt > WS_WATCHDOG) {
      this.logger.warn('Websocket silent for 3 minutes: reconnecting');
      this.reconnect();
      return;
    }
    try {
      socket.send('');
    } catch (err) {
      this.logger.warn(`Websocket keepalive failed: ${err.message}`);
    }
  }

  clearTimers() {
    this.timers.clearInterval(this.pingTimer);
    this.timers.clearTimeout(this.recycleTimer);
    this.pingTimer = undefined;
    this.recycleTimer = undefined;
  }

  /** Close our socket (its onclose is ignored). */
  close() {
    this.clearTimers();
    if (this.socket) {
      const socket = this.socket;
      this.socket = undefined;
      try {
        socket.close(1000);
      } catch {
        // already closed
      }
    }
    this.setConnected(false);
  }

  /** Husqvarna (or the network) closed the socket. */
  closed(code, wasOpened) {
    this.clearTimers();
    this.socket = undefined;
    this.setConnected(false);
    if (!wasOpened) {
      // A refused handshake: twice in a row, try a fresh token next time.
      this.refusals += 1;
      if (this.refusals >= 2) {
        this.tokens.invalidate?.();
      }
    } else if (this.now() - this.openedAt >= STABLE_AFTER) {
      this.attempts = 0;
    }
    this.logger.warn(`Websocket closed (${code ?? '?'}): reconnecting`);
    this.scheduleReconnect();
  }

  reconnect(delay) {
    this.close();
    this.scheduleReconnect(delay);
  }

  scheduleReconnect(delay) {
    if (this.stopped || this.retryTimer) {
      return;
    }
    const wait = delay ?? Math.min(WS_RECONNECT.max, WS_RECONNECT.base * 2 ** this.attempts);
    if (delay === undefined) {
      this.attempts += 1;
    }
    this.retryTimer = this.timers.setTimeout(() => {
      this.retryTimer = undefined;
      return this.open();
    }, wait);
  }

  setConnected(connected) {
    if (connected !== this.connected) {
      this.connected = connected;
      this.onStatus(connected);
    }
  }
}
