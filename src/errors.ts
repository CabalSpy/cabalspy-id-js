// ═══════════════════════════════════════════════════════════════════════════
//  ERRORS
// ═══════════════════════════════════════════════════════════════════════════

export interface RateLimitInfo {
  /** Requests per second allowed by the plan. `null` when the header is absent. */
  limit: number | null;
  remaining: number | null;
  /** Seconds until the current one-second window resets. */
  reset: number | null;
}

export const EMPTY_RATE_LIMIT: RateLimitInfo = Object.freeze({ limit: null, remaining: null, reset: null });

/** Error body of the Data API: `{"success": false, "error": {...}}`. */
export interface ApiErrorBody {
  code: string;
  message: string;
  request_id: string;
  /** Link to the error's documentation, e.g. https://docs.cabalspy.xyz/cabalspy-id/errors#wallet_not_found */
  docs: string;
  parameter?: string;
  allowed?: unknown[];
  /** Set on `plan_user_limit`. */
  limited?: boolean;
  [key: string]: unknown;
}

export interface CabalSpyIDErrorOptions {
  status?: number;
  code?: string;
  requestId?: string;
  docs?: string;
  parameter?: string;
  allowed?: unknown[];
  rateLimit?: RateLimitInfo;
  body?: unknown;
}

/** Base class for every error thrown by this SDK. */
export class CabalSpyIDError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly docs?: string;
  readonly parameter?: string;
  readonly allowed?: unknown[];
  readonly rateLimit: RateLimitInfo;
  /** The parsed response body, when there was one. */
  readonly body?: unknown;

  constructor(message: string, opts: CabalSpyIDErrorOptions = {}) {
    super(message);
    this.name = new.target.name;
    this.status = opts.status ?? 0;
    this.code = opts.code ?? 'unknown_error';
    this.requestId = opts.requestId;
    this.docs = opts.docs;
    this.parameter = opts.parameter;
    this.allowed = opts.allowed;
    this.rateLimit = opts.rateLimit ?? { ...EMPTY_RATE_LIMIT };
    this.body = opts.body;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 400 — missing_parameter, invalid_parameter, instance_required */
export class BadRequestError extends CabalSpyIDError {}
/** 401 — missing_api_key; thesis API: client_id_required, invalid_client */
export class AuthenticationError extends CabalSpyIDError {}
/** 403 — invalid_api_key, product_not_enabled, no_instance, scope_not_allowed; thesis API: origin_not_allowed */
export class PermissionError extends CabalSpyIDError {}
/**
 * 403 — plan_user_limit. The person signed in beyond the plan's user limit:
 * the platform receives no data for them until it upgrades.
 */
export class PlanUserLimitError extends PermissionError {
  readonly limited = true as const;
}
/** 404 — profile_not_found, wallet_not_found, instance_not_found */
export class NotFoundError extends CabalSpyIDError {}
/** 429 — rate_limit_exceeded; thesis API: rate_limited (Retry-After 60) */
export class RateLimitError extends CabalSpyIDError {
  /** Seconds until the next request is allowed, taken from Retry-After. */
  readonly retryAfter: number | null;
  constructor(message: string, opts: CabalSpyIDErrorOptions & { retryAfter?: number | null } = {}) {
    super(message, opts);
    this.retryAfter = opts.retryAfter ?? null;
  }
}
/** 5xx — internal_error, service_unavailable */
export class ServerError extends CabalSpyIDError {}
/** Network failure, timeout or aborted connection. */
export class ConnectionError extends CabalSpyIDError {}
/** Response was not valid JSON, or did not have the expected envelope. */
export class InvalidResponseError extends CabalSpyIDError {}

/**
 * An error from the OpenID Connect endpoints (`/oauth/token`, `/oauth/userinfo`,
 * `/oauth/revoke`) or from the authorization redirect, in OAuth's own format:
 * `code` is the OAuth `error` (invalid_grant, invalid_client, access_denied …).
 */
export class OAuthError extends CabalSpyIDError {
  readonly error: string;
  readonly errorDescription?: string;
  constructor(error: string, description?: string, opts: CabalSpyIDErrorOptions = {}) {
    super(description ? `${error}: ${description}` : error, { ...opts, code: error });
    this.error = error;
    this.errorDescription = description;
  }
}

/** An ID or access token failed verification (signature, iss, aud, exp, nonce …). */
export class TokenVerificationError extends CabalSpyIDError {}

/** A webhook failed signature or timestamp verification. */
export class WebhookVerificationError extends CabalSpyIDError {}

/** Maps an HTTP status and Data API error body onto the right error class. */
export function errorFromStatus(
  status: number,
  body: ApiErrorBody | null,
  rateLimit: RateLimitInfo,
  retryAfter: number | null,
  fallbackMessage: string,
): CabalSpyIDError {
  const opts: CabalSpyIDErrorOptions = {
    status,
    code: body?.code ?? `http_${status}`,
    requestId: body?.request_id,
    docs: body?.docs,
    parameter: body?.parameter,
    allowed: body?.allowed,
    rateLimit,
    body: body ?? undefined,
  };
  const msg = body?.message ?? fallbackMessage;

  if (status === 400) return new BadRequestError(msg, opts);
  if (status === 401) return new AuthenticationError(msg, opts);
  if (status === 403) {
    return body?.code === 'plan_user_limit' ? new PlanUserLimitError(msg, opts) : new PermissionError(msg, opts);
  }
  if (status === 404) return new NotFoundError(msg, opts);
  if (status === 429) return new RateLimitError(msg, { ...opts, retryAfter });
  if (status >= 500) return new ServerError(msg, opts);
  return new CabalSpyIDError(msg, opts);
}

export function isRetryable(err: unknown): boolean {
  return err instanceof RateLimitError || err instanceof ServerError || err instanceof ConnectionError;
}
