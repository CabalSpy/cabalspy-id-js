// ═══════════════════════════════════════════════════════════════════════════
//  PUBLIC THESIS API — https://id.cabalspy.xyz/thesis/v1 (browser friendly)
// ═══════════════════════════════════════════════════════════════════════════
//
// Reading needs nothing. Writing needs the signed-in user's CabalSpy ID access
// token with the scope "thesis" (e.g. from the login widget's csid:login event).
// CORS is open and no cookies are used, so this runs in the browser as is.
// Your API key is never needed here (and must never reach a browser).

import {
  type ApiErrorBody,
  AuthenticationError,
  BadRequestError,
  CabalSpyIDError,
  ConnectionError,
  EMPTY_RATE_LIMIT,
  InvalidResponseError,
  PermissionError,
  errorFromStatus,
} from './errors';
import {
  CHAINS,
  type Chain,
  type Pagination,
  THESIS_EMOJIS,
  THESIS_REPORT_REASONS,
  type Thesis,
  type ThesisCounts,
  type ThesisEligibility,
  type ThesisEmoji,
  type ThesisNotices,
  type ThesisNotifications,
  type ThesisReactions,
  type ThesisReportReason,
  type ThesisSort,
  type ThesisStance,
  type ThesisSummary,
  type ThesisToken,
} from './types';
import { USER_AGENT } from './util';

export const DEFAULT_THESIS_URL = 'https://id.cabalspy.xyz/thesis/v1';
export const DEFAULT_THESIS_WS_URL = 'wss://id.cabalspy.xyz/thesis/v1/ws';

export interface ThesisScopeOptions {
  /**
   * `global` (default): theses written on every platform. `instance`: only the
   * ones written on the instance named by `clientId`.
   */
  scope?: 'global' | 'instance';
  /** Your instance's client_id. Needed for `scope: 'instance'`; also credits posts to your app. */
  clientId?: string;
}

export interface ThesisClientOptions extends ThesisScopeOptions {
  /** The signed-in user's access token (scope `thesis`). Needed only for writing. */
  accessToken?: string | null;
  /** Default: https://id.cabalspy.xyz/thesis/v1 */
  baseUrl?: string;
  /** Default: wss://id.cabalspy.xyz/thesis/v1/ws */
  wsUrl?: string;
  /** Per-request timeout in ms. Default: 15_000 */
  timeout?: number;
  fetch?: typeof globalThis.fetch;
}

export interface TokenThesesPage {
  items: Thesis[];
  pagination: Pagination;
  token: ThesisToken;
  summary: ThesisCounts;
}

export interface ThesisPage {
  items: Thesis[];
  pagination: Pagination;
}

export interface TokenThesesOptions extends ThesisScopeOptions {
  sort?: ThesisSort;
  stance?: ThesisStance;
  /** 1-50. Default: 20 */
  limit?: number;
  cursor?: string;
}

export interface ThesisViewer {
  csid_id: string;
  username: string | null;
  name: string | null;
  image_url: string | null;
}

/** Eligibility of the signed-in user, who that is, and their unread moderation notices. */
export type ThesisMe = ThesisEligibility & { user: ThesisViewer; notices: ThesisNotices };

function assertChain(chain: string): void {
  if (!(CHAINS as readonly string[]).includes(chain)) {
    throw new BadRequestError(`Unknown blockchain '${chain}'`, { code: 'invalid_parameter', parameter: 'chain', allowed: [...CHAINS] });
  }
}

const enc = encodeURIComponent;

/** Query parameters for a scope; instance scope needs the client_id. */
function scopeQuery(scope: string | undefined, clientId: string | undefined): Record<string, string | undefined> {
  if (scope === undefined || scope === 'global') return scope ? { scope } : {};
  if (scope !== 'instance') {
    throw new BadRequestError(`Invalid value for 'scope': ${scope}`, {
      code: 'invalid_parameter',
      parameter: 'scope',
      allowed: ['global', 'instance'],
    });
  }
  if (!clientId) {
    throw new BadRequestError('scope=instance needs clientId', { code: 'missing_parameter', parameter: 'clientId' });
  }
  return { scope, client_id: clientId };
}

/**
 * Client for the public thesis API, e.g. in a browser app that builds its own
 * thesis UI.
 *
 *   const theses = new ThesisClient({ accessToken });     // from csid:login
 *   const page = await theses.list('solana', mint, { sort: 'top' });
 *   await theses.post('solana', mint, { body: 'Strong community, early.', stance: 'bull' });
 *   const live = theses.live('solana', mint);
 *   live.on('thesis', (t) => render(t));
 *   await live.connect();
 */
export class ThesisClient {
  readonly baseUrl: string;
  readonly wsUrl: string;
  readonly timeout: number;
  readonly scope?: 'global' | 'instance';
  readonly clientId?: string;
  private accessToken: string | null;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(options: ThesisClientOptions = {}) {
    this.accessToken = options.accessToken ?? null;
    this.baseUrl = (options.baseUrl ?? DEFAULT_THESIS_URL).replace(/\/+$/, '');
    this.wsUrl = (options.wsUrl ?? DEFAULT_THESIS_WS_URL).replace(/\/+$/, '');
    this.timeout = options.timeout ?? 15_000;
    this.scope = options.scope;
    this.clientId = options.clientId;
    scopeQuery(this.scope, this.clientId);
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /** Sets (or with null clears) the user's access token, e.g. after sign-in or sign-out. */
  setAccessToken(token: string | null | undefined): void {
    this.accessToken = token ?? null;
  }

  private async call<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    opts: { auth?: 'required' | 'optional'; body?: unknown; query?: Record<string, string | number | undefined> } = {},
  ): Promise<{ data: T; extra: Record<string, unknown> }> {
    if (opts.auth === 'required' && !this.accessToken) {
      throw new AuthenticationError('Sign in with CabalSpy ID to write (an access token with the scope "thesis").', {
        status: 401,
        code: 'sign_in_required',
      });
    }
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== '') sp.set(k, String(v));
    const qs = sp.toString();
    const url = `${this.baseUrl}${path}${qs ? `?${qs}` : ''}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    let res: Response;
    let text: string;
    try {
      res = await this.fetchImpl(url, {
        method,
        signal: controller.signal,
        credentials: 'omit',
        headers: {
          Accept: 'application/json',
          ...(typeof window === 'undefined' ? { 'User-Agent': USER_AGENT } : {}),
          ...(this.accessToken && opts.auth ? { Authorization: `Bearer ${this.accessToken}` } : {}),
          ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
      text = await res.text();
    } catch (err) {
      const aborted = (err as Error)?.name === 'AbortError';
      throw new ConnectionError(aborted ? `Request timed out after ${this.timeout} ms: ${method} ${path}` : `Network error: ${(err as Error)?.message}`, {
        code: aborted ? 'timeout' : 'connection_error',
      });
    } finally {
      clearTimeout(timer);
    }
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      parsed = null;
    }
    if (!res.ok || parsed?.success === false) {
      const err = (parsed?.error ?? null) as ApiErrorBody | null;
      throw errorFromStatus(res.status, err, { ...EMPTY_RATE_LIMIT }, null, `HTTP ${res.status} on ${method} ${path}`);
    }
    if (!parsed || !('data' in parsed)) {
      throw new InvalidResponseError(`Unexpected response shape on ${method} ${path}`, { status: res.status, code: 'invalid_response' });
    }
    const { data, success: _s, ...extra } = parsed;
    return { data: data as T, extra };
  }

  private tokenPath(chain: Chain, mint: string): string {
    assertChain(chain);
    if (!mint) throw new BadRequestError("Parameter 'mint' is required", { code: 'missing_parameter', parameter: 'mint' });
    return `/tokens/${enc(chain)}/${enc(mint)}`;
  }

  // ── reading ───────────────────────────────────────────────────────────────

  /** Theses on a token, with the token's info and counts. */
  async list(chain: Chain, mint: string, opts: TokenThesesOptions = {}): Promise<TokenThesesPage> {
    const { data, extra } = await this.call<Thesis[]>('GET', this.tokenPath(chain, mint), {
      auth: 'optional',
      query: {
        sort: opts.sort,
        stance: opts.stance,
        limit: opts.limit,
        cursor: opts.cursor,
        ...scopeQuery(opts.scope ?? this.scope, opts.clientId ?? this.clientId),
      },
    });
    return {
      items: data,
      pagination: extra.pagination as Pagination,
      token: extra.token as ThesisToken,
      summary: extra.summary as ThesisCounts,
    };
  }

  /** Every thesis on a token, following `next_cursor`. */
  async *iterate(chain: Chain, mint: string, opts: TokenThesesOptions = {}): AsyncGenerator<Thesis, void, void> {
    let cursor = opts.cursor;
    while (true) {
      const page = await this.list(chain, mint, { ...opts, cursor });
      yield* page.items;
      if (!page.pagination?.has_more || !page.pagination.next_cursor) return;
      cursor = page.pagination.next_cursor;
    }
  }

  /** Counts (theses, bull, bear, authors) and token info. */
  async summary(chain: Chain, mint: string, opts: ThesisScopeOptions = {}): Promise<ThesisSummary> {
    const query = scopeQuery(opts.scope ?? this.scope, opts.clientId ?? this.clientId);
    return (await this.call<ThesisSummary>('GET', `${this.tokenPath(chain, mint)}/summary`, { query })).data;
  }

  /** One thesis or reply. */
  async get(id: string): Promise<Thesis> {
    return (await this.call<Thesis>('GET', `/items/${enc(id)}`, { auth: 'optional' })).data;
  }

  /** Replies to a thesis. */
  async replies(id: string, opts: { limit?: number; cursor?: string } = {}): Promise<ThesisPage> {
    const { data, extra } = await this.call<Thesis[]>('GET', `/items/${enc(id)}/replies`, { auth: 'optional', query: opts });
    return { items: data, pagination: extra.pagination as Pagination };
  }

  /** Theses of one user (their csid_id). */
  async byUser(csidId: string, opts: { limit?: number; cursor?: string } = {}): Promise<ThesisPage> {
    const { data, extra } = await this.call<Thesis[]>('GET', `/users/${enc(csidId)}`, { auth: 'optional', query: opts });
    return { items: data, pagination: extra.pagination as Pagination };
  }

  // ── the signed-in user ────────────────────────────────────────────────────

  /** May the signed-in user post (holder) or reply on this token, and who are they. */
  async me(chain: Chain, mint: string): Promise<ThesisMe> {
    return (await this.call<ThesisMe>('GET', `${this.tokenPath(chain, mint)}/me`, { auth: 'required' })).data;
  }

  /** Posts a thesis. Holders only (`not_a_holder` otherwise). Up to 1000 characters. */
  async post(chain: Chain, mint: string, params: { body: string; stance?: ThesisStance }): Promise<Thesis> {
    if (params.stance && params.stance !== 'bull' && params.stance !== 'bear') {
      throw new BadRequestError('stance must be bull or bear', { code: 'invalid_parameter', parameter: 'stance', allowed: ['bull', 'bear'] });
    }
    const body = { ...params, ...(this.clientId ? { client_id: this.clientId } : {}) };
    return (await this.call<Thesis>('POST', this.tokenPath(chain, mint), { auth: 'required', body })).data;
  }

  /** Replies to a thesis. Any signed-in user may reply. */
  async reply(id: string, body: string): Promise<Thesis> {
    const payload = { body, ...(this.clientId ? { client_id: this.clientId } : {}) };
    return (await this.call<Thesis>('POST', `/items/${enc(id)}/replies`, { auth: 'required', body: payload })).data;
  }

  /** Adds (or with on=false removes) a reaction. */
  async react(id: string, emoji: ThesisEmoji, on = true): Promise<ThesisReactions> {
    if (!(THESIS_EMOJIS as readonly string[]).includes(emoji)) {
      throw new BadRequestError('Unknown reaction', { code: 'invalid_parameter', parameter: 'emoji', allowed: [...THESIS_EMOJIS] });
    }
    return (await this.call<ThesisReactions>('POST', `/items/${enc(id)}/reactions`, { auth: 'required', body: { emoji, on } })).data;
  }

  /** Reports a post (hidden for review after 3 reports). */
  async report(id: string, reason: ThesisReportReason, note?: string): Promise<{ reported: true }> {
    if (!(THESIS_REPORT_REASONS as readonly string[]).includes(reason)) {
      throw new BadRequestError('Choose a reason', { code: 'invalid_parameter', parameter: 'reason', allowed: [...THESIS_REPORT_REASONS] });
    }
    return (await this.call<{ reported: true }>('POST', `/items/${enc(id)}/report`, { auth: 'required', body: { reason, note } })).data;
  }

  /** Deletes the signed-in user's own thesis or reply. */
  async delete(id: string): Promise<{ deleted: true }> {
    return (await this.call<{ deleted: true }>('DELETE', `/items/${enc(id)}`, { auth: 'required' })).data;
  }

  /** The signed-in user's moderation notifications, with the unread count. */
  async notifications(): Promise<ThesisNotifications> {
    return (await this.call<ThesisNotifications>('GET', '/me/notifications', { auth: 'required' })).data;
  }

  /** Marks all of the signed-in user's notifications as read. */
  async markNotificationsRead(): Promise<{ read: true }> {
    return (await this.call<{ read: true }>('POST', '/me/notifications/read', { auth: 'required' })).data;
  }

  /** Appeals a moderation decision (an `appealable` notification; 10-1000 characters, within 30 days). */
  async appeal(notificationId: number, message: string): Promise<{ appealed: true }> {
    if (!message) throw new BadRequestError("Parameter 'message' is required", { code: 'missing_parameter', parameter: 'message' });
    return (
      await this.call<{ appealed: true }>('POST', `/me/notifications/${enc(String(notificationId))}/appeal`, {
        auth: 'required',
        body: { message },
      })
    ).data;
  }

  // ── live ──────────────────────────────────────────────────────────────────

  /**
   * Live updates for one token: thesis, reply, reaction, removed. With
   * `scope: 'instance'` (and `clientId`) only theses written on that instance.
   */
  live(chain: Chain, mint: string, options: ThesisLiveOptions & ThesisScopeOptions = {}): ThesisLive {
    this.tokenPath(chain, mint);
    const sp = new URLSearchParams(scopeQuery(options.scope ?? this.scope, options.clientId ?? this.clientId) as Record<string, string>);
    const qs = sp.toString();
    return new ThesisLive(`${this.wsUrl}/${enc(chain)}/${enc(mint)}${qs ? `?${qs}` : ''}`, options);
  }
}

// ── live websocket ─────────────────────────────────────────────────────────

export interface ThesisLiveOptions {
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

export interface ThesisLiveEventMap {
  thesis: Thesis;
  reply: Thesis;
  reaction: ThesisReactions;
  removed: { id: string };
  heartbeat: Record<string, never>;
  open: undefined;
  close: { code?: number; reason?: string };
  error: CabalSpyIDError;
}

type LiveHandler<T> = (payload: T) => void;

interface MinimalWebSocket {
  close(code?: number, reason?: string): void;
  readyState: number;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
}

/**
 * Public live socket for one token. Messages arrive as `thesis`, `reply`,
 * `reaction` and `removed`; it reconnects after drops or missed heartbeats.
 * Code 1008 (invalid token address, too many sockets) is final.
 */
export class ThesisLive {
  private ws: MinimalWebSocket | null = null;
  private readonly handlers = new Map<string, Set<LiveHandler<never>>>();
  private attempt = 0;
  private closedByUser = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private readonly opts: Required<Omit<ThesisLiveOptions, 'WebSocketImpl'>>;

  constructor(
    readonly url: string,
    private readonly options: ThesisLiveOptions = {},
  ) {
    this.opts = {
      reconnect: options.reconnect ?? true,
      reconnectDelay: options.reconnectDelay ?? 1_000,
      maxReconnectDelay: options.maxReconnectDelay ?? 30_000,
      heartbeatTimeout: options.heartbeatTimeout ?? 75_000,
    };
  }

  get connected(): boolean {
    return this.ws?.readyState === 1;
  }

  on<E extends keyof ThesisLiveEventMap>(event: E, handler: LiveHandler<ThesisLiveEventMap[E]>): this {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(handler as LiveHandler<never>);
    return this;
  }

  off<E extends keyof ThesisLiveEventMap>(event: E, handler: LiveHandler<ThesisLiveEventMap[E]>): this {
    this.handlers.get(event)?.delete(handler as LiveHandler<never>);
    return this;
  }

  private emit<E extends keyof ThesisLiveEventMap>(event: E, payload: ThesisLiveEventMap[E]): void {
    for (const h of [...(this.handlers.get(event) ?? [])]) {
      try {
        (h as LiveHandler<ThesisLiveEventMap[E]>)(payload);
      } catch (err) {
        if (event !== 'error') this.emit('error', new CabalSpyIDError(String((err as Error)?.message ?? err), { code: 'handler_error' }));
      }
    }
  }

  /** Opens the socket; resolves once it is open. */
  connect(): Promise<void> {
    this.closedByUser = false;
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
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const ws = new WS(this.url);
      this.ws = ws;
      ws.onopen = () => {
        this.attempt = 0;
        this.arm();
        this.emit('open', undefined);
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      ws.onmessage = (ev) => {
        if (this.ws !== ws) return;
        this.arm();
        let msg: { type?: string; data?: unknown };
        try {
          msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
        } catch {
          return;
        }
        if (msg.type === 'thesis' || msg.type === 'reply' || msg.type === 'reaction' || msg.type === 'removed') {
          this.emit(msg.type, msg.data as never);
        } else if (msg.type === 'heartbeat') {
          this.emit('heartbeat', {});
        }
      };
      ws.onerror = () => {
        if (this.ws !== ws) return;
        const err = new ConnectionError(`WebSocket error on ${this.url}`, { code: 'ws_error' });
        this.emit('error', err);
        if (!settled) {
          settled = true;
          reject(err);
        }
      };
      ws.onclose = (ev) => {
        if (this.ws !== ws) return;
        this.ws = null;
        this.disarm();
        const e = (ev ?? {}) as { code?: number; reason?: string };
        this.emit('close', { code: e.code, reason: e.reason });
        const final = e.code === 1008;
        if (final) {
          this.emit(
            'error',
            new PermissionError('The live socket was refused (1008): invalid token address or too many sockets from this IP', {
              code: 'ws_refused',
              status: 403,
            }),
          );
        }
        if (!settled) {
          settled = true;
          reject(new ConnectionError(`Live socket closed before it opened (code ${e.code ?? 'unknown'})`, { code: 'ws_closed_early' }));
        }
        if (!this.closedByUser && !final && this.opts.reconnect) this.scheduleReconnect();
      };
    });
  }

  private scheduleReconnect(): void {
    const delay = Math.min(this.opts.reconnectDelay * 2 ** this.attempt, this.opts.maxReconnectDelay) + Math.random() * 250;
    this.attempt++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closedByUser) this.connect().catch(() => undefined);
    }, delay);
  }

  private arm(): void {
    if (!this.opts.heartbeatTimeout) return;
    this.disarm();
    this.watchdog = setTimeout(() => {
      this.emit('error', new ConnectionError('No heartbeat from the live socket; reconnecting', { code: 'heartbeat_timeout' }));
      this.ws?.close(4000, 'heartbeat timeout');
    }, this.opts.heartbeatTimeout);
  }

  private disarm(): void {
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = null;
  }

  /** Closes the socket and stops reconnecting. */
  close(): void {
    this.closedByUser = true;
    this.disarm();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000, 'client closed');
    this.emit('close', { code: 1000, reason: 'client closed' });
  }
}
