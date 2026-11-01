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
  PlatformImportError,
  type RateLimitInfo,
  RateLimitError,
  errorFromStatus,
  isRetryable,
} from './errors';
import { CabalSpyIDStream, type StreamOptions } from './stream';
import { ThesesStream, type ThesesStreamOptions } from './thesesStream';
import { CalloutsStream, type CalloutsStreamOptions } from './calloutsStream';
import { CopyTradingStream, type CopyTradingStreamOptions } from './copyTradingStream';
import {
  type ApiResponse,
  CALLOUT_COMPETITION_METRICS,
  CALLOUT_LEADERBOARD_SORTS,
  CALLOUT_WHO,
  type Callout,
  type CalloutCompetitionMetric,
  type CalloutLeaderboardEntry,
  type CalloutLeaderboardResponse,
  type CalloutLeaderboardSort,
  type CalloutRemoveResult,
  type CalloutSettings,
  type CalloutSettingsUpdate,
  type CalloutStats,
  CHAINS,
  COMPETITION_KINDS,
  COMPETITION_METRICS,
  COMPETITION_STATUSES,
  COPY_INSTRUCTION_STATUSES,
  COPY_MODES,
  COPY_REPORT_STATUSES,
  COPY_SIDES,
  type Chain,
  type Competition,
  type CompetitionEnrollment,
  type CompetitionJoinResult,
  type CopyInstruction,
  type CopyInstructionStatus,
  type CopyMode,
  type CopyReportStatus,
  type CopySides,
  type CopyTradingSetting,
  type CompetitionLeaveResult,
  type CompetitionParticipant,
  type CompetitionStanding,
  type CompetitionStandingsResponse,
  type CompetitionStatus,
  DATA_SCOPES,
  type HealthResponse,
  type HistoryResponse,
  type HistoryTrade,
  type HoldingsResponse,
  type InboundEnabled,
  type InboundStatus,
  LEADERBOARD_SORTS,
  type LeaderboardEntry,
  type LeaderboardResponse,
  type LeaderboardSort,
  type MeResponse,
  type Pagination,
  PERIODS,
  PLATFORM_IMPORT_MAX,
  type Period,
  type PlatformClaimLink,
  type PlatformImportItemResult,
  type PlatformImportResult,
  type PlatformImportSummary,
  type PlatformKolApply,
  type PlatformKolStatus,
  type PlatformKolVolumeCheck,
  type PlatformLeaderboardEntry,
  type PlatformLeaderboardResponse,
  type PlatformSettings,
  type PlatformSettingsUpdate,
  type PlatformTelegramLink,
  type PlatformTelegramStatus,
  type PlatformTelegramUnlink,
  type PlatformUser,
  type PlatformUserDeleteResult,
  type PlatformUserInput,
  type PlatformUserProfile,
  type PlatformUserSession,
  type PlatformUserUpsertResult,
  type PlatformWalletDeleteResult,
  type PlatformWalletInput,
  type PlatformWalletsAddResult,
  type PlatformXConnect,
  type PlatformXDisconnect,
  type PnlCalendarResponse,
  type Profile,
  type Scope,
  THESIS_EMOJIS,
  THESIS_REPORT_REASONS,
  type Thesis,
  type ThesisEligibility,
  type ThesisEmoji,
  type ThesisNotifications,
  type ThesisReactions,
  type ThesisReportReason,
  type ThesisSort,
  type ThesisStance,
  type ThesisSummary,
  type Trade,
  type TradingCompetitionMetric,
  type TrackerResponse,
  WALLET_TRUST,
  type WalletLookupResponse,
  type WalletTrust,
  type WalletVerification,
} from './types';
import { USER_AGENT, env, sleep, utf8 } from './util';

export const DEFAULT_BASE_URL = 'https://api-id.cabalspy.xyz/v1';
export const DEFAULT_STREAM_URL = 'wss://api-id.cabalspy.xyz/v1/stream';
export const DEFAULT_THESES_STREAM_URL = 'wss://api-id.cabalspy.xyz/v1/theses/stream';
export const DEFAULT_CALLOUTS_STREAM_URL = 'wss://api-id.cabalspy.xyz/v1/callouts/stream';
export const DEFAULT_COPY_TRADING_STREAM_URL = 'wss://api-id.cabalspy.xyz/v1/copy-trading/stream';

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
  /** Theses stream URL. Default: wss://api-id.cabalspy.xyz/v1/theses/stream */
  thesesStreamUrl?: string;
  /** Callouts stream URL. Default: wss://api-id.cabalspy.xyz/v1/callouts/stream */
  calloutsStreamUrl?: string;
  /** Copy trading stream URL. Default: wss://api-id.cabalspy.xyz/v1/copy-trading/stream */
  copyTradingStreamUrl?: string;
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

/**
 * `global` (default): theses written on every platform. `instance`: only the
 * ones written on your instance (your apps). Same for every plan.
 */
export interface ThesisScopeParam {
  scope?: Scope;
}

export interface ListThesesParams extends ThesisTokenParams, ThesisScopeParam {
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

export interface LatestThesesParams extends ThesisScopeParam {
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

// -- white-label: platform users ----------------------------------------------

/** One of your platform users: by your own user id (`external_id`) or by their `csid_id`. */
export type PlatformUserRef = { external_id: string; csid_id?: never } | { csid_id: string; external_id?: never };

/** A platform user by `external_id` (a plain string) or a PlatformUserRef. */
export type PlatformUserId = string | PlatformUserRef;

/** Only what you pass changes; null clears a field. */
export type UpdatePlatformUserParams = PlatformUserRef & {
  /** 1-60 characters, or null. */
  display_name?: string | null;
  /** https URL (max 500 characters), or null. */
  avatar_url?: string | null;
};

export interface PlatformUsersParams {
  /** 1-100. Default: 50 */
  limit?: number;
  cursor?: string;
}

export type AddPlatformWalletsParams = PlatformUserRef & {
  /** At most 10 per request; a user has at most 5 Solana and 5 EVM wallets. */
  wallets: PlatformWalletInput[];
};

export type DeletePlatformWalletParams = PlatformUserRef & { address: string };

export type StartWalletVerificationParams = PlatformUserRef & {
  /** The chain to verify on (the payment is sent there). */
  chain: Chain;
  address: string;
};

export type PlatformUserProfileParams = PlatformUserRef & {
  /** Default: 7d */
  period?: Period;
};

export interface PlatformLeaderboardParams {
  blockchain: Chain;
  /** Default: 7d */
  period?: Period;
  /** Default: pnl_usd */
  sort?: LeaderboardSort;
  /** 1-500. Default: 100 */
  limit?: number;
  /** The `next_cursor` of the previous page (a wallet address). */
  cursor?: string;
  /** `verified`: only payment-verified wallets. Can only narrow the instance's `leaderboard_trust`. */
  trust?: 'all' | 'verified';
}

export type PlatformClaimLinkParams = PlatformUserRef & {
  /** Where the person returns after claiming; on your verified domains or registered origins (or localhost). */
  return_url?: string;
};

export type PlatformXConnectParams = PlatformUserRef & {
  /** Required. On your verified domains or registered origins (or localhost). */
  return_url: string;
};

export interface ImportPlatformUsersProgress {
  /** 1-based number of the chunk that just finished. */
  chunk: number;
  chunks: number;
  /** Users handled so far. */
  done: number;
  total: number;
  /** Summary over everything handled so far. */
  summary: PlatformImportSummary;
}

export interface ImportPlatformUsersOptions {
  /** Users per request, 1-1000. Default: 1000 */
  chunkSize?: number;
  /** Largest JSON body per request in bytes. Default: 900_000 (the server accepts 1 MB). */
  maxBodyBytes?: number;
  /**
   * How often one chunk is sent again after HTTP 429, and how often items the
   * server rejected with `rate_limited` are sent again. Default: 5
   */
  maxRetries?: number;
  /**
   * Wait before sending items again that were rejected with `rate_limited`
   * (the server counts new users per minute and sends no Retry-After for them).
   * Default: 60_000
   */
  rateLimitedItemDelayMs?: number;
  /** Called after every chunk. */
  onProgress?: (progress: ImportPlatformUsersProgress) => void;
}

/** Aggregated result of importAllPlatformUsers(); `results` are in input order. */
export interface ImportPlatformUsersResult extends PlatformImportResult {
  /** Number of chunks the users were split into. */
  chunks: number;
  /** HTTP requests made, retries included. */
  requests: number;
}

// -- trading competitions ----------------------------------------------------

interface CompetitionBaseParams {
  /** 1-100 characters. */
  name: string;
  /** 1-8760 (one year); fractions allowed. */
  duration_hours: number;
  /** ISO 8601 or a Date. Omit or null: starts as soon as `min_participants` joined. */
  starts_at?: string | Date | null;
  /** Default: 1 */
  min_participants?: number;
  /** null: no limit. */
  max_participants?: number | null;
  /** `verified_only`: only payment-verified wallets count. */
  wallet_trust?: WalletTrust;
  enrollment?: CompetitionEnrollment;
  /** May users join after the start? */
  late_join?: boolean;
  /** Any JSON, at most 5000 characters serialized. */
  prizes?: unknown;
  /** At most 2000 characters. */
  description?: string | null;
}

/** A trading competition (the default kind): ranked on the participants' trades. */
export interface CreateTradingCompetitionParams extends CompetitionBaseParams {
  kind?: 'trading';
  chain: Chain;
  metric: TradingCompetitionMetric;
  /** Traders below it are listed but not ranked. */
  min_trades?: number;
  min_volume_usd?: number;
}

/**
 * A callout competition (needs the callouts extra): ranked on the callouts each
 * participant makes during the competition, each scored by its peak multiple.
 */
export interface CreateCalloutCompetitionParams extends CompetitionBaseParams {
  kind: 'callouts';
  /** A chain, or `all` for callouts on every chain. */
  chain: Chain | 'all';
  metric: CalloutCompetitionMetric;
  /** Callouts needed to be ranked, 0-100000 (0 and 1 both mean at least one). Default: 0 */
  min_callouts?: number;
  /** The multiple that counts as a hit for `hit_rate`: above 1, at most 1000. Default: 2 */
  hit_x?: number;
}

export type CreateCompetitionParams = CreateTradingCompetitionParams | CreateCalloutCompetitionParams;

/**
 * Any rule, any time (also while running); every change is recorded. The kind
 * cannot change: pass the fields of the competition's own kind.
 */
export type UpdateCompetitionParams = { id: string; note?: string } & (
  | Partial<Omit<CreateTradingCompetitionParams, 'kind'>>
  | Partial<Omit<CreateCalloutCompetitionParams, 'kind'>>
);

export interface CompetitionsParams {
  status?: CompetitionStatus;
  /** 1-500. Default: 50 */
  limit?: number;
  offset?: number;
}

export interface CompetitionPageParams {
  id: string;
  /** 1-1000. Default: 100 */
  limit?: number;
  offset?: number;
}

export type CompetitionMemberParams = { id: string } & PlatformUserRef;

// -- callouts (an extra, switched on per instance on request) ------------------

/** A callout by one of your users: `external_id` (platform user) or `csid_id`. */
export type CreateCalloutParams = PlatformUserRef & {
  chain: Chain;
  /** Token mint / contract address. */
  mint: string;
  /** Up to 280 characters, at most one link. */
  note?: string;
};

export interface RemoveCalloutParams {
  id: string;
  /** Up to 200 characters, kept for your records. */
  reason?: string;
}

/** Newest first. Filters combine; `mint` needs `chain`. */
export type CalloutsParams = {
  chain?: Chain;
  mint?: string;
  /** ISO 8601 or a Date: callouts made at or after it. */
  since?: string | Date;
  /** ISO 8601 or a Date: callouts made at or before it. */
  until?: string | Date;
  /** 1-200. Default: 50 */
  limit?: number;
  cursor?: string;
} & ({ external_id?: string; csid_id?: never } | { csid_id?: string; external_id?: never });

export type CalloutStatsParams = PlatformUserRef & {
  /** The multiple that counts as a hit: above 1, at most 1000. Default: 2 */
  hit_x?: number;
};

export interface CalloutLeaderboardParams {
  /** Callouts made in this period. Default: 7d */
  period?: Period;
  /** Omit for every chain. */
  chain?: Chain;
  /** Default: avg_peak_x */
  sort?: CalloutLeaderboardSort;
  /** Callouts needed to be listed, 1-1000. Default: 1 */
  min_callouts?: number;
  /** Above 1, at most 1000. Default: 2 */
  hit_x?: number;
  /** 1-500. Default: 100 */
  limit?: number;
  cursor?: string;
}

// -- copy trading ------------------------------------------------------------

/** The copied trader: a CabalSpy ID handle or csid_id, or one of your platform users. */
export type CopyTraderRef = { trader: string; trader_external_id?: never } | { trader_external_id: string; trader?: never };

/** `GET /v1/copy-trading/settings`: every trader of the user, or one with `trader` / `trader_external_id`. */
export type CopyTradingSettingsParams = PlatformUserRef & ({ trader?: string; trader_external_id?: never } | { trader_external_id?: string; trader?: never });

/** Only the settings you pass change; the trader is added to the user's Trade Feed if needed. */
export type UpdateCopyTradingSettingsParams = PlatformUserRef &
  CopyTraderRef & {
    enabled?: boolean;
    mode?: CopyMode;
    /** mode fixed_usd: USD per copied buy, above 0 and at most 1,000,000. */
    amount_usd?: number;
    /** mode percent: percent of the trader's buy, above 0 and at most 1000. */
    percent?: number;
    /** Cap per copied buy in USD (at most 1,000,000); null removes it. */
    max_usd?: number | null;
    sides?: CopySides;
    /** Price limit, 1-5000 basis points. Default: 300 */
    slippage_bps?: number;
  };

/** Newest first; one user's with `external_id` / `csid_id`. */
export type CopyInstructionsParams = {
  status?: CopyInstructionStatus;
  /** 1-100. Default: 50 */
  limit?: number;
  cursor?: string;
} & ({ external_id?: string; csid_id?: never } | { csid_id?: string; external_id?: never });

export interface ReportCopyInstructionParams {
  id: string;
  status: CopyReportStatus;
  /** The transaction signature or hash (10-200 characters). */
  tx_signature?: string;
  /** What was actually spent, in USD. */
  executed_amount_usd?: number;
  /** Up to 300 characters, e.g. why it failed or was skipped. */
  note?: string;
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

/** `{ external_id }` or `{ csid_id }` of a platform user; exactly one. */
function userRef(ref: PlatformUserId | undefined): { external_id: string } | { csid_id: string } {
  const r = (typeof ref === 'string' ? { external_id: ref } : (ref ?? {})) as { external_id?: string; csid_id?: string };
  const given = [r.external_id, r.csid_id].filter((v) => v !== undefined && v !== null && v !== '').length;
  if (given !== 1) {
    throw new BadRequestError('Pass exactly one of: external_id, csid_id.', {
      code: 'missing_parameter',
      parameter: 'external_id|csid_id',
    });
  }
  return r.external_id ? { external_id: r.external_id } : { csid_id: r.csid_id! };
}

/** Splits a params object into the user reference and the rest. */
function splitRef(params: PlatformUserRef): [{ external_id: string } | { csid_id: string }, Record<string, unknown>] {
  const { external_id: _e, csid_id: _c, ...rest } = (params ?? {}) as { external_id?: string; csid_id?: string };
  return [userRef(params), rest];
}

function isoTime(v: string | Date | null | undefined): string | null | undefined {
  return v instanceof Date ? v.toISOString().replace(/\.\d{3}Z$/, 'Z') : v;
}

function competitionFields(p: Record<string, unknown>, create: boolean): Record<string, unknown> {
  const kind = p.kind as string | undefined;
  assertOneOf(kind, COMPETITION_KINDS, 'kind');
  // On create the kind is known (default: trading); an update keeps the competition's own kind.
  const callouts = kind === 'callouts';
  const chains: readonly string[] = create && !callouts ? CHAINS : [...CHAINS, 'all'];
  const metrics: readonly string[] = !create
    ? [...COMPETITION_METRICS, ...CALLOUT_COMPETITION_METRICS]
    : callouts
      ? CALLOUT_COMPETITION_METRICS
      : COMPETITION_METRICS;
  assertOneOf(p.chain as string | undefined, chains, 'chain');
  assertOneOf(p.metric as string | undefined, metrics, 'metric');
  assertOneOf(p.wallet_trust as string | undefined, WALLET_TRUST, 'wallet_trust');
  assertOneOf(p.enrollment as string | undefined, ['opt_in', 'all_users'], 'enrollment');
  if (create) {
    const wrong = (callouts ? ['min_trades', 'min_volume_usd'] : ['min_callouts', 'hit_x']).find((k) => p[k] !== undefined);
    if (wrong) {
      throw new BadRequestError(
        callouts ? `${wrong} applies to trading competitions; use min_callouts.` : `${wrong} applies to callout competitions (kind: 'callouts').`,
        { code: 'invalid_parameter', parameter: wrong },
      );
    }
  }
  assertHitX(p.hit_x);
  const out: Record<string, unknown> = { ...p };
  if ('starts_at' in p) out.starts_at = isoTime(p.starts_at as string | Date | null | undefined);
  return out;
}

function copyTrader(p: { trader?: string; trader_external_id?: string }, required: boolean): Record<string, string> {
  if (p.trader && p.trader_external_id) {
    throw new BadRequestError('Pass at most one of: trader, trader_external_id.', { code: 'invalid_parameter', parameter: 'trader|trader_external_id' });
  }
  if (required && !p.trader && !p.trader_external_id) {
    throw new BadRequestError('Pass one of: trader, trader_external_id.', { code: 'missing_parameter', parameter: 'trader' });
  }
  if (p.trader) return { trader: p.trader };
  return p.trader_external_id ? { trader_external_id: p.trader_external_id } : {};
}

function assertNumber(v: unknown, parameter: string, low: number, high: number, integer = false): void {
  if (v === undefined) return;
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= low || v > high || (integer && !Number.isInteger(v))) {
    throw new BadRequestError(`${parameter} must be ${integer ? 'a whole number' : 'a number'} above ${low} and at most ${high}.`, {
      code: 'invalid_parameter',
      parameter,
    });
  }
}

const COPY_SETTING_FIELDS = ['enabled', 'mode', 'amount_usd', 'percent', 'max_usd', 'sides', 'slippage_bps'] as const;

function assertHitX(v: unknown): void {
  if (v === undefined) return;
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 1 || v > 1000) {
    throw new BadRequestError('hit_x must be a number above 1 and at most 1000.', { code: 'invalid_parameter', parameter: 'hit_x' });
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
  readonly thesesStreamUrl: string;
  readonly calloutsStreamUrl: string;
  readonly copyTradingStreamUrl: string;
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
    this.thesesStreamUrl = (options.thesesStreamUrl ?? DEFAULT_THESES_STREAM_URL).replace(/\/+$/, '');
    this.calloutsStreamUrl = (options.calloutsStreamUrl ?? DEFAULT_CALLOUTS_STREAM_URL).replace(/\/+$/, '');
    this.copyTradingStreamUrl = (options.copyTradingStreamUrl ?? DEFAULT_COPY_TRADING_STREAM_URL).replace(/\/+$/, '');
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

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    auth: boolean,
    body?: unknown,
    opts: { maxRetries?: number } = {},
  ): Promise<Envelope<T>> {
    const { res, parsed, rateLimit, label } = await this.send(method, path, auth, body, opts);
    if (parsed == null || typeof parsed !== 'object' || !('data' in parsed)) {
      throw new InvalidResponseError(`Unexpected response shape on ${label}: no data field`, {
        status: res.status,
        code: 'invalid_response',
        rateLimit,
      });
    }
    return { ...(parsed as ApiResponse<T>), rateLimit, status: res.status };
  }

  /** One request with retries; throws the mapped error for non-2xx responses. */
  private async send(
    method: 'GET' | 'POST',
    path: string,
    auth: boolean,
    body?: unknown,
    opts: { maxRetries?: number } = {},
  ): Promise<{ res: Response; text: string; parsed: unknown; rateLimit: RateLimitInfo; label: string }> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const label = `${method} ${stripQuery(path)}`;
    const maxRetries = opts.maxRetries ?? this.maxRetries;
    let lastError: CabalSpyIDError | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
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
        if (retryable && attempt < maxRetries) {
          lastError = error;
          continue;
        }
        throw error;
      }
      return { res, text, parsed, rateLimit, label };
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
    assertOneOf(params.scope, ['global', 'instance'], 'scope');
    return this.getRaw<Thesis[]>('/theses', { ...params });
  }

  /** Iterates over every thesis on a token, following `next_cursor`. */
  async *iterTheses(params: ListThesesParams): AsyncGenerator<Thesis, void, void> {
    for await (const page of this.pages((cursor) => this.listThesesRaw({ ...params, cursor }), { cursor: params.cursor })) {
      yield* page.data;
    }
  }

  /** GET /v1/theses/summary — counts (theses, bull, bear, authors) and token info. */
  async thesisSummary(params: ThesisTokenParams & ThesisScopeParam): Promise<ThesisSummary> {
    assertToken(params);
    assertOneOf(params.scope, ['global', 'instance'], 'scope');
    return this.get<ThesisSummary>('/theses/summary', { blockchain: params.blockchain, mint: params.mint, scope: params.scope });
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
    assertOneOf(params.scope, ['global', 'instance'], 'scope');
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

  /**
   * GET /v1/theses/notifications — moderation notifications of one of your users
   * (warnings, hidden posts, pauses, appeal results), with the unread count.
   */
  async thesisNotifications(csidId: string): Promise<ThesisNotifications> {
    assertRequired(csidId, 'csid_id');
    return this.get<ThesisNotifications>('/theses/notifications', { csid_id: csidId });
  }

  /**
   * POST /v1/theses/appeal — appeals a moderation decision in the user's name
   * (an `appealable` notification, within 30 days; message 10-1000 characters).
   */
  async appealThesisDecision(csidId: string, notificationId: number, message: string): Promise<{ appealed: true }> {
    assertRequired(csidId, 'csid_id');
    assertRequired(notificationId, 'notification_id');
    assertRequired(message, 'message');
    return this.post<{ appealed: true }>('/theses/appeal', { csid_id: csidId, notification_id: notificationId, message });
  }

  /** POST /v1/theses/delete — deletes the user's own thesis or reply. */
  async deleteThesis(params: DeleteThesisParams): Promise<{ deleted: true }> {
    assertRequired(params.thesis_id, 'thesis_id');
    assertRequired(params.csid_id, 'csid_id');
    return this.post<{ deleted: true }>('/theses/delete', { ...params });
  }

  // ── white-label: platform users ───────────────────────────────────────────
  // A platform that keeps its own login manages its users by its own user id
  // (`external_id`). Everywhere else in the API, `external_id` works in place
  // of `csid_id`.

  /**
   * POST /v1/platform-users — creates the user (needs at least one wallet and
   * a free place in your plan) or updates an existing one (profile fields that
   * were passed, wallets added). `created` says which.
   */
  async createPlatformUser(params: PlatformUserInput): Promise<PlatformUserUpsertResult> {
    assertRequired(params?.external_id, 'external_id');
    return this.post<PlatformUserUpsertResult>('/platform-users', { ...params });
  }

  /**
   * POST /v1/platform-users/import — creates or updates up to 1000 users in one
   * call. Each user is handled on its own: a bad item or the plan limit never
   * undoes the others. For more users, use importAllPlatformUsers().
   */
  async importPlatformUsers(users: PlatformUserInput[]): Promise<PlatformImportResult> {
    if (!Array.isArray(users) || users.length === 0) {
      throw new BadRequestError("Parameter 'users' is required", { code: 'missing_parameter', parameter: 'users' });
    }
    if (users.length > PLATFORM_IMPORT_MAX) {
      throw new BadRequestError(`At most ${PLATFORM_IMPORT_MAX} users per import call; use importAllPlatformUsers().`, {
        code: 'invalid_parameter',
        parameter: 'users',
      });
    }
    return this.post<PlatformImportResult>('/platform-users/import', { users });
  }

  /**
   * Imports any number of users: sends them in chunks of at most 1000 (and
   * under 1 MB), retries a chunk after HTTP 429 (honouring Retry-After), sends
   * items rejected with `rate_limited` again after a pause, and returns one
   * aggregated result in input order. A chunk that succeeded is never sent
   * again.
   *
   * Any other error stops the import with a PlatformImportError carrying the
   * results so far and the users not yet imported (`pending`); importing them
   * again is safe, the import is an upsert.
   */
  async importAllPlatformUsers(
    users: Iterable<PlatformUserInput>,
    options: ImportPlatformUsersOptions = {},
  ): Promise<ImportPlatformUsersResult> {
    const all = [...users];
    const chunkSize = Math.max(1, Math.min(options.chunkSize ?? PLATFORM_IMPORT_MAX, PLATFORM_IMPORT_MAX));
    const maxBytes = options.maxBodyBytes ?? 900_000;
    const maxRetries = options.maxRetries ?? 5;
    const itemDelay = options.rateLimitedItemDelayMs ?? 60_000;
    const results: (PlatformImportItemResult | undefined)[] = new Array(all.length);
    let requests = 0;

    // Chunks of input indices: at most chunkSize users and maxBytes of JSON each.
    const chunks: number[][] = [];
    let cur: number[] = [];
    let bytes = utf8('{"users":[]}').length;
    all.forEach((u, i) => {
      const size = utf8(JSON.stringify(u)).length + 1;
      if (cur.length && (cur.length >= chunkSize || bytes + size > maxBytes)) {
        chunks.push(cur);
        cur = [];
        bytes = utf8('{"users":[]}').length;
      }
      cur.push(i);
      bytes += size;
    });
    if (cur.length) chunks.push(cur);

    const done = () => results.filter((r): r is PlatformImportItemResult => r !== undefined);
    const summarize = (): PlatformImportSummary => {
      const s: PlatformImportSummary = { created: 0, updated: 0, unchanged: 0, rejected: 0 };
      for (const r of done()) s[r.status] += 1;
      return s;
    };

    // One request, retried here after 429 (the client's own retries are off for it).
    const send = async (idx: number[], c: number): Promise<PlatformImportItemResult[]> => {
      for (let attempt = 0; ; attempt++) {
        requests++;
        try {
          const env = await this.request<PlatformImportResult>(
            'POST',
            '/platform-users/import' + buildQuery(this.authedQuery({}, true)),
            true,
            { users: idx.map((i) => all[i]) },
            { maxRetries: 0 },
          );
          return env.data.results;
        } catch (err) {
          if (err instanceof RateLimitError && attempt < maxRetries) {
            const wait =
              err.retryAfter != null ? err.retryAfter * 1000 : Math.min(1000 * 2 ** attempt, 30_000) + Math.random() * 250;
            await sleep(Math.min(wait, 300_000));
            continue;
          }
          const pending = [...idx, ...chunks.slice(c + 1).flat()].map((i) => all[i]!);
          throw new PlatformImportError(err, { summary: summarize(), results: done() }, pending);
        }
      }
    };

    for (let c = 0; c < chunks.length; c++) {
      let idx = chunks[c]!;
      for (let round = 0; ; round++) {
        const got = await send(idx, c);
        idx.forEach((i, k) => {
          if (got[k]) results[i] = got[k];
        });
        // Items the server skipped because of its per-minute limit for new users.
        const again = idx.filter((i) => results[i]?.status === 'rejected' && results[i]?.error?.code === 'rate_limited');
        if (!again.length || round >= maxRetries) break;
        await sleep(itemDelay);
        idx = again;
      }
      options.onProgress?.({
        chunk: c + 1,
        chunks: chunks.length,
        done: chunks.slice(0, c + 1).reduce((n, x) => n + x.length, 0),
        total: all.length,
        summary: summarize(),
      });
    }
    return { summary: summarize(), results: done(), chunks: chunks.length, requests };
  }

  /** GET /v1/platform-users — one user by external_id (a plain string) or csid_id. */
  async platformUser(user: PlatformUserId): Promise<PlatformUser> {
    return this.get<PlatformUser>('/platform-users', userRef(user));
  }

  /** POST /v1/platform-users/update — changes display_name and/or avatar_url. */
  async updatePlatformUser(params: UpdatePlatformUserParams): Promise<PlatformUser> {
    const [ref, rest] = splitRef(params);
    if (!('display_name' in rest) && !('avatar_url' in rest)) {
      throw new BadRequestError('Pass display_name and/or avatar_url.', { code: 'missing_parameter', parameter: 'display_name' });
    }
    return this.post<PlatformUser>('/platform-users/update', { ...ref, ...rest });
  }

  /** GET /v1/platform-users/list — your platform users, newest first. */
  async platformUsers(params: PlatformUsersParams = {}): Promise<PlatformUser[]> {
    return (await this.platformUsersRaw(params)).data;
  }

  async platformUsersRaw(params: PlatformUsersParams = {}): Promise<Envelope<PlatformUser[]>> {
    return this.getRaw<PlatformUser[]>('/platform-users/list', { limit: params.limit, cursor: params.cursor });
  }

  /** Iterates over every platform user, following `next_cursor`. */
  async *iterPlatformUsers(params: PlatformUsersParams = {}): AsyncGenerator<PlatformUser, void, void> {
    for await (const page of this.pages((cursor) => this.platformUsersRaw({ ...params, cursor }), { cursor: params.cursor })) {
      yield* page.data;
    }
  }

  /**
   * POST /v1/platform-users/delete — a managed user and their data are deleted;
   * for a claimed user only the link to your platform goes (`deleted: false`).
   */
  async deletePlatformUser(user: PlatformUserId): Promise<PlatformUserDeleteResult> {
    return this.post<PlatformUserDeleteResult>('/platform-users/delete', userRef(user));
  }

  /** POST /v1/platform-users/wallets/add — adds existing wallets (no payment verification). */
  async addPlatformUserWallets(params: AddPlatformWalletsParams): Promise<PlatformWalletsAddResult> {
    const [ref, rest] = splitRef(params);
    if (!Array.isArray(rest.wallets) || rest.wallets.length === 0) {
      throw new BadRequestError("Parameter 'wallets' is required", { code: 'missing_parameter', parameter: 'wallets' });
    }
    return this.post<PlatformWalletsAddResult>('/platform-users/wallets/add', { ...ref, wallets: rest.wallets });
  }

  /** POST /v1/platform-users/wallets/delete — removes a wallet (never the last one: `last_wallet`). */
  async deletePlatformUserWallet(params: DeletePlatformWalletParams): Promise<PlatformWalletDeleteResult> {
    const [ref, rest] = splitRef(params);
    assertRequired(rest.address, 'address');
    return this.post<PlatformWalletDeleteResult>('/platform-users/wallets/delete', { ...ref, address: rest.address });
  }

  /**
   * POST /v1/platform-users/wallets/verify — starts a payment verification
   * (the website's flow). Show `instructions`, `payment_uri` or the QR code
   * (walletVerificationQr) to the user; `wallet.verified` arrives as a webhook.
   */
  async startWalletVerification(params: StartWalletVerificationParams): Promise<WalletVerification> {
    const [ref, rest] = splitRef(params);
    assertRequired(rest.chain, 'chain');
    assertOneOf(rest.chain as string, CHAINS, 'chain');
    assertRequired(rest.address, 'address');
    return this.post<WalletVerification>('/platform-users/wallets/verify', { ...ref, chain: rest.chain, address: rest.address });
  }

  /** GET /v1/platform-users/wallets/verification — status of a verification. */
  async walletVerification(verificationId: string): Promise<WalletVerification> {
    assertRequired(verificationId, 'id');
    return this.get<WalletVerification>('/platform-users/wallets/verification', { id: verificationId });
  }

  /** GET /v1/platform-users/wallets/verification/qr — the payment URI as a QR code (SVG markup). */
  async walletVerificationQr(verificationId: string): Promise<string> {
    assertRequired(verificationId, 'id');
    const path = '/platform-users/wallets/verification/qr' + buildQuery(this.authedQuery({ id: verificationId }, true));
    return (await this.send('GET', path, true)).text;
  }

  /** POST /v1/platform-users/wallets/verification/cancel */
  async cancelWalletVerification(verificationId: string): Promise<WalletVerification> {
    assertRequired(verificationId, 'id');
    return this.post<WalletVerification>('/platform-users/wallets/verification/cancel', { id: verificationId });
  }

  /**
   * GET /v1/platform-users/profile — everything for a profile page in one call:
   * the user, trading per chain (summed over the wallets that count), recent
   * trades, theses, Trade Feed counts, KOL status and links to the wallet endpoints.
   */
  async platformUserProfile(params: PlatformUserId | PlatformUserProfileParams): Promise<PlatformUserProfile> {
    const period = typeof params === 'string' ? undefined : (params as PlatformUserProfileParams).period;
    assertOneOf(period, PERIODS, 'period');
    return this.get<PlatformUserProfile>('/platform-users/profile', { ...userRef(params), period });
  }

  /** GET /v1/platform-users/leaderboard — your platform users ranked, with their external_id. */
  async platformLeaderboard(params: PlatformLeaderboardParams): Promise<PlatformLeaderboardResponse> {
    return (await this.platformLeaderboardRaw(params)).data;
  }

  async platformLeaderboardRaw(params: PlatformLeaderboardParams): Promise<Envelope<PlatformLeaderboardResponse>> {
    assertRequired(params.blockchain, 'blockchain');
    assertOneOf(params.blockchain, CHAINS, 'blockchain');
    assertOneOf(params.period, PERIODS, 'period');
    assertOneOf(params.sort, LEADERBOARD_SORTS, 'sort');
    assertOneOf(params.trust, ['all', 'verified'], 'trust');
    return this.getRaw<PlatformLeaderboardResponse>('/platform-users/leaderboard', { ...params });
  }

  /** Iterates over every entry of your platform leaderboard, following `next_cursor`. */
  async *iterPlatformLeaderboard(params: PlatformLeaderboardParams): AsyncGenerator<PlatformLeaderboardEntry, void, void> {
    for await (const page of this.pages((cursor) => this.platformLeaderboardRaw({ ...params, cursor }), { cursor: params.cursor })) {
      yield* page.data.leaderboard;
    }
  }

  /** GET /v1/platform-users/settings */
  async platformSettings(): Promise<PlatformSettings> {
    return this.get<PlatformSettings>('/platform-users/settings');
  }

  /** POST /v1/platform-users/settings — changes only what you pass; returns every setting. */
  async updatePlatformSettings(changes: PlatformSettingsUpdate): Promise<PlatformSettings> {
    assertOneOf(changes.wallet_trust, WALLET_TRUST, 'wallet_trust');
    assertOneOf(changes.leaderboard_trust, WALLET_TRUST, 'leaderboard_trust');
    assertOneOf(changes.data_scope, DATA_SCOPES, 'data_scope');
    return this.post<PlatformSettings>('/platform-users/settings', { ...changes });
  }

  /** GET /v1/platform-users/inbound — whether the inbound URL is on, its last event and the formats it reads. */
  async inboundStatus(): Promise<InboundStatus> {
    return this.get<InboundStatus>('/platform-users/inbound');
  }

  /**
   * POST /v1/platform-users/inbound/enable — a new secret inbound URL for your
   * platform or auth provider (Privy, Dynamic, …) to post sign-ups to. Shown
   * once; calling it again replaces the URL.
   */
  async enableInbound(): Promise<InboundEnabled> {
    return this.post<InboundEnabled>('/platform-users/inbound/enable', {});
  }

  /** POST /v1/platform-users/inbound/disable */
  async disableInbound(): Promise<{ enabled: false }> {
    return this.post<{ enabled: false }>('/platform-users/inbound/disable', {});
  }

  /** POST /v1/platform-users/session — a 15-minute token for the embeddable verify widget. */
  async platformUserSession(user: PlatformUserId): Promise<PlatformUserSession> {
    return this.post<PlatformUserSession>('/platform-users/session', userRef(user));
  }

  /** POST /v1/platform-users/claim-link — a 24-hour link to take the account into the person's own CabalSpy ID. */
  async platformUserClaimLink(params: PlatformUserId | PlatformClaimLinkParams): Promise<PlatformClaimLink> {
    const returnUrl = typeof params === 'string' ? undefined : (params as PlatformClaimLinkParams).return_url;
    return this.post<PlatformClaimLink>('/platform-users/claim-link', {
      ...userRef(params),
      ...(returnUrl ? { return_url: returnUrl } : {}),
    });
  }

  /** POST /v1/platform-users/x/connect — a 10-minute link that connects the person's X account. */
  async connectPlatformUserX(params: PlatformXConnectParams): Promise<PlatformXConnect> {
    const [ref, rest] = splitRef(params);
    assertRequired(rest.return_url, 'return_url');
    return this.post<PlatformXConnect>('/platform-users/x/connect', { ...ref, return_url: rest.return_url });
  }

  /** POST /v1/platform-users/x/disconnect — not possible with the KOL badge (`kol_badge`, 409). */
  async disconnectPlatformUserX(user: PlatformUserId): Promise<PlatformXDisconnect> {
    return this.post<PlatformXDisconnect>('/platform-users/x/disconnect', userRef(user));
  }

  /** POST /v1/platform-users/telegram/link — a t.me deep link that connects the person's Telegram. */
  async linkPlatformUserTelegram(user: PlatformUserId): Promise<PlatformTelegramLink> {
    return this.post<PlatformTelegramLink>('/platform-users/telegram/link', userRef(user));
  }

  /** GET /v1/platform-users/telegram */
  async platformUserTelegram(user: PlatformUserId): Promise<PlatformTelegramStatus> {
    return this.get<PlatformTelegramStatus>('/platform-users/telegram', userRef(user));
  }

  /** POST /v1/platform-users/telegram/unlink */
  async unlinkPlatformUserTelegram(user: PlatformUserId): Promise<PlatformTelegramUnlink> {
    return this.post<PlatformTelegramUnlink>('/platform-users/telegram/unlink', userRef(user));
  }

  /** GET /v1/platform-users/kol — KOL badge, eligibility, criteria, 7-day volume and application. */
  async platformUserKol(user: PlatformUserId): Promise<PlatformKolStatus> {
    return this.get<PlatformKolStatus>('/platform-users/kol', userRef(user));
  }

  /** POST /v1/platform-users/kol/volume-check — queues an on-chain volume check (HTTP 202). */
  async requestPlatformUserVolumeCheck(user: PlatformUserId): Promise<PlatformKolVolumeCheck> {
    return this.post<PlatformKolVolumeCheck>('/platform-users/kol/volume-check', userRef(user));
  }

  /** POST /v1/platform-users/kol/apply — applies for the KOL badge (needs X: `x_required`). */
  async applyPlatformUserKol(user: PlatformUserId): Promise<PlatformKolApply> {
    return this.post<PlatformKolApply>('/platform-users/kol/apply', userRef(user));
  }

  // ── competitions ──────────────────────────────────────────────────────────
  // Between your platform users; at most 5 scheduled + running per account.
  // `kind: 'callouts'` ranks callouts instead of trades (needs the callouts extra).

  /** POST /v1/competitions — a trading competition, or with `kind: 'callouts'` a callout competition. */
  async createCompetition(params: CreateCompetitionParams): Promise<Competition> {
    for (const k of ['name', 'chain', 'metric', 'duration_hours'] as const) assertRequired(params?.[k], k);
    return this.post<Competition>('/competitions', competitionFields({ ...params }, true));
  }

  /** GET /v1/competitions — newest first, with live status. */
  async competitions(params: CompetitionsParams = {}): Promise<Competition[]> {
    return (await this.competitionsRaw(params)).data;
  }

  async competitionsRaw(params: CompetitionsParams = {}): Promise<Envelope<Competition[]>> {
    assertOneOf(params.status, COMPETITION_STATUSES, 'status');
    return this.getRaw<Competition[]>('/competitions', { ...params });
  }

  /** Iterates over every competition (offset pagination). */
  async *iterCompetitions(params: CompetitionsParams = {}): AsyncGenerator<Competition, void, void> {
    yield* this.offsetItems((offset) => this.competitionsRaw({ ...params, offset }), (d) => d, params.offset);
  }

  /** GET /v1/competitions/detail — one competition with every rule change. */
  async competition(id: string): Promise<Competition> {
    assertRequired(id, 'id');
    return this.get<Competition>('/competitions/detail', { id });
  }

  /** POST /v1/competitions/update — changes any rule, any time; `note` is recorded with it. */
  async updateCompetition(params: UpdateCompetitionParams): Promise<Competition> {
    assertRequired(params?.id, 'id');
    if ('kind' in (params as object)) {
      throw new BadRequestError('kind cannot be changed; create a new competition.', { code: 'invalid_parameter', parameter: 'kind' });
    }
    return this.post<Competition>('/competitions/update', competitionFields({ ...params }, false));
  }

  /** POST /v1/competitions/cancel */
  async cancelCompetition(id: string): Promise<Competition> {
    assertRequired(id, 'id');
    return this.post<Competition>('/competitions/cancel', { id });
  }

  /** POST /v1/competitions/join — `already: true` when the user was a participant. */
  async joinCompetition(params: CompetitionMemberParams): Promise<CompetitionJoinResult> {
    assertRequired(params?.id, 'id');
    return this.post<CompetitionJoinResult>('/competitions/join', { id: params.id, ...userRef(params) });
  }

  /** POST /v1/competitions/leave */
  async leaveCompetition(params: CompetitionMemberParams): Promise<CompetitionLeaveResult> {
    assertRequired(params?.id, 'id');
    return this.post<CompetitionLeaveResult>('/competitions/leave', { id: params.id, ...userRef(params) });
  }

  /** GET /v1/competitions/participants */
  async competitionParticipants(params: CompetitionPageParams): Promise<CompetitionParticipant[]> {
    return (await this.competitionParticipantsRaw(params)).data;
  }

  async competitionParticipantsRaw(params: CompetitionPageParams): Promise<Envelope<CompetitionParticipant[]>> {
    assertRequired(params?.id, 'id');
    return this.getRaw<CompetitionParticipant[]>('/competitions/participants', { ...params });
  }

  /** Iterates over every participant (offset pagination). */
  async *iterCompetitionParticipants(params: CompetitionPageParams): AsyncGenerator<CompetitionParticipant, void, void> {
    yield* this.offsetItems((offset) => this.competitionParticipantsRaw({ ...params, offset }), (d) => d, params.offset);
  }

  /** GET /v1/competitions/standings — ranked first, then the unranked (below the minimums). */
  async competitionStandings(params: CompetitionPageParams): Promise<CompetitionStandingsResponse> {
    return (await this.competitionStandingsRaw(params)).data;
  }

  async competitionStandingsRaw(params: CompetitionPageParams): Promise<Envelope<CompetitionStandingsResponse>> {
    assertRequired(params?.id, 'id');
    return this.getRaw<CompetitionStandingsResponse>('/competitions/standings', { ...params });
  }

  /** Iterates over every standings entry (offset pagination). */
  async *iterCompetitionStandings(params: CompetitionPageParams): AsyncGenerator<CompetitionStanding, void, void> {
    yield* this.offsetItems((offset) => this.competitionStandingsRaw({ ...params, offset }), (d) => d.standings, params.offset);
  }

  // ── callouts (an extra, switched on per instance on request) ──────────────
  // Without it every call throws FeatureNotEnabledError (403 feature_not_enabled).

  /**
   * POST /v1/callouts — one of your users calls a token; its price and market
   * cap are stamped and tracked. Throws CalloutCooldownError (429, with
   * `retryAfter`; never retried automatically), ConflictError `already_called`,
   * PermissionError `not_a_holder` / `kol_only`, UnprocessableError `no_price`.
   */
  async createCallout(params: CreateCalloutParams): Promise<Callout> {
    const [ref, rest] = splitRef(params);
    assertRequired(rest.chain, 'chain');
    assertOneOf(rest.chain as string, CHAINS, 'chain');
    assertRequired(rest.mint, 'mint');
    if (rest.note !== undefined && rest.note !== null && typeof rest.note !== 'string') {
      throw new BadRequestError('note must be text.', { code: 'invalid_parameter', parameter: 'note' });
    }
    return this.post<Callout>('/callouts', {
      ...ref,
      chain: rest.chain,
      mint: rest.mint,
      ...(rest.note !== undefined ? { note: rest.note } : {}),
    });
  }

  /** POST /v1/callouts/remove — takes a callout down (moderation); it leaves every list and statistic. */
  async removeCallout(params: string | RemoveCalloutParams): Promise<CalloutRemoveResult> {
    const p = typeof params === 'string' ? { id: params } : params;
    assertRequired(p?.id, 'id');
    return this.post<CalloutRemoveResult>('/callouts/remove', { id: p.id, ...(p.reason !== undefined ? { reason: p.reason } : {}) });
  }

  /** GET /v1/callouts — callouts of your instance, newest first (e.g. markers on a chart). */
  async callouts(params: CalloutsParams = {}): Promise<Callout[]> {
    return (await this.calloutsRaw(params)).data;
  }

  async calloutsRaw(params: CalloutsParams = {}): Promise<Envelope<Callout[]>> {
    const p = params as CalloutsParams & { external_id?: string; csid_id?: string };
    assertOneOf(p.chain, CHAINS, 'chain');
    if (p.mint) assertRequired(p.chain, 'chain');
    if (p.external_id && p.csid_id) {
      throw new BadRequestError('Pass at most one of: external_id, csid_id.', { code: 'invalid_parameter', parameter: 'external_id|csid_id' });
    }
    return this.getRaw<Callout[]>('/callouts', {
      chain: p.chain,
      mint: p.mint,
      external_id: p.external_id,
      csid_id: p.csid_id,
      since: isoTime(p.since),
      until: isoTime(p.until),
      limit: p.limit,
      cursor: p.cursor,
    });
  }

  /** Iterates over every matching callout, newest first, following `next_cursor`. */
  async *iterCallouts(params: CalloutsParams = {}): AsyncGenerator<Callout, void, void> {
    for await (const page of this.pages((cursor) => this.calloutsRaw({ ...params, cursor }), { cursor: params.cursor })) {
      yield* page.data;
    }
  }

  /** GET /v1/callouts/item — one callout. */
  async callout(id: string): Promise<Callout> {
    assertRequired(id, 'id');
    return this.get<Callout>('/callouts/item', { id });
  }

  /** GET /v1/callouts/stats — one user's callouts per period (6h, 1d, 7d, 30d) and all time. */
  async calloutStats(params: PlatformUserId | CalloutStatsParams): Promise<CalloutStats> {
    const hitX = typeof params === 'string' ? undefined : (params as CalloutStatsParams).hit_x;
    assertHitX(hitX);
    return this.get<CalloutStats>('/callouts/stats', { ...userRef(params), hit_x: hitX });
  }

  /** GET /v1/callouts/leaderboard — your callers ranked (cached for 30 s). */
  async calloutLeaderboard(params: CalloutLeaderboardParams = {}): Promise<CalloutLeaderboardResponse> {
    return (await this.calloutLeaderboardRaw(params)).data;
  }

  async calloutLeaderboardRaw(params: CalloutLeaderboardParams = {}): Promise<Envelope<CalloutLeaderboardResponse>> {
    assertOneOf(params.period, PERIODS, 'period');
    assertOneOf(params.chain, CHAINS, 'chain');
    assertOneOf(params.sort, CALLOUT_LEADERBOARD_SORTS, 'sort');
    assertHitX(params.hit_x);
    return this.getRaw<CalloutLeaderboardResponse>('/callouts/leaderboard', { ...params });
  }

  /** Iterates over every entry of the callers leaderboard, following `next_cursor`. */
  async *iterCalloutLeaderboard(params: CalloutLeaderboardParams = {}): AsyncGenerator<CalloutLeaderboardEntry, void, void> {
    for await (const page of this.pages((cursor) => this.calloutLeaderboardRaw({ ...params, cursor }), { cursor: params.cursor })) {
      yield* page.data.leaderboard;
    }
  }

  /** GET /v1/callouts/settings — who may call, holders only, cooldown. */
  async calloutSettings(): Promise<CalloutSettings> {
    return this.get<CalloutSettings>('/callouts/settings');
  }

  /** POST /v1/callouts/settings — changes only what you pass; returns every setting. */
  async updateCalloutSettings(changes: CalloutSettingsUpdate): Promise<CalloutSettings> {
    assertOneOf(changes?.who, CALLOUT_WHO, 'who');
    const cd = changes?.cooldown_minutes;
    if (cd !== undefined && (!Number.isInteger(cd) || cd < 0 || cd > 10080)) {
      throw new BadRequestError('cooldown_minutes must be a whole number from 0 to 10080 (7 days).', {
        code: 'invalid_parameter',
        parameter: 'cooldown_minutes',
      });
    }
    return this.post<CalloutSettings>('/callouts/settings', { ...changes });
  }

  // ── copy trading ──────────────────────────────────────────────────────────
  // Every trade of a trader a user copies becomes a ready-to-execute instruction
  // for that user. CabalSpy ID never holds keys and never executes: your app
  // executes the instruction with the user's wallet and reports the status back.
  // Needs the user's consent with the scope `trade_feed` (else PermissionError
  // `consent_required`). One platform at a time copies a trader for a user.

  /**
   * GET /v1/copy-trading/settings — the copy settings of every trader in the
   * user's Trade Feed (copied ones first). NotFoundError `not_in_trade_feed` for
   * a trader who is not in it, `trader_not_found` for an unknown one.
   */
  copyTradingSettings(user: PlatformUserId): Promise<CopyTradingSetting[]>;
  /** GET /v1/copy-trading/settings — the copy settings for one trader (`trader` or `trader_external_id`). */
  copyTradingSettings(params: PlatformUserRef & CopyTraderRef): Promise<CopyTradingSetting>;
  async copyTradingSettings(params: PlatformUserId | CopyTradingSettingsParams): Promise<CopyTradingSetting[] | CopyTradingSetting> {
    const p = (typeof params === 'string' ? {} : params) as { trader?: string; trader_external_id?: string };
    return this.get<CopyTradingSetting[] | CopyTradingSetting>('/copy-trading/settings', {
      ...userRef(params as PlatformUserId),
      ...copyTrader(p, false),
    });
  }

  /**
   * POST /v1/copy-trading/settings — changes how a user copies one trader (only
   * what you pass; `max_usd: null` removes the cap). The trader is added to the
   * Trade Feed if needed. ConflictError `copy_managed_elsewhere` while another
   * platform copies this trader for the user.
   */
  async updateCopyTradingSettings(params: UpdateCopyTradingSettingsParams): Promise<CopyTradingSetting> {
    const [ref, rest] = splitRef(params);
    const target = copyTrader(rest as { trader?: string; trader_external_id?: string }, true);
    const changes: Record<string, unknown> = {};
    for (const k of COPY_SETTING_FIELDS) if (rest[k] !== undefined) changes[k] = rest[k];
    assertOneOf(changes.mode as string | undefined, COPY_MODES, 'mode');
    assertOneOf(changes.sides as string | undefined, COPY_SIDES, 'sides');
    if (changes.enabled !== undefined && typeof changes.enabled !== 'boolean') {
      throw new BadRequestError('enabled must be true or false.', { code: 'invalid_parameter', parameter: 'enabled' });
    }
    assertNumber(changes.amount_usd, 'amount_usd', 0, 1_000_000);
    assertNumber(changes.percent, 'percent', 0, 1000);
    if (changes.max_usd !== null) assertNumber(changes.max_usd, 'max_usd', 0, 1_000_000);
    assertNumber(changes.slippage_bps, 'slippage_bps', 0, 5000, true);
    if (Object.keys(changes).length === 0) {
      throw new BadRequestError(`Pass at least one of: ${COPY_SETTING_FIELDS.join(', ')}.`, { code: 'missing_parameter', parameter: 'enabled' });
    }
    return this.post<CopyTradingSetting>('/copy-trading/settings', { ...ref, ...target, ...changes });
  }

  /** GET /v1/copy-trading/instructions — your instance's copy instructions, newest first. */
  async copyInstructions(params: CopyInstructionsParams = {}): Promise<CopyInstruction[]> {
    return (await this.copyInstructionsRaw(params)).data;
  }

  async copyInstructionsRaw(params: CopyInstructionsParams = {}): Promise<Envelope<CopyInstruction[]>> {
    const p = params as CopyInstructionsParams & { external_id?: string; csid_id?: string };
    if (p.external_id && p.csid_id) {
      throw new BadRequestError('Pass at most one of: external_id, csid_id.', { code: 'invalid_parameter', parameter: 'external_id|csid_id' });
    }
    assertOneOf(p.status, COPY_INSTRUCTION_STATUSES, 'status');
    if (p.limit !== undefined && (!Number.isInteger(p.limit) || p.limit < 1 || p.limit > 100)) {
      throw new BadRequestError('limit must be a whole number from 1 to 100.', { code: 'invalid_parameter', parameter: 'limit' });
    }
    return this.getRaw<CopyInstruction[]>('/copy-trading/instructions', {
      external_id: p.external_id,
      csid_id: p.csid_id,
      status: p.status,
      limit: p.limit,
      cursor: p.cursor,
    });
  }

  /** Iterates over every matching copy instruction, newest first, following `next_cursor`. */
  async *iterCopyInstructions(params: CopyInstructionsParams = {}): AsyncGenerator<CopyInstruction, void, void> {
    for await (const page of this.pages((cursor) => this.copyInstructionsRaw({ ...params, cursor }), { cursor: params.cursor })) {
      yield* page.data;
    }
  }

  /** GET /v1/copy-trading/instructions/item — one instruction. */
  async copyInstruction(id: string): Promise<CopyInstruction> {
    assertRequired(id, 'id');
    return this.get<CopyInstruction>('/copy-trading/instructions/item', { id });
  }

  /**
   * POST /v1/copy-trading/instructions/status — what happened: `executed` (with
   * `tx_signature`, `executed_amount_usd`), `failed` or `skipped`. Final: the same
   * report twice is fine, another one is a ConflictError `already_reported`. A
   * copied buy reported failed or skipped means later sells of that token are not sent.
   */
  async reportCopyInstruction(params: ReportCopyInstructionParams): Promise<CopyInstruction> {
    assertRequired(params?.id, 'id');
    assertRequired(params.status, 'status');
    assertOneOf(params.status, COPY_REPORT_STATUSES, 'status');
    const sig = params.tx_signature;
    if (sig !== undefined && (typeof sig !== 'string' || sig.length < 10 || sig.length > 200)) {
      throw new BadRequestError('tx_signature must be a transaction signature or hash (10-200 characters).', {
        code: 'invalid_parameter',
        parameter: 'tx_signature',
      });
    }
    assertNumber(params.executed_amount_usd, 'executed_amount_usd', 0, 10_000_000);
    return this.post<CopyInstruction>('/copy-trading/instructions/status', {
      id: params.id,
      status: params.status,
      ...(sig !== undefined ? { tx_signature: sig } : {}),
      ...(params.executed_amount_usd !== undefined ? { executed_amount_usd: params.executed_amount_usd } : {}),
      ...(params.note !== undefined ? { note: params.note } : {}),
    });
  }

  /**
   * Offset pagination (competitions): the server reports `total` but no cursor
   * (`has_more` is always false there), so the next offset is computed here.
   */
  private async *offsetItems<P, I>(
    fetchPage: (offset: number) => Promise<Envelope<P>>,
    items: (data: P) => I[],
    start = 0,
  ): AsyncGenerator<I, void, void> {
    let offset = start;
    for (;;) {
      const page = await fetchPage(offset);
      const list = items(page.data);
      yield* list;
      offset += list.length;
      const total = page.pagination?.total;
      if (list.length === 0 || (total != null ? offset >= total : list.length < (page.pagination?.limit ?? Infinity))) return;
    }
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

  /**
   * Live theses for the tokens you subscribe to (every plan), e.g. for a chart.
   *
   *   const ts = csid.thesesStream();
   *   ts.on('thesis', (t) => addMarker(t));
   *   await ts.connect();
   *   ts.subscribe([{ blockchain: 'solana', mint }]);
   */
  thesesStream(options: ThesesStreamOptions = {}): ThesesStream {
    if (!this.apiKey) {
      throw new AuthenticationError('The theses stream needs an API key.', { status: 401, code: 'missing_api_key' });
    }
    return new ThesesStream(this.thesesStreamUrl, this.apiKey, { instance: this.instance, ...options });
  }

  /**
   * Every callout event of your instance, live (needs the callouts extra; at
   * most 5 connections per key). Optional `chain` / `mint` narrow it.
   *
   *   const cs = csid.calloutsStream({ chain: 'solana' });
   *   cs.on('callout.created', (c) => addMarker(c));
   *   await cs.connect();
   */
  calloutsStream(options: CalloutsStreamOptions = {}): CalloutsStream {
    if (!this.apiKey) {
      throw new AuthenticationError('The callouts stream needs an API key.', { status: 401, code: 'missing_api_key' });
    }
    return new CalloutsStream(this.calloutsStreamUrl, this.apiKey, { instance: this.instance, ...options });
  }

  /**
   * Every new copy instruction of your instance, live (at most 5 connections per key).
   *
   *   const cs = csid.copyTradingStream();
   *   cs.on('copy_trade.instruction', (i) => execute(i));
   *   await cs.connect();
   */
  copyTradingStream(options: CopyTradingStreamOptions = {}): CopyTradingStream {
    if (!this.apiKey) {
      throw new AuthenticationError('The copy trading stream needs an API key.', { status: 401, code: 'missing_api_key' });
    }
    return new CopyTradingStream(this.copyTradingStreamUrl, this.apiKey, { instance: this.instance, ...options });
  }
}

function stripQuery(path: string): string {
  const i = path.indexOf('?');
  return i === -1 ? path : path.slice(0, i);
}
