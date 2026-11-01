// ═══════════════════════════════════════════════════════════════════════════
//  ERRORS
// ═══════════════════════════════════════════════════════════════════════════

import type { PlatformImportResult, PlatformUserInput } from './types';

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

/**
 * 400 — missing_parameter, invalid_parameter, instance_required; white-label:
 * wallet_required, invalid_address, invalid_return_url, invalid_body
 */
export class BadRequestError extends CabalSpyIDError {}
/** 401 — missing_api_key; thesis API: client_id_required, invalid_client */
export class AuthenticationError extends CabalSpyIDError {}
/**
 * 403 — invalid_api_key, product_not_enabled, no_instance, scope_not_allowed;
 * thesis API: origin_not_allowed; white-label: claim_disabled; callouts:
 * kol_only, not_a_holder, invalid_account, posting_paused, consent_required, sandbox_user;
 * copy trading: consent_required (no `trade_feed` scope), trading_private
 */
export class PermissionError extends CabalSpyIDError {}
/**
 * 403 — feature_not_enabled. An extra (e.g. callouts and callout competitions)
 * is not switched on for this instance; CabalSpy switches it on on request.
 * `me().features` lists the extras that are on.
 */
export class FeatureNotEnabledError extends PermissionError {}
/**
 * 403 — plan_user_limit. The person signed in beyond the plan's user limit:
 * the platform receives no data for them until it upgrades. For platform users
 * (white-label) it means no new user can be created: `body.user_limit`,
 * `body.users` and `body.plan` say why.
 */
export class PlanUserLimitError extends PermissionError {
  readonly limited = true as const;
}
/**
 * 404 — profile_not_found, wallet_not_found, instance_not_found; white-label:
 * platform_user_not_found, verification_not_found, competition_not_found, invalid_inbound_url;
 * callouts: callout_not_found; copy trading: trader_not_found, not_in_trade_feed,
 * not_found (no such instruction for your instance)
 */
export class NotFoundError extends CabalSpyIDError {}
/**
 * 409 — the request conflicts with the current state. White-label:
 * account_claimed, too_many_wallets, wallet_already_verified, already_verified,
 * last_wallet, kol_badge, x_required, kol_not_eligible, volume_check_unavailable;
 * competitions: competition_limit, competition_closed, competition_full, late_join_closed;
 * callouts: already_called (the user called this token less than 24 hours ago);
 * copy trading: copy_managed_elsewhere (another platform copies this trader for the
 * user), already_reported (the instruction already has another final status),
 * trade_feed_full.
 */
export class ConflictError extends CabalSpyIDError {}
/**
 * 429 — rate_limit_exceeded (requests per second); thesis API and white-label:
 * rate_limited (e.g. more than 2,000 new platform users per minute,
 * too_many_open_verifications)
 */
export class RateLimitError extends CabalSpyIDError {
  /** Seconds until the next request is allowed, taken from Retry-After. */
  readonly retryAfter: number | null;
  constructor(message: string, opts: CabalSpyIDErrorOptions & { retryAfter?: number | null } = {}) {
    super(message, opts);
    this.retryAfter = opts.retryAfter ?? null;
  }
}
/**
 * 429 — callout_cooldown: the user made a callout too recently (the instance's
 * `cooldown_minutes`). `retryAfter` says when the next one is possible. Never
 * retried automatically: it is the user's limit, not the API's.
 */
export class CalloutCooldownError extends RateLimitError {}
/** 422 — the request is valid but cannot be done; callouts: no_price (the token has no market price yet). */
export class UnprocessableError extends CabalSpyIDError {}
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

/**
 * importAllPlatformUsers() stopped on an error it does not retry. `cause` is
 * the original error (its status and code are copied), `result` holds what was
 * imported so far and `pending` the users not yet imported, in input order.
 * Importing `pending` again is safe: the import is an upsert.
 */
export class PlatformImportError extends CabalSpyIDError {
  readonly cause: unknown;
  readonly result: PlatformImportResult;
  readonly pending: PlatformUserInput[];
  constructor(cause: unknown, result: PlatformImportResult, pending: PlatformUserInput[]) {
    const c = cause instanceof CabalSpyIDError ? cause : undefined;
    super(
      `Import stopped after ${result.results.length} user(s), ${pending.length} pending: ${(cause as Error)?.message ?? String(cause)}`,
      {
        status: c?.status,
        code: c?.code ?? 'import_failed',
        requestId: c?.requestId,
        docs: c?.docs,
        parameter: c?.parameter,
        allowed: c?.allowed,
        rateLimit: c?.rateLimit,
        body: c?.body,
      },
    );
    this.cause = cause;
    this.result = result;
    this.pending = pending;
  }
}

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
    if (body?.code === 'plan_user_limit') return new PlanUserLimitError(msg, opts);
    if (body?.code === 'feature_not_enabled') return new FeatureNotEnabledError(msg, opts);
    return new PermissionError(msg, opts);
  }
  if (status === 404) return new NotFoundError(msg, opts);
  if (status === 409) return new ConflictError(msg, opts);
  if (status === 422) return new UnprocessableError(msg, opts);
  if (status === 429) {
    const ra = retryAfter ?? (typeof body?.retry_after === 'number' ? body.retry_after : null);
    return body?.code === 'callout_cooldown'
      ? new CalloutCooldownError(msg, { ...opts, retryAfter: ra })
      : new RateLimitError(msg, { ...opts, retryAfter });
  }
  if (status >= 500) return new ServerError(msg, opts);
  return new CabalSpyIDError(msg, opts);
}

export function isRetryable(err: unknown): boolean {
  if (err instanceof CalloutCooldownError) return false;
  return err instanceof RateLimitError || err instanceof ServerError || err instanceof ConnectionError;
}
