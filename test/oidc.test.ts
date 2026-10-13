import { createHash } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';

import { CabalSpyIDAuth, OAuthError, TokenVerificationError, generatePkce, isLimited } from '../src/index';
import { ISSUER, type TestKey, discoveryDoc, json, makeKey, mockFetch, signJwt } from './helpers';

const CLIENT_ID = 'csid_testclient';
const SECRET = 'csid_sk_testsecret';
const REDIRECT = 'https://app.example.com/callback';

let key: TestKey;
let otherKey: TestKey;
const now = () => Math.floor(Date.now() / 1000);

beforeAll(async () => {
  key = await makeKey('k1');
  otherKey = await makeKey('k-other');
});

interface Provider {
  idToken?: string;
  tokenStatus?: number;
  tokenBody?: unknown;
  keys?: () => TestKey[];
}

function provider(p: Provider = {}) {
  let jwksHits = 0;
  const m = mockFetch((req) => {
    const path = new URL(req.url).pathname;
    if (path === '/.well-known/openid-configuration') return json(discoveryDoc());
    if (path === '/oauth/jwks') {
      jwksHits++;
      return json({ keys: (p.keys?.() ?? [key]).map((k) => k.jwk) });
    }
    if (path === '/oauth/token') {
      if (p.tokenStatus) return json(p.tokenBody, p.tokenStatus);
      return json({ access_token: 'at', token_type: 'Bearer', expires_in: 900, id_token: p.idToken, scope: 'openid profile' });
    }
    if (path === '/oauth/userinfo') return json({ sub: 'user-1', preferred_username: 'alice', wallets: [] });
    if (path === '/oauth/revoke') return json({});
    return json({ error: 'not_found' }, 404);
  });
  return { ...m, jwksHits: () => jwksHits };
}

const idClaims = (extra: Record<string, unknown> = {}) => ({
  iss: ISSUER,
  sub: 'user-1',
  aud: CLIENT_ID,
  azp: CLIENT_ID,
  iat: now(),
  exp: now() + 900,
  nonce: 'n-1',
  preferred_username: 'alice',
  ...extra,
});

describe('authorization URL', () => {
  it('uses PKCE S256, state and nonce', async () => {
    const m = provider();
    const auth = new CabalSpyIDAuth({ clientId: CLIENT_ID, clientSecret: SECRET, redirectUri: REDIRECT, fetch: m.fetch });
    const req = await auth.createAuthorizationUrl({ scope: ['profile', 'wallets'], prompt: 'consent' });
    const url = new URL(req.url);
    expect(url.origin + url.pathname).toBe(`${ISSUER}/oauth/authorize`);
    const q = Object.fromEntries(url.searchParams);
    expect(q).toMatchObject({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT,
      scope: 'openid profile wallets',
      code_challenge_method: 'S256',
      state: req.state,
      nonce: req.nonce,
      prompt: 'consent',
    });
    expect(req.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(q.code_challenge).toBe(createHash('sha256').update(req.codeVerifier).digest('base64url'));
    expect(req.state).not.toBe(req.nonce);
  });

  it('generatePkce returns a valid pair', async () => {
    const { codeVerifier, codeChallenge } = await generatePkce();
    expect(codeChallenge).toBe(createHash('sha256').update(codeVerifier).digest('base64url'));
    expect(codeChallenge).toHaveLength(43);
  });
});

describe('callback and code exchange', () => {
  it('exchanges the code with Basic auth and verifies the ID token', async () => {
    const m = provider({ idToken: await signJwt(key, idClaims()) });
    const auth = new CabalSpyIDAuth({ clientId: CLIENT_ID, clientSecret: SECRET, redirectUri: REDIRECT, fetch: m.fetch });
    const { tokens, claims } = await auth.handleCallback(`${REDIRECT}?code=abc&state=s-1&iss=${encodeURIComponent(ISSUER)}`, {
      state: 's-1',
      nonce: 'n-1',
      codeVerifier: 'v'.repeat(64),
    });
    expect(tokens.access_token).toBe('at');
    expect(claims.sub).toBe('user-1');
    expect(claims.preferred_username).toBe('alice');
    const tokenCall = m.calls.find((c) => c.url.endsWith('/oauth/token'))!;
    expect(tokenCall.method).toBe('POST');
    expect(tokenCall.headers['content-type']).toBe('application/x-www-form-urlencoded');
    expect(tokenCall.headers.authorization).toBe(`Basic ${Buffer.from(`${CLIENT_ID}:${SECRET}`).toString('base64')}`);
    expect(Object.fromEntries(new URLSearchParams(tokenCall.body))).toEqual({
      grant_type: 'authorization_code',
      code: 'abc',
      redirect_uri: REDIRECT,
      code_verifier: 'v'.repeat(64),
    });
  });

  it('client_secret_post and public clients put credentials in the form', async () => {
    const m = provider({ idToken: await signJwt(key, idClaims()) });
    const post = new CabalSpyIDAuth({ clientId: CLIENT_ID, clientSecret: SECRET, tokenEndpointAuthMethod: 'client_secret_post', redirectUri: REDIRECT, fetch: m.fetch });
    await post.exchangeCode({ code: 'c', codeVerifier: 'v'.repeat(43) });
    const pub = new CabalSpyIDAuth({ clientId: CLIENT_ID, redirectUri: REDIRECT, fetch: m.fetch });
    await pub.exchangeCode({ code: 'c', codeVerifier: 'v'.repeat(43) });
    const [a, b] = m.calls.filter((c) => c.url.endsWith('/oauth/token'));
    expect(new URLSearchParams(a!.body).get('client_secret')).toBe(SECRET);
    expect(new URLSearchParams(a!.body).get('client_id')).toBe(CLIENT_ID);
    expect(a!.headers.authorization).toBeUndefined();
    expect(new URLSearchParams(b!.body).get('client_id')).toBe(CLIENT_ID);
    expect(new URLSearchParams(b!.body).has('client_secret')).toBe(false);
  });

  it('rejects state mismatch, provider errors and a foreign iss', async () => {
    const m = provider();
    const auth = new CabalSpyIDAuth({ clientId: CLIENT_ID, redirectUri: REDIRECT, fetch: m.fetch });
    const checks = { state: 's-1', nonce: 'n', codeVerifier: 'v' };
    await expect(auth.handleCallback('?code=a&state=evil', checks)).rejects.toMatchObject({ code: 'invalid_state' });
    await expect(auth.handleCallback('?error=access_denied&error_description=nope&state=s-1', checks)).rejects.toMatchObject({
      error: 'access_denied',
      errorDescription: 'nope',
    });
    await expect(auth.handleCallback('?code=a&state=s-1&iss=https://evil.example', checks)).rejects.toMatchObject({ code: 'invalid_issuer' });
    expect(m.calls.some((c) => c.url.endsWith('/oauth/token'))).toBe(false);
  });

  it('maps token endpoint errors to OAuthError', async () => {
    const m = provider({ tokenStatus: 400, tokenBody: { error: 'invalid_grant', error_description: 'The code is invalid, expired or already used.' } });
    const auth = new CabalSpyIDAuth({ clientId: CLIENT_ID, clientSecret: SECRET, redirectUri: REDIRECT, fetch: m.fetch });
    const err = await auth.exchangeCode({ code: 'x', codeVerifier: 'v' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OAuthError);
    expect(err).toMatchObject({ status: 400, error: 'invalid_grant', code: 'invalid_grant' });
  });
});

describe('ID token verification', () => {
  async function verify(token: string, opts: { nonce?: string } = {}, keys?: () => TestKey[]) {
    const m = provider({ keys });
    const auth = new CabalSpyIDAuth({ clientId: CLIENT_ID, fetch: m.fetch });
    return auth.verifyIdToken(token, opts);
  }

  it('accepts a valid token', async () => {
    const claims = await verify(await signJwt(key, idClaims()), { nonce: 'n-1' });
    expect(claims.sub).toBe('user-1');
  });

  it.each([
    ['wrong nonce', idClaims(), { nonce: 'other' }, 'invalid_nonce'],
    ['expired', idClaims({ exp: now() - 3600 }), {}, 'token_expired'],
    ['wrong audience', idClaims({ aud: 'csid_other' }), {}, 'invalid_audience'],
    ['wrong azp', idClaims({ azp: 'csid_other' }), {}, 'invalid_azp'],
    ['wrong issuer', idClaims({ iss: 'https://evil.example' }), {}, 'invalid_issuer'],
    ['issued in the future', idClaims({ iat: now() + 3600 }), {}, 'invalid_iat'],
  ])('rejects %s', async (_name, claims, opts, code) => {
    const err = await verify(await signJwt(key, claims), opts).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TokenVerificationError);
    expect(err).toMatchObject({ code });
  });

  it('rejects a token signed by another key', async () => {
    const forged = await signJwt({ ...otherKey, kid: 'k1' }, idClaims());
    await expect(verify(forged)).rejects.toMatchObject({ code: 'invalid_signature' });
  });

  it('rejects an unknown kid and a non-ES256 alg', async () => {
    await expect(verify(await signJwt(otherKey, idClaims()))).rejects.toMatchObject({ code: 'unknown_kid' });
    await expect(verify(await signJwt(key, idClaims(), { alg: 'HS256' }))).rejects.toMatchObject({ code: 'invalid_alg' });
  });

  it('rejects an access token used as ID token', async () => {
    const at = await signJwt(key, idClaims(), { typ: 'at+jwt' });
    await expect(verify(at)).rejects.toMatchObject({ code: 'invalid_typ' });
  });

  it('handles limited (anonymous) users', async () => {
    const claims = await verify(
      await signJwt(key, idClaims({ sub: 'anon_abc123', preferred_username: undefined, limited: true, reason: 'plan_user_limit' })),
    );
    expect(claims.limited).toBe(true);
    expect(isLimited(claims)).toBe(true);
    expect(isLimited({ sub: 'user-1' })).toBe(false);
  });

  it('refetches the JWKS once for a rotated key', async () => {
    let rotated = false;
    const m = provider({ keys: () => (rotated ? [key, otherKey] : [key]) });
    const auth = new CabalSpyIDAuth({ clientId: CLIENT_ID, fetch: m.fetch });
    await auth.verifyIdToken(await signJwt(key, idClaims()));
    rotated = true;
    // within the cooldown an unknown kid is not refetched
    await expect(auth.verifyIdToken(await signJwt(otherKey, idClaims()))).rejects.toMatchObject({ code: 'unknown_kid' });
    expect(m.jwksHits()).toBe(1);
  });

  it('verifies access tokens (typ at+jwt)', async () => {
    const m = provider();
    const auth = new CabalSpyIDAuth({ clientId: CLIENT_ID, fetch: m.fetch });
    const at = await signJwt(
      key,
      { iss: ISSUER, sub: 'user-1', aud: CLIENT_ID, client_id: CLIENT_ID, scope: 'openid profile', iat: now(), exp: now() + 900, jti: 'j' },
      { typ: 'at+jwt' },
    );
    expect((await auth.verifyAccessToken(at)).scope).toBe('openid profile');
    await expect(auth.verifyAccessToken(await signJwt(key, idClaims()))).rejects.toMatchObject({ code: 'invalid_typ' });
  });
});

describe('refresh, revoke, userinfo', () => {
  it('sends the right grants', async () => {
    const m = provider({ idToken: 'x' });
    const auth = new CabalSpyIDAuth({ clientId: CLIENT_ID, clientSecret: SECRET, fetch: m.fetch });
    await auth.refresh('csid_rt_1');
    await auth.revoke('csid_rt_1');
    const info = await auth.userinfo('at-1');
    expect(info.preferred_username).toBe('alice');
    const [refresh, revoke, userinfo] = m.calls.filter((c) => !c.url.includes('well-known'));
    expect(Object.fromEntries(new URLSearchParams(refresh!.body))).toEqual({ grant_type: 'refresh_token', refresh_token: 'csid_rt_1' });
    expect(revoke!.url).toBe(`${ISSUER}/oauth/revoke`);
    expect(new URLSearchParams(revoke!.body).get('token')).toBe('csid_rt_1');
    expect(revoke!.headers.authorization).toMatch(/^Basic /);
    expect(userinfo!.headers.authorization).toBe('Bearer at-1');
  });

  it('caches discovery and checks its issuer', async () => {
    const m = provider();
    const auth = new CabalSpyIDAuth({ clientId: CLIENT_ID, fetch: m.fetch });
    await auth.discover();
    await auth.discover();
    expect(m.calls.filter((c) => c.url.includes('well-known'))).toHaveLength(1);
    const bad = new CabalSpyIDAuth({ clientId: CLIENT_ID, issuer: 'https://other.example', fetch: m.fetch });
    await expect(bad.discover()).rejects.toMatchObject({ code: 'invalid_issuer' });
  });

  it('needs a secret for confidential auth methods', () => {
    expect(() => new CabalSpyIDAuth({ clientId: CLIENT_ID, tokenEndpointAuthMethod: 'client_secret_basic' })).toThrow(/clientSecret/);
  });
});
