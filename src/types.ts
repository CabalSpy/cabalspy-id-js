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
  | 'thesis.created'
  | 'thesis.reply'
  | 'thesis.reaction'
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
