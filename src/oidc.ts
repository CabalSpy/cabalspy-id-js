// ═══════════════════════════════════════════════════════════════════════════
//  LOGIN WITH CABALSPY ID — OpenID Connect helpers for servers
// ═══════════════════════════════════════════════════════════════════════════

import { CabalSpyIDError, ConnectionError, InvalidResponseError, OAuthError, TokenVerificationError } from './errors';
import { type Jwks, JwksCache, verifyJwt } from './jwt';
import type { CabalSpyIDClaims, DiscoveryDocument, OidcScope, TokenResponse } from './types';
import { USER_AGENT, env, randomToken, sha256Base64Url, timingSafeEqual } from './util';

export const DEFAULT_ISSUER = 'https://id.cabalspy.xyz';

export type TokenEndpointAuthMethod = 'client_secret_basic' | 'client_secret_post' | 'none';

export interface CabalSpyIDAuthOptions {
  /** Your instance's client_id (`csid_…`). */
  clientId: string;
  /** Client secret (`csid_sk_…`) of a server-side app. Omit for public clients. */
  clientSecret?: string;
  /** Default redirect URI. Must exactly match one registered in the dashboard. */
  redirectUri?: string;
  /** Default: https://id.cabalspy.xyz (env CABALSPY_ID_ISSUER) */
  issuer?: string;
  /** Default: client_secret_basic with a secret, else none. */
  tokenEndpointAuthMethod?: TokenEndpointAuthMethod;
  /** Accepted clock skew in seconds when checking tokens. Default: 60 */
  clockTolerance?: number;
  /** Per-request timeout in milliseconds. Default: 15_000 */
  timeout?: number;
  fetch?: typeof globalThis.fetch;
}

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
}

/** A fresh PKCE verifier (64 chars) and its S256 challenge. */
export async function generatePkce(): Promise<PkcePair> {
  const codeVerifier = await randomToken(48);
  return { codeVerifier, codeChallenge: await sha256Base64Url(codeVerifier) };
}

export interface AuthorizationUrlParams {
  /** Default: ['openid', 'profile']. `openid` is added when missing. */
  scope?: OidcScope[] | string;
  redirectUri?: string;
  /** 'none' (silent, live apps only) or 'consent'. */
  prompt?: 'none' | 'consent';
  /** Your own state value; generated when omitted. */
  state?: string;
  /** Your own nonce; generated when omitted. */
  nonce?: string;
  /** Additional query parameters. */
  extraParams?: Record<string, string>;
}

/**
 * What you must keep (e.g. in a signed, http-only cookie or the server
 * session) until the user comes back to your redirect URI.
 */
export interface AuthorizationRequest {
  url: string;
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
}

export interface CallbackChecks {
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectUri?: string;
}

export interface VerifyIdTokenOptions {
  /** The nonce you sent; required after an authorization request. */
  nonce?: string;
  /** Maximum seconds since the user authenticated (checks auth_time). */
  maxAge?: number;
}

export interface LoginResult {
  tokens: TokenResponse;
  /** Verified ID token claims. Check `claims.limited` before using profile data. */
  claims: CabalSpyIDClaims;
}

/** True when the platform is over its plan's user limit: anonymous sub, no profile data. */
export function isLimited(claims: Pick<CabalSpyIDClaims, 'limited' | 'sub'>): boolean {
  return claims.limited === true || claims.sub.startsWith('anon_');
}

/**
 * OpenID Connect client for "Login with CabalSpy ID".
 *
 *   const auth = new CabalSpyIDAuth({ clientId, clientSecret, redirectUri });
 *   const req = await auth.createAuthorizationUrl({ scope: ['openid', 'profile', 'wallets'] });
 *   // store req.state, req.nonce, req.codeVerifier; redirect to req.url
 *   const { tokens, claims } = await auth.handleCallback(callbackUrl, stored);
 */
export class CabalSpyIDAuth {
  readonly clientId: string;
  readonly issuer: string;
  readonly redirectUri?: string;
  readonly authMethod: TokenEndpointAuthMethod;

  private readonly clientSecret?: string;
  private readonly clockTolerance: number;
  private readonly timeout: number;
  private readonly fetchImpl: typeof globalThis.fetch;
  private discovery: Promise<DiscoveryDocument> | null = null;
  private readonly jwks: JwksCache;

  constructor(options: CabalSpyIDAuthOptions) {
    if (!options?.clientId) {
      throw new CabalSpyIDError('clientId is required', { code: 'missing_client_id' });
    }
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.redirectUri = options.redirectUri;
    this.issuer = (options.issuer ?? (env('CABALSPY_ID_ISSUER') || DEFAULT_ISSUER)).replace(/\/+$/, '');
    this.authMethod = options.tokenEndpointAuthMethod ?? (options.clientSecret ? 'client_secret_basic' : 'none');
    if (this.authMethod !== 'none' && !this.clientSecret) {
      throw new CabalSpyIDError(`${this.authMethod} needs clientSecret`, { code: 'missing_client_secret' });
    }
    this.clockTolerance = options.clockTolerance ?? 60;
    this.timeout = options.timeout ?? 15_000;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.jwks = new JwksCache(async () => {
      const d = await this.discover();
      return this.fetchJson<Jwks>(d.jwks_uri, { headers: { Accept: 'application/json' } });
    });
  }

  // ── plumbing ──────────────────────────────────────────────────────────────

  private async send(url: string, init: RequestInit): Promise<{ res: Response; body: unknown }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const res = await this.fetchImpl(url, {
        ...init,
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT, ...(init.headers as Record<string, string>) },
      });
      const text = await res.text();
      let body: unknown = null;
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = null;
        }
      }
      return { res, body };
    } catch (err) {
      const aborted = (err as Error)?.name === 'AbortError';
      throw new ConnectionError(aborted ? `Request timed out after ${this.timeout} ms: ${url}` : `Network error: ${(err as Error)?.message}`, {
        code: aborted ? 'timeout' : 'connection_error',
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
    const { res, body } = await this.send(url, init);
    if (!res.ok) throw oauthError(res, body);
    if (body == null || typeof body !== 'object') {
      throw new InvalidResponseError(`Expected JSON from ${url}`, { status: res.status, code: 'invalid_response' });
    }
    return body as T;
  }

  private clientAuth(form: URLSearchParams): Record<string, string> {
    form.set('client_id', this.clientId);
    if (this.authMethod === 'client_secret_basic') {
      form.delete('client_id');
      // RFC 6749 2.3.1: form-encode id and secret before base64.
      const raw = `${encodeURIComponent(this.clientId)}:${encodeURIComponent(this.clientSecret!)}`;
      return { Authorization: `Basic ${btoa(raw)}` };
    }
    if (this.authMethod === 'client_secret_post') form.set('client_secret', this.clientSecret!);
    return {};
  }

  private async postForm<T>(url: string, params: Record<string, string>): Promise<T> {
    const form = new URLSearchParams(params);
    const headers = this.clientAuth(form);
    return this.fetchJson<T>(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: form.toString(),
    });
  }

  // ── discovery ─────────────────────────────────────────────────────────────

  /** The provider's discovery document (cached for the life of this object). */
  discover(): Promise<DiscoveryDocument> {
    if (!this.discovery) {
      this.discovery = this.fetchJson<DiscoveryDocument>(`${this.issuer}/.well-known/openid-configuration`, {
        headers: { Accept: 'application/json' },
      }).then((d) => {
        if (d.issuer !== this.issuer) {
          throw new TokenVerificationError(`Discovery issuer '${d.issuer}' does not match '${this.issuer}'`, {
            code: 'invalid_issuer',
          });
        }
        return d;
      });
      this.discovery.catch(() => {
        this.discovery = null; // retry next time
      });
    }
    return this.discovery;
  }

  /** The provider's public signing keys. */
  async getJwks(): Promise<Jwks> {
    const d = await this.discover();
    return this.fetchJson<Jwks>(d.jwks_uri, { headers: { Accept: 'application/json' } });
  }

  // ── authorization ─────────────────────────────────────────────────────────

  /**
   * Builds the authorization URL with PKCE (S256), state and nonce.
   * Store `state`, `nonce` and `codeVerifier` until the callback.
   */
  async createAuthorizationUrl(params: AuthorizationUrlParams = {}): Promise<AuthorizationRequest> {
    const d = await this.discover();
    const redirectUri = params.redirectUri ?? this.redirectUri;
    if (!redirectUri) throw new CabalSpyIDError('redirectUri is required', { code: 'missing_redirect_uri' });
    const scopes = typeof params.scope === 'string' ? params.scope.split(/\s+/).filter(Boolean) : (params.scope ?? ['openid', 'profile']);
    if (!scopes.includes('openid')) scopes.unshift('openid');
    const { codeVerifier, codeChallenge } = await generatePkce();
    const state = params.state ?? (await randomToken(24));
    const nonce = params.nonce ?? (await randomToken(24));
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: redirectUri,
      scope: [...new Set(scopes)].join(' '),
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      ...(params.prompt ? { prompt: params.prompt } : {}),
      ...(params.extraParams ?? {}),
    });
    return { url: `${d.authorization_endpoint}?${q.toString()}`, state, nonce, codeVerifier, redirectUri };
  }

  /**
   * Completes the login on your redirect URI: checks `error`, `state` and
   * `iss`, exchanges the code and verifies the ID token (signature, iss, aud,
   * exp, nonce).
   *
   * @param callback the full callback URL, its query string or URLSearchParams
   */
  async handleCallback(callback: string | URL | URLSearchParams, checks: CallbackChecks): Promise<LoginResult> {
    const params = toParams(callback);
    const error = params.get('error');
    if (error) throw new OAuthError(error, params.get('error_description') ?? undefined, { status: 400 });
    const state = params.get('state') ?? '';
    if (!checks.state || !timingSafeEqual(state, checks.state)) {
      throw new OAuthError('invalid_state', 'The state parameter does not match (possible CSRF).', { status: 400 });
    }
    const iss = params.get('iss');
    if (iss !== null && iss !== this.issuer) {
      throw new OAuthError('invalid_issuer', `Unexpected iss '${iss}' in the authorization response.`, { status: 400 });
    }
    const code = params.get('code');
    if (!code) throw new OAuthError('invalid_request', 'The callback has no code.', { status: 400 });
    const tokens = await this.exchangeCode({ code, codeVerifier: checks.codeVerifier, redirectUri: checks.redirectUri });
    const claims = await this.verifyIdToken(tokens.id_token, { nonce: checks.nonce });
    return { tokens, claims };
  }

  /** POST /oauth/token with grant_type=authorization_code. */
  async exchangeCode(params: { code: string; codeVerifier: string; redirectUri?: string }): Promise<TokenResponse> {
    const d = await this.discover();
    const redirectUri = params.redirectUri ?? this.redirectUri;
    if (!redirectUri) throw new CabalSpyIDError('redirectUri is required', { code: 'missing_redirect_uri' });
    return this.postForm<TokenResponse>(d.token_endpoint, {
      grant_type: 'authorization_code',
      code: params.code,
      redirect_uri: redirectUri,
      code_verifier: params.codeVerifier,
    });
  }

  /**
   * POST /oauth/token with grant_type=refresh_token. Refresh tokens rotate:
   * always store the new `refresh_token`. Reusing an old one revokes the whole
   * chain.
   */
  async refresh(refreshToken: string): Promise<TokenResponse> {
    const d = await this.discover();
    return this.postForm<TokenResponse>(d.token_endpoint, { grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  /** POST /oauth/revoke (RFC 7009). Revoking a refresh token ends its whole chain. */
  async revoke(token: string): Promise<void> {
    const d = await this.discover();
    await this.postForm<Record<string, never>>(d.revocation_endpoint, { token });
  }

  /** GET /oauth/userinfo — full claims for the access token's scopes (x, wallets, onchain …). */
  async userinfo(accessToken: string): Promise<CabalSpyIDClaims> {
    const d = await this.discover();
    return this.fetchJson<CabalSpyIDClaims>(d.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
  }

  // ── token verification ────────────────────────────────────────────────────

  /**
   * Verifies an ID token: ES256 signature (JWKS), iss, aud, azp, exp, nonce.
   * Use it for tokens from your own callback and for `idToken` sent from the
   * browser widget's `csid:login` event.
   *
   * When the platform is over its plan's user limit, `sub` is `anon_…` and
   * `limited` is true; see isLimited().
   */
  async verifyIdToken(idToken: string, options: VerifyIdTokenOptions = {}): Promise<CabalSpyIDClaims> {
    const { payload } = await verifyJwt<CabalSpyIDClaims>(idToken, this.jwks, {
      issuer: this.issuer,
      audience: this.clientId,
      rejectTyp: 'at+jwt',
      clockTolerance: this.clockTolerance,
    });
    if (typeof payload.sub !== 'string' || !payload.sub) {
      throw new TokenVerificationError('ID token has no sub', { code: 'missing_sub' });
    }
    if (payload.azp !== undefined && payload.azp !== this.clientId) {
      throw new TokenVerificationError('ID token azp does not match the client', { code: 'invalid_azp' });
    }
    if (options.nonce !== undefined && (typeof payload.nonce !== 'string' || !timingSafeEqual(payload.nonce, options.nonce))) {
      throw new TokenVerificationError('ID token nonce does not match', { code: 'invalid_nonce' });
    }
    if (options.maxAge !== undefined) {
      const now = Math.floor(Date.now() / 1000);
      if (typeof payload.auth_time !== 'number' || payload.auth_time + options.maxAge + this.clockTolerance < now) {
        throw new TokenVerificationError('The user authenticated too long ago (max_age)', { code: 'auth_time_too_old' });
      }
    }
    return payload;
  }

  /**
   * Verifies a CabalSpy ID access token (typ at+jwt) issued to this client,
   * e.g. one your frontend sends to your API. Returns its claims
   * (sub, scope, client_id, exp, jti).
   */
  async verifyAccessToken(accessToken: string): Promise<{ sub: string; scope: string; client_id: string; exp: number; jti: string } & Record<string, unknown>> {
    const { payload } = await verifyJwt<{ sub: string; scope: string; client_id: string; exp: number; jti: string }>(
      accessToken,
      this.jwks,
      { issuer: this.issuer, audience: this.clientId, typ: 'at+jwt', clockTolerance: this.clockTolerance },
    );
    if (payload.client_id !== this.clientId) {
      throw new TokenVerificationError('Access token was issued to another client', { code: 'invalid_audience' });
    }
    return payload;
  }
}

function toParams(callback: string | URL | URLSearchParams): URLSearchParams {
  if (callback instanceof URLSearchParams) return callback;
  if (callback instanceof URL) return callback.searchParams;
  const s = String(callback);
  const i = s.indexOf('?');
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith('/')) return new URLSearchParams(i === -1 ? '' : s.slice(i + 1));
  return new URLSearchParams(s.startsWith('?') ? s.slice(1) : s);
}

function oauthError(res: Response, body: unknown): OAuthError {
  const b = (body ?? {}) as { error?: unknown; error_description?: string };
  if (typeof b.error === 'string') return new OAuthError(b.error, b.error_description, { status: res.status, body });
  return new OAuthError(`http_${res.status}`, `HTTP ${res.status} from ${res.url || 'the identity provider'}`, {
    status: res.status,
    body,
  });
}
