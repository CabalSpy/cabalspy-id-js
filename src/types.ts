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
}

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
  username: string;
  name: string | null;
  image_url: string | null;
  bio: string | null;
  twitter: string;
  x: {
    id: string;
    followers: number | null;
    following: number | null;
    verified: boolean | null;
    verified_type: string | null;
  };
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
  username: string;
  name: string | null;
  image_url: string | null;
  twitter: string;
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
    twitter: string;
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

export type OidcScope = 'openid' | 'profile' | 'wallets' | 'onchain' | 'offline_access';

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
  preferred_username?: string;
  picture?: string | null;
  /** https://id.cabalspy.xyz/u/<username> */
  profile?: string;
  kol_badge?: boolean;
  /** Full X profile, userinfo only (scope `profile`). */
  x?: XProfileClaim;
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
  | 'webhook.test';

export interface WebhookEvent<D = Record<string, unknown>> {
  /** Event id; the same on every retry. Dedupe on it. */
  id: string;
  type: WebhookEventType | string;
  created_at: string;
  sandbox: boolean;
  /** Always carries `sub` (the user's CabalSpy ID), except for webhook.test. */
  data: D & { sub?: string };
}
