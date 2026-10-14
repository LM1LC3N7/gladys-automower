// -----------------------------------------------------------------------------
// A fake WebSocket for the event stream: the test plays Husqvarna's side.
// -----------------------------------------------------------------------------

export class FakeSocket {
  constructor(url, { headers } = {}) {
    this.url = url;
    this.headers = headers;
    this.sent = [];
    this.closed = false;
    this.pong = false;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
  }

  send(text) {
    this.sent.push(text);
    if (this.pong && text === '') {
      this.receive('');
    }
  }

  close() {
    this.closed = true;
  }

  // --- Husqvarna's side -------------------------------------------------------
  /** Open the connection; `pong`: answer every empty message, as Husqvarna does. */
  open({ pong = true } = {}) {
    this.pong = pong;
    this.onopen?.();
  }

  /** A message: an object is sent as JSON, a string as is ('' is the "pong"). */
  receive(message) {
    this.onmessage?.({ data: typeof message === 'string' ? message : JSON.stringify(message) });
  }

  drop(code = 1006) {
    this.onclose?.({ code });
  }
}

export function createSocketFactory() {
  const sockets = [];
  return {
    sockets,
    last: () => sockets.at(-1),
    factory: (url, options) => {
      const socket = new FakeSocket(url, options);
      sockets.push(socket);
      return socket;
    },
  };
}
