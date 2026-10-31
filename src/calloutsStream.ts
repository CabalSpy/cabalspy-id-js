// ═══════════════════════════════════════════════════════════════════════════
//  CALLOUTS STREAM — wss://api-id.cabalspy.xyz/v1/callouts/stream
//  (callouts are an extra, switched on per instance on request)
// ═══════════════════════════════════════════════════════════════════════════
//
//   ?api_key&chain&mint     (optional chain / mint narrow it to one chain or token)
//   ← ready, callout.created, callout.update, callout.milestone, callout.scored,
//     callout.final, callout.removed, heartbeat (30 s), error
//   → "ping"  ← pong

import { BadRequestError, CabalSpyIDError, ConnectionError, FeatureNotEnabledError, PermissionError, RateLimitError } from './errors';
import { CHAINS, type Callout, type CalloutMilestone, type CalloutRemoved, type CalloutUpdate, type Chain } from './types';

export interface CalloutsStreamOptions {
  /** Only callouts on this chain. */
  chain?: Chain;
  /** Only callouts of this token (needs `chain`). */
  mint?: string;
  /** Instance client_id, when your account has several. */
  instance?: string;
  /** Reconnect automatically after a dropped connection. Default: true */
  reconnect?: boolean;
  /** Initial reconnect delay in ms, doubling up to maxReconnectDelay. Default: 1000 */
  reconnectDelay?: number;
  /** Default: 30_000 */
  maxReconnectDelay?: number;
  /** The server sends a heartbeat every 30 s; silence this long reopens the socket. 0 disables. Default: 75_000 */
  heartbeatTimeout?: number;
  /** WebSocket implementation for Node < 22 (the `ws` package). */
  WebSocketImpl?: unknown;
}

export interface CalloutsReadyEvent {
  /** The callout events this connection receives. */
  events: CalloutEventName[];
  chain: Chain | null;
  mint: string | null;
}

export interface CalloutsStreamEventMap {
  ready: CalloutsReadyEvent;
  /** A user called a token. */
  'callout.created': Callout;
  /** A new read of a tracked callout (price, market cap, x, peak_x). */
  'callout.update': CalloutUpdate;
  /** A new milestone (2x, 3x, 5x, 10x, …): the callout plus `milestone_x`. */
  'callout.milestone': CalloutMilestone;
  /** The first 24 hours were scored (`first_day` is set). */
  'callout.scored': Callout;
  /** Tracking stopped (token inactive: below a $10k market cap for 24 hours in a row). */
  'callout.final': Callout;
  /** The platform took a callout down. */
  'callout.removed': CalloutRemoved;
  heartbeat: { ts: number };
  pong: Record<string, never>;
  open: undefined;
  close: { code?: number; reason?: string };
  reconnecting: { attempt: number; delay: number };
  error: CabalSpyIDError;
}

export const CALLOUT_EVENT_NAMES = [
  'callout.created',
  'callout.update',
  'callout.milestone',
  'callout.scored',
  'callout.final',
  'callout.removed',
] as const;
export type CalloutEventName = (typeof CALLOUT_EVENT_NAMES)[number];

/** One callout event, as yielded by `for await (… of calloutsStream)`. */
export type CalloutStreamEvent = {
  [K in CalloutEventName]: { event: K; data: CalloutsStreamEventMap[K] };
}[CalloutEventName];

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

function connectionError(code: string, message: string): CabalSpyIDError {
  if (code === 'invalid_parameter') return new BadRequestError(message, { code, status: 400 });
  if (code === 'too_many_connections') return new RateLimitError(message, { code, status: 429 });
  if (code === 'feature_not_enabled') return new FeatureNotEnabledError(message, { code, status: 403 });
  return new PermissionError(message, { code, status: 403 });
}

/**
 * Every callout event of your instance, live (at most 5 connections per key).
 *
 *   const cs = csid.calloutsStream({ chain: 'solana' });
 *   cs.on('callout.created', (c) => addMarker(c));
 *   cs.on('callout.milestone', (c) => toast(`${c.token.symbol} hit ${c.milestone_x}x`));
 *   await cs.connect();
 *
 *   for await (const { event, data } of cs) { … }
 */
export class CalloutsStream {
  private ws: MinimalWebSocket | null = null;
  private readonly handlers = new Map<string, Set<Handler<never>>>();
  private attempt = 0;
  private closedByUser = false;
  private fatal: CabalSpyIDError | null = null;
  private ready = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private readonly opts: Required<Pick<CalloutsStreamOptions, 'reconnect' | 'reconnectDelay' | 'maxReconnectDelay' | 'heartbeatTimeout'>>;

  constructor(
    private readonly url: string,
    private readonly apiKey: string,
    private readonly options: CalloutsStreamOptions = {},
  ) {
    if (options.chain !== undefined && !(CHAINS as readonly string[]).includes(options.chain)) {
      throw new BadRequestError(`Invalid value for 'chain': ${options.chain}`, {
        code: 'invalid_parameter',
        parameter: 'chain',
        allowed: [...CHAINS],
      });
    }
    if (options.mint && !options.chain) {
      throw new BadRequestError("Parameter 'chain' is required with 'mint'", { code: 'missing_parameter', parameter: 'chain' });
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
    if (this.options.chain) sp.set('chain', this.options.chain);
    if (this.options.mint) sp.set('mint', this.options.mint.trim());
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

  on<E extends keyof CalloutsStreamEventMap>(event: E, handler: Handler<CalloutsStreamEventMap[E]>): this {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(handler as Handler<never>);
    return this;
  }

  off<E extends keyof CalloutsStreamEventMap>(event: E, handler: Handler<CalloutsStreamEventMap[E]>): this {
    this.handlers.get(event)?.delete(handler as Handler<never>);
    return this;
  }

  private emit<E extends keyof CalloutsStreamEventMap>(event: E, payload: CalloutsStreamEventMap[E]): void {
    for (const h of [...(this.handlers.get(event) ?? [])]) {
      try {
        (h as Handler<CalloutsStreamEventMap[E]>)(payload);
      } catch (err) {
        if (event !== 'error') this.emit('error', new CabalSpyIDError(String((err as Error)?.message ?? err), { code: 'handler_error' }));
      }
    }
  }

  // ── connection ────────────────────────────────────────────────────────────

  /** Opens the socket; resolves on `ready`. */
  connect(): Promise<CalloutsReadyEvent> {
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
    return new Promise<CalloutsReadyEvent>((resolve, reject) => {
      let settled = false;
      const settle = (err: CabalSpyIDError | null, value?: CalloutsReadyEvent) => {
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
          const data = msg.data as CalloutsReadyEvent;
          this.emit('ready', data);
          settle(null, data);
        } else if (event && (CALLOUT_EVENT_NAMES as readonly string[]).includes(event)) {
          this.emit(event as CalloutEventName, msg.data as never);
        } else if (event === 'heartbeat') {
          this.emit('heartbeat', { ts: Number(msg.ts) });
        } else if (event === 'pong') {
          this.emit('pong', {});
        } else if (event === 'error') {
          const code = msg.error?.code ?? 'stream_error';
          const err = connectionError(code, msg.error?.message ?? 'Stream error');
          // Refusals (invalid key, callouts not enabled, bad token) do not go away by reconnecting.
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
        settle(new ConnectionError(`Callouts stream closed before it was ready (code ${e.code ?? 'unknown'})`, { code: 'ws_closed_early' }));
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
      this.emit('error', new ConnectionError('No heartbeat from the callouts stream; reconnecting', { code: 'heartbeat_timeout' }));
      this.ws?.close(4000, 'heartbeat timeout');
    }, this.opts.heartbeatTimeout);
  }

  private disarm(): void {
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = null;
  }

  /** Sends a ping (answered with `pong`). */
  ping(): void {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ op: 'ping' }));
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
   * Iterates over callout events as `{ event, data }`. Connects if needed;
   * breaking out closes a connection the iterator opened.
   */
  async *[Symbol.asyncIterator](): AsyncGenerator<CalloutStreamEvent, void, void> {
    const queue: CalloutStreamEvent[] = [];
    let wake: (() => void) | null = null;
    let failure: CabalSpyIDError | null = null;
    let done = false;
    const listeners = CALLOUT_EVENT_NAMES.map((name) => {
      const fn = (data: unknown) => {
        queue.push({ event: name, data } as CalloutStreamEvent);
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
