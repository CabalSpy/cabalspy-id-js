// Shared by the subpath entry points: the same error classes as the root export.
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
} from '../errors';
export { SDK_VERSION } from '../util';
