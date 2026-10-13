/** ES256 JWT verification against a JWKS, with WebCrypto only (no dependencies). */

import { TokenVerificationError } from './errors';
import { base64UrlDecode, fromUtf8, getCrypto, utf8 } from './util';

export interface EcJwk {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
  kid?: string;
  alg?: string;
  use?: string;
}

export interface Jwks {
  keys: EcJwk[];
}

export interface JwtHeader {
  alg: string;
  kid?: string;
  typ?: string;
  [key: string]: unknown;
}

export interface DecodedJwt<P = Record<string, unknown>> {
  header: JwtHeader;
  payload: P;
}

/** Decodes a JWT without verifying it. Never trust the result. */
export function decodeJwt<P = Record<string, unknown>>(token: string): DecodedJwt<P> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new TokenVerificationError('Malformed JWT', { code: 'malformed_token' });
  try {
    return {
      header: JSON.parse(fromUtf8(base64UrlDecode(parts[0]!))) as JwtHeader,
      payload: JSON.parse(fromUtf8(base64UrlDecode(parts[1]!))) as P,
    };
  } catch {
    throw new TokenVerificationError('Malformed JWT', { code: 'malformed_token' });
  }
}

/**
 * Caches the provider's public keys. An unknown `kid` triggers one refetch
 * (key rotation), at most once per `cooldownMs`.
 */
export class JwksCache {
  private keys = new Map<string, CryptoKey>();
  private loaded = 0;
  private inflight: Promise<void> | null = null;

  constructor(
    private readonly load: () => Promise<Jwks>,
    private readonly cooldownMs = 60_000,
  ) {}

  private refresh(): Promise<void> {
    if (!this.inflight) {
      this.inflight = (async () => {
        const jwks = await this.load();
        const c = await getCrypto();
        const next = new Map<string, CryptoKey>();
        for (const jwk of jwks.keys ?? []) {
          if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || (jwk.alg && jwk.alg !== 'ES256')) continue;
          const key = await c.subtle.importKey(
            'jwk',
            { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, ext: true },
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['verify'],
          );
          next.set(jwk.kid ?? '', key);
        }
        this.keys = next;
        this.loaded = Date.now();
      })().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  async getKey(kid: string | undefined): Promise<CryptoKey> {
    const id = kid ?? '';
    if (!this.loaded) await this.refresh();
    let key = this.keys.get(id) ?? (kid === undefined && this.keys.size === 1 ? [...this.keys.values()][0] : undefined);
    if (!key && Date.now() - this.loaded > this.cooldownMs) {
      await this.refresh();
      key = this.keys.get(id);
    }
    if (!key) throw new TokenVerificationError(`No signing key with kid '${id}' in the JWKS`, { code: 'unknown_kid' });
    return key;
  }
}

export interface VerifyOptions {
  issuer: string;
  audience: string;
  /** Required `typ` header, e.g. 'at+jwt'. */
  typ?: string;
  /** Rejected `typ` header, e.g. 'at+jwt' for ID tokens. */
  rejectTyp?: string;
  /** Seconds of clock skew to accept. Default: 60 */
  clockTolerance?: number;
  /** Current time in seconds; for tests. */
  now?: number;
}

/** Verifies an ES256 JWT's signature and its iss, aud, exp, nbf and iat claims. */
export async function verifyJwt<P extends Record<string, unknown>>(
  token: string,
  jwks: JwksCache,
  opts: VerifyOptions,
): Promise<DecodedJwt<P>> {
  const decoded = decodeJwt<P>(token);
  const { header, payload } = decoded;
  if (header.alg !== 'ES256') {
    throw new TokenVerificationError(`Unexpected alg '${header.alg}', expected ES256`, { code: 'invalid_alg' });
  }
  if (opts.typ && header.typ !== opts.typ) {
    throw new TokenVerificationError(`Unexpected token type '${header.typ}', expected '${opts.typ}'`, { code: 'invalid_typ' });
  }
  if (opts.rejectTyp && header.typ === opts.rejectTyp) {
    throw new TokenVerificationError(`A '${header.typ}' token is not accepted here`, { code: 'invalid_typ' });
  }

  const key = await jwks.getKey(header.kid);
  const [h, p, s] = token.split('.') as [string, string, string];
  const signature = base64UrlDecode(s);
  if (signature.length !== 64) throw new TokenVerificationError('Invalid ES256 signature length', { code: 'invalid_signature' });
  const c = await getCrypto();
  const ok = await c.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, utf8(`${h}.${p}`));
  if (!ok) throw new TokenVerificationError('Invalid token signature', { code: 'invalid_signature' });

  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const tol = opts.clockTolerance ?? 60;
  if (payload.iss !== opts.issuer) {
    throw new TokenVerificationError(`Unexpected issuer '${String(payload.iss)}'`, { code: 'invalid_issuer' });
  }
  const aud = payload.aud;
  const audOk = Array.isArray(aud) ? aud.includes(opts.audience) : aud === opts.audience;
  if (!audOk) throw new TokenVerificationError('Token was issued for another client (aud)', { code: 'invalid_audience' });
  if (typeof payload.exp !== 'number') throw new TokenVerificationError('Token has no exp', { code: 'missing_exp' });
  if (payload.exp + tol < now) throw new TokenVerificationError('Token has expired', { code: 'token_expired' });
  if (typeof payload.nbf === 'number' && payload.nbf - tol > now) {
    throw new TokenVerificationError('Token is not valid yet (nbf)', { code: 'token_not_yet_valid' });
  }
  if (typeof payload.iat === 'number' && payload.iat - tol > now) {
    throw new TokenVerificationError('Token was issued in the future (iat)', { code: 'invalid_iat' });
  }
  return decoded;
}
