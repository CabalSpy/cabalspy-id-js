/**
 * CabalSpy ID Data API client — https://api-id.cabalspy.xyz/v1
 *
 * Auth: Authorization: Bearer <API_KEY>. The same key as the CabalSpy API, with
 * the "CabalSpy ID" toggle enabled on the API keys page of
 * https://apidashboard.cabalspy.xyz.
 */

import {
  type ApiErrorBody,
  AuthenticationError,
  BadRequestError,
  CabalSpyIDError,
  ConnectionError,
  EMPTY_RATE_LIMIT,
  InvalidResponseError,
  type RateLimitInfo,
  RateLimitError,
  errorFromStatus,
  isRetryable,
} from './errors';
import { CabalSpyIDStream, type StreamOptions } from './stream';
import {
  type ApiResponse,
  CHAINS,
  type Chain,
  type HealthResponse,
  type HistoryResponse,
  type HistoryTrade,
  type HoldingsResponse,
  LEADERBOARD_SORTS,
  type LeaderboardEntry,
  type LeaderboardResponse,
  type LeaderboardSort,
  type MeResponse,
  type Pagination,
  PERIODS,
  type Period,
  type PnlCalendarResponse,
  type Profile,
  type Scope,
  THESIS_EMOJIS,
  THESIS_REPORT_REASONS,
  type Thesis,
  type ThesisEligibility,
  type ThesisEmoji,
  type ThesisReactions,
  type ThesisReportReason,
  type ThesisSort,
  type ThesisStance,
  type ThesisSummary,
  type Trade,
  type TrackerResponse,
  type WalletLookupResponse,
} from './types';
import { USER_AGENT, env, sleep } from './util';

export const DEFAULT_BASE_URL = 'https://api-id.cabalspy.xyz/v1';
export const DEFAULT_STREAM_URL = 'wss://api-id.cabalspy.xyz/v1/stream';

export interface CabalSpyIDOptions {
  /**
   * API key. Falls back to CABALSPY_ID_API_KEY, then CABALSPY_API_KEY.
   * Only `health()` works without one.
   */
  apiKey?: string;
  /**
   * Your instance's client_id (`csid_…`). Only needed when your account has
   * several CabalSpy ID instances. Falls back to CABALSPY_ID_INSTANCE.
   */
  instance?: string;
  /** REST base URL including /v1. Falls back to CABALSPY_ID_BASE_URL, then the default. */
  baseUrl?: string;
  /** Stream URL. Falls back to CABALSPY_ID_STREAM_URL, then the default. */
  streamUrl?: string;
  /** Per-request timeout in milliseconds. Default: 30_000 */
  timeout?: number;
  /** Retries on 429, 5xx and network errors. Default: 2 */
  maxRetries?: number;
  /** Extra headers added to every request. */
  headers?: Record<string, string>;
  /** Custom fetch implementation, for tests or proxies. */
  fetch?: typeof globalThis.fetch;
}

/** Response body plus the metadata carried in HTTP headers. */
export interface Envelope<T> extends ApiResponse<T> {
  rateLimit: RateLimitInfo;
  status: number;
}

type QueryValue = string | number | boolean | undefined | null;
export type Query = Record<string, QueryValue>;

// ── parameters ──────────────────────────────────────────────────────────────

export interface ScopedParams {
  /** `global` (every CabalSpy ID user) is Enterprise only. Default: instance */
  scope?: Scope;
}

export interface UsersParams extends ScopedParams {
  /** 1-100. Default: 50 */
  limit?: number;
  /** Only users with the KOL badge. */
  kol?: boolean;
  cursor?: string;
}

/** Exactly one of username, csid_id or address. */
export type ProfileParams = ScopedParams &
  (
    | { username: string; csid_id?: never; address?: never }
    | { csid_id: string; username?: never; address?: never }
    | { address: string; username?: never; csid_id?: never }
  );

export interface WalletParams extends ScopedParams {
  blockchain: Chain;
  address: string;
}

export interface TrackerParams extends WalletParams {
  /** Default: 1d */
  period?: Period;
}

export interface HistoryParams extends WalletParams {
  /** 1-1000. Default: 500 */
  limit?: number;
  cursor?: string;
}

export interface LeaderboardParams extends ScopedParams {
  blockchain: Chain;
  /** Default: 1d */
  period?: Period;
  /** Default: volume */
  sort?: LeaderboardSort;
  /** 1-500. Default: 100 */
  limit?: number;
  /** The `next_cursor` of the previous page (a wallet address). */
  cursor?: string;
}

export interface LatestTransactionsParams extends ScopedParams {
  /** Omit for every chain. */
  blockchain?: Chain;
  /** 1-100. Default: 50 */
  limit?: number;
}

// -- theses ------------------------------------------------------------------

export interface ThesisTokenParams {
  blockchain: Chain;
  /** Token mint / contract address. */
  mint: string;
}

export interface ListThesesParams extends ThesisTokenParams {
  /** Default: new */
  sort?: ThesisSort;
  stance?: ThesisStance;
  /** 1-50. Default: 20 */
  limit?: number;
  cursor?: string;
  /** Viewer: fills `my_reactions` and `is_mine` for this user. */
  csid_id?: string;
}

export interface ThesisRepliesParams {
  /** The thesis id. */
  id: string;
  /** 1-100. Default: 50 */
  limit?: number;
  cursor?: string;
  csid_id?: string;
}

export interface LatestThesesParams {
  /** Omit for every chain. */
  blockchain?: Chain;
  /** `instance`: only theses of your instance's users. Default: all */
  users?: 'all' | 'instance';
  /** 1-50. Default: 20 */
  limit?: number;
  cursor?: string;
  csid_id?: string;
}

/** Exactly one of csid_id or username. */
export type UserThesesParams = { limit?: number; cursor?: string } & (
  | { csid_id: string; username?: never }
  | { username: string; csid_id?: never }
);

/**
 * Writes happen in the name of one of your users: `csid_id` is the `sub` of
 * their ID token. They must have signed in to your app with the scope
 * `thesis` and be within your plan's user limit.
 */
export interface ThesisWriter {
  csid_id: string;
}

export interface PostThesisParams extends ThesisTokenParams, ThesisWriter {
  /** Up to 1000 characters. Only holders of the token can post. */
  body: string;
  stance?: ThesisStance;
}

export interface ReplyToThesisParams extends ThesisWriter {
  thesis_id: string;
  body: string;
}

export interface ReactToThesisParams extends ThesisWriter {
  thesis_id: string;
  emoji: ThesisEmoji;
  /** false removes the reaction. Default: true */
  on?: boolean;
}

export interface ReportThesisParams extends ThesisWriter {
  thesis_id: string;
  reason: ThesisReportReason;
  note?: string;
}

export interface DeleteThesisParams extends ThesisWriter {
  thesis_id: string;
}

function buildQuery(params: Query): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.append(k, typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

function parseNumHeader(h: Headers, name: string): number | null {
  const raw = h.get(name);
  if (raw == null) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

function backoffDelay(attempt: number, lastError?: unknown): number {
  // The server's Retry-After takes precedence over our own backoff.
  if (lastError instanceof RateLimitError && lastError.retryAfter != null) {
    return Math.min(lastError.retryAfter * 1000, 60_000);
  }
  const base = 500 * 2 ** (attempt - 1); // 500, 1000, 2000 …
  return Math.min(base, 8_000) + Math.random() * 250;
}

function assertOneOf(value: string | undefined, allowed: readonly string[], parameter: string): void {
  if (value === undefined) return;
  if (!allowed.includes(value)) {
    throw new BadRequestError(`Invalid value for '${parameter}': ${value}`, {
      code: 'invalid_parameter',
      parameter,
      allowed: [...allowed],
    });
  }
}

function assertRequired(value: unknown, parameter: string): void {
  if (value === undefined || value === null || value === '') {
    throw new BadRequestError(`Parameter '${parameter}' is required`, { code: 'missing_parameter', parameter });
  }
}

function assertToken(p: { blockchain?: string; mint?: string }): void {
  assertRequired(p.blockchain, 'blockchain');
  assertOneOf(p.blockchain, CHAINS, 'blockchain');
  assertRequired(p.mint, 'mint');
}

function assertWallet(p: { blockchain?: string; address?: string }): void {
  assertRequired(p.blockchain, 'blockchain');
  assertOneOf(p.blockchain, CHAINS, 'blockchain');
  assertRequired(p.address, 'address');
}

// ═══════════════════════════════════════════════════════════════════════════
//  CLIENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Data API client.
 *
 *   const csid = new CabalSpyID({ apiKey: process.env.CABALSPY_API_KEY });
 *   const me = await csid.me();
 *   const user = await csid.profile({ csid_id: idToken.sub });
 */
export class CabalSpyID {
  readonly baseUrl: string;
  readonly streamUrl: string;
  readonly timeout: number;
  readonly maxRetries: number;
  readonly instance?: string;

  private readonly apiKey: string;
  private readonly extraHeaders: Record<string, string>;
  private readonly fetchImpl: typeof globalThis.fetch;

  /** Rate limit state from the most recent request. */
  lastRateLimit: RateLimitInfo = { ...EMPTY_RATE_LIMIT };

  constructor(options: CabalSpyIDOptions = {}) {
    this.apiKey = options.apiKey ?? (env('CABALSPY_ID_API_KEY') || env('CABALSPY_API_KEY') || '');
    this.instance = options.instance ?? (env('CABALSPY_ID_INSTANCE') || undefined);
    this.baseUrl = (options.baseUrl ?? (env('CABALSPY_ID_BASE_URL') || DEFAULT_BASE_URL)).replace(/\/+$/, '');
    this.streamUrl = (options.streamUrl ?? (env('CABALSPY_ID_STREAM_URL') || DEFAULT_STREAM_URL)).replace(/\/+$/, '');
    this.timeout = options.timeout ?? 30_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.extraHeaders = options.headers ?? {};
    const f = options.fetch ?? globalThis.fetch;
    if (typeof f !== 'function') {
      throw new CabalSpyIDError('No fetch implementation available. Use Node 18+ or pass { fetch }.', {
        code: 'no_fetch',
      });
    }
    this.fetchImpl = options.fetch ?? f.bind(globalThis);
  }

  // ── HTTP core ─────────────────────────────────────────────────────────────

  private authedQuery(query: Query, auth: boolean): Query {
    if (auth && !this.apiKey) {
      throw new AuthenticationError(
        'Missing API key. Pass { apiKey } or set CABALSPY_ID_API_KEY (the CabalSpy API key with CabalSpy ID enabled).',
        { status: 401, code: 'missing_api_key' },
      );
    }
    return auth && this.instance && query.instance === undefined ? { ...query, instance: this.instance } : query;
  }

  /** GET returning the full envelope: data, pagination, meta and rate limit. */
  async getRaw<T>(path: string, query: Query = {}, opts: { auth?: boolean } = {}): Promise<Envelope<T>> {
    const auth = opts.auth ?? true;
    return this.request<T>('GET', path + buildQuery(this.authedQuery(query, auth)), auth);
  }

  /** GET returning only the data payload. */
  async get<T>(path: string, query: Query = {}): Promise<T> {
    return (await this.getRaw<T>(path, query)).data;
  }

  /**
   * POST with a JSON body, returning the full envelope. POSTs are not retried
   * after a server or network error (the write may have happened); only the
   * API's own rate limit (429 rate_limit_exceeded) is retried.
   */
  async postRaw<T>(path: string, body: Record<string, unknown>): Promise<Envelope<T>> {
    return this.request<T>('POST', path + buildQuery(this.authedQuery({}, true)), true, body);
  }

  /** POST returning only the data payload. */
  async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return (await this.postRaw<T>(path, body)).data;
  }

  private async request<T>(method: 'GET' | 'POST', path: string, auth: boolean, body?: unknown): Promise<Envelope<T>> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const label = `${method} ${stripQuery(path)}`;
    let lastError: CabalSpyIDError | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) await sleep(backoffDelay(attempt, lastError));

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);
      let res: Response;
      let text: string;
      try {
        res = await this.fetchImpl(url, {
          method,
          signal: controller.signal,
          headers: {
            ...(auth ? { Authorization: `Bearer ${this.apiKey}` } : {}),
            Accept: 'application/json',
            'User-Agent': USER_AGENT,
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...this.extraHeaders,
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        text = await res.text();
      } catch (err) {
        const aborted = (err as Error)?.name === 'AbortError';
        lastError = new ConnectionError(
          aborted ? `Request timed out after ${this.timeout} ms: ${label}` : `Network error: ${(err as Error)?.message ?? String(err)}`,
          { code: aborted ? 'timeout' : 'connection_error' },
        );
        if (method !== 'GET') throw lastError; // the write may have happened
        continue; // network errors are retryable
      } finally {
        clearTimeout(timer);
      }

      const rateLimit: RateLimitInfo = {
        limit: parseNumHeader(res.headers, 'X-RateLimit-Limit'),
        remaining: parseNumHeader(res.headers, 'X-RateLimit-Remaining'),
        reset: parseNumHeader(res.headers, 'X-RateLimit-Reset'),
      };
      this.lastRateLimit = rateLimit;

      let parsed: unknown = null;
      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = null;
        }
      }

      if (!res.ok) {
        const errBody = (parsed as { error?: ApiErrorBody } | null)?.error ?? null;
        const retryAfter = parseNumHeader(res.headers, 'Retry-After');
        const error = errorFromStatus(res.status, errBody, rateLimit, retryAfter, `HTTP ${res.status} on ${label}`);
        const retryable =
          method === 'GET' ? isRetryable(error) : error instanceof RateLimitError && error.code === 'rate_limit_exceeded';
        if (retryable && attempt < this.maxRetries) {
          lastError = error;
          continue;
        }
        throw error;
      }

      if (parsed == null || typeof parsed !== 'object' || !('data' in parsed)) {
        throw new InvalidResponseError(`Unexpected response shape on ${label}: no data field`, {
          status: res.status,
          code: 'invalid_response',
          rateLimit,
        });
      }
      return { ...(parsed as ApiResponse<T>), rateLimit, status: res.status };
    }
    throw lastError ?? new ConnectionError(`Request failed: ${label}`);
  }

  /**
   * Walks a cursor-paginated route and yields whole pages.
   *
   *   for await (const page of csid.pages((cursor) => csid.usersRaw({ cursor }))) …
   *
   * Reads `pagination` from the envelope or, for the leaderboard, from `data`.
   */
  async *pages<T>(
    fetchPage: (cursor: string | undefined) => Promise<Envelope<T>>,
    opts: { cursor?: string; maxPages?: number } = {},
  ): AsyncGenerator<Envelope<T>, void, void> {
    let cursor = opts.cursor;
    const maxPages = opts.maxPages ?? Infinity;
    for (let i = 0; i < maxPages; i++) {
      const page = await fetchPage(cursor);
      const inner = (page.data as { pagination?: Pagination } | null)?.pagination;
      const pagination = page.pagination ?? inner;
      yield { ...page, pagination };
      const next = pagination?.next_cursor;
      if (!pagination?.has_more || !next) return;
      cursor = next;
    }
  }

  // ── account ───────────────────────────────────────────────────────────────

  /** GET /v1/health — service health and trade sync freshness. No API key required. */
  async health(): Promise<HealthResponse> {
    return (await this.getRaw<HealthResponse>('/health', {}, { auth: false })).data;
  }

  /** GET /v1/me — the key's instance, plan, request rate and number of users with data. */
  async me(): Promise<MeResponse> {
    return this.get<MeResponse>('/me');
  }

  // ── users ─────────────────────────────────────────────────────────────────

  /** GET /v1/users — users of your instance (within the plan's user limit), newest first. */
  async users(params: UsersParams = {}): Promise<Profile[]> {
    return (await this.usersRaw(params)).data;
  }

  async usersRaw(params: UsersParams = {}): Promise<Envelope<Profile[]>> {
    return this.getRaw<Profile[]>('/users', {
      limit: params.limit,
      kol: params.kol ? 'true' : undefined,
      cursor: params.cursor,
      scope: params.scope,
    });
  }

  /** Iterates over every user, following `next_cursor`. */
  async *iterUsers(params: Omit<UsersParams, 'cursor'> & { cursor?: string } = {}): AsyncGenerator<Profile, void, void> {
    for await (const page of this.pages((cursor) => this.usersRaw({ ...params, cursor }), { cursor: params.cursor })) {
      yield* page.data;
    }
  }

  /**
   * GET /v1/profile — one user by X username, by `csid_id` (the `sub` of their
   * ID token) or by a verified wallet address. Pass exactly one.
   *
   * An anonymous `anon_…` sub throws PlanUserLimitError.
   */
  async profile(params: ProfileParams): Promise<Profile> {
    const p = params as { username?: string; csid_id?: string; address?: string; scope?: Scope };
    const given = [p.username, p.csid_id, p.address].filter((v) => v !== undefined && v !== '').length;
    if (given !== 1) {
      throw new BadRequestError('Pass exactly one of: username, csid_id, address.', {
        code: 'missing_parameter',
        parameter: 'username|csid_id|address',
      });
    }
    return this.get<Profile>('/profile', {
      username: p.username?.replace(/^@/, ''),
      csid_id: p.csid_id,
      address: p.address,
      scope: p.scope,
    });
  }

  /** GET /v1/wallets/lookup — which of your users verified this wallet (by an on-chain payment). */
  async walletLookup(address: string, params: ScopedParams = {}): Promise<WalletLookupResponse> {
    assertRequired(address, 'address');
    return this.get<WalletLookupResponse>('/wallets/lookup', { address, scope: params.scope });
  }

  // ── trading ───────────────────────────────────────────────────────────────

  /**
   * GET /v1/wallets/tracker — stats, realized PnL, win-rate distribution,
   * tokens, PnL chart (cumulative from 0) and trades of a verified wallet for a
   * period. Same numbers as the CabalSpy API.
   */
  async tracker(params: TrackerParams): Promise<TrackerResponse> {
    assertWallet(params);
    assertOneOf(params.period, PERIODS, 'period');
    return this.get<TrackerResponse>('/wallets/tracker', { ...params });
  }

  /** GET /v1/wallets/history — lifetime stats, token overview and one page of trades. */
  async history(params: HistoryParams): Promise<HistoryResponse> {
    return (await this.historyRaw(params)).data;
  }

  async historyRaw(params: HistoryParams): Promise<Envelope<HistoryResponse>> {
    assertWallet(params);
    return this.getRaw<HistoryResponse>('/wallets/history', { ...params });
  }

  /** Iterates over every trade of a wallet, newest first, following `next_cursor`. */
  async *iterHistory(params: HistoryParams): AsyncGenerator<HistoryTrade, void, void> {
    for await (const page of this.pages((cursor) => this.historyRaw({ ...params, cursor }), { cursor: params.cursor })) {
      yield* page.data.trades;
    }
  }

  /** GET /v1/wallets/holdings — current token balances with USD value (dust under $0.01 hidden). */
  async holdings(params: WalletParams): Promise<HoldingsResponse> {
    assertWallet(params);
    return this.get<HoldingsResponse>('/wallets/holdings', { ...params });
  }

  /** GET /v1/wallets/pnl_calendar — realized PnL per UTC day, grouped by month. */
  async pnlCalendar(params: WalletParams): Promise<PnlCalendarResponse> {
    assertWallet(params);
    return this.get<PnlCalendarResponse>('/wallets/pnl_calendar', { ...params });
  }

  /** GET /v1/wallets/leaderboard — your users ranked by volume, PnL, win rate or trades. */
  async leaderboard(params: LeaderboardParams): Promise<LeaderboardResponse> {
    return (await this.leaderboardRaw(params)).data;
  }

  async leaderboardRaw(params: LeaderboardParams): Promise<Envelope<LeaderboardResponse>> {
    assertRequired(params.blockchain, 'blockchain');
    assertOneOf(params.blockchain, CHAINS, 'blockchain');
    assertOneOf(params.period, PERIODS, 'period');
    assertOneOf(params.sort, LEADERBOARD_SORTS, 'sort');
    return this.getRaw<LeaderboardResponse>('/wallets/leaderboard', { ...params });
  }

  /** Iterates over every leaderboard entry, following `next_cursor`. */
  async *iterLeaderboard(params: LeaderboardParams): AsyncGenerator<LeaderboardEntry, void, void> {
    for await (const page of this.pages((cursor) => this.leaderboardRaw({ ...params, cursor }), { cursor: params.cursor })) {
      yield* page.data.leaderboard;
    }
  }

  /** GET /v1/transactions/latest — the newest trades of your users, each with the trader. */
  async latestTransactions(params: LatestTransactionsParams = {}): Promise<Trade[]> {
    assertOneOf(params.blockchain, CHAINS, 'blockchain');
    return this.get<Trade[]>('/transactions/latest', { ...params });
  }

  // -- theses ----------------------------------------------------------------
  // Reading: theses are public; any key reads them, also outside its instance.

  /** GET /v1/theses — theses on a token, newest or top first. */
  async listTheses(params: ListThesesParams): Promise<Thesis[]> {
    return (await this.listThesesRaw(params)).data;
  }

  async listThesesRaw(params: ListThesesParams): Promise<Envelope<Thesis[]>> {
    assertToken(params);
    assertOneOf(params.sort, ['new', 'top'], 'sort');
    assertOneOf(params.stance, ['bull', 'bear'], 'stance');
    return this.getRaw<Thesis[]>('/theses', { ...params });
  }

  /** Iterates over every thesis on a token, following `next_cursor`. */
  async *iterTheses(params: ListThesesParams): AsyncGenerator<Thesis, void, void> {
    for await (const page of this.pages((cursor) => this.listThesesRaw({ ...params, cursor }), { cursor: params.cursor })) {
      yield* page.data;
    }
  }

  /** GET /v1/theses/summary — counts (theses, bull, bear, authors) and token info. */
  async thesisSummary(params: ThesisTokenParams): Promise<ThesisSummary> {
    assertToken(params);
    return this.get<ThesisSummary>('/theses/summary', { blockchain: params.blockchain, mint: params.mint });
  }

  /** GET /v1/theses/item — one thesis or reply. */
  async thesis(id: string, params: { csid_id?: string } = {}): Promise<Thesis> {
    assertRequired(id, 'id');
    return this.get<Thesis>('/theses/item', { id, csid_id: params.csid_id });
  }

  /** GET /v1/theses/replies — replies to a thesis. */
  async thesisReplies(params: ThesisRepliesParams): Promise<Thesis[]> {
    return (await this.thesisRepliesRaw(params)).data;
  }

  async thesisRepliesRaw(params: ThesisRepliesParams): Promise<Envelope<Thesis[]>> {
    assertRequired(params.id, 'id');
    return this.getRaw<Thesis[]>('/theses/replies', { ...params });
  }

  /** Iterates over every reply of a thesis. */
  async *iterThesisReplies(params: ThesisRepliesParams): AsyncGenerator<Thesis, void, void> {
    for await (const page of this.pages((cursor) => this.thesisRepliesRaw({ ...params, cursor }), { cursor: params.cursor })) {
      yield* page.data;
    }
  }

  /** GET /v1/theses/latest — newest theses on every token (or only your users'). */
  async latestTheses(params: LatestThesesParams = {}): Promise<Thesis[]> {
    return (await this.latestThesesRaw(params)).data;
  }

  async latestThesesRaw(params: LatestThesesParams = {}): Promise<Envelope<Thesis[]>> {
    assertOneOf(params.blockchain, CHAINS, 'blockchain');
    assertOneOf(params.users, ['all', 'instance'], 'users');
    return this.getRaw<Thesis[]>('/theses/latest', { ...params });
  }

  /** GET /v1/theses/user — theses of one user, by csid_id or X username. */
  async userTheses(params: UserThesesParams): Promise<Thesis[]> {
    return (await this.userThesesRaw(params)).data;
  }

  async userThesesRaw(params: UserThesesParams): Promise<Envelope<Thesis[]>> {
    const p = params as { csid_id?: string; username?: string; limit?: number; cursor?: string };
    if (!!p.csid_id === !!p.username) {
      throw new BadRequestError('Pass exactly one of: csid_id, username.', {
        code: 'missing_parameter',
        parameter: 'csid_id|username',
      });
    }
    return this.getRaw<Thesis[]>('/theses/user', { ...p, username: p.username?.replace(/^@/, '') });
  }

  /**
   * GET /v1/theses/eligibility — may this user post (holder, not paused) and
   * reply on this token through your app? `reason` says why not
   * (consent_required, plan_user_limit, sandbox_user).
   */
  async thesisEligibility(params: ThesisTokenParams & ThesisWriter): Promise<ThesisEligibility> {
    assertToken(params);
    assertRequired(params.csid_id, 'csid_id');
    return this.get<ThesisEligibility>('/theses/eligibility', { ...params });
  }

  // Writing, in the name of one of your users (scope `thesis`).

  /** POST /v1/theses — posts a thesis. Holders only (`not_a_holder` otherwise). */
  async postThesis(params: PostThesisParams): Promise<Thesis> {
    assertToken(params);
    assertRequired(params.body, 'body');
    assertRequired(params.csid_id, 'csid_id');
    assertOneOf(params.stance, ['bull', 'bear'], 'stance');
    return this.post<Thesis>('/theses', { ...params });
  }

  /** POST /v1/theses/replies — replies to a thesis. */
  async replyToThesis(params: ReplyToThesisParams): Promise<Thesis> {
    assertRequired(params.thesis_id, 'thesis_id');
    assertRequired(params.body, 'body');
    assertRequired(params.csid_id, 'csid_id');
    return this.post<Thesis>('/theses/replies', { ...params });
  }

  /** POST /v1/theses/reactions — adds (or with `on: false` removes) a reaction. */
  async reactToThesis(params: ReactToThesisParams): Promise<ThesisReactions> {
    assertRequired(params.thesis_id, 'thesis_id');
    assertOneOf(params.emoji, THESIS_EMOJIS, 'emoji');
    assertRequired(params.csid_id, 'csid_id');
    return this.post<ThesisReactions>('/theses/reactions', { ...params, on: params.on ?? true });
  }

  /** POST /v1/theses/report — reports a post (hidden for review after 3 reports). */
  async reportThesis(params: ReportThesisParams): Promise<{ reported: true }> {
    assertRequired(params.thesis_id, 'thesis_id');
    assertOneOf(params.reason, THESIS_REPORT_REASONS, 'reason');
    assertRequired(params.csid_id, 'csid_id');
    return this.post<{ reported: true }>('/theses/report', { ...params });
  }

  /** POST /v1/theses/delete — deletes the user's own thesis or reply. */
  async deleteThesis(params: DeleteThesisParams): Promise<{ deleted: true }> {
    assertRequired(params.thesis_id, 'thesis_id');
    assertRequired(params.csid_id, 'csid_id');
    return this.post<{ deleted: true }>('/theses/delete', { ...params });
  }

  // ── stream ────────────────────────────────────────────────────────────────

  /**
   * Live trades of your users over WebSocket (Pro plan and up).
   *
   *   const stream = csid.stream({ blockchain: 'solana' });
   *   stream.on('trade', (trade) => console.log(trade));
   *   await stream.connect();
   */
  stream(options: StreamOptions = {}): CabalSpyIDStream {
    if (!this.apiKey) {
      throw new AuthenticationError('The stream needs an API key.', { status: 401, code: 'missing_api_key' });
    }
    return new CabalSpyIDStream(this.streamUrl, this.apiKey, { instance: this.instance, ...options });
  }
}

function stripQuery(path: string): string {
  const i = path.indexOf('?');
  return i === -1 ? path : path.slice(0, i);
}
