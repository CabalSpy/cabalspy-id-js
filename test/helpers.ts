import { webcrypto } from 'node:crypto';

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

export type Responder = (req: RecordedRequest) => Response | Promise<Response>;

/** A fetch that records every request and answers from a route table or queue. */
export function mockFetch(handler: Responder) {
  const calls: RecordedRequest[] = [];
  const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((v, k) => (headers[k] = v));
    const req: RecordedRequest = {
      url: String(input),
      method: init.method ?? 'GET',
      headers,
      body: typeof init.body === 'string' ? init.body : undefined,
    };
    calls.push(req);
    return handler(req);
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

export function ok<T>(data: T, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}): Response {
  return json(
    {
      success: true,
      data,
      ...extra,
      meta: { request_id: 'req_test', cached: false, cache_age_seconds: 0, version: 'v1', timestamp: '2026-10-13T00:00:00Z' },
    },
    200,
    { 'X-RateLimit-Limit': '10', 'X-RateLimit-Remaining': '9', 'X-RateLimit-Reset': '1', ...headers },
  );
}

export function apiError(status: number, code: string, message = code, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}): Response {
  return json(
    { success: false, error: { code, message, request_id: 'req_err', docs: `https://docs.cabalspy.xyz/cabalspy-id/errors#${code}`, ...extra } },
    status,
    headers,
  );
}

const b64url = (b: Uint8Array | ArrayBuffer) => Buffer.from(b instanceof ArrayBuffer ? new Uint8Array(b) : b).toString('base64url');

export interface TestKey {
  kid: string;
  privateKey: CryptoKey;
  jwk: { kty: 'EC'; crv: 'P-256'; x: string; y: string; kid: string; alg: 'ES256'; use: 'sig' };
}

export async function makeKey(kid = 'test-key'): Promise<TestKey> {
  const pair = (await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const pub = (await webcrypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey;
  return {
    kid,
    privateKey: pair.privateKey,
    jwk: { kty: 'EC', crv: 'P-256', x: pub.x!, y: pub.y!, kid, alg: 'ES256', use: 'sig' },
  };
}

export async function signJwt(key: TestKey, payload: Record<string, unknown>, header: Record<string, unknown> = {}): Promise<string> {
  const h = b64url(Buffer.from(JSON.stringify({ alg: 'ES256', kid: key.kid, typ: 'JWT', ...header })));
  const p = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.privateKey, Buffer.from(`${h}.${p}`));
  return `${h}.${p}.${b64url(sig)}`;
}

export const ISSUER = 'https://id.cabalspy.xyz';

export function discoveryDoc(issuer = ISSUER) {
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    userinfo_endpoint: `${issuer}/oauth/userinfo`,
    jwks_uri: `${issuer}/oauth/jwks`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    scopes_supported: ['openid', 'profile', 'wallets', 'onchain', 'offline_access'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    id_token_signing_alg_values_supported: ['ES256'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
    code_challenge_methods_supported: ['S256'],
    claims_supported: ['sub'],
  };
}
