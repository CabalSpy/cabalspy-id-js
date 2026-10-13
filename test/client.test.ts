import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AuthenticationError,
  BadRequestError,
  CabalSpyID,
  ConnectionError,
  InvalidResponseError,
  NotFoundError,
  PermissionError,
  PlanUserLimitError,
  RateLimitError,
  SDK_VERSION,
  ServerError,
} from '../src/index';
import { apiError, json, mockFetch, ok } from './helpers';

const KEY = 'csid_api_testkey';

function client(handler: Parameters<typeof mockFetch>[0], opts: Record<string, unknown> = {}) {
  const m = mockFetch(handler);
  const csid = new CabalSpyID({ apiKey: KEY, fetch: m.fetch, maxRetries: 0, ...opts });
  return { csid, calls: m.calls };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('requests', () => {
  it('sends the key, user agent and query, and returns data', async () => {
    const { csid, calls } = client(() =>
      ok({ instance: 'example.com', client_id: 'csid_x', mode: 'live', plan: 'pro', rate_limit_rps: 10, websockets: true, global_scope: false, users_with_data: 3 }),
    );
    const me = await csid.me();
    expect(me.plan).toBe('pro');
    expect(calls[0]!.url).toBe('https://api-id.cabalspy.xyz/v1/me');
    expect(calls[0]!.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(calls[0]!.headers['user-agent']).toBe(`cabalspy-id-sdk/${SDK_VERSION}`);
    expect(csid.lastRateLimit).toEqual({ limit: 10, remaining: 9, reset: 1 });
  });

  it('adds instance to every authenticated request', async () => {
    const { csid, calls } = client(() => ok([]), { instance: 'csid_abc' });
    await csid.users({ limit: 5, kol: true });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe('/v1/users');
    expect(Object.fromEntries(url.searchParams)).toEqual({ limit: '5', kol: 'true', instance: 'csid_abc' });
  });

  it('health works without an API key and sends no Authorization', async () => {
    const m = mockFetch(() => ok({ status: 'ok', trade_sync_age_seconds: 2 }));
    const csid = new CabalSpyID({ apiKey: '', fetch: m.fetch });
    expect(await csid.health()).toEqual({ status: 'ok', trade_sync_age_seconds: 2 });
    expect(m.calls[0]!.headers.authorization).toBeUndefined();
  });

  it('requires a key for everything else', async () => {
    const csid = new CabalSpyID({ apiKey: '', fetch: mockFetch(() => ok({})).fetch });
    await expect(csid.me()).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('falls back to CABALSPY_ID_API_KEY, then CABALSPY_API_KEY', async () => {
    vi.stubEnv('CABALSPY_ID_API_KEY', '');
    vi.stubEnv('CABALSPY_API_KEY', 'from_env');
    const m = mockFetch(() => ok({}));
    await new CabalSpyID({ fetch: m.fetch }).me();
    expect(m.calls[0]!.headers.authorization).toBe('Bearer from_env');
  });

  it('builds every endpoint path and parameter', async () => {
    const { csid, calls } = client((req) => {
      const path = new URL(req.url).pathname;
      if (path === '/v1/wallets/history') return ok({ trades: [] }, { pagination: { limit: 1, has_more: false, next_cursor: null } });
      if (path === '/v1/wallets/leaderboard') return ok({ leaderboard: [], pagination: { limit: 1, total: 0, has_more: false, next_cursor: null } });
      return ok({});
    });
    const w = { blockchain: 'solana' as const, address: 'So1' };
    await csid.profile({ username: '@alice' });
    await csid.profile({ csid_id: '4b7c' });
    await csid.walletLookup('0xABC');
    await csid.tracker({ ...w, period: '7d' });
    await csid.history({ ...w, limit: 1 });
    await csid.holdings(w);
    await csid.pnlCalendar(w);
    await csid.leaderboard({ blockchain: 'base', period: '30d', sort: 'pnl_usd', limit: 10 });
    await csid.latestTransactions({ limit: 3 });
    await csid.users({ scope: 'global' });
    const got = calls.map((c) => {
      const u = new URL(c.url);
      return `${u.pathname}?${u.searchParams.toString()}`;
    });
    expect(got).toEqual([
      '/v1/profile?username=alice',
      '/v1/profile?csid_id=4b7c',
      '/v1/wallets/lookup?address=0xABC',
      '/v1/wallets/tracker?blockchain=solana&address=So1&period=7d',
      '/v1/wallets/history?blockchain=solana&address=So1&limit=1',
      '/v1/wallets/holdings?blockchain=solana&address=So1',
      '/v1/wallets/pnl_calendar?blockchain=solana&address=So1',
      '/v1/wallets/leaderboard?blockchain=base&period=30d&sort=pnl_usd&limit=10',
      '/v1/transactions/latest?limit=3',
      '/v1/users?scope=global',
    ]);
  });

  it('validates parameters before sending', async () => {
    const { csid, calls } = client(() => ok({}));
    // @ts-expect-error two identifiers
    await expect(csid.profile({ username: 'a', address: 'b' })).rejects.toBeInstanceOf(BadRequestError);
    // @ts-expect-error unknown chain
    await expect(csid.tracker({ blockchain: 'tron', address: 'x' })).rejects.toMatchObject({ code: 'invalid_parameter', parameter: 'blockchain' });
    // @ts-expect-error unknown period
    await expect(csid.tracker({ blockchain: 'eth', address: 'x', period: '2d' })).rejects.toMatchObject({ parameter: 'period', allowed: ['6h', '1d', '7d', '30d'] });
    // @ts-expect-error unknown sort
    await expect(csid.leaderboard({ blockchain: 'eth', sort: 'best' })).rejects.toMatchObject({ parameter: 'sort' });
    await expect(csid.holdings({ blockchain: 'eth', address: '' })).rejects.toMatchObject({ code: 'missing_parameter', parameter: 'address' });
    expect(calls).toHaveLength(0);
  });
});

describe('errors', () => {
  const cases: [number, string, unknown][] = [
    [400, 'invalid_parameter', BadRequestError],
    [400, 'instance_required', BadRequestError],
    [401, 'missing_api_key', AuthenticationError],
    [403, 'invalid_api_key', PermissionError],
    [403, 'scope_not_allowed', PermissionError],
    [403, 'plan_user_limit', PlanUserLimitError],
    [404, 'wallet_not_found', NotFoundError],
    [404, 'profile_not_found', NotFoundError],
    [429, 'rate_limit_exceeded', RateLimitError],
    [503, 'service_unavailable', ServerError],
  ];
  it.each(cases)('%i %s', async (status, code, cls) => {
    const { csid } = client(() => apiError(status, code, `msg ${code}`, { parameter: 'period', allowed: ['1d'] }, { 'Retry-After': '1' }));
    const err = await csid.me().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(cls as typeof Error);
    expect(err).toMatchObject({
      status,
      code,
      message: `msg ${code}`,
      requestId: 'req_err',
      docs: `https://docs.cabalspy.xyz/cabalspy-id/errors#${code}`,
      parameter: 'period',
      allowed: ['1d'],
    });
    if (err instanceof RateLimitError) expect(err.retryAfter).toBe(1);
    if (err instanceof PlanUserLimitError) expect(err.limited).toBe(true);
  });

  it('retries 429 (honouring Retry-After) and 5xx', async () => {
    let n = 0;
    const { csid, calls } = client(
      () => {
        n++;
        if (n === 1) return apiError(429, 'rate_limit_exceeded', 'slow down', {}, { 'Retry-After': '0' });
        if (n === 2) return apiError(500, 'internal_error');
        return ok({ plan: 'free' });
      },
      { maxRetries: 2 },
    );
    vi.useFakeTimers();
    const p = csid.me();
    await vi.runAllTimersAsync();
    vi.useRealTimers();
    expect(await p).toEqual({ plan: 'free' });
    expect(calls).toHaveLength(3);
  });

  it('does not retry 4xx', async () => {
    const { csid, calls } = client(() => apiError(404, 'wallet_not_found'), { maxRetries: 3 });
    await expect(csid.me()).rejects.toBeInstanceOf(NotFoundError);
    expect(calls).toHaveLength(1);
  });

  it('wraps network failures', async () => {
    const { csid } = client(() => {
      throw new TypeError('fetch failed');
    });
    await expect(csid.me()).rejects.toMatchObject({ code: 'connection_error' });
    await expect(csid.me()).rejects.toBeInstanceOf(ConnectionError);
  });

  it('rejects a response without data', async () => {
    const { csid } = client(() => json({ hello: 'world' }));
    await expect(csid.me()).rejects.toBeInstanceOf(InvalidResponseError);
  });
});

describe('pagination', () => {
  it('iterUsers follows next_cursor', async () => {
    const pages: Record<string, Response> = {};
    const { csid, calls } = client((req) => {
      const cursor = new URL(req.url).searchParams.get('cursor') ?? '';
      if (!cursor) return ok([{ username: 'a' }, { username: 'b' }], { pagination: { limit: 2, total: 3, has_more: true, next_cursor: 'c2' } });
      return pages[cursor] ?? ok([{ username: 'c' }], { pagination: { limit: 2, total: 3, has_more: false, next_cursor: null } });
    });
    const names: string[] = [];
    for await (const u of csid.iterUsers({ limit: 2 })) names.push(u.username);
    expect(names).toEqual(['a', 'b', 'c']);
    expect(new URL(calls[1]!.url).searchParams.get('cursor')).toBe('c2');
  });

  it('iterLeaderboard reads pagination inside data', async () => {
    const { csid } = client((req) => {
      const cursor = new URL(req.url).searchParams.get('cursor');
      const entry = (w: string) => ({ wallet: w, rank: 1 });
      if (!cursor) return ok({ leaderboard: [entry('w1')], pagination: { limit: 1, total: 2, has_more: true, next_cursor: 'w1' } });
      return ok({ leaderboard: [entry('w2')], pagination: { limit: 1, total: 2, has_more: false, next_cursor: null } });
    });
    const wallets: string[] = [];
    for await (const e of csid.iterLeaderboard({ blockchain: 'solana', limit: 1 })) wallets.push(e.wallet);
    expect(wallets).toEqual(['w1', 'w2']);
  });

  it('iterHistory yields trades across pages', async () => {
    const { csid } = client((req) => {
      const cursor = new URL(req.url).searchParams.get('cursor');
      const t = (s: string) => ({ tx_signature: s });
      if (!cursor) return ok({ trades: [t('s1'), t('s2')] }, { pagination: { limit: 2, has_more: true, next_cursor: 'n' } });
      return ok({ trades: [t('s3')] }, { pagination: { limit: 2, has_more: false, next_cursor: null } });
    });
    const sigs: string[] = [];
    for await (const t of csid.iterHistory({ blockchain: 'solana', address: 'x', limit: 2 })) sigs.push(t.tx_signature);
    expect(sigs).toEqual(['s1', 's2', 's3']);
  });
});
