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
 *
 * `trade_feed` lets your app manage the user's Trade Feed (add and remove
 * traders, read the feed and its notifications, the Trade Feed widgets) and
 * makes them a recipient of `trade_feed.*` webhooks and stream events.
 */
export type OidcScope = 'openid' | 'profile' | 'wallets' | 'onchain' | 'thesis' | 'trade_feed' | 'offline_access';

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
  | 'trade_feed.trade'
  | 'trade_feed.thesis'
  | 'webhook.test';

export interface WebhookEvent<D = Record<string, unknown>> {
  /** Event id; the same on every retry. Dedupe on it. */
  id: string;
  type: WebhookEventType | string;
  created_at: string;
  sandbox: boolean;
  /**
   * Carries `sub` (the user's CabalSpy ID), except for webhook.test and the
   * Trade Feed events (`trade_feed.*` list the users to tell in `data.recipients`).
   */
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

// ── Trade Feed ──────────────────────────────────────────────────────────────

/** `filter` of a Trade Feed. */
export const TRADE_FEED_FILTERS = ['all', 'buys', 'sells', 'theses'] as const;
export type TradeFeedFilter = (typeof TRADE_FEED_FILTERS)[number];

/** At most this many traders in one person's Trade Feed. */
export const TRADE_FEED_MAX_TRADERS = 300;

/**
 * What a trade did to the trader's position in the token:
 * `new` (first buy, or a buy after the position was closed), `add` (bought more),
 * `partial` (sold `sold_percent` of the position), `close` (sold the rest),
 * `sell` (a sell without a known entry).
 */
export type TradeFeedLabel = 'new' | 'add' | 'partial' | 'close' | 'sell';

/** A trader as everyone may see them. */
export interface TradeFeedTrader {
  csid_id: string;
  /** X handle; for people without X `tg.<telegram name>` or `id.<hex>`. */
  username: string;
  name: string | null;
  image_url: string | null;
  /** Has the KOL badge. */
  kol: boolean;
  /** https://id.cabalspy.xyz/u/<username> */
  profile_url: string | null;
}

/** A trade of a trader in a Trade Feed. */
export interface TradeFeedTrade {
  blockchain: Chain;
  mint: string;
  symbol: string | null;
  name: string | null;
  logo: string | null;
  side: 'buy' | 'sell';
  label: TradeFeedLabel;
  /** `partial` sells: the share of the position sold, 0-100. */
  sold_percent: number | null;
  /** Size in the chain's native coin (`currency`). */
  amount_native: number;
  currency: Currency | null;
  amount_usd: number | null;
  token_amount: number | null;
  price_usd: number | null;
  /** Sells with a known entry: realized PnL of this sell. */
  pnl_usd: number | null;
  pnl_percent: number | null;
  /** The trader's verified wallet (verified wallets are public). */
  wallet: string;
  /** The wallet on the chain's explorer. */
  wallet_url: string | null;
  tx_signature: string;
  tx_url: string | null;
}

/** A thesis of a trader in a Trade Feed. */
export interface TradeFeedThesis {
  id: string;
  blockchain: Chain;
  mint: string;
  symbol: string | null;
  name: string | null;
  logo: string | null;
  stance: ThesisStance | null;
  body: string;
  likes: number;
  replies: number;
  /** The token's theses on CabalSpy ID. */
  url: string;
}

export interface TradeFeedLinks {
  /** CabalSpy Terminal (Solana, BNB), else the token's theses. */
  token: string;
  /** CabalSpy Terminal chart; `null` on chains it does not cover. */
  terminal: string | null;
  /** The trader's CabalSpy ID profile. */
  profile: string | null;
}

interface TradeFeedItemBase {
  /** Stable id of the trade (`t…`) or thesis (`h…`): dedupe on it. */
  id: string;
  /** ISO 8601, UTC. */
  timestamp: string;
  trader: TradeFeedTrader;
  links: TradeFeedLinks;
  /** Feed pages only: this item's position (pass it as `cursor` to read on from here). */
  cursor?: string;
}

export interface TradeFeedTradeItem extends TradeFeedItemBase {
  type: 'trade';
  trade: TradeFeedTrade;
}

export interface TradeFeedThesisItem extends TradeFeedItemBase {
  type: 'thesis';
  thesis: TradeFeedThesis;
}

/** One entry of a Trade Feed (and, plus `recipients`, the payload of `trade_feed.*` events). */
export type TradeFeedItem = TradeFeedTradeItem | TradeFeedThesisItem;

/** What a person is told about one trader. */
export interface TradeFeedSettings {
  notify_buys: boolean;
  notify_sells: boolean;
  notify_theses: boolean;
  /** Minimum trade size per native coin (0 = every trade). */
  min_native: Record<Currency, number>;
  /** Muted: still in the feed, but no notifications. */
  muted: boolean;
}

/**
 * Settings when adding a trader (or updating one already in the Trade Feed).
 * Omitted fields keep their value; a new trader starts with the person's defaults.
 */
export interface TradeFeedSettingsInput {
  notify_buys?: boolean;
  notify_sells?: boolean;
  notify_theses?: boolean;
  /** Minimum trade size in SOL (0 = every trade). */
  min_sol?: number;
  /** Minimum trade size in BNB. */
  min_bnb?: number;
  /** Minimum trade size in ETH (Base, Ethereum, Robinhood Chain). */
  min_eth?: number;
  muted?: boolean;
}

/** A trader in a person's Trade Feed. */
export interface TradeFeedEntry {
  trader: TradeFeedTrader;
  /** false while the trader keeps their trading private (nothing of them shows up then). */
  trading_public: boolean;
  added_at: string;
  /** In how many Trade Feeds this trader is. */
  in_trade_feeds: number;
  settings: TradeFeedSettings;
}

/** Pagination of /trade-feed/traders, with the Trade Feed's size and maximum. */
export interface TradeFeedTradersPagination extends Pagination {
  total: number;
  max: number;
}

/** Result of adding a trader. */
export interface TradeFeedAddResult {
  in_trade_feed: true;
  /** false: the trader was already there (settings, if given, were updated). */
  created: boolean;
  trader: TradeFeedTrader;
  settings: TradeFeedSettings;
}

/** Result of removing a trader. */
export interface TradeFeedRemoveResult {
  in_trade_feed: false;
  /** false: the trader was not in the Trade Feed. */
  removed: boolean;
}

export type TradeFeedEventType = 'trade_feed.trade' | 'trade_feed.thesis';

/** A Trade Feed event of one person (one that passed their filters). */
export interface TradeFeedNotification {
  id: number;
  event: TradeFeedEventType;
  /** One plain-text line, e.g. "Trade Feed: @handle bought $SYM — 1.2 SOL ($240) · new position". */
  text: string;
  created_at: string;
  data: TradeFeedItem;
}

/** Your users who should hear about an event (their `csid_id`s). */
export interface TradeFeedRecipients {
  recipients: string[];
}

/** `data` of a `trade_feed.trade` webhook or stream event. */
export type TradeFeedTradeData = Omit<TradeFeedTradeItem, 'cursor'> & TradeFeedRecipients;
/** `data` of a `trade_feed.thesis` webhook or stream event. */
export type TradeFeedThesisData = Omit<TradeFeedThesisItem, 'cursor'> & TradeFeedRecipients;
export type TradeFeedEventData = TradeFeedTradeData | TradeFeedThesisData;
