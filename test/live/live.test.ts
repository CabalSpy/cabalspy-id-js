/**
 * Live checks against the public CabalSpy ID endpoints. No API key needed.
 * Run with: npm run test:live
 */
import { describe, expect, it } from 'vitest';

import {
  AuthenticationError,
  BadRequestError,
  CabalSpyID,
  CabalSpyIDAuth,
  PermissionError,
  ThesisClient,
  decodeJwt,
} from '../../src/index';

const WSOL = 'So11111111111111111111111111111111111111112';
/** Public client_id of the CabalSpy ID playground instance (not a secret). */
const PLAYGROUND_CLIENT_ID = 'csid_a97b0c26eccf6f41d5e3a99b';

describe('live: Data API', () => {
  it('GET /v1/health', async () => {
    const csid = new CabalSpyID({ apiKey: '' });
    const health = await csid.health();
    expect(['ok', 'degraded']).toContain(health.status);
    expect('trade_sync_age_seconds' in health).toBe(true);
  });

  it('maps a missing key to AuthenticationError with docs link', async () => {
    const csid = new CabalSpyID({ apiKey: '' });
    const err = await csid.getRaw('/me', {}, { auth: false }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthenticationError);
    expect(err).toMatchObject({ status: 401, code: 'missing_api_key' });
    expect((err as AuthenticationError).docs).toBe('https://docs.cabalspy.xyz/cabalspy-id/errors#missing_api_key');
    expect((err as AuthenticationError).requestId).toMatch(/^req_/);
  });

  it('maps an invalid key to PermissionError', async () => {
    const csid = new CabalSpyID({ apiKey: 'csid_api_not_a_real_key', maxRetries: 0 });
    await expect(csid.me()).rejects.toMatchObject({ status: 403, code: 'invalid_api_key' });
  });

  it('the stream refuses an invalid key', async () => {
    if (typeof (globalThis as { WebSocket?: unknown }).WebSocket !== 'function') return; // Node < 22
    const stream = new CabalSpyID({ apiKey: 'csid_api_not_a_real_key' }).stream({ reconnect: false });
    const err = await stream.connect().catch((e: unknown) => e);
    stream.close();
    expect(err).toBeInstanceOf(PermissionError);
    expect(err).toMatchObject({ code: 'invalid_api_key' });
  });
});

describe('live: OpenID Connect', () => {
  const auth = new CabalSpyIDAuth({ clientId: 'csid_live_test', redirectUri: 'https://example.com/cb' });

  it('discovery document', async () => {
    const d = await auth.discover();
    expect(d.issuer).toBe('https://id.cabalspy.xyz');
    expect(d.id_token_signing_alg_values_supported).toContain('ES256');
    expect(d.code_challenge_methods_supported).toContain('S256');
    expect(d.scopes_supported).toEqual(expect.arrayContaining(['openid', 'profile', 'wallets', 'onchain', 'offline_access']));
  });

  it('JWKS has importable ES256 keys', async () => {
    const jwks = await auth.getJwks();
    expect(jwks.keys.length).toBeGreaterThan(0);
    for (const k of jwks.keys) expect(k).toMatchObject({ kty: 'EC', crv: 'P-256', alg: 'ES256' });
    // An unsigned token with a real kid fails on the signature, which proves the key imported.
    const kid = jwks.keys[0]!.kid;
    const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const fake = `${enc({ alg: 'ES256', kid, typ: 'JWT' })}.${enc({ sub: 'x' })}.${Buffer.alloc(64).toString('base64url')}`;
    expect(decodeJwt(fake).header.kid).toBe(kid);
    await expect(auth.verifyIdToken(fake)).rejects.toMatchObject({ code: 'invalid_signature' });
  });

  it('builds an authorization URL against the real endpoint', async () => {
    const req = await auth.createAuthorizationUrl();
    expect(req.url.startsWith('https://id.cabalspy.xyz/oauth/authorize?')).toBe(true);
  });
});

describe('live: theses', () => {
  const tc = new ThesisClient({ clientId: PLAYGROUND_CLIENT_ID });

  it('lists theses of a token with token info and counts', async () => {
    const page = await tc.list('solana', WSOL, { limit: 2 });
    expect(Array.isArray(page.items)).toBe(true);
    expect(page.token).toMatchObject({ chain: 'solana', mint: WSOL });
    expect(typeof page.summary.theses).toBe('number');
    expect(page.pagination).toMatchObject({ limit: 2 });
  });

  it('summary', async () => {
    const s = await tc.summary('solana', WSOL);
    expect(s).toMatchObject({ token: { mint: WSOL } });
    expect(typeof s.bull).toBe('number');
  });

  it('maps errors: bad mint, missing / invalid token', async () => {
    await expect(tc.summary('solana', 'not-a-mint')).rejects.toBeInstanceOf(BadRequestError);
    const signedOut = new ThesisClient({ clientId: PLAYGROUND_CLIENT_ID, accessToken: 'not-a-token' });
    await expect(signedOut.me('solana', WSOL)).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('the Data API theses route needs a key', async () => {
    const csid = new CabalSpyID({ apiKey: '' });
    await expect(csid.getRaw('/theses', { blockchain: 'solana', mint: WSOL }, { auth: false })).rejects.toMatchObject({
      status: 401,
      code: 'missing_api_key',
    });
  });

  it('opens the public live socket', async () => {
    if (typeof (globalThis as { WebSocket?: unknown }).WebSocket !== 'function') return; // Node < 22
    const live = tc.live('solana', WSOL, { reconnect: false });
    await live.connect();
    expect(live.connected).toBe(true);
    live.close();
  });
});

describe('live: theses stream and scope', () => {
  it('the theses stream refuses an invalid key', async () => {
    if (typeof (globalThis as { WebSocket?: unknown }).WebSocket !== 'function') return; // Node < 22
    const ts = new CabalSpyID({ apiKey: 'csid_api_not_a_real_key' }).thesesStream({ reconnect: false });
    const err = await ts.connect().catch((e: unknown) => e);
    ts.close();
    // Refused either in the stream (invalid_api_key) or, while the proxy does not
    // upgrade this path, already at the HTTP handshake (ws_error).
    expect(['invalid_api_key', 'ws_error', 'ws_closed_early']).toContain((err as { code?: string }).code);
  });

  it('public reads accept scope=global', async () => {
    const s = await new ThesisClient({ clientId: PLAYGROUND_CLIENT_ID, scope: 'global' }).summary('solana', WSOL);
    expect(typeof s.theses).toBe('number');
  });
});

describe('live: notifications', () => {
  it('needs a valid user token', async () => {
    await expect(new ThesisClient({ clientId: PLAYGROUND_CLIENT_ID, accessToken: 'not-a-token' }).notifications()).rejects.toBeInstanceOf(AuthenticationError);
  });
});
