// ═══════════════════════════════════════════════════════════════════════════
//  LIVE STREAM — wss://api-id.cabalspy.xyz/v1/stream (Pro plan and up)
// ═══════════════════════════════════════════════════════════════════════════

import {
  BadRequestError,
  CabalSpyIDError,
  ConnectionError,
  PermissionError,
  RateLimitError,
} from './errors';
import {
  CHAINS,
  type Chain,
  type Scope,
  type ThesisLiveItem,
  type ThesisReactionUpdate,
  type ThesisRemoved,
  type Trade,
} from './types';

/** `trades`: your users' trades. `theses`: new theses, replies, reactions and removals (public, all users). */
export type StreamTopic = 'trades' | 'theses';

export interface StreamOptions {
  /** What to receive. Default: ['trades'] */
  events?: StreamTopic[];
  /** Only this chain. Default: every chain. */
  blockchain?: Chain;
  /** Theses of one token only (needs `blockchain`). */
  mint?: string;
  /** `global` (every CabalSpy ID user) is Enterprise only. Default: instance */
  scope?: Scope;
  /** Instance client_id, when your account has several. */
  instance?: string;
  /** Reconnect automatically after a dropped connection. Default: true */
  reconnect?: boolean;
  /** Initial reconnect delay in ms, doubling up to maxReconnectDelay. Default: 1000 */
  reconnectDelay?: number;
  /** Default: 30_000 */
  maxReconnectDelay?: number;
  /**
   * The server sends a heartbeat every 30 s. When nothing at all arrives for
   * this many ms, the connection is treated as dead and reopened.
   * 0 disables the check. Default: 75_000
   */
  heartbeatTimeout?: number;
  /**
   * WebSocket implementation. Browsers, Deno, Bun and Node 22+ have a global
   * WebSocket. On Node 18-21, `npm i ws` and pass `{ WebSocketImpl: WebSocket }`.
   */
  WebSocketImpl?: unknown;
}

export interface SubscribedEvent {
  blockchain: Chain | 'all';
  scope: Scope;
  events?: StreamTopic[];
  mint?: string | null;
}

export interface HeartbeatEvent {
  ts: number;
}

export interface CloseEvent {
  code?: number;
  reason?: string;
}

export interface ReconnectEvent {
  attempt: number;
  delay: number;
}

export interface StreamEventMap {
  trade: Trade;
  /** A new thesis (events: theses). */
  thesis: ThesisLiveItem;
  /** A new reply to a thesis. */
  'thesis.reply': ThesisLiveItem;
  /** Reaction counts of a thesis or reply changed. */
  'thesis.reaction': ThesisReactionUpdate;
  /** A thesis or reply was deleted or hidden. */
  'thesis.removed': ThesisRemoved;
  subscribed: SubscribedEvent;
  heartbeat: HeartbeatEvent;
  pong: Record<string, never>;
  open: undefined;
  close: CloseEvent;
  reconnecting: ReconnectEvent;
  error: CabalSpyIDError;
  /** Every parsed message, before dispatch. */
  message: Record<string, unknown>;
}

export type StreamEvent = keyof StreamEventMap;
type Handler<T> = (payload: T) => void;

interface MinimalWebSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readyState: number;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
}

/** Server error codes that will not go away by reconnecting. */
const FATAL_CODES = new Set([
  'invalid_api_key',
  'plan_required',
  'invalid_parameter',
  'missing_parameter',
  'scope_not_allowed',
  'product_not_enabled',
]);

function streamError(code: string, message: string): CabalSpyIDError {
  const opts = { code };
  if (code === 'invalid_parameter' || code === 'missing_parameter') return new BadRequestError(message, { ...opts, status: 400 });
  if (code === 'too_many_connections') return new RateLimitError(message, { ...opts, status: 429 });
  if (FATAL_CODES.has(code)) return new PermissionError(message, { ...opts, status: 403 });
  return new CabalSpyIDError(message, opts);
}

/**
 * WebSocket client for the live trade stream.
 *
 *   const stream = csid.stream({ blockchain: 'solana' });
 *   stream.on('trade', (t) => console.log(t.trader?.username, t.transaction_type, t.value_usd));
 *   await stream.connect();          // resolves once the server confirmed the subscription
 *
 * or as an async iterator:
 *
 *   for await (const trade of csid.stream()) { … }
 *
 * Reconnects with exponential backoff after a dropped connection or a missed
 * heartbeat. Configuration errors from the server (invalid key, plan without
 * the stream, …) are fatal: they are emitted as 'error' and stop reconnecting.
 */
export class CabalSpyIDStream {
  private ws: MinimalWebSocket | null = null;
  private readonly opts: Required<Omit<StreamOptions, 'WebSocketImpl' | 'blockchain' | 'scope' | 'instance' | 'events' | 'mint'>>;
  private readonly handlers = new Map<string, Set<Handler<never>>>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private closedByUser = false;
  private fatal: CabalSpyIDError | null = null;

  constructor(
    private readonly url: string,
    private readonly apiKey: string,
    private readonly options: StreamOptions = {},
  ) {
    const events = options.events ?? ['trades'];
    if (!events.length || events.some((e) => e !== 'trades' && e !== 'theses')) {
      throw new BadRequestError("events must contain 'trades' and/or 'theses'", {
        code: 'invalid_parameter',
        parameter: 'events',
        allowed: ['trades', 'theses'],
      });
    }
    if (options.mint && !options.blockchain) {
      throw new BadRequestError('mint needs blockchain', { code: 'missing_parameter', parameter: 'blockchain' });
    }
    if (options.blockchain && !(CHAINS as readonly string[]).includes(options.blockchain)) {
      throw new BadRequestError(`Unknown blockchain '${options.blockchain}'`, {
        code: 'invalid_parameter',
        parameter: 'blockchain',
        allowed: [...CHAINS],
      });
    }
    this.opts = {
      reconnect: options.reconnect ?? true,
      reconnectDelay: options.reconnectDelay ?? 1_000,
      maxReconnectDelay: options.maxReconnectDelay ?? 30_000,
      heartbeatTimeout: options.heartbeatTimeout ?? 75_000,
    };
  }

  /** True while the socket is open. */
  get connected(): boolean {
    return this.ws?.readyState === 1;
  }

  /** The stream URL including query parameters, with the key masked. */
  get safeUrl(): string {
    return this.buildUrl('***');
  }

  private buildUrl(key: string): string {
    const sp = new URLSearchParams({ api_key: key });
    if (this.options.events) sp.set('events', [...new Set(this.options.events)].join(','));
    if (this.options.blockchain) sp.set('blockchain', this.options.blockchain);
    if (this.options.mint) sp.set('mint', this.options.mint);
    if (this.options.scope) sp.set('scope', this.options.scope);
    if (this.options.instance) sp.set('instance', this.options.instance);
    return `${this.url}?${sp.toString()}`;
  }

  on<E extends StreamEvent>(event: E, handler: Handler<StreamEventMap[E]>): this {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<never>);
    return this;
  }

  off<E extends StreamEvent>(event: E, handler: Handler<StreamEventMap[E]>): this {
    this.handlers.get(event)?.delete(handler as Handler<never>);
    return this;
  }

  private emit<E extends StreamEvent>(event: E, payload: StreamEventMap[E]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const h of [...set]) {
      try {
        (h as Handler<StreamEventMap[E]>)(payload);
      } catch (err) {
        // A throwing handler must not take down the connection.
        if (event !== 'error') {
          this.emit('error', err instanceof CabalSpyIDError ? err : new CabalSpyIDError(String((err as Error)?.message ?? err), { code: 'handler_error' }));
        }
      }
    }
  }

  /** Opens the socket. Resolves once the server sent `subscribed`. */
  connect(): Promise<SubscribedEvent> {
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

    return new Promise<SubscribedEvent>((resolve, reject) => {
      let settled = false;
      const settle = (err: CabalSpyIDError | null, value?: SubscribedEvent) => {
        if (settled) return;
        settled = true;
        if (err) reject(err);
        else resolve(value!);
      };

      let ws: MinimalWebSocket;
      try {
        ws = new WS(this.buildUrl(this.apiKey));
      } catch (err) {
        settle(new ConnectionError(`Could not open ${this.safeUrl}: ${(err as Error)?.message ?? err}`, { code: 'ws_error' }));
        return;
      }
      this.ws = ws;

      ws.onopen = () => {
        this.armWatchdog();
        this.emit('open', undefined);
      };

      ws.onmessage = (ev) => {
        if (this.ws !== ws) return;
        this.armWatchdog();
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)) as Record<string, unknown>;
        } catch {
          return;
        }
        this.emit('message', msg);
        switch (msg.event) {
          case 'trade':
            this.emit('trade', msg.data as Trade);
            break;
          case 'subscribed': {
            this.reconnectAttempt = 0;
            const data = (msg.data ?? {}) as SubscribedEvent;
            this.emit('subscribed', data);
            settle(null, data);
            break;
          }
          case 'thesis':
          case 'thesis.reply':
          case 'thesis.reaction':
          case 'thesis.removed':
            this.emit(msg.event, msg.data as never);
            break;
          case 'heartbeat':
            this.emit('heartbeat', { ts: Number(msg.ts) });
            break;
          case 'pong':
            this.emit('pong', {});
            break;
          case 'error': {
            const e = (msg.error ?? {}) as { code?: string; message?: string };
            const err = streamError(e.code ?? 'stream_error', e.message ?? 'Stream error');
            if (FATAL_CODES.has(err.code)) this.fatal = err;
            this.emit('error', err);
            settle(err);
            break;
          }
          default:
            break;
        }
      };

      ws.onerror = (ev) => {
        if (this.ws !== ws) return;
        const err = new ConnectionError(`WebSocket error on ${this.safeUrl}: ${describeWsEvent(ev)}`, { code: 'ws_error' });
        this.emit('error', err);
        settle(err);
      };

      ws.onclose = (ev) => {
        if (this.ws !== ws) return;
        this.clearWatchdog();
        this.ws = null;
        const e = (ev ?? {}) as { code?: number; reason?: string };
        this.emit('close', { code: e.code, reason: e.reason });
        settle(
          new ConnectionError(`Stream closed before it was ready (code ${e.code ?? 'unknown'}${e.reason ? `, ${e.reason}` : ''})`, {
            code: 'ws_closed_early',
          }),
        );
        if (!this.closedByUser && !this.fatal && this.opts.reconnect) this.scheduleReconnect();
      };
    });
  }

  private scheduleReconnect(): void {
    const delay = Math.min(this.opts.reconnectDelay * 2 ** this.reconnectAttempt, this.opts.maxReconnectDelay) + Math.random() * 250;
    this.reconnectAttempt++;
    this.emit('reconnecting', { attempt: this.reconnectAttempt, delay });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.closedByUser) return;
      this.connect().catch(() => {
        /* reported through 'error'; onclose schedules the next attempt */
      });
    }, delay);
  }

  private armWatchdog(): void {
    if (!this.opts.heartbeatTimeout) return;
    this.clearWatchdog();
    this.watchdog = setTimeout(() => {
      // Nothing heard, not even a heartbeat: the connection is dead.
      this.emit('error', new ConnectionError('No heartbeat from the stream; reconnecting', { code: 'heartbeat_timeout' }));
      this.ws?.close(4000, 'heartbeat timeout');
    }, this.opts.heartbeatTimeout);
  }

  private clearWatchdog(): void {
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = null;
  }

  /**
   * Sends a ping; the server answers with 'pong'. Not needed to keep the
   * connection alive (the server sends heartbeats), and pinging more often
   * than every 30 s suppresses those heartbeats.
   */
  ping(): void {
    if (this.ws?.readyState === 1) this.ws.send('ping');
  }

  /** Closes the connection and stops reconnecting. */
  close(): void {
    this.closedByUser = true;
    this.clearWatchdog();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000, 'client closed');
    this.emit('close', { code: 1000, reason: 'client closed' });
  }

  /**
   * Iterates over trades. Connects if needed; ends when close() is called or
   * a fatal error occurs (which is thrown). Breaking out of the loop closes a
   * connection the iterator opened.
   */
  [Symbol.asyncIterator](): AsyncGenerator<Trade, void, void> {
    return this.iterate<Trade>(['trade'], (_e, d) => d as Trade);
  }

  /**
   * Iterates over thesis events (`thesis`, `thesis.reply`, `thesis.reaction`,
   * `thesis.removed`). Open the stream with `events: ['theses']`.
   *
   *   for await (const { event, data } of csid.stream({ events: ['theses'] }).theses()) { … }
   */
  theses(): AsyncGenerator<ThesisStreamEvent, void, void> {
    return this.iterate<ThesisStreamEvent>(
      ['thesis', 'thesis.reply', 'thesis.reaction', 'thesis.removed'],
      (event, data) => ({ event, data }) as ThesisStreamEvent,
    );
  }

  private async *iterate<T>(
    names: StreamEvent[],
    wrap: (event: StreamEvent, data: unknown) => T,
  ): AsyncGenerator<T, void, void> {
    const queue: T[] = [];
    let wake: (() => void) | null = null;
    let failure: CabalSpyIDError | null = null;
    let done = false;
    const listeners = names.map((name) => {
      const fn = (data: unknown) => {
        queue.push(wrap(name, data));
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
    const ownsConnection = !this.ws;
    try {
      if (ownsConnection) await this.connect();
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
      // Breaking out of `for await` closes a connection the iterator opened.
      if (ownsConnection && !this.closedByUser) this.close();
    }
  }
}

/** One thesis event from `stream.theses()`. */
export type ThesisStreamEvent =
  | { event: 'thesis'; data: ThesisLiveItem }
  | { event: 'thesis.reply'; data: ThesisLiveItem }
  | { event: 'thesis.reaction'; data: ThesisReactionUpdate }
  | { event: 'thesis.removed'; data: ThesisRemoved };

/** Pulls whatever detail the runtime attached to a websocket error event. */
function describeWsEvent(ev: unknown): string {
  if (!ev || typeof ev !== 'object') return 'no detail available';
  const e = ev as { message?: string; error?: { message?: string; code?: string }; type?: string };
  return e.error?.message ?? e.message ?? (e.error?.code ? `errno ${e.error.code}` : undefined) ?? e.type ?? 'no detail available';
}
