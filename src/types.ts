/**
 * Response shapes of the CabalSpy ID Data API, derived from the server source.
 *
 * Every object type keeps an index signature-free shape for editor help, but
 * the server may add fields later; nothing is stripped at runtime.
 *
 * Timestamps are ISO 8601 UTC strings ("2026-10-12T08:00:00Z"), except
 * `PnlCalendarDay.date`, which is "DD-MM-YY" like the CabalSpy API.
 */

export const CHAINS = ['solana', 'bnb', 'base', 'eth', 'rh'] as const;
/** solana, bnb (BNB Chain), base, eth (Ethereum), rh (Robinhood Chain). */
export type Chain = (typeof CHAINS)[number];

export const PERIODS = ['6h', '1d', '7d', '30d'] as const;
export type Period = (typeof PERIODS)[number];

export const LEADERBOARD_SORTS = ['volume', 'pnl', 'pnl_usd', 'win_rate', 'trades'] as const;
export type LeaderboardSort = (typeof LEADERBOARD_SORTS)[number];

export type Currency = 'SOL' | 'BNB' | 'ETH';
export type Scope = 'instance' | 'global';

export const CURRENCY_BY_CHAIN: Record<Chain, Currency> = {
  solana: 'SOL',
  bnb: 'BNB',
  base: 'ETH',
  eth: 'ETH',
  rh: 'ETH',
};

// ── envelope ────────────────────────────────────────────────────────────────

export interface ResponseMeta {
  request_id: string;
  cached: boolean;
  cache_age_seconds: number;
  version: string;
  timestamp: string;
}

export interface Pagination {
  limit: number;
  /** Absent on /wallets/history, `null` on /transactions/latest. */
  total?: number | null;
  has_more: boolean;
  next_cursor: string | null;
}

/** Shape of every successful Data API response. */
export interface ApiResponse<T> {
  success: true;
  data: T;
  pagination?: Pagination;
  meta: ResponseMeta;
}

// ── account ─────────────────────────────────────────────────────────────────

export interface HealthResponse {
  status: 'ok' | 'degraded';
  /** Seconds since the last trade sync; `null` when unknown. */
  trade_sync_age_seconds: number | null;
}

export interface MeResponse {
  /** The registrable domain of a live instance, else the client_id. */
  instance: string;
  client_id: string;
  mode: 'sandbox' | 'development' | 'live';
  /** free | starter | pro | business | enterprise, or "development" for non-live apps. */
  plan: string;
  /** Requests per second; `null` = unlimited. */
  rate_limit_rps: number | null;
  /** Whether the key may open the live stream (Pro plan and up). */
  websockets: boolean;
  /** Whether `scope=global` is available (Enterprise). */
  global_scope: boolean;
  users_with_data: number;
  /**
   * Extras switched on for this instance by CabalSpy, e.g. `callouts`.
   * Empty when none are on.
   */
  features: InstanceFeature[];
}

/** Extras CabalSpy switches on per instance on request. */
export type InstanceFeature = 'callouts' | (string & {});

// ── users ───────────────────────────────────────────────────────────────────

export interface VerifiedWallet {
  address: string;
  /** "solana" or "evm". */
  family: string;
  chains: Chain[];
  verified_at: string | null;
}

export interface Profile {
  /** The user's id: the `sub` of their ID token. */
  csid_id: string;
  /** X handle; for people without X `tg.<telegram name>` (signed in with Telegram) or `id.<hex>` (signed in with Google). X handles never contain a dot. */
  username: string;
  name: string | null;
  image_url: string | null;
  bio: string | null;
  /** https://x.com/<handle>; `null` for people without X. */
  twitter: string | null;
  /** https://t.me/<name> when Telegram is connected, else an empty string. */
  telegram: string;
  /** X stats; `null` for people who signed in with Telegram or Google and have not connected X. */
  x: {
    id: string;
    followers: number | null;
    following: number | null;
    verified: boolean | null;
    verified_type: string | null;
  } | null;
  kol: { badge: boolean; since: string | null };
  profile_url: string;
  wallets: VerifiedWallet[];
  joined_at: string | null;
}

export interface WalletLookupResponse {
  address: string;
  verified: true;
  wallet: VerifiedWallet | null;
  owner: Omit<Profile, 'wallets'>;
}

// ── trading ─────────────────────────────────────────────────────────────────

/** Trader block on trading responses. */
export interface TraderProfile {
  csid_id: string;
  /** X handle; for people without X `tg.<telegram name>` (signed in with Telegram) or `id.<hex>` (signed in with Google). X handles never contain a dot. */
  username: string;
  name: string | null;
  image_url: string | null;
  /** https://x.com/<handle>; `null` for people without X. */
  twitter: string | null;
  /** https://t.me/<name> when Telegram is connected, else an empty string. */
  telegram: string;
  blockchain: Chain;
  currency: Currency;
  type: 'csid';
  kol: boolean;
  /** e.g. "13:00-22:00 UTC"; empty when there were no trades in 30 days. */
  active_hours: string;
  profile_url: string;
  wallet_address?: string;
}

export interface PeriodStats {
  period: Period;
  total_buy: number;
  total_buy_usd: number;
  total_sell: number;
  total_sell_usd: number;
  volume: number;
  volume_usd: number;
  /** Cash flow inside the window: sells minus buys. */
  realized_pnl: number;
  realized_pnl_usd: number;
  realized_pnl_percentage: number;
  buy_txn: number;
  sell_txn: number;
  largest_buy: number;
  best_trade_pnl: number;
  worst_trade_pnl: number;
  win_count: number;
  loss_count: number;
  avg_hold_time_minutes: number;
}

export interface WinRateBuckets {
  above_500: number;
  above_100_to_500: number;
  above_zero_to_100: number;
  below_zero: number;
}

export interface WinRateDistribution extends WinRateBuckets {
  win_count: number;
  closed_count: number;
  win_rate_percentage: number;
}

export interface ActiveTokens {
  active_tokens_count: number;
  avg_position_size: number;
  still_holding_count: number;
}

export interface HistoryToken {
  mint: string;
  token_name: string | null;
  token_symbol: string | null;
  token_logo: string | null;
  buy_value: number;
  buy_value_usd: number;
  sell_value: number;
  sell_value_usd: number;
  buy_tokens: number;
  sell_tokens: number;
  realized_pnl: number;
  realized_pnl_usd: number;
  realized_pnl_percentage: number;
  currency: Currency;
  remaining_tokens: number;
}

export interface PnlChartPoint {
  timestamp: string;
  realized_pnl: number;
  realized_pnl_usd: number;
}

export interface TrackerTrade {
  mint: string;
  token_name: string | null;
  token_logo: string | null;
  transaction_type: 'buy' | 'sell';
  buy_token: null;
  sell_token: null;
  buy_value?: number;
  buy_value_usd?: number;
  sell_value?: number;
  sell_value_usd?: number;
  token_amount: number | null;
  created_at: string;
  tx_signature: string;
}

export interface TrackerResponse {
  wallet: string;
  profile: TraderProfile;
  period_stats: PeriodStats;
  period_win_rate_distribution: WinRateDistribution;
  period_active_tokens: ActiveTokens;
  period_history_tokens: HistoryToken[];
  /** Cumulative realized PnL, starts at 0, one point every 15 minutes. */
  period_realized_pnl_chart: PnlChartPoint[];
  period_trades: TrackerTrade[];
}

export interface LifetimeStats {
  buy: number;
  sell: number;
  realized_pnl: number;
  realized_pnl_percentage: number;
  buy_txn: number;
  sell_txn: number;
  total_tx_count: number;
  win_count: number;
  total_sold: number;
  win_rate: number;
  active_tokens_count: number;
  largest_buy: number;
  best_trade_pnl: number;
  worst_trade_pnl: number;
  still_holding_count: number;
}

export interface TokenOverview {
  mint: string;
  token_name: string | null;
  token_logo: string | null;
  invested: number;
  sold: number;
  realized_pnl: number;
  realized_pnl_percentage: number;
  currency: Currency;
  buy_txn: number;
  sell_txn: number;
  first_seen: string;
  last_seen: string;
  still_holding: boolean;
}

export interface HistoryTrade {
  tx_signature: string;
  mint: string;
  token_name: string | null;
  token_logo: string | null;
  transaction_type: 'buy' | 'sell';
  value: number;
  value_usd: number;
  currency: Currency;
  created_at: string;
}

export interface HistoryResponse {
  lifetime_stats: LifetimeStats;
  win_rate_distribution: WinRateBuckets;
  token_overview: TokenOverview[];
  /** One page of trades, newest first. */
  trades: HistoryTrade[];
  profile: TraderProfile;
}

export interface HoldingToken {
  token_address: string | null;
  token_name: string | null;
  symbol: string | null;
  logo: string | null;
  amount: string;
  amount_formatted: string;
  decimals: number | null;
  price_usd: number;
  value_usd: number;
  verified_contract: boolean | null;
  avg_buy_price_usd?: number | null;
  unrealized_pnl_usd?: number | null;
}

export interface HoldingsResponse {
  wallet: string;
  blockchain: Chain;
  profile: TraderProfile;
  active_holdings: {
    tokens: HoldingToken[];
    count: number;
    total_value_usd: number;
    last_updated: string;
    stale: boolean;
    loading: boolean;
  };
}

export interface PnlCalendarDay {
  /** "DD-MM-YY" */
  date: string;
  realized_pnl: number;
  realized_pnl_usd: number;
  buy_txn: number;
  sell_txn: number;
  txn_total: number;
  tokens_traded: number;
  volume: number;
  total_buy: number;
  total_sell: number;
  total_buy_usd: number;
  total_sell_usd: number;
}

export interface PnlCalendarMonth {
  month: number;
  year: number;
  dates: PnlCalendarDay[];
  realized_pnl: number;
  realized_pnl_usd: number;
  volume: number;
  total_buy: number;
  total_buy_usd: number;
  total_sell: number;
  total_sell_usd: number;
  buy_txn: number;
  sell_txn: number;
  txn_total: number;
  tokens_traded: number;
  positive_streak: number;
  negative_streak: number;
  /** Only on the current month. */
  current_positive_streak?: number;
  current_negative_streak?: number;
}

export interface PnlCalendarResponse {
  wallet: string;
  profile: TraderProfile;
  /** Oldest first. */
  months: PnlCalendarMonth[];
  /** Days of the current month. */
  dates: PnlCalendarDay[];
  month: PnlCalendarMonth | null;
}

export interface LeaderboardEntry {
  rank: number;
  wallet: string;
  profile: {
    csid_id: string;
    username: string;
    name: string | null;
    image_url: string | null;
    /** https://x.com/<handle>; `null` for people without X. */
    twitter: string | null;
    /** https://t.me/<name> when Telegram is connected, else an empty string. */
    telegram: string;
    blockchain: Chain;
    currency: Currency;
    wallet_type: 'csid';
    kol: boolean;
    public_trading: boolean;
  };
  period_stats: {
    period: Period;
    total_buy: number;
    total_buy_usd: number;
    total_sell: number;
    total_sell_usd: number;
    total_volume: number;
    total_volume_usd: number;
    realized_pnl: number;
    realized_pnl_usd: number;
    realized_pnl_percentage: number;
    avg_hold_time_minutes: number;
    total_txn: number;
    buy_txn: number;
    sell_txn: number;
  };
  period_win_rate_distribution: { win_count: number; closed_count: number; win_rate_percentage: number };
  period_history_tokens: { total_tokens: number };
}

export interface LeaderboardResponse {
  blockchain: Chain;
  type: 'csid';
  scope: Scope;
  period: Period;
  sort: LeaderboardSort;
  currency: Currency;
  /** The leaderboard paginates inside `data`. */
  pagination: Pagination;
  leaderboard: LeaderboardEntry[];
}

/** Trader summary attached to trades. */
export interface TradeOwner {
  csid_id: string;
  username: string;
  name: string | null;
  image_url: string | null;
  kol: boolean;
}

/** One trade, from /transactions/latest and the live stream. */
export interface Trade {
  signature: string;
  blockchain: Chain;
  wallet: string;
  mint: string;
  transaction_type: 'buy' | 'sell';
  token_symbol: string | null;
  token_name: string | null;
  token_logo: string | null;
  token_amount: number | null;
  value: number;
  value_usd: number;
  currency: Currency;
  timestamp: string;
  trader: TradeOwner | null;
}

// ── OpenID Connect ──────────────────────────────────────────────────────────

/**
 * `thesis` lets your app post theses and replies, react and report in the
 * user's name (Data API writes with `csid_id`, or the public thesis API and
 * the thesis widget with the user's access token).
 */
export type OidcScope = 'openid' | 'profile' | 'wallets' | 'onchain' | 'thesis' | 'offline_access';

export interface XProfileClaim {
  id: string;
  username: string;
  followers: number | null;
  following: number | null;
  posts: number | null;
  listed: number | null;
  verified: boolean | null;
  verified_type: string | null;
  created_at: string | null;
  fetched_at: string;
}

export interface WalletClaim {
  address: string;
  family: string;
  chains: Chain[];
  verified_at: string | null;
}

/**
 * Claims of an ID token or a userinfo response.
 *
 * When the platform is over its plan's user limit, `sub` is an anonymous
 * `anon_…` id, `limited` is true and no profile or wallet data is included.
 */
export interface CabalSpyIDClaims {
  sub: string;
  iss?: string;
  aud?: string;
  azp?: string;
  exp?: number;
  iat?: number;
  auth_time?: number;
  nonce?: string;
  name?: string | null;
  /** X handle; for people without X `tg.<telegram name>` (signed in with Telegram) or `id.<hex>` (signed in with Google). X handles never contain a dot. */
  preferred_username?: string;
  picture?: string | null;
  /** https://id.cabalspy.xyz/u/<username> */
  profile?: string;
  kol_badge?: boolean;
  /**
   * Full X profile, userinfo only (scope `profile`). `null` for people who signed
   * in with Telegram or Google and have not connected X. See hasX().
   */
  x?: XProfileClaim | null;
  /** Verified wallets, userinfo only (scope `wallets`). */
  wallets?: WalletClaim[];
  /** Latest 7-day on-chain volume, userinfo only (scope `onchain`). */
  onchain?: { volume_7d_usd: number; checked_at: string } | null;
  /** A made-up sandbox identity; never trust it in production. */
  sandbox?: boolean;
  /** True when the platform is over its plan's user limit. */
  limited?: boolean;
  reason?: 'plan_user_limit' | string;
  message?: string;
  [claim: string]: unknown;
}

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  /** Seconds. Access and ID tokens live 15 minutes. */
  expires_in: number;
  id_token: string;
  scope: string;
  /** Only with the `offline_access` scope. Rotates on every refresh. */
  refresh_token?: string;
}

export interface DiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  revocation_endpoint: string;
  scopes_supported: string[];
  response_types_supported: string[];
  grant_types_supported: string[];
  id_token_signing_alg_values_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  code_challenge_methods_supported: string[];
  claims_supported: string[];
  [key: string]: unknown;
}

// ── webhooks ────────────────────────────────────────────────────────────────

export type WebhookEventType =
  | 'wallet.verified'
  | 'wallet.removed'
  | 'profile.updated'
  | 'kol.granted'
  | 'consent.revoked'
  | 'thesis.created'
  | 'thesis.reply'
  | 'thesis.reaction'
  | 'webhook.test'
  // white-label (platform users) and trading competitions
  | 'platform_user.created'
  | 'platform_user.claimed'
  | 'platform_user.x_connected'
  | 'wallet.added'
  | 'verification.expired'
  | 'competition.started'
  | 'competition.updated'
  | 'competition.standings'
  | 'competition.ended'
  // callouts (an extra, switched on per instance)
  | 'callout.created'
  | 'callout.milestone'
  | 'callout.scored'
  | 'callout.final';

export interface WebhookEvent<D = Record<string, unknown>> {
  /** Event id; the same on every retry. Dedupe on it. */
  id: string;
  type: WebhookEventType | string;
  created_at: string;
  sandbox: boolean;
  /** Always carries `sub` (the user's CabalSpy ID), except for webhook.test. */
  data: D & { sub?: string };
}

/** `data` of a `thesis.created` webhook: one of your users posted a thesis. */
export interface ThesisCreatedData {
  sub: string;
  thesis: Thesis;
}

/** `data` of a `thesis.reply` webhook: one of your users replied to a thesis. */
export interface ThesisReplyData {
  sub: string;
  reply: Thesis;
}

/** `data` of a `thesis.reaction` webhook: one of your users added or removed a reaction. */
export interface ThesisReactionData {
  sub: string;
  thesis_id: string;
  chain: Chain;
  mint: string;
  emoji: ThesisEmoji | string;
  /** true: added, false: removed. */
  on: boolean;
  /** The new counts. */
  reactions: Partial<Record<ThesisEmoji | string, number>>;
}

/**
 * Added by the server to every per-user webhook about one of YOUR platform users
 * (white-label): your own user id and their CabalSpy ID.
 */
export interface PlatformUserWebhookRef {
  /** Your user id on your platform, as passed on create or import. */
  external_id: string;
  /** The user's CabalSpy ID (same as `sub`). */
  csid_id: string;
}

/** `data` of a `platform_user.created` webhook: a platform user was created (API, import or inbound URL). */
export interface PlatformUserCreatedData extends PlatformUserWebhookRef {
  sub: string;
  wallets: { address: string; family: WalletFamily; chains: Chain[] }[];
}

/** `data` of a `platform_user.claimed` webhook: the person took their account into their own CabalSpy ID. */
export interface PlatformUserClaimedData extends PlatformUserWebhookRef {
  /** The person's own CabalSpy ID; their csid_id changes to this. */
  sub: string;
  previous_csid_id: string;
  /** Payment-verified wallets that moved to the person's account. */
  wallets_moved: number;
}

/** `data` of a `platform_user.x_connected` webhook. */
export interface PlatformUserXConnectedData extends PlatformUserWebhookRef {
  sub: string;
  x: { id: string; username: string | null; name: string | null };
}

/** `data` of a `wallet.added` webhook: wallets submitted by the platform (not payment-verified). */
export interface WalletAddedData extends PlatformWalletAdded, PlatformUserWebhookRef {
  sub: string;
  verified: false;
}

/** `data` of a `verification.expired` webhook: a platform-started verification ended without payment. */
export interface VerificationExpiredData extends PlatformUserWebhookRef {
  sub: string;
  verification_id: string;
  address: string;
  chain: Chain;
  family: WalletFamily;
}

/** `data` of a `competition.started` webhook (instance level, no `sub`). */
export interface CompetitionStartedData {
  competition_id: string;
  name: string;
  started_at: string;
  ends_at: string;
  participants: number;
}

/** `data` of a `competition.updated` webhook: a rule changed (also while running). */
export interface CompetitionUpdatedData {
  competition_id: string;
  rules_version: number;
  /** The phase the change happened in. */
  during: CompetitionStatus;
  changes: CompetitionFieldChanges;
  note: string | null;
}

/** `data` of a `competition.standings` webhook, every 5 minutes while running. */
export interface CompetitionStandingsData {
  competition_id: string;
  metric: CompetitionMetric;
  /** The top 20 ranked traders. */
  top: CompetitionStanding[];
}

/**
 * `data` of a `competition.ended` webhook. A cancelled competition sends only
 * `competition_id`, `cancelled: true` and empty `results`.
 */
export interface CompetitionEndedData {
  competition_id: string;
  cancelled: boolean;
  /** The top 100 ranked traders (final). Empty when cancelled. */
  results: CompetitionStanding[];
  name?: string;
  ended_at?: string;
  metric?: CompetitionMetric;
}

/** `data` of a `callout.created` webhook (instance level, no `sub`): one of your users called a token. */
export interface CalloutCreatedData {
  callout: Callout;
}

/** `data` of a `callout.milestone` webhook: a callout reached a new peak multiple (2, 3, 5, 10, 20, 50, 100). */
export interface CalloutMilestoneData {
  callout: Callout;
  /** The milestone reached; each one is announced once per callout. */
  milestone_x: number;
}

/** `data` of a `callout.scored` webhook: the first 24 hours were scored (on candles, or live numbers without them). */
export interface CalloutScoredData {
  callout: Callout & { first_day: CalloutFirstDay };
}

/**
 * `data` of a `callout.final` webhook: tracking stopped because the token was
 * inactive (market cap below $10k for 24 hours in a row). The score is final.
 */
export interface CalloutFinalData {
  callout: Callout;
}

/** `data` of every webhook type the SDK knows the shape of. */
export interface WebhookEventDataMap {
  'thesis.created': ThesisCreatedData;
  'thesis.reply': ThesisReplyData;
  'thesis.reaction': ThesisReactionData;
  'platform_user.created': PlatformUserCreatedData;
  'platform_user.claimed': PlatformUserClaimedData;
  'platform_user.x_connected': PlatformUserXConnectedData;
  'wallet.added': WalletAddedData;
  'verification.expired': VerificationExpiredData;
  'competition.started': CompetitionStartedData;
  'competition.updated': CompetitionUpdatedData;
  'competition.standings': CompetitionStandingsData;
  'competition.ended': CompetitionEndedData;
  'callout.created': CalloutCreatedData;
  'callout.milestone': CalloutMilestoneData;
  'callout.scored': CalloutScoredData;
  'callout.final': CalloutFinalData;
}

/** A webhook event of type K with its typed `data`. */
export type TypedWebhookEvent<K extends keyof WebhookEventDataMap = keyof WebhookEventDataMap> = {
  [T in K]: WebhookEvent<WebhookEventDataMap[T]> & { type: T };
}[K];

// ── white-label: platform users ─────────────────────────────────────────────
//
// A platform that keeps its own login manages ITS users by its own user id
// (`external_id`, 1-128 printable ASCII characters without spaces).

/** Most users per `POST /v1/platform-users/import` call. */
export const PLATFORM_IMPORT_MAX = 1000;
/** Most wallets per request (create, import item, wallets/add). */
export const PLATFORM_MAX_WALLETS_PER_REQUEST = 10;
/** Wallet trust settings: count every wallet, or only payment-verified ones. */
export const WALLET_TRUST = ['all', 'verified_only'] as const;
export type WalletTrust = (typeof WALLET_TRUST)[number];
/** `csid`: part of the CabalSpy ID network (default); `platform`: only the platform sees its users. */
export const DATA_SCOPES = ['csid', 'platform'] as const;
export type DataScope = (typeof DATA_SCOPES)[number];
/** Payload formats the inbound URL understands. */
export const INBOUND_FORMATS = ['csid', 'privy', 'dynamic', 'generic'] as const;
export type InboundFormat = (typeof INBOUND_FORMATS)[number];

export type WalletFamily = 'solana' | 'evm';

/**
 * A wallet to import: an address string, or an object. Default chains:
 * `solana` for a Solana address, every enabled EVM chain for an EVM address.
 * `source` (1-40 of a-z 0-9 _ . -) records where it came from, e.g. "privy".
 */
export type PlatformWalletInput = string | { address: string; chains?: Chain | Chain[]; source?: string };

/** One user for create / import. Every new user needs at least one wallet (at most 10 per request). */
export interface PlatformUserInput {
  external_id: string;
  wallets?: PlatformWalletInput[];
  /** 1-60 characters, or null to clear. */
  display_name?: string | null;
  /** An https URL (max 500 characters), or null to clear. */
  avatar_url?: string | null;
}

/**
 * Trust status of a platform user's wallet:
 * - `verified`: payment-verified (on `verified_chains`)
 * - `active`: unverified, counts (tracking, data, leaderboard if allowed)
 * - `needs_verification`: unverified, the instance only counts verified wallets
 * - `verified_elsewhere`: unverified, another account verified this address
 * - `pending`: only a verification was started, nothing counts yet
 */
export type PlatformWalletStatus = 'verified' | 'active' | 'needs_verification' | 'verified_elsewhere' | 'pending';

export interface PlatformWallet {
  address: string;
  family: WalletFamily;
  chains: Chain[];
  verified: boolean;
  verified_chains: Chain[];
  status: PlatformWalletStatus;
  /** Whether the wallet counts for tracking, data and leaderboards. */
  counts: boolean;
  source: string | null;
  verified_at: string | null;
  added_at: string;
}

/** A wallet or chain that was new in a create / import / wallets/add call. */
export interface PlatformWalletAdded {
  address: string;
  family: WalletFamily;
  /** Only the chains that were new. */
  chains: Chain[];
  source: string | null;
}

export type WalletVerificationStatus = 'pending' | 'verified' | 'cancelled' | 'expired';

/** A payment verification of a wallet (the same flow as on id.cabalspy.xyz). */
export interface WalletVerification {
  verification_id: string;
  status: WalletVerificationStatus;
  chain: Chain;
  chain_name: string;
  /** The wallet being verified (the sender of the payment). */
  address: string;
  /** Amount to send, formatted, e.g. "0.000123456". */
  amount: string;
  /** Amount in base units (lamports / wei) as a string. */
  amount_base: string;
  currency: string;
  decimals: number;
  receiver: string;
  expires_at: string;
  /** 0 unless pending. */
  seconds_left: number;
  /** `solana:<receiver>?amount=…` or `ethereum:<receiver>@<chainId>?value=…` (EIP-681). */
  payment_uri: string;
  evm_chain_id: number | null;
  /** Ready-to-show English instructions. */
  instructions: string;
  tx_hash: string | null;
  explorer_url: string | null;
  created_at: string;
  /** Your user's id; included on every verification endpoint. */
  external_id?: string;
}

/** A platform user (no trading data; see `platformUserProfile()`). */
export interface PlatformUser {
  csid_id: string;
  external_id: string;
  /** The person took the account into their own CabalSpy ID: they manage it themselves now. */
  claimed: boolean;
  claimed_at: string | null;
  managed: boolean;
  display_name: string | null;
  avatar_url: string | null;
  /** Beyond the plan's user limit: no data until the platform upgrades. */
  limited: boolean;
  x: {
    id: string;
    username: string;
    name: string | null;
    avatar_url: string | null;
    followers: number | null;
    following: number | null;
    verified: boolean | null;
    verified_type: string | null;
    created_at: string | null;
    url: string;
  } | null;
  telegram: { username: string | null; name: string | null; linked_at: string | null } | null;
  kol: { badge: boolean; since: string | null };
  wallets: PlatformWallet[];
  pending_verifications: WalletVerification[];
  created_at: string;
}

/** Result of `POST /v1/platform-users` (create or update). */
export interface PlatformUserUpsertResult extends PlatformUser {
  /** true: new user (HTTP 201); false: existing user updated (HTTP 200). */
  created: boolean;
  wallets_added: PlatformWalletAdded[];
}

export type PlatformImportStatus = 'created' | 'updated' | 'unchanged' | 'rejected';

export interface PlatformImportItemResult {
  external_id: string | null;
  status: PlatformImportStatus;
  /** Not on rejected items. */
  csid_id?: string;
  wallets_added?: PlatformWalletAdded[];
  /** Only on rejected items, e.g. `plan_user_limit`, `wallet_required`, `invalid_address`, `rate_limited`. */
  error?: { code: string; message: string };
}

export interface PlatformImportSummary {
  created: number;
  updated: number;
  unchanged: number;
  rejected: number;
}

/** Result of `POST /v1/platform-users/import`; `results` are in input order. */
export interface PlatformImportResult {
  summary: PlatformImportSummary;
  results: PlatformImportItemResult[];
}

export interface PlatformWalletsAddResult {
  external_id: string;
  wallets_added: PlatformWalletAdded[];
  /** Every wallet of the user, after the change. */
  wallets: PlatformWallet[];
}

export interface PlatformUserDeleteResult {
  external_id: string;
  /** false for a claimed user: only the link to your platform was removed, the person keeps their account. */
  deleted: boolean;
  unlinked: boolean;
}

export interface PlatformWalletDeleteResult {
  external_id: string;
  address: string;
  removed: true;
}

/** Instance settings for platform users. */
export interface PlatformSettings {
  /** The instance's name. */
  name: string;
  white_label: boolean;
  data_scope: DataScope;
  /** Same as `data_scope === 'csid'`. */
  network_sharing: boolean;
  wallet_trust: WalletTrust;
  leaderboard_trust: WalletTrust;
  /** Default: on unless `white_label` is on. */
  claim_links: boolean;
  telegram_alerts: boolean;
  inbound: { enabled: boolean; last_event_at: string | null };
}

/** Settings to change; only what you pass changes. */
export interface PlatformSettingsUpdate {
  white_label?: boolean;
  data_scope?: DataScope;
  /** Same as `data_scope` (`true` = `csid`). */
  network_sharing?: boolean;
  wallet_trust?: WalletTrust;
  leaderboard_trust?: WalletTrust;
  claim_links?: boolean;
  telegram_alerts?: boolean;
}

export interface InboundStatus {
  enabled: boolean;
  last_event_at: string | null;
  formats: InboundFormat[];
}

export interface InboundEnabled {
  enabled: true;
  /** The secret inbound URL. Shown once; enabling again replaces it. */
  url: string;
  note: string;
}

/**
 * The SDK's own payload for the inbound URL (`format: csid`). Provider payloads
 * (Privy, Dynamic, generic) are understood as well: the user id is taken from
 * `user.id` / `data.userId` / `userId` / `data.id`, the wallets from every
 * address field. An event name containing "delet" (not "wallet") deletes the user.
 */
export interface InboundEvent {
  event: 'user.created' | 'user.updated' | 'wallet.added' | 'user.deleted' | string;
  external_id: string;
  wallets?: PlatformWalletInput[];
  display_name?: string | null;
  avatar_url?: string | null;
}

/** Response of the inbound URL. Business errors come back as `accepted: false` (HTTP 200). */
export type InboundEventResult =
  | {
      accepted: true;
      result: 'created' | 'updated';
      external_id: string;
      csid_id: string;
      wallets_added: PlatformWalletAdded[];
    }
  | { accepted: true; result: 'deleted'; external_id: string; deleted: boolean; unlinked: boolean }
  | {
      accepted: true;
      result: 'wallets_removed';
      external_id: string;
      wallets_removed: string[];
      /** Kept wallets, e.g. code `last_wallet` or `wallet_not_found`. */
      wallets_not_removed: { address: string; code: string }[];
    }
  | { accepted: true; result: 'ignored'; external_id: string; note: string }
  | { accepted: true; result: 'unknown_user' | 'waiting_for_wallet'; external_id: string }
  | { accepted: false; error: { code: string; message: string } };

/** 15-minute token for the embeddable verify widget. */
export interface PlatformUserSession {
  external_id: string;
  client_id: string;
  /** `pvs_…` */
  session: string;
  expires_at: string;
  /** Seconds (900). */
  expires_in: number;
}

/** A 24-hour link the person opens to take the account into their own CabalSpy ID. */
export interface PlatformClaimLink {
  external_id: string;
  url: string;
  expires_at: string;
}

/** Send the person to `authorize_url` (valid 10 minutes) to connect X. */
export interface PlatformXConnect {
  external_id: string;
  authorize_url: string;
  expires_at: string;
}

export interface PlatformXDisconnect {
  external_id: string;
  disconnected: boolean;
}

/** The person opens `deep_link` (t.me) to connect Telegram. */
export interface PlatformTelegramLink {
  external_id: string;
  code: string;
  deep_link: string;
  expires_at: string | null;
}

export interface PlatformTelegramStatus {
  external_id: string;
  linked: boolean;
  username: string | null;
  linked_at: string | null;
}

export interface PlatformTelegramUnlink {
  external_id: string;
  linked: false;
}

export interface PlatformKolStatus {
  external_id: string;
  badge: boolean;
  eligible: boolean;
  /** The KOL criteria and whether each is met. */
  criteria: Record<string, unknown>[];
  volume_7d_usd: number | null;
  /** When the next on-chain volume check may be requested. */
  volume_check_next_at: string | null;
  application: { status: string; applied_at: string | null; reviewed_at: string | null } | null;
}

export interface PlatformKolVolumeCheck {
  external_id: string;
  queued: true;
}

export interface PlatformKolApply {
  external_id: string;
  application: 'pending';
}

/** Per-wallet numbers on a platform user's profile. */
export type PlatformProfileWalletStats = LeaderboardEntry['period_stats'] & {
  address: string;
  verified: boolean;
  win_rate_percentage: number;
};

/** Trading on one chain, summed over the user's wallets that count. */
export interface PlatformProfileTrading {
  blockchain: Chain;
  currency: Currency;
  period: Period;
  total_buy: number;
  total_buy_usd: number;
  total_sell: number;
  total_sell_usd: number;
  total_volume: number;
  total_volume_usd: number;
  realized_pnl: number;
  realized_pnl_usd: number;
  total_txn: number;
  buy_txn: number;
  sell_txn: number;
  win_count: number;
  closed_count: number;
  win_rate_percentage: number;
  tokens: number;
  wallets: PlatformProfileWalletStats[];
}

/** Everything for a profile page in one call (`GET /v1/platform-users/profile`). */
export interface PlatformUserProfile extends Omit<PlatformUser, 'kol'> {
  period: Period;
  trading: PlatformProfileTrading[];
  /** The 20 newest trades (without the trader block). */
  recent_trades: Omit<Trade, 'trader'>[];
  theses: { total: number; latest: Thesis[] };
  trade_feed: { traders: number; in_trade_feeds: number };
  kol: {
    badge: boolean;
    since: string | null;
    application: { status: string; applied_at: string | null; note: string | null } | null;
  };
  /** Data API paths for each wallet that counts. */
  links: { blockchain: Chain; address: string; tracker: string; history: string; holdings: string; pnl_calendar: string }[];
}

export interface PlatformLeaderboardEntry extends Omit<LeaderboardEntry, 'profile'> {
  profile: LeaderboardEntry['profile'] & { profile_url: null };
  /** Your user's id. */
  external_id: string | null;
  /** Whether this wallet is payment-verified on the chain. */
  verified: boolean;
}

/** Leaderboard of your own platform users. Pagination is in the envelope (`*Raw`). */
export interface PlatformLeaderboardResponse {
  blockchain: Chain;
  period: Period;
  sort: LeaderboardSort;
  currency: Currency;
  /** `verified` when the instance or the request only counts payment-verified wallets. */
  trust: 'all' | 'verified';
  leaderboard: PlatformLeaderboardEntry[];
}

// ── competitions (trading and callouts) ─────────────────────────────────────

/** `trading`: ranked on trades (default). `callouts`: ranked on callouts (needs the callouts extra). */
export const COMPETITION_KINDS = ['trading', 'callouts'] as const;
export type CompetitionKind = (typeof COMPETITION_KINDS)[number];

/** Metrics of trading competitions. */
export const COMPETITION_METRICS = ['pnl_usd', 'pnl', 'volume_usd', 'volume', 'trades', 'win_rate'] as const;
export type TradingCompetitionMetric = (typeof COMPETITION_METRICS)[number];

/** Metrics of callout competitions (each callout scored by its peak multiple, `score_x`). */
export const CALLOUT_COMPETITION_METRICS = ['avg_peak_x', 'best_peak_x', 'sum_peak_x', 'hit_rate', 'callouts'] as const;
export type CalloutCompetitionMetric = (typeof CALLOUT_COMPETITION_METRICS)[number];

export type CompetitionMetric = TradingCompetitionMetric | CalloutCompetitionMetric;

/** scheduled -> waiting (start time passed, not enough participants) -> running -> ended / cancelled */
export const COMPETITION_STATUSES = ['scheduled', 'waiting', 'running', 'ended', 'cancelled'] as const;
export type CompetitionStatus = (typeof COMPETITION_STATUSES)[number];

/** `opt_in`: users join one by one; `all_users`: every platform user takes part. */
export type CompetitionEnrollment = 'opt_in' | 'all_users';

/** At most this many competitions per developer account at a time (scheduled + running). */
export const MAX_OPEN_COMPETITIONS = 5;

/** Recorded rule changes: field -> { from, to } (duration as `duration_hours`). */
export type CompetitionFieldChanges = Record<string, { from: unknown; to: unknown }>;

export interface CompetitionChange {
  rules_version: number;
  changed_at: string;
  during: CompetitionStatus;
  changes: CompetitionFieldChanges;
  note: string | null;
}

export interface Competition {
  id: string;
  name: string;
  description: string | null;
  /** `trading` or `callouts`; cannot change after creation. */
  kind: CompetitionKind;
  /** `all` (every chain) only in callout competitions. */
  chain: Chain | 'all';
  /** e.g. "Solana", or "All chains". */
  chain_name: string;
  metric: CompetitionMetric;
  wallet_trust: WalletTrust;
  enrollment: CompetitionEnrollment;
  status: CompetitionStatus;
  starts_at: string | null;
  duration_hours: number;
  started_at: string | null;
  ends_at: string | null;
  ended_at: string | null;
  min_participants: number;
  max_participants: number | null;
  participants: number;
  /** Trading competitions only. */
  min_trades?: number;
  /** Trading competitions only. */
  min_volume_usd?: number;
  /** Callout competitions only: callouts needed to be ranked (0 and 1 both mean at least one). */
  min_callouts?: number;
  /** Callout competitions only: the multiple that counts as a hit for `hit_rate`. */
  hit_x?: number;
  late_join: boolean;
  /** Whatever you passed (any JSON, max 5000 characters). */
  prizes: unknown;
  rules_version: number;
  standings_updated_at: string | null;
  created_at: string;
  updated_at: string;
  /** Detail, create, update and cancel only: every rule change. */
  changes?: CompetitionChange[];
  changed_while_running?: boolean;
}

export interface CompetitionParticipant {
  external_id: string | null;
  csid_id: string;
  joined_at: string;
}

export interface CompetitionStandingBase {
  /** null: below the minimums (listed, not ranked). */
  rank: number | null;
  ranked: boolean;
  external_id: string | null;
  csid_id: string;
  /** The value of the competition's metric. */
  score: number;
}

/** Stats of a participant in a trading competition. */
export interface TradingCompetitionStats {
  pnl: number;
  pnl_usd: number;
  volume: number;
  volume_usd: number;
  trades: number;
  buys: number;
  sells: number;
  win_count: number;
  closed_count: number;
  win_rate: number;
  tokens: number;
  /** Wallets that count on the competition's chain. */
  wallets: number;
}

/** Stats of a participant in a callout competition: their callouts during the competition. */
export interface CalloutCompetitionStats extends CalloutSummary {
  /** The participant's callout with the highest peak multiple; null without callouts. */
  best_call: CalloutBestCall | null;
}

export type TradingCompetitionStanding = CompetitionStandingBase & TradingCompetitionStats;
export type CalloutCompetitionStanding = CompetitionStandingBase & CalloutCompetitionStats;

/**
 * One row of the standings. Trading competitions fill the trading stats,
 * callout competitions the callout stats (check `Competition.kind`, or narrow
 * with `TradingCompetitionStanding` / `CalloutCompetitionStanding`).
 */
export type CompetitionStanding = CompetitionStandingBase & Partial<TradingCompetitionStats> & Partial<CalloutCompetitionStats>;

/** Standings: ranked first, then the unranked. Pagination (offset) is in the envelope. */
export interface CompetitionStandingsResponse {
  competition_id: string;
  status: CompetitionStatus;
  metric: CompetitionMetric;
  rules_version: number;
  /** When the standings were computed (every 5 minutes while running). */
  updated_at: string | null;
  /** true once the competition ended: these are the results. */
  final: boolean;
  standings: CompetitionStanding[];
}

export interface CompetitionJoinResult {
  competition_id: string;
  external_id: string;
  joined: true;
  /** true when the user was already a participant (HTTP 200 instead of 201). */
  already: boolean;
}

export interface CompetitionLeaveResult {
  competition_id: string;
  external_id: string;
  /** false when the user was not a participant. */
  left: boolean;
}

// ── token theses ────────────────────────────────────────────────────────────

export type ThesisStance = 'bull' | 'bear';
export type ThesisSort = 'new' | 'top';

/** Reactions: `like` plus a fixed emoji set. */
export const THESIS_EMOJIS = ['like', '🔥', '🚀', '💎', '👀', '😂', '🤝', '💀', '🐂', '🐻'] as const;
export type ThesisEmoji = (typeof THESIS_EMOJIS)[number];

export const THESIS_REPORT_REASONS = ['spam', 'scam', 'abuse', 'impersonation', 'other'] as const;
export type ThesisReportReason = (typeof THESIS_REPORT_REASONS)[number];

/** Maximum thesis / reply length in characters. */
export const THESIS_MAX_BODY = 1000;

export interface ThesisAuthor {
  csid_id: string;
  /** X handle; for people without X `tg.<telegram name>` (signed in with Telegram) or `id.<hex>` (signed in with Google). X handles never contain a dot. */
  username: string | null;
  name: string | null;
  image_url: string | null;
  kol_badge: boolean;
  profile_url: string | null;
}

export interface ThesisPnl {
  invested_usd: number;
  realized_usd: number;
  holding_value_usd: number | null;
  pnl_usd: number | null;
  pnl_percent: number | null;
}

/** The author's real position in the token, when they show their trading publicly. */
export interface ThesisPositionPublic {
  /** What was bought and sold when the thesis was posted. */
  at_post: ThesisPnl & { tokens_held: number | null; first_buy: string | null };
  /** Live: PnL now, and whether the author still holds or sold. */
  now: (ThesisPnl & { tokens_held: number; status: 'holding' | 'sold' }) | null;
}

/** The author keeps their trading private: only that they hold the token. */
export interface ThesisPositionPrivate {
  private: true;
}

export type ThesisPosition = ThesisPositionPublic | ThesisPositionPrivate;

/** Who reacted recently (newest first). */
export interface ThesisReactor {
  emoji: ThesisEmoji | string;
  csid_id: string;
  username: string | null;
  at: string;
}

/** A thesis (`kind: 'thesis'`) or a reply to one (`kind: 'reply'`). */
export interface Thesis {
  id: string;
  chain: Chain;
  mint: string;
  kind: 'thesis' | 'reply';
  /** The thesis a reply belongs to. */
  parent_id: string | null;
  body: string;
  stance: ThesisStance | null;
  author: ThesisAuthor;
  likes: number;
  replies: number;
  /** Count per reaction, e.g. { like: 3, '🚀': 1 }. */
  reactions: Partial<Record<ThesisEmoji | string, number>>;
  /** The latest reactions with who reacted, newest first. */
  reacted_by: ThesisReactor[];
  /** The viewer's own reactions (pass `csid_id` / an access token to get them). */
  my_reactions: string[];
  /** Name of the app it was posted through. */
  via: string | null;
  created_at: string;
  is_mine: boolean;
  /** Theses only (not replies). */
  position?: ThesisPosition;
  /** Theses only: a preview of the newest replies, oldest first. */
  latest_replies?: Thesis[];
}

export interface ThesisToken {
  chain: Chain;
  mint: string;
  name: string | null;
  symbol: string | null;
  logo: string | null;
  price_usd: number | null;
}

export interface ThesisCounts {
  theses: number;
  bull: number;
  bear: number;
  authors: number;
}

export interface ThesisSummary extends ThesisCounts {
  token: ThesisToken;
}

export interface ThesisEligibility {
  /** Holders only: one of the user's verified wallets bought and still holds the token. */
  can_post: boolean;
  can_reply: boolean;
  holder: boolean | null;
  /** Posting paused after several hidden posts. */
  paused: boolean;
  /** Data API: why the user can't write for your app (consent_required, plan_user_limit, sandbox_user). */
  reason?: string;
}

/** Moderation notification kinds. */
export type ThesisNotificationKind =
  | 'post_hidden'
  | 'paused'
  | 'banned'
  | 'post_removed'
  | 'post_restored'
  | 'appeal_accepted'
  | 'appeal_rejected'
  | 'reporting_paused';

/** A moderation notification (warning, hidden post, pause, appeal result …). */
export interface ThesisNotification {
  id: number;
  kind: ThesisNotificationKind | string;
  /** Ready-to-show English text. */
  text: string;
  /** Details, e.g. thesis_id, until, note. */
  data: Record<string, unknown>;
  created_at: string;
  read: boolean;
  /** Can be appealed (within 30 days). */
  appealable: boolean;
  /** Appeal status when appealed: pending | accepted | rejected; null otherwise. */
  appeal: 'pending' | 'accepted' | 'rejected' | string | null;
}

export interface ThesisNotifications {
  unread: number;
  items: ThesisNotification[];
}

/** Unread moderation notices of the signed-in user (public API `me()`). */
export interface ThesisNotices {
  unread: number;
  /** Text of the newest notice when there are unread ones. */
  latest: string | null;
  /** Where the user reads all notices on id.cabalspy.xyz. */
  url: string;
}

export interface ThesisReactions {
  id: string;
  reactions: Partial<Record<ThesisEmoji | string, number>>;
}

/** Stream / live payload of a new thesis or reply. */
export type ThesisLiveItem = Thesis & { blockchain?: Chain };
/** Stream / live payload of a removed (deleted or hidden) post. */
export interface ThesisRemoved {
  id: string;
  blockchain?: Chain;
  mint?: string;
}
/** Stream / live payload of changed reaction counts. */
export type ThesisReactionUpdate = ThesisReactions & { blockchain?: Chain; mint?: string };

// ── callouts (an extra, switched on per instance on request) ────────────────
//
// A user calls a token; its price and market cap are stamped and tracked: every
// minute for the first 24 hours (then that day is scored on candles), after that
// every 5 minutes while the token is active. Tracking stops after 24 hours in a
// row below a $10k market cap.

/** Callout statuses you can see (removed callouts leave every list). */
export type CalloutStatus = 'tracking' | 'final';

/** `first_day`: read every minute; `extended`: every 5 minutes; `stopped`: no longer tracked. */
export type CalloutTrackingPhase = 'first_day' | 'extended' | 'stopped';

/** `inactive`: market cap below $10k for 24 hours in a row; `no_price`: the token lost its market price. */
export type CalloutStopReason = 'inactive' | 'no_price';

/** Milestones announced once each (`callout.milestone`). */
export const CALLOUT_MILESTONES = [2, 3, 5, 10, 20, 50, 100] as const;

/** Longest callout note, in characters (at most one link). */
export const CALLOUT_MAX_NOTE = 280;

/** Below this market cap (USD) for 24 hours in a row, after the first day, tracking stops. */
export const CALLOUT_ACTIVE_MCAP_USD = 10_000;

/** Sort orders of the callers leaderboard. */
export const CALLOUT_LEADERBOARD_SORTS = ['avg_peak_x', 'best_peak_x', 'sum_peak_x', 'hit_rate', 'callouts', 'median_peak_x'] as const;
export type CalloutLeaderboardSort = (typeof CALLOUT_LEADERBOARD_SORTS)[number];

/** Who may make callouts on your platform. */
export const CALLOUT_WHO = ['all', 'kol_only'] as const;
export type CalloutWho = (typeof CALLOUT_WHO)[number];

/** A caller (author of callouts), as shown on callouts, stats and the leaderboard. */
export interface CalloutUser {
  csid_id: string;
  /** Your user id, for platform users (white-label); else null. */
  external_id: string | null;
  name: string | null;
  username: string | null;
  avatar_url: string | null;
  /** Has the KOL badge. */
  kol: boolean;
}

/** The author of a callout; only `csid_id` when the profile could not be loaded. */
export type CalloutAuthor = Pick<CalloutUser, 'csid_id'> & Partial<Omit<CalloutUser, 'csid_id'>>;

export interface CalloutToken {
  name: string | null;
  symbol: string | null;
  logo: string | null;
}

/** The first 24 hours, scored once they are over. */
export interface CalloutFirstDay {
  /** `candles`: scored on price candles; `live`: no candles, the live numbers stand. */
  kind: 'candles' | 'live';
  /** The entry: the candle close right before the call, or the quote at the call. */
  entry_price_usd: number;
  /** Highest high of the first day against the entry (candles only). */
  peak_x: number | null;
  /** Last close of the first day against the entry (candles only). */
  close_x: number | null;
  minutes_to_peak: number | null;
  /** e.g. STALE_ENTRY, NO_TRADES_AFTER, NO_TRADES_LAST_6H, EXTREME_MULTIPLE, CANDLES_UNAVAILABLE, NO_CANDLES_NO_DATA. */
  flags: string[];
}

export interface CalloutTracking {
  /** true while the callout is tracked. */
  active: boolean;
  phase: CalloutTrackingPhase;
  /** Next daily candle check (after the first day, while tracking). */
  next_check_at: string | null;
  /** Since when the market cap is below $10k (after the first day, while tracking); null when it is not. */
  below_10k_since: string | null;
  /** Daily candle checks done after the first day. */
  daily_checks: number;
  stopped_at: string | null;
  stop_reason: CalloutStopReason | null;
}

/** A callout: one user calling one token, with the numbers at the call, now and at the peak. */
export interface Callout {
  id: string;
  chain: Chain;
  mint: string;
  token: CalloutToken;
  author: CalloutAuthor;
  note: string | null;
  called_at: string;
  /** End of the first 24 hours. */
  window_ends_at: string;
  status: CalloutStatus;
  /** Stamped at the call. */
  at_call: { price_usd: number; market_cap_usd: number | null };
  /** The latest read; `x` = now against the entry. */
  now: { price_usd: number | null; market_cap_usd: number | null; x: number | null; at: string | null };
  /** The highest price since the call; `x` = peak against the entry. */
  peak: { price_usd: number; market_cap_usd: number | null; x: number | null; at: string | null };
  /** The callout's score: the peak multiple since the call. */
  score_x: number | null;
  /** Market data provider of the numbers. */
  source: string | null;
  tracking: CalloutTracking;
  /** Present once the first 24 hours are scored. */
  first_day?: CalloutFirstDay;
}

/** Result of `POST /v1/callouts/remove`. */
export interface CalloutRemoveResult {
  id: string;
  removed: true;
}

/** Average, median, best and hit rate of a set of callouts (by peak multiple). */
export interface CalloutSummary {
  callouts: number;
  avg_peak_x: number | null;
  median_peak_x: number | null;
  best_peak_x: number | null;
  sum_peak_x: number;
  /** Callouts that reached `hit_x`. */
  hits: number;
  /** Share of hits in percent (0-100). */
  hit_rate: number;
}

/** Stats of the callouts made in one period. */
export interface CalloutPeriodStats extends CalloutSummary {
  /** Average multiple right now. */
  avg_now_x: number | null;
  /** Callouts still tracked. */
  tracking: number;
}

/** `GET /v1/callouts/stats`: one user's callouts per period (made in the last 6h / 1d / 7d / 30d). */
export interface CalloutStats {
  user: CalloutUser | null;
  hit_x: number;
  periods: Record<Period, CalloutPeriodStats>;
  callouts_all_time: number;
}

/** A caller's best callout (highest peak multiple). */
export interface CalloutBestCall {
  id: string;
  chain: Chain;
  mint: string;
  symbol: string | null;
  peak_x: number | null;
}

export interface CalloutLeaderboardEntry extends CalloutSummary {
  rank: number;
  csid_id: string;
  author: CalloutUser | null;
  best_call: CalloutBestCall;
}

/** `GET /v1/callouts/leaderboard`. Pagination is in the envelope (`*Raw`). */
export interface CalloutLeaderboardResponse {
  period: Period;
  chain: Chain | null;
  sort: CalloutLeaderboardSort;
  hit_x: number;
  leaderboard: CalloutLeaderboardEntry[];
}

/** Your instance's callout rules. */
export interface CalloutSettings {
  /** Default: all */
  who: CalloutWho;
  /** Only holders of the token may call it. Default: true */
  require_holding: boolean;
  /** Minutes between two callouts of one user, 0-10080. Default: 360 */
  cooldown_minutes: number;
}

/** Settings to change; only what you pass changes. */
export type CalloutSettingsUpdate = Partial<CalloutSettings>;

// stream payloads

/** Stream: a new read of a tracked callout (no milestone reached). */
export interface CalloutUpdate {
  id: string;
  chain: Chain;
  mint: string;
  price_usd: number;
  market_cap_usd: number | null;
  /** Now against the entry. */
  x: number | null;
  /** The score so far. */
  peak_x: number;
}

/** Stream: a callout reached a milestone (the callout plus `milestone_x`). */
export type CalloutMilestone = Callout & { milestone_x: number };

/** Stream: a callout was taken down by the platform. */
export interface CalloutRemoved {
  id: string;
  chain: Chain;
  mint: string;
}
