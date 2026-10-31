import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BadRequestError,
  CabalSpyID,
  CalloutCooldownError,
  ConflictError,
  FeatureNotEnabledError,
  NotFoundError,
  PermissionError,
  RateLimitError,
  ServerError,
  UnprocessableError,
  type Callout,
  type CalloutCompetitionStanding,
  type CalloutStreamEvent,
  type CompetitionStanding,
  type MeResponse,
} from '../src/index';
import * as api from '../src/entries/api';
import { type RecordedRequest, apiError, mockFetch, ok } from './helpers';

const KEY = 'csid_api_testkey';
const MINT = 'So11111111111111111111111111111111111111112';

function client(handler: Parameters<typeof mockFetch>[0], opts: Record<string, unknown> = {}) {
  const m = mockFetch(handler);
  const csid = new CabalSpyID({ apiKey: KEY, fetch: m.fetch, maxRetries: 0, ...opts });
  return { csid, calls: m.calls };
}

function describeCall(c: RecordedRequest) {
  const u = new URL(c.url);
  const q = u.searchParams.toString();
  return { call: `${c.method} ${u.pathname}${q ? `?${q}` : ''}`, body: c.body === undefined ? undefined : JSON.parse(c.body) };
}

/** A callout exactly as the server's present() builds it (first day scored on candles). */
const CALLOUT: Callout = {
  id: '6f1c0c52-5d0a-4a43-9a0b-6f7a1c9e2d11',
  chain: 'solana',
  mint: MINT,
  token: { name: 'Wrapped SOL', symbol: 'SOL', logo: null },
  author: { csid_id: 'c-1', external_id: 'u1', name: 'Alice', username: 'alice', avatar_url: null, kol: false },
  note: 'Breakout soon',
  called_at: '2026-10-31T12:00:00Z',
  window_ends_at: '2026-11-01T12:00:00Z',
  status: 'tracking',
  at_call: { price_usd: 0.001, market_cap_usd: 1_000_000 },
  now: { price_usd: 0.0025, market_cap_usd: 2_500_000, x: 2.5, at: '2026-11-01T13:00:00Z' },
  peak: { price_usd: 0.003, market_cap_usd: 3_000_000, x: 3, at: '2026-11-01T08:00:00Z' },
  score_x: 3,
  source: 'birdeye',
  tracking: {
    active: true,
    phase: 'extended',
    next_check_at: '2026-11-02T12:00:00Z',
    below_10k_since: null,
    daily_checks: 1,
    stopped_at: null,
    stop_reason: null,
  },
  first_day: { kind: 'candles', entry_price_usd: 0.001, peak_x: 3, close_x: 2.4, minutes_to_peak: 1200, flags: [] },
};

afterEach(() => {
  vi.useRealTimers();
});

describe('callouts: requests', () => {
  it('builds every endpoint path, query and body', async () => {
    const { csid, calls } = client((req) => {
      const path = new URL(req.url).pathname;
      if (path === '/v1/callouts' && req.method === 'GET') return ok([CALLOUT], { pagination: { limit: 10, has_more: false, next_cursor: null } });
      if (path === '/v1/callouts/leaderboard') {
        return ok({ period: '30d', chain: 'base', sort: 'hit_rate', hit_x: 3, leaderboard: [] }, { pagination: { limit: 20, total: 0, has_more: false, next_cursor: null } });
      }
      return ok(CALLOUT);
    });
    await csid.createCallout({ external_id: 'u1', chain: 'solana', mint: MINT, note: 'Breakout soon' });
    await csid.createCallout({ csid_id: 'c-1', chain: 'base', mint: '0xabc' });
    await csid.removeCallout({ id: 'co-1', reason: 'spam' });
    await csid.removeCallout('co-2');
    await csid.callouts({ chain: 'solana', mint: MINT, external_id: 'u1', since: new Date('2026-10-30T00:00:00.000Z'), until: '2026-10-31T00:00:00Z', limit: 10, cursor: 'cur' });
    await csid.calloutsRaw({ csid_id: 'c-1' });
    await csid.callout('co-1');
    await csid.calloutStats('u1');
    await csid.calloutStats({ csid_id: 'c-1', hit_x: 5 });
    await csid.calloutLeaderboard({ period: '30d', chain: 'base', sort: 'hit_rate', min_callouts: 3, hit_x: 3, limit: 20 });
    await csid.calloutLeaderboard();
    await csid.calloutSettings();
    await csid.updateCalloutSettings({ who: 'kol_only', require_holding: false, cooldown_minutes: 0 });

    expect(calls.map(describeCall)).toEqual([
      { call: 'POST /v1/callouts', body: { external_id: 'u1', chain: 'solana', mint: MINT, note: 'Breakout soon' } },
      { call: 'POST /v1/callouts', body: { csid_id: 'c-1', chain: 'base', mint: '0xabc' } },
      { call: 'POST /v1/callouts/remove', body: { id: 'co-1', reason: 'spam' } },
      { call: 'POST /v1/callouts/remove', body: { id: 'co-2' } },
      {
        call: `GET /v1/callouts?chain=solana&mint=${MINT}&external_id=u1&since=2026-10-30T00%3A00%3A00Z&until=2026-10-31T00%3A00%3A00Z&limit=10&cursor=cur`,
        body: undefined,
      },
      { call: 'GET /v1/callouts?csid_id=c-1', body: undefined },
      { call: 'GET /v1/callouts/item?id=co-1', body: undefined },
      { call: 'GET /v1/callouts/stats?external_id=u1', body: undefined },
      { call: 'GET /v1/callouts/stats?csid_id=c-1&hit_x=5', body: undefined },
      { call: 'GET /v1/callouts/leaderboard?period=30d&chain=base&sort=hit_rate&min_callouts=3&hit_x=3&limit=20', body: undefined },
      { call: 'GET /v1/callouts/leaderboard', body: undefined },
      { call: 'GET /v1/callouts/settings', body: undefined },
      { call: 'POST /v1/callouts/settings', body: { who: 'kol_only', require_holding: false, cooldown_minutes: 0 } },
    ]);
    for (const c of calls) expect(c.headers.authorization).toBe(`Bearer ${KEY}`);
  });

  it('returns typed data', async () => {
    const { csid } = client(() => ok(CALLOUT));
    const c = await csid.createCallout({ external_id: 'u1', chain: 'solana', mint: MINT });
    expect(c.score_x).toBe(3);
    expect(c.tracking.below_10k_since).toBeNull();
    expect(c.first_day?.kind).toBe('candles');
    expect(c.author.external_id).toBe('u1');
  });

  it('adds instance to every call', async () => {
    const { csid, calls } = client(() => ok({}), { instance: 'csid_abc' });
    await csid.callout('co-1');
    await csid.createCallout({ external_id: 'u1', chain: 'solana', mint: MINT });
    for (const c of calls) expect(new URL(c.url).searchParams.get('instance')).toBe('csid_abc');
  });

  it('validates parameters before sending', async () => {
    const { csid, calls } = client(() => ok({}));
    // @ts-expect-error no user
    await expect(csid.createCallout({ chain: 'solana', mint: MINT })).rejects.toMatchObject({ parameter: 'external_id|csid_id' });
    // @ts-expect-error unknown chain
    await expect(csid.createCallout({ external_id: 'u1', chain: 'tron', mint: MINT })).rejects.toMatchObject({ parameter: 'chain' });
    // @ts-expect-error mint is required
    await expect(csid.createCallout({ external_id: 'u1', chain: 'solana' })).rejects.toMatchObject({ parameter: 'mint' });
    await expect(csid.removeCallout('')).rejects.toMatchObject({ parameter: 'id' });
    await expect(csid.callouts({ mint: MINT })).rejects.toMatchObject({ parameter: 'chain' });
    // @ts-expect-error at most one user
    await expect(csid.callouts({ external_id: 'u1', csid_id: 'c-1' })).rejects.toBeInstanceOf(BadRequestError);
    await expect(csid.callout('')).rejects.toMatchObject({ parameter: 'id' });
    await expect(csid.calloutStats({ external_id: 'u1', hit_x: 1 })).rejects.toMatchObject({ parameter: 'hit_x' });
    // @ts-expect-error no user
    await expect(csid.calloutStats({})).rejects.toMatchObject({ parameter: 'external_id|csid_id' });
    // @ts-expect-error unknown sort
    await expect(csid.calloutLeaderboard({ sort: 'volume' })).rejects.toMatchObject({ parameter: 'sort' });
    // @ts-expect-error unknown period
    await expect(csid.calloutLeaderboard({ period: '1y' })).rejects.toMatchObject({ parameter: 'period' });
    await expect(csid.calloutLeaderboard({ hit_x: 1001 })).rejects.toMatchObject({ parameter: 'hit_x' });
    // @ts-expect-error unknown who
    await expect(csid.updateCalloutSettings({ who: 'everyone' })).rejects.toMatchObject({ parameter: 'who' });
    await expect(csid.updateCalloutSettings({ cooldown_minutes: 10081 })).rejects.toMatchObject({ parameter: 'cooldown_minutes' });
    await expect(csid.updateCalloutSettings({ cooldown_minutes: 1.5 })).rejects.toMatchObject({ parameter: 'cooldown_minutes' });
    expect(calls).toHaveLength(0);
  });

  it('iterates callouts and the leaderboard, following next_cursor', async () => {
    const { csid, calls } = client((req) => {
      const u = new URL(req.url);
      const cursor = u.searchParams.get('cursor');
      if (u.pathname === '/v1/callouts/leaderboard') {
        const entry = (rank: number) => ({ rank, csid_id: `c-${rank}`, callouts: 1, avg_peak_x: 2, best_call: { id: 'x', chain: 'solana', mint: MINT, symbol: 'S', peak_x: 2 } });
        return cursor
          ? ok({ period: '7d', chain: null, sort: 'avg_peak_x', hit_x: 2, leaderboard: [entry(3)] }, { pagination: { limit: 2, total: 3, has_more: false, next_cursor: null } })
          : ok({ period: '7d', chain: null, sort: 'avg_peak_x', hit_x: 2, leaderboard: [entry(1), entry(2)] }, { pagination: { limit: 2, total: 3, has_more: true, next_cursor: 'p2' } });
      }
      return cursor
        ? ok([{ ...CALLOUT, id: 'b' }], { pagination: { limit: 1, has_more: false, next_cursor: null } })
        : ok([{ ...CALLOUT, id: 'a' }], { pagination: { limit: 1, has_more: true, next_cursor: 'n1' } });
    });
    const ids: string[] = [];
    for await (const c of csid.iterCallouts({ chain: 'solana', limit: 1 })) ids.push(c.id);
    expect(ids).toEqual(['a', 'b']);
    const ranks: number[] = [];
    for await (const e of csid.iterCalloutLeaderboard({ limit: 2 })) ranks.push(e.rank);
    expect(ranks).toEqual([1, 2, 3]);
    expect(calls.map((c) => new URL(c.url).searchParams.get('cursor'))).toEqual([null, 'n1', null, 'p2']);
  });

  it('me() carries the instance features', async () => {
    const me: MeResponse = {
      instance: 'example.com',
      client_id: 'csid_x',
      mode: 'live',
      plan: 'pro',
      rate_limit_rps: 10,
      websockets: true,
      global_scope: false,
      users_with_data: 3,
      features: ['callouts'],
    };
    const { csid } = client(() => ok(me));
    expect((await csid.me()).features).toContain('callouts');
  });
});

describe('callouts: errors', () => {
  it('callout_cooldown is a CalloutCooldownError with retryAfter and is never retried', async () => {
    const { csid, calls } = client(
      () => apiError(429, 'callout_cooldown', 'One callout every 360 minutes; next one in 42 minutes.', { retry_after: 2500 }, { 'Retry-After': '2500' }),
      { maxRetries: 3 },
    );
    const err = await csid.createCallout({ external_id: 'u1', chain: 'solana', mint: MINT }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CalloutCooldownError);
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err).toMatchObject({ status: 429, code: 'callout_cooldown', retryAfter: 2500 });
    expect(calls).toHaveLength(1);
  });

  it('callout_cooldown falls back to retry_after in the body', async () => {
    const { csid } = client(() => apiError(429, 'callout_cooldown', 'wait', { retry_after: 61 }));
    const err = await csid.createCallout({ external_id: 'u1', chain: 'solana', mint: MINT }).catch((e: unknown) => e);
    expect(err).toMatchObject({ retryAfter: 61 });
  });

  it('the API rate limit on a POST is still retried', async () => {
    let n = 0;
    const { csid, calls } = client(
      () => (++n === 1 ? apiError(429, 'rate_limit_exceeded', 'slow down', {}, { 'Retry-After': '0' }) : ok(CALLOUT)),
      { maxRetries: 2 },
    );
    await csid.createCallout({ external_id: 'u1', chain: 'solana', mint: MINT });
    expect(calls).toHaveLength(2);
  });

  it.each([
    [403, 'feature_not_enabled', FeatureNotEnabledError],
    [403, 'not_a_holder', PermissionError],
    [403, 'kol_only', PermissionError],
    [403, 'invalid_account', PermissionError],
    [403, 'posting_paused', PermissionError],
    [409, 'already_called', ConflictError],
    [404, 'callout_not_found', NotFoundError],
    [422, 'no_price', UnprocessableError],
    [503, 'service_unavailable', ServerError],
    [400, 'invalid_parameter', BadRequestError],
  ] as const)('%i %s', async (status, code, cls) => {
    const { csid, calls } = client(() => apiError(status, code), { maxRetries: 2 });
    const err = await csid.createCallout({ external_id: 'u1', chain: 'solana', mint: MINT }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(cls);
    expect(err).toMatchObject({ status, code });
    expect(calls).toHaveLength(1);
  });

  it('feature_not_enabled is a PermissionError too (GET is not retried)', async () => {
    const { csid, calls } = client(() => apiError(403, 'feature_not_enabled', 'Callouts are not enabled for this instance.'), { maxRetries: 2 });
    const err = await csid.calloutSettings().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PermissionError);
    expect(err).toBeInstanceOf(FeatureNotEnabledError);
    expect(calls).toHaveLength(1);
  });
});

describe('callout competitions', () => {
  it('sends kind, min_callouts, hit_x and chain all', async () => {
    const { csid, calls } = client(() => ok({}));
    await csid.createCompetition({
      kind: 'callouts',
      name: 'Best caller',
      chain: 'all',
      metric: 'avg_peak_x',
      duration_hours: 72,
      min_callouts: 3,
      hit_x: 5,
    });
    await csid.createCompetition({ kind: 'trading', name: 'PnL', chain: 'solana', metric: 'pnl_usd', duration_hours: 24, min_trades: 2 });
    await csid.updateCompetition({ id: 'cmp-1', min_callouts: 5, hit_x: 3, note: 'harder' });
    await csid.updateCompetition({ id: 'cmp-1', metric: 'hit_rate' });
    expect(calls.map(describeCall)).toEqual([
      {
        call: 'POST /v1/competitions',
        body: { kind: 'callouts', name: 'Best caller', chain: 'all', metric: 'avg_peak_x', duration_hours: 72, min_callouts: 3, hit_x: 5 },
      },
      { call: 'POST /v1/competitions', body: { kind: 'trading', name: 'PnL', chain: 'solana', metric: 'pnl_usd', duration_hours: 24, min_trades: 2 } },
      { call: 'POST /v1/competitions/update', body: { id: 'cmp-1', min_callouts: 5, hit_x: 3, note: 'harder' } },
      { call: 'POST /v1/competitions/update', body: { id: 'cmp-1', metric: 'hit_rate' } },
    ]);
  });

  it('validates kind-specific fields before sending', async () => {
    const { csid, calls } = client(() => ok({}));
    // @ts-expect-error callout metric on a trading competition
    await expect(csid.createCompetition({ name: 'x', chain: 'solana', metric: 'avg_peak_x', duration_hours: 1 })).rejects.toMatchObject({ parameter: 'metric' });
    // @ts-expect-error trading metric on a callout competition
    await expect(csid.createCompetition({ kind: 'callouts', name: 'x', chain: 'solana', metric: 'pnl_usd', duration_hours: 1 })).rejects.toMatchObject({ parameter: 'metric' });
    // @ts-expect-error chain all is for callout competitions
    await expect(csid.createCompetition({ name: 'x', chain: 'all', metric: 'pnl', duration_hours: 1 })).rejects.toMatchObject({ parameter: 'chain' });
    // @ts-expect-error min_callouts is for callout competitions
    await expect(csid.createCompetition({ name: 'x', chain: 'solana', metric: 'pnl', duration_hours: 1, min_callouts: 2 })).rejects.toMatchObject({ parameter: 'min_callouts' });
    // @ts-expect-error min_trades is for trading competitions
    await expect(csid.createCompetition({ kind: 'callouts', name: 'x', chain: 'all', metric: 'callouts', duration_hours: 1, min_trades: 2 })).rejects.toMatchObject({ parameter: 'min_trades' });
    await expect(csid.createCompetition({ kind: 'callouts', name: 'x', chain: 'all', metric: 'callouts', duration_hours: 1, hit_x: 1 })).rejects.toMatchObject({ parameter: 'hit_x' });
    // @ts-expect-error unknown kind
    await expect(csid.createCompetition({ kind: 'memes', name: 'x', chain: 'solana', metric: 'pnl', duration_hours: 1 })).rejects.toMatchObject({ parameter: 'kind' });
    // @ts-expect-error kind cannot change
    await expect(csid.updateCompetition({ id: 'c', kind: 'callouts' })).rejects.toMatchObject({ parameter: 'kind' });
    // @ts-expect-error unknown metric
    await expect(csid.updateCompetition({ id: 'c', metric: 'luck' })).rejects.toMatchObject({ parameter: 'metric' });
    expect(calls).toHaveLength(0);
  });

  it('maps feature_not_enabled on a callout competition', async () => {
    const { csid } = client(() => apiError(403, 'feature_not_enabled', 'Callout competitions need callouts'));
    const err = await csid.createCompetition({ kind: 'callouts', name: 'x', chain: 'all', metric: 'sum_peak_x', duration_hours: 1 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FeatureNotEnabledError);
  });

  it('types callout standings and competitions', async () => {
    const standing: CalloutCompetitionStanding = {
      rank: 1,
      ranked: true,
      external_id: 'u1',
      csid_id: 'c-1',
      score: 3.5,
      callouts: 4,
      avg_peak_x: 3.5,
      median_peak_x: 3,
      best_peak_x: 6,
      sum_peak_x: 14,
      hits: 3,
      hit_rate: 75,
      best_call: { id: 'co-1', chain: 'solana', mint: MINT, symbol: 'SOL', peak_x: 6 },
    };
    const { csid } = client((req) =>
      new URL(req.url).pathname.endsWith('/standings')
        ? ok({ competition_id: 'cmp', status: 'running', metric: 'avg_peak_x', rules_version: 1, updated_at: null, final: false, standings: [standing] }, { pagination: { limit: 100, total: 1, has_more: false, next_cursor: null } })
        : ok({ id: 'cmp', kind: 'callouts', chain: 'all', chain_name: 'All chains', metric: 'avg_peak_x', min_callouts: 3, hit_x: 2 }),
    );
    const comp = await csid.competition('cmp');
    expect(comp.kind).toBe('callouts');
    expect(comp.chain).toBe('all');
    expect(comp.min_callouts).toBe(3);
    const { standings } = await csid.competitionStandings({ id: 'cmp' });
    const s: CompetitionStanding = standings[0]!;
    expect(s.best_call?.peak_x).toBe(6);
    expect(s.hit_rate).toBe(75);
  });
});

// ── stream ──────────────────────────────────────────────────────────────────

class FakeWS {
  static all: FakeWS[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  constructor(public url: string) {
    FakeWS.all.push(this);
  }
  send(d: string) {
    this.sent.push(d);
  }
  close(code = 1000) {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.({ code });
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  push(m: unknown) {
    this.onmessage?.({ data: JSON.stringify(m) });
  }
  ready(chain: string | null = null, mint: string | null = null) {
    this.open();
    this.push({
      event: 'ready',
      data: { events: ['callout.created', 'callout.update', 'callout.milestone', 'callout.scored', 'callout.final', 'callout.removed'], chain, mint },
    });
  }
}

const last = () => FakeWS.all[FakeWS.all.length - 1]!;
const streamClient = (opts: Record<string, unknown> = {}) => new CabalSpyID({ apiKey: 'k', fetch: (() => {}) as never, ...opts });

describe('CalloutsStream', () => {
  afterEach(() => {
    FakeWS.all = [];
  });

  it('connects to /v1/callouts/stream with key, chain, mint and instance', async () => {
    const cs = streamClient({ instance: 'csid_abc' }).calloutsStream({ WebSocketImpl: FakeWS, chain: 'solana', mint: MINT });
    const p = cs.connect();
    const u = new URL(last().url);
    expect(`${u.protocol}//${u.host}${u.pathname}`).toBe('wss://api-id.cabalspy.xyz/v1/callouts/stream');
    expect(Object.fromEntries(u.searchParams)).toEqual({ api_key: 'k', chain: 'solana', mint: MINT, instance: 'csid_abc' });
    expect(cs.safeUrl).toContain('api_key=***');
    last().ready('solana', MINT);
    expect(await p).toMatchObject({ chain: 'solana', mint: MINT });
    expect(cs.connected).toBe(true);
    cs.ping();
    expect(last().sent).toEqual([JSON.stringify({ op: 'ping' })]);
    cs.close();
  });

  it('honours calloutsStreamUrl', () => {
    const cs = streamClient({ calloutsStreamUrl: 'ws://localhost:9000/v1/callouts/stream/' }).calloutsStream({ WebSocketImpl: FakeWS });
    expect(cs.safeUrl).toBe('ws://localhost:9000/v1/callouts/stream?api_key=***');
  });

  it('emits every callout event with its payload', async () => {
    const cs = streamClient().calloutsStream({ WebSocketImpl: FakeWS });
    const got: string[] = [];
    cs.on('callout.created', (c) => got.push(`created:${c.score_x}`))
      .on('callout.update', (u) => got.push(`update:${u.x}/${u.peak_x}`))
      .on('callout.milestone', (m) => got.push(`milestone:${m.milestone_x}`))
      .on('callout.scored', (c) => got.push(`scored:${c.first_day?.kind}`))
      .on('callout.final', (c) => got.push(`final:${c.tracking.stop_reason}`))
      .on('callout.removed', (r) => got.push(`removed:${r.id}`))
      .on('heartbeat', (h) => got.push(`hb:${h.ts}`))
      .on('pong', () => got.push('pong'));
    const p = cs.connect();
    last().ready();
    await p;
    const ws = last();
    ws.push({ event: 'callout.created', data: CALLOUT });
    ws.push({ event: 'callout.update', data: { id: 'co', chain: 'solana', mint: MINT, price_usd: 0.002, market_cap_usd: 2e6, x: 2, peak_x: 3 } });
    ws.push({ event: 'callout.milestone', data: { ...CALLOUT, milestone_x: 5 } });
    ws.push({ event: 'callout.scored', data: CALLOUT });
    ws.push({ event: 'callout.final', data: { ...CALLOUT, status: 'final', tracking: { ...CALLOUT.tracking, active: false, phase: 'stopped', stop_reason: 'inactive' } } });
    ws.push({ event: 'callout.removed', data: { id: 'co', chain: 'solana', mint: MINT } });
    ws.push({ event: 'heartbeat', ts: 7 });
    ws.push({ event: 'pong' });
    ws.push({ event: 'something.new', data: {} });
    expect(got).toEqual(['created:3', 'update:2/3', 'milestone:5', 'scored:candles', 'final:inactive', 'removed:co', 'hb:7', 'pong']);
    cs.close();
  });

  it('feature_not_enabled before ready is fatal (no reconnect)', async () => {
    const cs = streamClient().calloutsStream({ WebSocketImpl: FakeWS, reconnectDelay: 5 });
    const p = cs.connect();
    last().open();
    last().push({ event: 'error', error: { code: 'feature_not_enabled', message: 'Callouts are not enabled for this instance.' } });
    last().close(4403);
    await expect(p).rejects.toBeInstanceOf(FeatureNotEnabledError);
    await new Promise((r) => setTimeout(r, 40));
    expect(FakeWS.all).toHaveLength(1);
  });

  it('too_many_connections is not fatal: it reconnects', async () => {
    const cs = streamClient().calloutsStream({ WebSocketImpl: FakeWS, reconnectDelay: 5 });
    const p = cs.connect();
    last().open();
    last().push({ event: 'error', error: { code: 'too_many_connections', message: 'At most 5' } });
    last().close(4403);
    await expect(p).rejects.toBeInstanceOf(RateLimitError);
    await new Promise((r) => setTimeout(r, 300));
    expect(FakeWS.all.length).toBeGreaterThanOrEqual(2);
    cs.close();
  });

  it('reconnects after a drop and reopens on a missing heartbeat', async () => {
    vi.useFakeTimers();
    const cs = streamClient().calloutsStream({ WebSocketImpl: FakeWS, heartbeatTimeout: 1000, reconnectDelay: 10 });
    const p = cs.connect();
    last().ready();
    await p;
    await vi.advanceTimersByTimeAsync(1600);
    expect(FakeWS.all.length).toBeGreaterThanOrEqual(2);
    cs.close();
  });

  it('validates options locally', () => {
    // @ts-expect-error unknown chain
    expect(() => streamClient().calloutsStream({ chain: 'tron' })).toThrow(BadRequestError);
    expect(() => streamClient().calloutsStream({ mint: MINT })).toThrow(/chain/);
    expect(() => new CabalSpyID({ apiKey: '', fetch: (() => {}) as never }).calloutsStream()).toThrow(/API key/);
  });

  it('iterates callout events as a typed union', async () => {
    const cs = streamClient().calloutsStream({ WebSocketImpl: FakeWS });
    const seen: string[] = [];
    const run = (async () => {
      for await (const ev of cs) {
        const e: CalloutStreamEvent = ev;
        if (e.event === 'callout.milestone') seen.push(`m${e.data.milestone_x}`);
        else if (e.event === 'callout.update') seen.push(`u${e.data.peak_x}`);
        else seen.push(e.event);
        if (seen.length === 3) break;
      }
    })();
    await new Promise((r) => setTimeout(r, 0));
    last().ready();
    await new Promise((r) => setTimeout(r, 0));
    last().push({ event: 'callout.created', data: CALLOUT });
    last().push({ event: 'callout.update', data: { id: 'co', chain: 'solana', mint: MINT, price_usd: 1, market_cap_usd: null, x: 1, peak_x: 2 } });
    last().push({ event: 'callout.milestone', data: { ...CALLOUT, milestone_x: 10 } });
    await run;
    expect(seen).toEqual(['callout.created', 'u2', 'm10']);
    expect(last().readyState).toBe(3);
  });
});

describe('entry points', () => {
  it('cabalspy-id/api exposes callouts', () => {
    expect(api.CabalSpyID).toBe(CabalSpyID);
    expect(api.CalloutsStream).toBeTypeOf('function');
    expect(api.CalloutCooldownError).toBe(CalloutCooldownError);
    expect(api.FeatureNotEnabledError).toBe(FeatureNotEnabledError);
    expect(api.UnprocessableError).toBe(UnprocessableError);
    expect(api.CALLOUT_COMPETITION_METRICS).toEqual(['avg_peak_x', 'best_peak_x', 'sum_peak_x', 'hit_rate', 'callouts']);
    expect(api.COMPETITION_KINDS).toEqual(['trading', 'callouts']);
    expect(api.CALLOUT_LEADERBOARD_SORTS).toContain('median_peak_x');
    expect(api.CALLOUT_MILESTONES).toEqual([2, 3, 5, 10, 20, 50, 100]);
    expect(api.CALLOUT_EVENT_NAMES).toContain('callout.scored');
    expect(api.DEFAULT_CALLOUTS_STREAM_URL).toBe('wss://api-id.cabalspy.xyz/v1/callouts/stream');
  });
});
