/**
 * `cabalspy-id/api` — the SocialFi API: Data API client (users, profiles,
 * verified wallets, trading stats, leaderboards), the live trade stream, Login
 * with CabalSpy ID (OpenID Connect) and webhook verification.
 *
 *   import { CabalSpyID, CabalSpyIDAuth, verifyWebhook } from 'cabalspy-id/api';
 *
 * Same classes as the root export (`cabalspy-id`); thesis features live in
 * `cabalspy-id/thesis`, the browser widgets in `cabalspy-id/widget`.
 */

export {
  CabalSpyID,
  DEFAULT_BASE_URL,
  DEFAULT_STREAM_URL,
  type CabalSpyIDOptions,
  type Envelope,
  type Query,
  type ScopedParams,
  type UsersParams,
  type ProfileParams,
  type WalletParams,
  type TrackerParams,
  type HistoryParams,
  type LeaderboardParams,
  type LatestTransactionsParams,
} from '../client';

export {
  CabalSpyIDStream,
  type StreamOptions,
  type StreamEvent,
  type StreamEventMap,
  type SubscribedEvent,
  type HeartbeatEvent,
  type CloseEvent,
  type ReconnectEvent,
  type StreamTopic,
} from '../stream';

export {
  CabalSpyIDAuth,
  DEFAULT_ISSUER,
  generatePkce,
  isLimited,
  type CabalSpyIDAuthOptions,
  type TokenEndpointAuthMethod,
  type PkcePair,
  type AuthorizationUrlParams,
  type AuthorizationRequest,
  type CallbackChecks,
  type VerifyIdTokenOptions,
  type LoginResult,
} from '../oidc';

export { decodeJwt, JwksCache, type EcJwk, type Jwks, type JwtHeader, type DecodedJwt } from '../jwt';

export { verifyWebhook, signWebhook, type VerifyWebhookOptions, type HeaderSource } from '../webhooks';

export * from './errors';

export { hasX, handleKind, type UserLike, type HandleKind } from '../users';

export {
  CHAINS,
  PERIODS,
  LEADERBOARD_SORTS,
  CURRENCY_BY_CHAIN,
  type Chain,
  type Period,
  type LeaderboardSort,
  type Currency,
  type Scope,
  type ResponseMeta,
  type Pagination,
  type ApiResponse,
  type HealthResponse,
  type MeResponse,
  type VerifiedWallet,
  type Profile,
  type WalletLookupResponse,
  type TraderProfile,
  type PeriodStats,
  type WinRateBuckets,
  type WinRateDistribution,
  type ActiveTokens,
  type HistoryToken,
  type PnlChartPoint,
  type TrackerTrade,
  type TrackerResponse,
  type LifetimeStats,
  type TokenOverview,
  type HistoryTrade,
  type HistoryResponse,
  type HoldingToken,
  type HoldingsResponse,
  type PnlCalendarDay,
  type PnlCalendarMonth,
  type PnlCalendarResponse,
  type LeaderboardEntry,
  type LeaderboardResponse,
  type TradeOwner,
  type Trade,
  type OidcScope,
  type XProfileClaim,
  type WalletClaim,
  type CabalSpyIDClaims,
  type TokenResponse,
  type DiscoveryDocument,
  type WebhookEventType,
  type WebhookEvent,
} from '../types';
