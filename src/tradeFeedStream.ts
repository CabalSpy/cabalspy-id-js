// ═══════════════════════════════════════════════════════════════════════════
//  TRADE FEED STREAM — wss://api-id.cabalspy.xyz/v1/trade-feed/stream (every plan)
// ═══════════════════════════════════════════════════════════════════════════
//
//   ← ready {"events": ["trade_feed.trade", "trade_feed.thesis"]}
//   ← trade_feed.trade | trade_feed.thesis  {"event", "id", "data": {…, "recipients": [csid_id, …]}}
//   ← heartbeat (30 s), pong, error (then close 4403)
//   → "ping"
//
// Every Trade Feed event that concerns your users (those who allowed the scope
// `trade_feed`); `data.recipients` lists them. At most 5 connections per API key.

import { CabalSpyIDError, ConnectionError, PermissionError, RateLimitError } from './errors';
import type { TradeFeedEventType, TradeFeedThesisData, TradeFeedTradeData } from './types';

export interface TradeFeedStreamOptions {
  /** Instance client_id, when your account has several. */
  instance?: string;
  /** Default: true */
  reconnect?: boolean;
  /** Default: 1000 */
  reconnectDelay?: number;
  /** Default: 30_000 */
  maxReconnectDelay?: number;
  /** The server sends a heartbeat every 30 s; silence this long reopens the socket. 0 disables. Default: 75_000 */
  heartbeatTimeout?: number;
  /** WebSocket implementation for Node < 22 (the `ws` package). */
  WebSocketImpl?: unknown;
}

export interface TradeFeedReadyEvent {
  events: TradeFeedEventType[];
}

/** One event from the Trade Feed stream, as yielded by the async iterator. */
export type TradeFeedStreamEvent =
  | { event: 'trade_feed.trade'; id: string; data: TradeFeedTradeData }
  | { event: 'trade_feed.thesis'; id: string; data: TradeFeedThesisData };

export interface TradeFeedStreamEventMap {
  ready: TradeFeedReadyEvent;
  /** A trade; the second argument is the event id (the same for every connection: dedupe on it). */
  'trade_feed.trade': TradeFeedTradeData;
  /** A thesis. */
  'trade_feed.thesis': TradeFeedThesisData;
  heartbeat: { ts: number };
  pong: Record<string, never>;
  open: undefined;
  close: { code?: number; reason?: string };
  reconnecting: { attempt: number; delay: number };
  error: CabalSpyIDError;
}

type Handler<T> = (payload: T, eventId?: string) => void;

interface MinimalWebSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readyState: number;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
}

export const TRADE_FEED_EVENTS = ['trade_feed.trade', 'trade_feed.thesis'] as const;

function connectionError(code: string, message: string): CabalSpyIDError {
  if (code === 'too_many_connections') return new RateLimitError(message, { code, status: 429 });
  return new PermissionError(message, { code, status: 403 });
}

/**
 * Live Trade Feed events of your users (every plan): one event per trade or
 * thesis of a trader in their Trade Feeds, with `data.recipients` = your users
 * whose filters it passed. The same events as the `trade_feed.*` webhooks.
 *
 *   const tf = csid.tradeFeedStream();
 *   tf.on('trade_feed.trade', (e) => notify(e.recipients, e));
 *   await tf.connect();
 *
 *   for await (const { event, id, data } of csid.tradeFeedStream()) { … }
 *
 * Reconnects with exponential backoff after a dropped connection or a missed
 * heartbeat; an invalid key is final.
 */
export class TradeFeedStream {
  private ws: MinimalWebSocket | null = null;
  private readonly handlers = new Map<string, Set<Handler<never>>>();
  private attempt = 0;
  private closedByUser = false;
  private fatal: CabalSpyIDError | null = null;
  private ready = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private readonly opts: Required<Pick<TradeFeedStreamOptions, 'reconnect' | 'reconnectDelay' | 'maxReconnectDelay' | 'heartbeatTimeout'>>;

  constructor(
    private readonly url: string,
    private readonly apiKey: string,
    private readonly options: TradeFeedStreamOptions = {},
  ) {
    this.opts = {
      reconnect: options.reconnect ?? true,
      reconnectDelay: options.reconnectDelay ?? 1_000,
      maxReconnectDelay: options.maxReconnectDelay ?? 30_000,
      heartbeatTimeout: options.heartbeatTimeout ?? 75_000,
    };
  }

  private buildUrl(key: string): string {
    const sp = new URLSearchParams({ api_key: key });
    if (this.options.instance) sp.set('instance', this.options.instance);
    return `${this.url}?${sp.toString()}`;
  }

  /** The URL with the key masked, safe to log. */
  get safeUrl(): string {
    return this.buildUrl('***');
  }

  get connected(): boolean {
    return this.ws?.readyState === 1 && this.ready;
  }

  on<E extends keyof TradeFeedStreamEventMap>(event: E, handler: Handler<TradeFeedStreamEventMap[E]>): this {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(handler as Handler<never>);
    return this;
  }

  off<E extends keyof TradeFeedStreamEventMap>(event: E, handler: Handler<TradeFeedStreamEventMap[E]>): this {
    this.handlers.get(event)?.delete(handler as Handler<never>);
    return this;
  }

  private emit<E extends keyof TradeFeedStreamEventMap>(event: E, payload: TradeFeedStreamEventMap[E], eventId?: string): void {
    for (const h of [...(this.handlers.get(event) ?? [])]) {
      try {
        (h as Handler<TradeFeedStreamEventMap[E]>)(payload, eventId);
      } catch (err) {
        if (event !== 'error') this.emit('error', new CabalSpyIDError(String((err as Error)?.message ?? err), { code: 'handler_error' }));
      }
    }
  }

  /** Opens the socket; resolves on `ready`. */
  connect(): Promise<TradeFeedReadyEvent> {
    this.closedByUser = false;
    this.fatal = null;
    const WS = (this.options.WebSocketImpl ?? (globalThis as { WebSocket?: unknown }).WebSocket) as
      | (new (url: string) => MinimalWebSocket)
      | undefined;
    if (!WS) {
      return Promise.reject(
        new ConnectionError('No WebSocket implementation found. On Node < 22, run `npm i ws` and pass { WebSocketImpl: WebSocket }.', {
          code: 'no_websocket',
        }),
      );
    }
    return new Promise<TradeFeedReadyEvent>((resolve, reject) => {
      let settled = false;
      const settle = (err: CabalSpyIDError | null, value?: TradeFeedReadyEvent) => {
        if (settled) return;
        settled = true;
        if (err) reject(err);
        else resolve(value!);
      };
      this.ready = false;
      const ws = new WS(this.buildUrl(this.apiKey));
      this.ws = ws;
      ws.onopen = () => {
        this.arm();
        this.emit('open', undefined);
      };
      ws.onmessage = (ev) => {
        if (this.ws !== ws) return;
        this.arm();
        let msg: { event?: string; id?: string; data?: unknown; ts?: number; error?: { code?: string; message?: string } };
        try {
          msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
        } catch {
          return;
        }
        const event = msg.event;
        if (event === 'ready') {
          this.ready = true;
          this.attempt = 0;
          const data = (msg.data ?? { events: [...TRADE_FEED_EVENTS] }) as TradeFeedReadyEvent;
          this.emit('ready', data);
          settle(null, data);
        } else if (event === 'trade_feed.trade' || event === 'trade_feed.thesis') {
          this.emit(event, msg.data as never, msg.id);
        } else if (event === 'heartbeat') {
          this.emit('heartbeat', { ts: Number(msg.ts) });
        } else if (event === 'pong') {
          this.emit('pong', {});
        } else if (event === 'error') {
          const code = msg.error?.code ?? 'stream_error';
          const err = connectionError(code, msg.error?.message ?? 'Stream error');
          // Refused (the server closes the socket): a bad key is final, too_many_connections is retried.
          if (code !== 'too_many_connections') this.fatal = err;
          this.emit('error', err);
          settle(err);
        }
      };
      ws.onerror = () => {
        if (this.ws !== ws) return;
        const err = new ConnectionError(`WebSocket error on ${this.safeUrl}`, { code: 'ws_error' });
        this.emit('error', err);
        settle(err);
      };
      ws.onclose = (ev) => {
        if (this.ws !== ws) return;
        this.ws = null;
        this.ready = false;
        this.disarm();
        const e = (ev ?? {}) as { code?: number; reason?: string };
        this.emit('close', { code: e.code, reason: e.reason });
        settle(new ConnectionError(`Trade Feed stream closed before it was ready (code ${e.code ?? 'unknown'})`, { code: 'ws_closed_early' }));
        if (!this.closedByUser && !this.fatal && this.opts.reconnect) this.scheduleReconnect();
      };
    });
  }

  private scheduleReconnect(): void {
    const delay = Math.min(this.opts.reconnectDelay * 2 ** this.attempt, this.opts.maxReconnectDelay) + Math.random() * 250;
    this.attempt++;
    this.emit('reconnecting', { attempt: this.attempt, delay });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closedByUser) this.connect().catch(() => undefined);
    }, delay);
  }

  private arm(): void {
    if (!this.opts.heartbeatTimeout) return;
    this.disarm();
    this.watchdog = setTimeout(() => {
      this.emit('error', new ConnectionError('No heartbeat from the Trade Feed stream; reconnecting', { code: 'heartbeat_timeout' }));
      this.ws?.close(4000, 'heartbeat timeout');
    }, this.opts.heartbeatTimeout);
  }

  private disarm(): void {
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = null;
  }

  /** Sends a ping (answered with `pong`). */
  ping(): void {
    if (this.ws?.readyState === 1) this.ws.send('ping');
  }

  /** Closes the socket and stops reconnecting. */
  close(): void {
    this.closedByUser = true;
    this.disarm();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const ws = this.ws;
    this.ws = null;
    this.ready = false;
    ws?.close(1000, 'client closed');
    this.emit('close', { code: 1000, reason: 'client closed' });
  }

  /**
   * Iterates over Trade Feed events as `{ event, id, data }`. Connects if
   * needed; breaking out closes a connection the iterator opened.
   */
  async *[Symbol.asyncIterator](): AsyncGenerator<TradeFeedStreamEvent, void, void> {
    const queue: TradeFeedStreamEvent[] = [];
    let wake: (() => void) | null = null;
    let failure: CabalSpyIDError | null = null;
    let done = false;
    const listeners = TRADE_FEED_EVENTS.map((name) => {
      const fn = (data: unknown, id?: string) => {
        queue.push({ event: name, id: id ?? '', data } as TradeFeedStreamEvent);
        wake?.();
      };
      return [name, fn] as const;
    });
    const onError = () => {
      if (this.fatal) {
        failure = this.fatal;
        wake?.();
      }
    };
    const onClose = () => {
      if (this.closedByUser || !this.opts.reconnect) {
        done = true;
        wake?.();
      }
    };
    for (const [name, fn] of listeners) this.on(name, fn as never);
    this.on('error', onError).on('close', onClose);
    const owns = !this.ws;
    try {
      if (owns) await this.connect();
      while (true) {
        while (queue.length) yield queue.shift()!;
        if (failure) throw failure;
        if (done) return;
        await new Promise<void>((r) => (wake = r));
        wake = null;
      }
    } finally {
      for (const [name, fn] of listeners) this.off(name, fn as never);
      this.off('error', onError).off('close', onClose);
      if (owns && !this.closedByUser) this.close();
    }
  }
}
