/**
 * CabalSpy ID SDK — the verified social layer for crypto trading.
 *
 * - CabalSpyID:       Data API client (https://api-id.cabalspy.xyz/v1) and live stream
 * - CabalSpyIDAuth:   "Login with CabalSpy ID" (OpenID Connect, PKCE, ID token verification)
 * - ThesisClient:     public token thesis API for browsers (user access token) and live()
 * - verifyWebhook:    Standard Webhooks signature verification
 * - White-label:      platform users by your own user id (createPlatformUser, importAllPlatformUsers, …)
 *                     and trading competitions between them (createCompetition, …)
 * - cabalspy-id/react: <CabalSpyLogin />, <CabalSpyTheses /> and useCabalSpyID()
 *
 * Focused entry points: cabalspy-id/api, cabalspy-id/thesis, cabalspy-id/widget (browser).
 *
 * Docs: https://docs.cabalspy.xyz/cabalspy-id
 */

export {
  CabalSpyID,
  DEFAULT_BASE_URL,
  DEFAULT_STREAM_URL,
  DEFAULT_THESES_STREAM_URL,
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
  type ThesisTokenParams,
  type ThesisScopeParam,
  type ListThesesParams,
  type ThesisRepliesParams,
  type LatestThesesParams,
  type UserThesesParams,
  type ThesisWriter,
  type PostThesisParams,
  type ReplyToThesisParams,
  type ReactToThesisParams,
  type ReportThesisParams,
  type DeleteThesisParams,
  type PlatformUserRef,
  type PlatformUserId,
  type UpdatePlatformUserParams,
  type PlatformUsersParams,
  type AddPlatformWalletsParams,
  type DeletePlatformWalletParams,
  type StartWalletVerificationParams,
  type PlatformUserProfileParams,
  type PlatformLeaderboardParams,
  type PlatformClaimLinkParams,
  type PlatformXConnectParams,
  type ImportPlatformUsersOptions,
  type ImportPlatformUsersProgress,
  type ImportPlatformUsersResult,
  type CreateCompetitionParams,
  type UpdateCompetitionParams,
  type CompetitionsParams,
  type CompetitionPageParams,
  type CompetitionMemberParams,
} from './client';

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
  type ThesisStreamEvent,
} from './stream';

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
} from './oidc';

export {
  ThesesStream,
  MAX_THESES_STREAM_TOKENS,
  type ThesisTokenRef,
  type ThesesStreamOptions,
  type ThesesReadyEvent,
  type ThesesSubscribedEvent,
  type ThesesStreamEventMap,
} from './thesesStream';

export {
  ThesisClient,
  ThesisLive,
  DEFAULT_THESIS_URL,
  DEFAULT_THESIS_WS_URL,
  CLIENT_ID_HEADER,
  THESIS_WS_CLOSE_CODES,
  thesisCloseError,
  type ThesisClientOptions,
  type ThesisScopeOptions,
  type TokenThesesPage,
  type ThesisPage,
  type TokenThesesOptions,
  type ThesisViewer,
  type ThesisMe,
  type ThesisLiveOptions,
  type ThesisLiveEventMap,
} from './thesis';

export { decodeJwt, JwksCache, type EcJwk, type Jwks, type JwtHeader, type DecodedJwt } from './jwt';

export {
  verifyWebhook,
  verifyTypedWebhook,
  isWebhookEvent,
  signWebhook,
  type VerifyWebhookOptions,
  type HeaderSource,
} from './webhooks';

export {
  CabalSpyIDError,
  BadRequestError,
  AuthenticationError,
  PermissionError,
  PlanUserLimitError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ServerError,
  ConnectionError,
  InvalidResponseError,
  OAuthError,
  TokenVerificationError,
  WebhookVerificationError,
  PlatformImportError,
  type ApiErrorBody,
  type RateLimitInfo,
  type CabalSpyIDErrorOptions,
} from './errors';

export * from './types';

export { hasX, handleKind, type UserLike, type HandleKind } from './users';

export { SDK_VERSION } from './util';

import { CabalSpyID } from './client';
export default CabalSpyID;
