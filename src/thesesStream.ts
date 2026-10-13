// ═══════════════════════════════════════════════════════════════════════════
//  THESES STREAM — wss://api-id.cabalspy.xyz/v1/theses/stream (every plan)
// ═══════════════════════════════════════════════════════════════════════════
//
//   → {"op": "subscribe",   "tokens": [{"blockchain": "solana", "mint": "…"}, …]}   (up to 200)
//   → {"op": "unsubscribe", "tokens": [...]}      → {"op": "subscribe", "all": true}
//   ← ready, subscribed, thesis, thesis.reply, thesis.reaction, thesis.removed, heartbeat (30 s), error

import { BadRequestError, CabalSpyIDError, ConnectionError, PermissionError, RateLimitError } from './errors';
import type { ThesisStreamEvent } from './stream';
import {
  CHAINS,
  type Chain,
  type ThesisLiveItem,
  type ThesisReactionUpdate,
  type ThesisRemoved,
} from './types';

/** Tokens per connection. */
export const MAX_THESES_STREAM_TOKENS = 200;

export interface ThesisTokenRef {
  blockchain: Chain;
  mint: string;
}

export interface ThesesStreamOptions {
  /** `global` (default): theses from every platform. `instance`: only the ones written on your instance. */
  scope?: 'global' | 'instance';
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

export interface ThesesReadyEvent {
  scope: 'global' | 'instance';
  max_tokens: number;
}

export interface ThesesSubscribedEvent {
  all: boolean;
  tokens: ThesisTokenRef[];
}

export interface ThesesStreamEventMap {
  ready: ThesesReadyEvent;
  subscribed: ThesesSubscribedEvent;
  thesis: ThesisLiveItem;
  'thesis.reply': ThesisLiveItem;
  'thesis.reaction': ThesisReactionUpdate;
  'thesis.removed': ThesisRemoved;
  heartbeat: { ts: number };
  pong: Record<string, never>;
  open: undefined;
  close: { code?: number; reason?: string };
  reconnecting: { attempt: number; delay: number };
  error: CabalSpyIDError;
}

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

const THESIS_EVENT_NAMES = ['thesis', 'thesis.reply', 'thesis.reaction', 'thesis.removed'] as const;

function keyOf(t: ThesisTokenRef): string {
  const mint = t.blockchain === 'solana' ? t.mint.trim() : t.mint.trim().toLowerCase();
  return `${t.blockchain}:${mint}`;
}

function connectionError(code: string, message: string): CabalSpyIDError {
  if (code === 'invalid_parameter') return new BadRequestError(message, { code, status: 400 });
  if (code === 'too_many_connections') return new RateLimitError(message, { code, status: 429 });
  return new PermissionError(message, { code, status: 403 });
}

/**
 * Live theses for the tokens you choose. Subscriptions are remembered and sent
 * again after every reconnect.
 *
 *   const ts = csid.thesesStream();
 *   ts.on('thesis', (t) => addMarker(t.blockchain, t.mint, t));
 *   await ts.connect();
 *   ts.subscribe([{ blockchain: 'solana', mint: MINT_A }, { blockchain: 'base', mint: TOKEN_B }]);
 *
 *   for await (const { event, data } of ts) { … }
 */
export class ThesesStream {
  private ws: MinimalWebSocket | null = null;
  private readonly handlers = new Map<string, Set<Handler<never>>>();
  private readonly tokens = new Map<string, ThesisTokenRef>();
  private all = false;
  private attempt = 0;
  private closedByUser = false;
  private fatal: CabalSpyIDError | null = null;
  private ready = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private readonly opts: Required<Pick<ThesesStreamOptions, 'reconnect' | 'reconnectDelay' | 'maxReconnectDelay' | 'heartbeatTimeout'>>;

  constructor(
    private readonly url: string,
    private readonly apiKey: string,
    private readonly options: ThesesStreamOptions = {},
  ) {
    if (options.scope && options.scope !== 'global' && options.scope !== 'instance') {
      throw new BadRequestError(`Invalid value for 'scope': ${options.scope}`, {
        code: 'invalid_parameter',
        parameter: 'scope',
        allowed: ['global', 'instance'],
      });
    }
    this.opts = {
      reconnect: options.reconnect ?? true,
      reconnectDelay: options.reconnectDelay ?? 1_000,
      maxReconnectDelay: options.maxReconnectDelay ?? 30_000,
      heartbeatTimeout: options.heartbeatTimeout ?? 75_000,
    };
  }

  private buildUrl(key: string): string {
    const sp = new URLSearchParams({ api_key: key });
    if (this.options.scope) sp.set('scope', this.options.scope);
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

  /** The tokens currently subscribed (kept across reconnects). */
  get subscriptions(): { all: boolean; tokens: ThesisTokenRef[] } {
    return { all: this.all, tokens: [...this.tokens.values()] };
  }

  on<E extends keyof ThesesStreamEventMap>(event: E, handler: Handler<ThesesStreamEventMap[E]>): this {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(handler as Handler<never>);
    return this;
  }

  off<E extends keyof ThesesStreamEventMap>(event: E, handler: Handler<ThesesStreamEventMap[E]>): this {
    this.handlers.get(event)?.delete(handler as Handler<never>);
    return this;
  }

  private emit<E extends keyof ThesesStreamEventMap>(event: E, payload: ThesesStreamEventMap[E]): void {
    for (const h of [...(this.handlers.get(event) ?? [])]) {
      try {
        (h as Handler<ThesesStreamEventMap[E]>)(payload);
      } catch (err) {
        if (event !== 'error') this.emit('error', new CabalSpyIDError(String((err as Error)?.message ?? err), { code: 'handler_error' }));
      }
    }
  }

  private send(frame: unknown): void {
    if (this.ws?.readyState === 1 && this.ready) this.ws.send(JSON.stringify(frame));
  }

  // ── subscriptions ─────────────────────────────────────────────────────────

  /** Adds tokens (at most 200 per connection). Sent now if connected, and after every reconnect. */
  subscribe(tokens: ThesisTokenRef[]): this {
    const fresh: ThesisTokenRef[] = [];
    for (const t of tokens) {
      if (!t || !(CHAINS as readonly string[]).includes(t.blockchain)) {
        throw new BadRequestError(`Unknown blockchain '${t?.blockchain}'`, {
          code: 'invalid_parameter',
          parameter: 'blockchain',
          allowed: [...CHAINS],
        });
      }
      if (!t.mint) throw new BadRequestError("Parameter 'mint' is required", { code: 'missing_parameter', parameter: 'mint' });
      const k = keyOf(t);
      if (!this.tokens.has(k)) fresh.push({ blockchain: t.blockchain, mint: t.mint.trim() });
    }
    if (this.tokens.size + fresh.length > MAX_THESES_STREAM_TOKENS) {
      throw new BadRequestError(`At most ${MAX_THESES_STREAM_TOKENS} tokens per connection`, {
        code: 'too_many_tokens',
        parameter: 'tokens',
      });
    }
    for (const t of fresh) this.tokens.set(keyOf(t), t);
    if (fresh.length) this.send({ op: 'subscribe', tokens: fresh });
    return this;
  }

  /** Removes tokens. */
  unsubscribe(tokens: ThesisTokenRef[]): this {
    const gone = tokens.filter((t) => this.tokens.delete(keyOf(t)));
    if (gone.length) this.send({ op: 'unsubscribe', tokens: gone });
    return this;
  }

  /** Every token (all theses). */
  subscribeAll(): this {
    this.all = true;
    this.send({ op: 'subscribe', all: true });
    return this;
  }

  /** Drops every subscription, including subscribeAll(). */
  unsubscribeAll(): this {
    this.all = false;
    this.tokens.clear();
    this.send({ op: 'unsubscribe', all: true });
    return this;
  }

  private resubscribe(): void {
    if (this.all) this.send({ op: 'subscribe', all: true });
    const list = [...this.tokens.values()];
    if (list.length) this.send({ op: 'subscribe', tokens: list });
  }

  // ── connection ────────────────────────────────────────────────────────────

  /** Opens the socket; resolves on `ready` (after sending the remembered subscriptions). */
  connect(): Promise<ThesesReadyEvent> {
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
    return new Promise<ThesesReadyEvent>((resolve, reject) => {
      let settled = false;
      const settle = (err: CabalSpyIDError | null, value?: ThesesReadyEvent) => {
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
        let msg: { event?: string; data?: unknown; ts?: number; error?: { code?: string; message?: string } };
        try {
          msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
        } catch {
          return;
        }
        const event = msg.event;
        if (event === 'ready') {
          this.ready = true;
          this.attempt = 0;
          this.resubscribe();
          const data = msg.data as ThesesReadyEvent;
          this.emit('ready', data);
          settle(null, data);
        } else if (event === 'subscribed') {
          this.emit('subscribed', msg.data as ThesesSubscribedEvent);
        } else if (event && (THESIS_EVENT_NAMES as readonly string[]).includes(event)) {
          this.emit(event as (typeof THESIS_EVENT_NAMES)[number], msg.data as never);
        } else if (event === 'heartbeat') {
          this.emit('heartbeat', { ts: Number(msg.ts) });
        } else if (event === 'pong') {
          this.emit('pong', {});
        } else if (event === 'error') {
          const code = msg.error?.code ?? 'stream_error';
          const message = msg.error?.message ?? 'Stream error';
          if (!this.ready) {
            // Refused before ready: the server closes the socket.
            const err = connectionError(code, message);
            if (code !== 'too_many_connections') this.fatal = err;
            this.emit('error', err);
            settle(err);
          } else {
            // A bad frame (too many tokens, unknown token …): the connection stays.
            this.emit('error', new BadRequestError(message, { code, status: 400 }));
          }
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
        settle(new ConnectionError(`Theses stream closed before it was ready (code ${e.code ?? 'unknown'})`, { code: 'ws_closed_early' }));
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
      this.emit('error', new ConnectionError('No heartbeat from the theses stream; reconnecting', { code: 'heartbeat_timeout' }));
      this.ws?.close(4000, 'heartbeat timeout');
    }, this.opts.heartbeatTimeout);
  }

  private disarm(): void {
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = null;
  }

  /** Sends a ping (answered with `pong`). Pinging more often than every 30 s suppresses heartbeats. */
  ping(): void {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ op: 'ping' }));
  }

  /** Closes the socket and stops reconnecting. Subscriptions are kept for a later connect(). */
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
   * Iterates over thesis events as `{ event, data }`. Connects if needed;
   * breaking out closes a connection the iterator opened.
   */
  async *[Symbol.asyncIterator](): AsyncGenerator<ThesisStreamEvent, void, void> {
    const queue: ThesisStreamEvent[] = [];
    let wake: (() => void) | null = null;
    let failure: CabalSpyIDError | null = null;
    let done = false;
    const listeners = THESIS_EVENT_NAMES.map((name) => {
      const fn = (data: unknown) => {
        queue.push({ event: name, data } as ThesisStreamEvent);
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
