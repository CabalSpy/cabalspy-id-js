/**
 * CabalSpy ID SDK — the verified social layer for crypto trading.
 *
 * - CabalSpyID:       Data API client (https://api-id.cabalspy.xyz/v1) and live stream
 * - CabalSpyIDAuth:   "Login with CabalSpy ID" (OpenID Connect, PKCE, ID token verification)
 * - verifyWebhook:    Standard Webhooks signature verification
 * - cabalspy-id/react: <CabalSpyLogin /> button and useCabalSpyID() hook
 *
 * Docs: https://docs.cabalspy.xyz/cabalspy-id
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

export { decodeJwt, JwksCache, type EcJwk, type Jwks, type JwtHeader, type DecodedJwt } from './jwt';

export { verifyWebhook, signWebhook, type VerifyWebhookOptions, type HeaderSource } from './webhooks';

export {
  CabalSpyIDError,
  BadRequestError,
  AuthenticationError,
  PermissionError,
  PlanUserLimitError,
  NotFoundError,
  RateLimitError,
  ServerError,
  ConnectionError,
  InvalidResponseError,
  OAuthError,
  TokenVerificationError,
  WebhookVerificationError,
  type ApiErrorBody,
  type RateLimitInfo,
  type CabalSpyIDErrorOptions,
} from './errors';

export * from './types';

export { SDK_VERSION } from './util';

import { CabalSpyID } from './client';
export default CabalSpyID;
