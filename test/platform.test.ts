import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BadRequestError,
  CabalSpyID,
  ConflictError,
  NotFoundError,
  PermissionError,
  PlanUserLimitError,
  PlatformImportError,
  RateLimitError,
  ServerError,
  type PlatformImportItemResult,
  type PlatformUserInput,
} from '../src/index';
import * as api from '../src/entries/api';
import { type RecordedRequest, apiError, mockFetch, ok } from './helpers';

const KEY = 'csid_api_testkey';

function client(handler: Parameters<typeof mockFetch>[0], opts: Record<string, unknown> = {}) {
  const m = mockFetch(handler);
  const csid = new CabalSpyID({ apiKey: KEY, fetch: m.fetch, maxRetries: 0, ...opts });
  return { csid, calls: m.calls };
}

/** "METHOD /path?query" plus the parsed JSON body. */
function describeCall(c: RecordedRequest) {
  const u = new URL(c.url);
  const q = u.searchParams.toString();
  return { call: `${c.method} ${u.pathname}${q ? `?${q}` : ''}`, body: c.body === undefined ? undefined : JSON.parse(c.body) };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('platform users: requests', () => {
  it('builds every endpoint path, query and body', async () => {
    const { csid, calls } = client((req) => {
      const path = new URL(req.url).pathname;
      if (path.endsWith('/verification/qr')) return new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } });
      if (path === '/v1/platform-users/list') return ok([], { pagination: { limit: 50, total: 0, has_more: false, next_cursor: null } });
      if (path === '/v1/platform-users/leaderboard') return ok({ leaderboard: [] }, { pagination: { limit: 10, total: 0, has_more: false, next_cursor: null } });
      if (path === '/v1/platform-users/import') return ok({ summary: { created: 1, updated: 0, unchanged: 0, rejected: 0 }, results: [] });
      return ok({});
    });
    const wallets = [{ address: 'So1', chains: ['solana' as const], source: 'privy' }];
    await csid.createPlatformUser({ external_id: 'u1', wallets, display_name: 'Alice' });
    await csid.importPlatformUsers([{ external_id: 'u1', wallets: ['0xabc'] }]);
    await csid.platformUser('u1');
    await csid.platformUser({ csid_id: 'c-1' });
    await csid.updatePlatformUser({ external_id: 'u1', avatar_url: null });
    await csid.platformUsers({ limit: 5, cursor: 'cur' });
    await csid.deletePlatformUser('u1');
    await csid.addPlatformUserWallets({ external_id: 'u1', wallets: ['0xdef'] });
    await csid.deletePlatformUserWallet({ csid_id: 'c-1', address: '0xdef' });
    await csid.startWalletVerification({ external_id: 'u1', chain: 'base', address: '0xdef' });
    await csid.walletVerification('v-1');
    expect(await csid.walletVerificationQr('v-1')).toBe('<svg/>');
    await csid.cancelWalletVerification('v-1');
    await csid.platformUserProfile({ external_id: 'u1', period: '30d' });
    await csid.platformUserProfile('u1');
    await csid.platformLeaderboard({ blockchain: 'solana', period: '1d', sort: 'volume', limit: 10, trust: 'verified' });
    await csid.platformSettings();
    await csid.updatePlatformSettings({ wallet_trust: 'verified_only', data_scope: 'platform', claim_links: false });
    await csid.inboundStatus();
    await csid.enableInbound();
    await csid.disableInbound();
    await csid.platformUserSession('u1');
    await csid.platformUserClaimLink('u1');
    await csid.platformUserClaimLink({ external_id: 'u1', return_url: 'https://app.example.com/back' });
    await csid.connectPlatformUserX({ external_id: 'u1', return_url: 'https://app.example.com/x' });
    await csid.disconnectPlatformUserX('u1');
    await csid.linkPlatformUserTelegram('u1');
    await csid.platformUserTelegram('u1');
    await csid.unlinkPlatformUserTelegram({ csid_id: 'c-1' });
    await csid.platformUserKol('u1');
    await csid.requestPlatformUserVolumeCheck('u1');
    await csid.applyPlatformUserKol('u1');

    expect(calls.map(describeCall)).toEqual([
      { call: 'POST /v1/platform-users', body: { external_id: 'u1', wallets, display_name: 'Alice' } },
      { call: 'POST /v1/platform-users/import', body: { users: [{ external_id: 'u1', wallets: ['0xabc'] }] } },
      { call: 'GET /v1/platform-users?external_id=u1', body: undefined },
      { call: 'GET /v1/platform-users?csid_id=c-1', body: undefined },
      { call: 'POST /v1/platform-users/update', body: { external_id: 'u1', avatar_url: null } },
      { call: 'GET /v1/platform-users/list?limit=5&cursor=cur', body: undefined },
      { call: 'POST /v1/platform-users/delete', body: { external_id: 'u1' } },
      { call: 'POST /v1/platform-users/wallets/add', body: { external_id: 'u1', wallets: ['0xdef'] } },
      { call: 'POST /v1/platform-users/wallets/delete', body: { csid_id: 'c-1', address: '0xdef' } },
      { call: 'POST /v1/platform-users/wallets/verify', body: { external_id: 'u1', chain: 'base', address: '0xdef' } },
      { call: 'GET /v1/platform-users/wallets/verification?id=v-1', body: undefined },
      { call: 'GET /v1/platform-users/wallets/verification/qr?id=v-1', body: undefined },
      { call: 'POST /v1/platform-users/wallets/verification/cancel', body: { id: 'v-1' } },
      { call: 'GET /v1/platform-users/profile?external_id=u1&period=30d', body: undefined },
      { call: 'GET /v1/platform-users/profile?external_id=u1', body: undefined },
      { call: 'GET /v1/platform-users/leaderboard?blockchain=solana&period=1d&sort=volume&limit=10&trust=verified', body: undefined },
      { call: 'GET /v1/platform-users/settings', body: undefined },
      { call: 'POST /v1/platform-users/settings', body: { wallet_trust: 'verified_only', data_scope: 'platform', claim_links: false } },
      { call: 'GET /v1/platform-users/inbound', body: undefined },
      { call: 'POST /v1/platform-users/inbound/enable', body: {} },
      { call: 'POST /v1/platform-users/inbound/disable', body: {} },
      { call: 'POST /v1/platform-users/session', body: { external_id: 'u1' } },
      { call: 'POST /v1/platform-users/claim-link', body: { external_id: 'u1' } },
      { call: 'POST /v1/platform-users/claim-link', body: { external_id: 'u1', return_url: 'https://app.example.com/back' } },
      { call: 'POST /v1/platform-users/x/connect', body: { external_id: 'u1', return_url: 'https://app.example.com/x' } },
      { call: 'POST /v1/platform-users/x/disconnect', body: { external_id: 'u1' } },
      { call: 'POST /v1/platform-users/telegram/link', body: { external_id: 'u1' } },
      { call: 'GET /v1/platform-users/telegram?external_id=u1', body: undefined },
      { call: 'POST /v1/platform-users/telegram/unlink', body: { csid_id: 'c-1' } },
      { call: 'GET /v1/platform-users/kol?external_id=u1', body: undefined },
      { call: 'POST /v1/platform-users/kol/volume-check', body: { external_id: 'u1' } },
      { call: 'POST /v1/platform-users/kol/apply', body: { external_id: 'u1' } },
    ]);
    for (const c of calls) {
      expect(c.headers.authorization).toBe(`Bearer ${KEY}`);
      if (c.method === 'POST') expect(c.headers['content-type']).toBe('application/json');
    }
  });

  it('adds instance to every call, the QR code included', async () => {
    const { csid, calls } = client((req) =>
      new URL(req.url).pathname.endsWith('/qr') ? new Response('<svg/>') : ok({}),
      { instance: 'csid_abc' },
    );
    await csid.platformUser('u1');
    await csid.walletVerificationQr('v-1');
    await csid.platformUserSession('u1');
    for (const c of calls) expect(new URL(c.url).searchParams.get('instance')).toBe('csid_abc');
  });

  it('returns the data with the server status on the envelope', async () => {
    const user = { csid_id: 'c-1', external_id: 'u1', created: true, wallets_added: [], wallets: [] };
    const { csid } = client(() => ok(user, {}, {}));
    const got = await csid.createPlatformUser({ external_id: 'u1', wallets: ['So1'] });
    expect(got.created).toBe(true);
    expect(got.external_id).toBe('u1');
  });

  it('validates parameters before sending', async () => {
    const { csid, calls } = client(() => ok({}));
    // @ts-expect-error both identifiers
    await expect(csid.platformUser({ external_id: 'u1', csid_id: 'c' })).rejects.toMatchObject({ code: 'missing_parameter', parameter: 'external_id|csid_id' });
    // @ts-expect-error no identifier
    await expect(csid.platformUserKol({})).rejects.toBeInstanceOf(BadRequestError);
    await expect(csid.platformUser('')).rejects.toBeInstanceOf(BadRequestError);
    // @ts-expect-error external_id is required
    await expect(csid.createPlatformUser({ wallets: ['So1'] })).rejects.toMatchObject({ parameter: 'external_id' });
    await expect(csid.importPlatformUsers([])).rejects.toMatchObject({ parameter: 'users' });
    const many = Array.from({ length: 1001 }, (_, i) => ({ external_id: `u${i}`, wallets: ['So1'] }));
    await expect(csid.importPlatformUsers(many)).rejects.toMatchObject({ code: 'invalid_parameter', parameter: 'users' });
    await expect(csid.updatePlatformUser({ external_id: 'u1' })).rejects.toMatchObject({ parameter: 'display_name' });
    await expect(csid.addPlatformUserWallets({ external_id: 'u1', wallets: [] })).rejects.toMatchObject({ parameter: 'wallets' });
    // @ts-expect-error unknown chain
    await expect(csid.startWalletVerification({ external_id: 'u1', chain: 'tron', address: 'x' })).rejects.toMatchObject({ parameter: 'chain' });
    // @ts-expect-error unknown period
    await expect(csid.platformUserProfile({ external_id: 'u1', period: '2d' })).rejects.toMatchObject({ parameter: 'period' });
    // @ts-expect-error unknown trust
    await expect(csid.platformLeaderboard({ blockchain: 'eth', trust: 'some' })).rejects.toMatchObject({ parameter: 'trust' });
    // @ts-expect-error unknown setting value
    await expect(csid.updatePlatformSettings({ wallet_trust: 'none' })).rejects.toMatchObject({ parameter: 'wallet_trust', allowed: ['all', 'verified_only'] });
    // @ts-expect-error return_url is required
    await expect(csid.connectPlatformUserX({ external_id: 'u1' })).rejects.toMatchObject({ parameter: 'return_url' });
    await expect(csid.walletVerification('')).rejects.toMatchObject({ parameter: 'id' });
    expect(calls).toHaveLength(0);
  });
});

describe('platform users: errors', () => {
  const cases: [number, string, unknown][] = [
    [400, 'wallet_required', BadRequestError],
    [400, 'invalid_address', BadRequestError],
    [400, 'invalid_return_url', BadRequestError],
    [403, 'claim_disabled', PermissionError],
    [403, 'plan_user_limit', PlanUserLimitError],
    [404, 'platform_user_not_found', NotFoundError],
    [404, 'verification_not_found', NotFoundError],
    [404, 'competition_not_found', NotFoundError],
    [409, 'account_claimed', ConflictError],
    [409, 'too_many_wallets', ConflictError],
    [409, 'last_wallet', ConflictError],
    [409, 'kol_not_eligible', ConflictError],
    [409, 'competition_full', ConflictError],
    [429, 'rate_limited', RateLimitError],
    [503, 'service_unavailable', ServerError],
  ];
  it.each(cases)('%i %s', async (status, code, cls) => {
    const { csid } = client(() => apiError(status, code, `msg ${code}`, { user_limit: 25 }));
    const err = await csid.platformUser('u1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(cls as typeof Error);
    expect(err).toMatchObject({ status, code, message: `msg ${code}`, docs: `https://docs.cabalspy.xyz/cabalspy-id/errors#${code}` });
    expect((err as { body: { user_limit: number } }).body.user_limit).toBe(25);
  });

  it('does not retry a POST after rate_limited (only rate_limit_exceeded)', async () => {
    const { csid, calls } = client(() => apiError(429, 'rate_limited'), { maxRetries: 3 });
    await expect(csid.createPlatformUser({ external_id: 'u1', wallets: ['So1'] })).rejects.toBeInstanceOf(RateLimitError);
    expect(calls).toHaveLength(1);
  });
});

describe('platform users: pagination', () => {
  it('iterPlatformUsers follows next_cursor', async () => {
    const { csid, calls } = client((req) => {
      const cursor = new URL(req.url).searchParams.get('cursor');
      if (!cursor) return ok([{ external_id: 'a' }, { external_id: 'b' }], { pagination: { limit: 2, total: 3, has_more: true, next_cursor: 'Yw==' } });
      return ok([{ external_id: 'c' }], { pagination: { limit: 2, total: 3, has_more: false, next_cursor: null } });
    });
    const ids: string[] = [];
    for await (const u of csid.iterPlatformUsers({ limit: 2 })) ids.push(u.external_id);
    expect(ids).toEqual(['a', 'b', 'c']);
    expect(new URL(calls[1]!.url).searchParams.get('cursor')).toBe('Yw==');
    expect(new URL(calls[1]!.url).searchParams.get('limit')).toBe('2');
  });

  it('iterPlatformLeaderboard reads the envelope pagination', async () => {
    const { csid, calls } = client((req) => {
      const cursor = new URL(req.url).searchParams.get('cursor');
      const entry = (w: string, rank: number) => ({ wallet: w, rank, external_id: `u-${w}`, verified: false });
      if (!cursor) return ok({ trust: 'all', leaderboard: [entry('w1', 1)] }, { pagination: { limit: 1, total: 2, has_more: true, next_cursor: 'w1' } });
      return ok({ trust: 'all', leaderboard: [entry('w2', 2)] }, { pagination: { limit: 1, total: 2, has_more: false, next_cursor: null } });
    });
    const got: string[] = [];
    for await (const e of csid.iterPlatformLeaderboard({ blockchain: 'solana', limit: 1 })) got.push(e.external_id!);
    expect(got).toEqual(['u-w1', 'u-w2']);
    expect(new URL(calls[1]!.url).searchParams.get('cursor')).toBe('w1');
  });
});

// ── import with chunking ────────────────────────────────────────────────────

const users = (n: number, prefix = 'u'): PlatformUserInput[] =>
  Array.from({ length: n }, (_, i) => ({ external_id: `${prefix}${i}`, wallets: [`So${i}`] }));

const created = (u: { external_id: string }): PlatformImportItemResult => ({
  external_id: u.external_id,
  csid_id: `c-${u.external_id}`,
  status: 'created',
  wallets_added: [],
});

/** An import endpoint that creates everyone (the summary of each response is not used by the SDK). */
function importOk(req: RecordedRequest) {
  const body = JSON.parse(req.body!) as { users: { external_id: string }[] };
  return ok({ summary: { created: body.users.length, updated: 0, unchanged: 0, rejected: 0 }, results: body.users.map(created) });
}

const sent = (calls: RecordedRequest[]) => calls.map((c) => (JSON.parse(c.body!) as { users: { external_id: string }[] }).users.map((u) => u.external_id));

describe('importAllPlatformUsers', () => {
  it('sends chunks of at most 1000 and aggregates the results in input order', async () => {
    const { csid, calls } = client(importOk);
    const progress: number[] = [];
    const r = await csid.importAllPlatformUsers(users(2500), { onProgress: (p) => progress.push(p.done) });
    expect(calls.map((c) => (JSON.parse(c.body!) as { users: unknown[] }).users.length)).toEqual([1000, 1000, 500]);
    expect(calls.every((c) => new URL(c.url).pathname === '/v1/platform-users/import' && c.method === 'POST')).toBe(true);
    expect(r.summary).toEqual({ created: 2500, updated: 0, unchanged: 0, rejected: 0 });
    expect(r.results).toHaveLength(2500);
    expect(r.results[0]!.external_id).toBe('u0');
    expect(r.results[2499]!.external_id).toBe('u2499');
    expect(r.chunks).toBe(3);
    expect(r.requests).toBe(3);
    expect(progress).toEqual([1000, 2000, 2500]);
  });

  it('also splits by body size and honours chunkSize', async () => {
    const { csid, calls } = client(importOk);
    const big = users(30).map((u) => ({ ...u, display_name: 'x'.repeat(50), avatar_url: `https://cdn.example.com/${'a'.repeat(400)}` }));
    await csid.importAllPlatformUsers(big, { maxBodyBytes: 5_000 });
    for (const c of calls) expect(new TextEncoder().encode(c.body!).length).toBeLessThanOrEqual(5_000);
    expect(sent(calls).flat()).toEqual(big.map((u) => u.external_id));

    const small = client(importOk);
    await small.csid.importAllPlatformUsers(users(7), { chunkSize: 3 });
    expect(sent(small.calls).map((x) => x.length)).toEqual([3, 3, 1]);
  });

  it('retries a chunk after 429 honouring Retry-After, never re-sending a chunk that succeeded', async () => {
    let n = 0;
    const { csid, calls } = client((req) => {
      n++;
      if (n === 2) return apiError(429, 'rate_limit_exceeded', 'slow down', {}, { 'Retry-After': '7' });
      if (n === 3) return apiError(429, 'rate_limited', 'slow down');
      return importOk(req);
    });
    vi.useFakeTimers();
    const sleeps: number[] = [];
    const orig = globalThis.setTimeout;
    const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
      if ((ms ?? 0) >= 1000 && ms !== 30_000) sleeps.push(ms!); // not the request timeout
      return orig(fn, ms);
    }) as typeof setTimeout);
    const p = csid.importAllPlatformUsers(users(1500));
    await vi.runAllTimersAsync();
    const r = await p;
    spy.mockRestore();
    // chunk 1 once, chunk 2 three times (429 with Retry-After 7 s, then 429 without: backoff)
    expect(sent(calls).map((x) => [x.length, x[0]])).toEqual([
      [1000, 'u0'],
      [500, 'u1000'],
      [500, 'u1000'],
      [500, 'u1000'],
    ]);
    expect(sleeps[0]).toBe(7000);
    expect(sleeps[1]).toBeGreaterThanOrEqual(2000);
    expect(r.summary.created).toBe(1500);
    expect(r.requests).toBe(4);
    expect(r.chunks).toBe(2);
  });

  it('sends only the items rejected with rate_limited again', async () => {
    let round = 0;
    const { csid, calls } = client((req) => {
      round++;
      const body = JSON.parse(req.body!) as { users: { external_id: string }[] };
      if (round === 1) {
        return ok({
          summary: { created: 2, updated: 0, unchanged: 0, rejected: 2 },
          results: body.users.map((u, i): PlatformImportItemResult =>
            i < 2 ? created(u) : { external_id: u.external_id, status: 'rejected', error: { code: 'rate_limited', message: 'At most 2000 new platform users per minute.' } },
          ),
        });
      }
      return importOk(req);
    });
    vi.useFakeTimers();
    const p = csid.importAllPlatformUsers(users(4), { rateLimitedItemDelayMs: 60_000 });
    await vi.runAllTimersAsync();
    const r = await p;
    expect(sent(calls)).toEqual([['u0', 'u1', 'u2', 'u3'], ['u2', 'u3']]);
    expect(r.summary).toEqual({ created: 4, updated: 0, unchanged: 0, rejected: 0 });
    expect(r.results.map((x) => x.external_id)).toEqual(['u0', 'u1', 'u2', 'u3']);
  });

  it('keeps other rejections (plan_user_limit) as they are', async () => {
    const { csid, calls } = client((req) => {
      const body = JSON.parse(req.body!) as { users: { external_id: string }[] };
      return ok({
        summary: { created: 1, updated: 0, unchanged: 0, rejected: 1 },
        results: [created(body.users[0]!), { external_id: body.users[1]!.external_id, status: 'rejected', error: { code: 'plan_user_limit', message: 'full' } }],
      });
    });
    const r = await csid.importAllPlatformUsers(users(2));
    expect(calls).toHaveLength(1);
    expect(r.summary).toEqual({ created: 1, updated: 0, unchanged: 0, rejected: 1 });
    expect(r.results[1]!.error!.code).toBe('plan_user_limit');
  });

  it('stops on other errors with the results so far and the pending users', async () => {
    let n = 0;
    const { csid, calls } = client((req) => {
      n++;
      if (n === 2) return apiError(500, 'internal_error');
      return importOk(req);
    }, { maxRetries: 3 });
    const input = users(2500);
    const err = (await csid.importAllPlatformUsers(input).catch((e: unknown) => e)) as PlatformImportError;
    expect(err).toBeInstanceOf(PlatformImportError);
    expect(err.cause).toBeInstanceOf(ServerError);
    expect(err).toMatchObject({ status: 500, code: 'internal_error' });
    expect(calls).toHaveLength(2); // a POST is never retried after a server error
    expect(err.result.summary.created).toBe(1000);
    expect(err.pending).toHaveLength(1500);
    expect(err.pending[0]).toBe(input[1000]);
  });

  it('gives up after maxRetries 429s', async () => {
    const { csid, calls } = client(() => apiError(429, 'rate_limit_exceeded', 'no', {}, { 'Retry-After': '0' }));
    const err = await csid.importAllPlatformUsers(users(3), { maxRetries: 2 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PlatformImportError);
    expect((err as PlatformImportError).cause).toBeInstanceOf(RateLimitError);
    expect(calls).toHaveLength(3);
  });

  it('accepts any iterable and returns an empty result for no users', async () => {
    const { csid, calls } = client(importOk);
    const r = await csid.importAllPlatformUsers(new Set<PlatformUserInput>());
    expect(r).toEqual({ summary: { created: 0, updated: 0, unchanged: 0, rejected: 0 }, results: [], chunks: 0, requests: 0 });
    expect(calls).toHaveLength(0);
  });
});

// ── competitions ────────────────────────────────────────────────────────────

describe('competitions', () => {
  it('builds every endpoint path, query and body', async () => {
    const { csid, calls } = client(() => ok({ standings: [] }, { pagination: { limit: 100, total: 0, has_more: false, next_cursor: null } }));
    await csid.createCompetition({
      name: 'Weekly PnL',
      chain: 'solana',
      metric: 'pnl_usd',
      duration_hours: 168,
      starts_at: new Date('2026-11-01T18:00:00.000Z'),
      min_participants: 2,
      enrollment: 'all_users',
      prizes: [{ rank: 1, prize: '1 SOL' }],
    });
    await csid.competitions({ status: 'running', limit: 10, offset: 20 });
    await csid.competition('cmp-1');
    await csid.updateCompetition({ id: 'cmp-1', min_trades: 3, note: 'more trades' });
    await csid.cancelCompetition('cmp-1');
    await csid.joinCompetition({ id: 'cmp-1', external_id: 'u1' });
    await csid.leaveCompetition({ id: 'cmp-1', csid_id: 'c-1' });
    await csid.competitionParticipants({ id: 'cmp-1', limit: 50 });
    await csid.competitionStandings({ id: 'cmp-1', offset: 100 });
    expect(calls.map(describeCall)).toEqual([
      {
        call: 'POST /v1/competitions',
        body: {
          name: 'Weekly PnL',
          chain: 'solana',
          metric: 'pnl_usd',
          duration_hours: 168,
          starts_at: '2026-11-01T18:00:00Z',
          min_participants: 2,
          enrollment: 'all_users',
          prizes: [{ rank: 1, prize: '1 SOL' }],
        },
      },
      { call: 'GET /v1/competitions?status=running&limit=10&offset=20', body: undefined },
      { call: 'GET /v1/competitions/detail?id=cmp-1', body: undefined },
      { call: 'POST /v1/competitions/update', body: { id: 'cmp-1', min_trades: 3, note: 'more trades' } },
      { call: 'POST /v1/competitions/cancel', body: { id: 'cmp-1' } },
      { call: 'POST /v1/competitions/join', body: { id: 'cmp-1', external_id: 'u1' } },
      { call: 'POST /v1/competitions/leave', body: { id: 'cmp-1', csid_id: 'c-1' } },
      { call: 'GET /v1/competitions/participants?id=cmp-1&limit=50', body: undefined },
      { call: 'GET /v1/competitions/standings?id=cmp-1&offset=100', body: undefined },
    ]);
  });

  it('validates parameters before sending', async () => {
    const { csid, calls } = client(() => ok({}));
    // @ts-expect-error duration_hours is required
    await expect(csid.createCompetition({ name: 'x', chain: 'solana', metric: 'pnl' })).rejects.toMatchObject({ parameter: 'duration_hours' });
    // @ts-expect-error unknown metric
    await expect(csid.createCompetition({ name: 'x', chain: 'solana', metric: 'luck', duration_hours: 1 })).rejects.toMatchObject({ parameter: 'metric' });
    // @ts-expect-error unknown enrollment
    await expect(csid.updateCompetition({ id: 'c', enrollment: 'everyone' })).rejects.toMatchObject({ parameter: 'enrollment' });
    // @ts-expect-error unknown status
    await expect(csid.competitions({ status: 'paused' })).rejects.toMatchObject({ parameter: 'status' });
    // @ts-expect-error no user
    await expect(csid.joinCompetition({ id: 'c' })).rejects.toMatchObject({ parameter: 'external_id|csid_id' });
    await expect(csid.competition('')).rejects.toMatchObject({ parameter: 'id' });
    expect(calls).toHaveLength(0);
  });

  it('iterates with offsets, using total (has_more is always false on these routes)', async () => {
    const { csid, calls } = client((req) => {
      const u = new URL(req.url);
      const offset = Number(u.searchParams.get('offset') ?? 0);
      const all = ['s1', 's2', 's3', 's4', 's5'].map((id, i) => ({ csid_id: id, rank: i + 1, ranked: true }));
      const page = all.slice(offset, offset + 2);
      const pagination = { limit: 2, total: all.length, has_more: false, next_cursor: null };
      if (u.pathname.endsWith('/standings')) return ok({ competition_id: 'c', final: false, standings: page }, { pagination });
      return ok(page, { pagination });
    });
    const ids: string[] = [];
    for await (const s of csid.iterCompetitionStandings({ id: 'c', limit: 2 })) ids.push(s.csid_id);
    expect(ids).toEqual(['s1', 's2', 's3', 's4', 's5']);
    expect(calls.map((c) => new URL(c.url).searchParams.get('offset'))).toEqual(['0', '2', '4']);

    const parts: string[] = [];
    for await (const p of csid.iterCompetitionParticipants({ id: 'c', limit: 2, offset: 2 })) parts.push(p.csid_id);
    expect(parts).toEqual(['s3', 's4', 's5']);

    let count = 0;
    for await (const _c of csid.iterCompetitions({ limit: 2 })) count++;
    expect(count).toBe(5);
  });

  it('maps competition errors', async () => {
    const { csid } = client(() => apiError(409, 'competition_limit', 'You can run 5 competitions at a time', { limit: 5 }));
    const err = await csid.createCompetition({ name: 'x', chain: 'bnb', metric: 'volume_usd', duration_hours: 24 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err).toMatchObject({ status: 409, code: 'competition_limit' });
  });
});

describe('entry points', () => {
  it('cabalspy-id/api exposes the white-label client, errors and constants', () => {
    expect(api.CabalSpyID).toBe(CabalSpyID);
    expect(api.ConflictError).toBe(ConflictError);
    expect(api.PlatformImportError).toBe(PlatformImportError);
    expect(api.PLATFORM_IMPORT_MAX).toBe(1000);
    expect(api.PLATFORM_MAX_WALLETS_PER_REQUEST).toBe(10);
    expect(api.COMPETITION_METRICS).toContain('win_rate');
    expect(api.WALLET_TRUST).toEqual(['all', 'verified_only']);
    expect(typeof api.isWebhookEvent).toBe('function');
  });
});
