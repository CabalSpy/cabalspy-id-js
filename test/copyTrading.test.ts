import { afterEach, describe, expect, it } from 'vitest';

import {
  BadRequestError,
  CabalSpyID,
  ConflictError,
  NotFoundError,
  PermissionError,
  RateLimitError,
  ServerError,
  type CopyInstruction,
  type CopyInstructionEvent,
  type CopyTradingSetting,
  type CopyTradingStreamEvent,
} from '../src/index';
import * as api from '../src/entries/api';
import { type RecordedRequest, apiError, mockFetch, ok } from './helpers';

const KEY = 'csid_api_testkey';
const MINT = 'So11111111111111111111111111111111111111112';
const TX = '5'.repeat(88);

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

const TRADER = { csid_id: 't-1', username: 'ctkol', name: 'Ctkol', image_url: null, kol: true, profile_url: 'https://id.cabalspy.xyz/u/ctkol' };
const COPY = {
  enabled: true,
  mode: 'fixed_usd',
  amount_usd: 25,
  percent: 100,
  max_usd: 20,
  sides: 'both',
  slippage_bps: 300,
  updated_at: '2026-11-01T12:00:00Z',
} as const;
const SETTING: CopyTradingSetting = { trader: TRADER, copy: COPY, managed_by_other_platform: false };

/** An instruction exactly as the server's present() builds it. */
const INSTRUCTION: CopyInstruction = {
  id: '9f0b1c2d-0000-4000-8000-000000000001',
  type: 'copy_instruction',
  status: 'pending',
  created_at: '2026-11-01T12:00:00Z',
  expires_at: '2026-11-01T12:02:00Z',
  csid_id: 'f-1',
  trader: TRADER,
  action: {
    blockchain: 'solana',
    mint: MINT,
    symbol: 'CPT',
    name: null,
    logo: null,
    side: 'buy',
    amount_usd: 20,
    amount_native: 0.133333333,
    currency: 'SOL',
    sell_percent: null,
    price_usd: 0.15,
    max_price_usd: 0.1545,
    min_price_usd: null,
    slippage_bps: 300,
  },
  source_trade: {
    blockchain: 'solana',
    mint: MINT,
    symbol: 'CPT',
    name: null,
    logo: null,
    side: 'buy',
    label: 'new',
    sold_percent: null,
    amount_native: 1,
    currency: 'SOL',
    amount_usd: 150,
    token_amount: 1000,
    price_usd: 0.15,
    pnl_usd: null,
    pnl_percent: null,
    wallet: 'W1',
    wallet_url: null,
    tx_signature: 'sig',
    tx_url: null,
  },
  settings: COPY,
  links: { token: null, terminal: null, profile: null },
  tx_signature: null,
  executed_amount_usd: null,
  note: null,
  updated_at: '2026-11-01T12:00:00Z',
};

describe('copy trading: requests', () => {
  it('builds every endpoint path, query and body', async () => {
    const { csid, calls } = client((req) => {
      const path = new URL(req.url).pathname;
      if (path === '/v1/copy-trading/instructions') return ok([INSTRUCTION], { pagination: { limit: 50, has_more: false, next_cursor: null } });
      if (path === '/v1/copy-trading/settings') return ok(SETTING);
      return ok(INSTRUCTION);
    });
    await csid.copyTradingSettings('u1');
    await csid.copyTradingSettings({ csid_id: 'f-1', trader: 'ctkol' });
    await csid.copyTradingSettings({ external_id: 'u1', trader_external_id: 'u2' });
    await csid.updateCopyTradingSettings({
      external_id: 'u1',
      trader: 'ctkol',
      enabled: true,
      mode: 'fixed_usd',
      amount_usd: 25,
      max_usd: 20,
      sides: 'buys',
      slippage_bps: 150,
    });
    await csid.updateCopyTradingSettings({ csid_id: 'f-1', trader_external_id: 'u2', mode: 'percent', percent: 10, max_usd: null });
    await csid.updateCopyTradingSettings({ external_id: 'u1', trader: 't-1', enabled: false });
    await csid.copyInstructions();
    await csid.copyInstructions({ external_id: 'u1', status: 'expired', limit: 2, cursor: 'abc' });
    await csid.copyInstructionsRaw({ csid_id: 'f-1', status: 'executed' });
    await csid.copyInstruction('i1');
    await csid.reportCopyInstruction({ id: 'i1', status: 'executed', tx_signature: TX, executed_amount_usd: 19.8 });
    await csid.reportCopyInstruction({ id: 'i2', status: 'failed', note: 'insufficient balance' });
    await csid.reportCopyInstruction({ id: 'i3', status: 'skipped' });

    expect(calls.map(describeCall)).toEqual([
      { call: 'GET /v1/copy-trading/settings?external_id=u1', body: undefined },
      { call: 'GET /v1/copy-trading/settings?csid_id=f-1&trader=ctkol', body: undefined },
      { call: 'GET /v1/copy-trading/settings?external_id=u1&trader_external_id=u2', body: undefined },
      {
        call: 'POST /v1/copy-trading/settings',
        body: { external_id: 'u1', trader: 'ctkol', enabled: true, mode: 'fixed_usd', amount_usd: 25, max_usd: 20, sides: 'buys', slippage_bps: 150 },
      },
      { call: 'POST /v1/copy-trading/settings', body: { csid_id: 'f-1', trader_external_id: 'u2', mode: 'percent', percent: 10, max_usd: null } },
      { call: 'POST /v1/copy-trading/settings', body: { external_id: 'u1', trader: 't-1', enabled: false } },
      { call: 'GET /v1/copy-trading/instructions', body: undefined },
      { call: 'GET /v1/copy-trading/instructions?external_id=u1&status=expired&limit=2&cursor=abc', body: undefined },
      { call: 'GET /v1/copy-trading/instructions?csid_id=f-1&status=executed', body: undefined },
      { call: 'GET /v1/copy-trading/instructions/item?id=i1', body: undefined },
      { call: 'POST /v1/copy-trading/instructions/status', body: { id: 'i1', status: 'executed', tx_signature: TX, executed_amount_usd: 19.8 } },
      { call: 'POST /v1/copy-trading/instructions/status', body: { id: 'i2', status: 'failed', note: 'insufficient balance' } },
      { call: 'POST /v1/copy-trading/instructions/status', body: { id: 'i3', status: 'skipped' } },
    ]);
    for (const c of calls) expect(c.headers.authorization).toBe(`Bearer ${KEY}`);
  });

  it('returns typed data (a list, or one setting with a trader)', async () => {
    const { csid } = client((req) => {
      const u = new URL(req.url);
      if (u.pathname === '/v1/copy-trading/settings') return ok(u.searchParams.get('trader') || req.method === 'POST' ? SETTING : [SETTING]);
      if (u.pathname === '/v1/copy-trading/instructions') return ok([INSTRUCTION], { pagination: { limit: 50, has_more: false, next_cursor: null } });
      return ok({ ...INSTRUCTION, status: 'executed', tx_signature: TX, executed_amount_usd: 19.8 });
    });
    const all = await csid.copyTradingSettings('u1');
    expect(all[0]!.copy.enabled).toBe(true);
    const one = await csid.copyTradingSettings({ external_id: 'u1', trader: 'ctkol' });
    expect(one.copy.max_usd).toBe(20);
    expect(one.managed_by_other_platform).toBe(false);
    expect((await csid.updateCopyTradingSettings({ external_id: 'u1', trader: 'ctkol', enabled: true })).trader.username).toBe('ctkol');
    const [i] = await csid.copyInstructions({ external_id: 'u1' });
    expect(i!.action.max_price_usd).toBe(0.1545);
    const done = await csid.reportCopyInstruction({ id: i!.id, status: 'executed', tx_signature: TX, executed_amount_usd: 19.8 });
    expect(done).toMatchObject({ status: 'executed', executed_amount_usd: 19.8 });
  });

  it('adds instance to every call', async () => {
    const { csid, calls } = client(() => ok({}), { instance: 'csid_abc' });
    await csid.copyInstruction('i1');
    await csid.reportCopyInstruction({ id: 'i1', status: 'skipped' });
    for (const c of calls) expect(new URL(c.url).searchParams.get('instance')).toBe('csid_abc');
  });

  it('validates parameters before sending', async () => {
    const { csid, calls } = client(() => ok({}));
    // @ts-expect-error no user
    await expect(csid.copyTradingSettings({})).rejects.toMatchObject({ parameter: 'external_id|csid_id' });
    // @ts-expect-error at most one trader
    await expect(csid.copyTradingSettings({ external_id: 'u1', trader: 'a', trader_external_id: 'b' })).rejects.toMatchObject({
      parameter: 'trader|trader_external_id',
    });
    // @ts-expect-error no trader
    await expect(csid.updateCopyTradingSettings({ external_id: 'u1', enabled: true })).rejects.toMatchObject({ parameter: 'trader' });
    await expect(csid.updateCopyTradingSettings({ external_id: 'u1', trader: 'ctkol' })).rejects.toMatchObject({ code: 'missing_parameter' });
    // @ts-expect-error unknown mode
    await expect(csid.updateCopyTradingSettings({ external_id: 'u1', trader: 'ctkol', mode: 'all_in' })).rejects.toMatchObject({ parameter: 'mode' });
    // @ts-expect-error unknown sides
    await expect(csid.updateCopyTradingSettings({ external_id: 'u1', trader: 'ctkol', sides: 'sells' })).rejects.toMatchObject({ parameter: 'sides' });
    // @ts-expect-error enabled is a boolean
    await expect(csid.updateCopyTradingSettings({ external_id: 'u1', trader: 'ctkol', enabled: 'yes' })).rejects.toMatchObject({ parameter: 'enabled' });
    const bad: [string, unknown][] = [
      ['amount_usd', 0],
      ['amount_usd', 1_000_001],
      ['amount_usd', Infinity],
      ['percent', 2000],
      ['max_usd', 0],
      ['slippage_bps', 0],
      ['slippage_bps', 5001],
      ['slippage_bps', 2.5],
    ];
    for (const [k, v] of bad) {
      await expect(csid.updateCopyTradingSettings({ external_id: 'u1', trader: 'ctkol', [k]: v })).rejects.toMatchObject({ parameter: k });
    }
    // @ts-expect-error at most one user
    await expect(csid.copyInstructions({ external_id: 'u1', csid_id: 'f-1' })).rejects.toBeInstanceOf(BadRequestError);
    // @ts-expect-error unknown status
    await expect(csid.copyInstructions({ status: 'bogus' })).rejects.toMatchObject({ parameter: 'status' });
    await expect(csid.copyInstructions({ limit: 101 })).rejects.toMatchObject({ parameter: 'limit' });
    await expect(csid.copyInstruction('')).rejects.toMatchObject({ parameter: 'id' });
    await expect(csid.reportCopyInstruction({ id: '', status: 'executed' })).rejects.toMatchObject({ parameter: 'id' });
    // @ts-expect-error pending cannot be reported
    await expect(csid.reportCopyInstruction({ id: 'i1', status: 'pending' })).rejects.toMatchObject({ parameter: 'status', allowed: ['executed', 'failed', 'skipped'] });
    await expect(csid.reportCopyInstruction({ id: 'i1', status: 'executed', tx_signature: 'short' })).rejects.toMatchObject({ parameter: 'tx_signature' });
    await expect(csid.reportCopyInstruction({ id: 'i1', status: 'executed', executed_amount_usd: 0 })).rejects.toMatchObject({ parameter: 'executed_amount_usd' });
    expect(calls).toHaveLength(0);
  });

  it('iterates instructions, following next_cursor', async () => {
    const { csid, calls } = client((req) => {
      const cursor = new URL(req.url).searchParams.get('cursor');
      return cursor
        ? ok([{ ...INSTRUCTION, id: 'b' }], { pagination: { limit: 1, has_more: false, next_cursor: null } })
        : ok([{ ...INSTRUCTION, id: 'a' }], { pagination: { limit: 1, has_more: true, next_cursor: 'n1' } });
    });
    const ids: string[] = [];
    for await (const i of csid.iterCopyInstructions({ external_id: 'u1', status: 'pending', limit: 1 })) ids.push(i.id);
    expect(ids).toEqual(['a', 'b']);
    expect(calls.map((c) => new URL(c.url).search)).toEqual(['?external_id=u1&status=pending&limit=1', '?external_id=u1&status=pending&limit=1&cursor=n1']);
  });
});

describe('copy trading: errors', () => {
  it.each([
    [403, 'consent_required', PermissionError],
    [403, 'trading_private', PermissionError],
    [404, 'trader_not_found', NotFoundError],
    [409, 'copy_managed_elsewhere', ConflictError],
    [409, 'trade_feed_full', ConflictError],
    [503, 'service_unavailable', ServerError],
  ] as const)('settings %i %s', async (status, code, cls) => {
    const { csid, calls } = client(() => apiError(status, code), { maxRetries: 2 });
    const err = await csid.updateCopyTradingSettings({ external_id: 'u1', trader: 'ctkol', enabled: true }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(cls);
    expect(err).toMatchObject({ status, code });
    expect(calls).toHaveLength(1);
  });

  it('not_in_trade_feed is a NotFoundError', async () => {
    const { csid } = client(() => apiError(404, 'not_in_trade_feed', 'This trader is not in the user’s Trade Feed.'));
    await expect(csid.copyTradingSettings({ external_id: 'u1', trader: 'someone' })).rejects.toMatchObject({ code: 'not_in_trade_feed', status: 404 });
  });

  it.each([
    [409, 'already_reported', ConflictError],
    [404, 'not_found', NotFoundError],
    [400, 'invalid_parameter', BadRequestError],
    [503, 'service_unavailable', ServerError],
  ] as const)('report %i %s (never retried)', async (status, code, cls) => {
    const { csid, calls } = client(() => apiError(status, code), { maxRetries: 2 });
    const err = await csid.reportCopyInstruction({ id: 'i1', status: 'failed' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(cls);
    expect(calls).toHaveLength(1);
  });

  it('the trade feed rate limit on settings is not retried; the API rate limit is', async () => {
    let r = client(() => apiError(429, 'rate_limited', 'slow', {}, { 'Retry-After': '0' }), { maxRetries: 2 });
    await expect(r.csid.updateCopyTradingSettings({ external_id: 'u1', trader: 'ctkol', enabled: true })).rejects.toBeInstanceOf(RateLimitError);
    expect(r.calls).toHaveLength(1);
    let n = 0;
    r = client(() => (++n === 1 ? apiError(429, 'rate_limit_exceeded', 'slow down', {}, { 'Retry-After': '0' }) : ok(SETTING)), { maxRetries: 2 });
    await r.csid.updateCopyTradingSettings({ external_id: 'u1', trader: 'ctkol', enabled: true });
    expect(r.calls).toHaveLength(2);
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
  ready() {
    this.open();
    this.push({ event: 'ready', data: { events: ['copy_trade.instruction'] } });
  }
}

const last = () => FakeWS.all[FakeWS.all.length - 1]!;
const streamClient = (opts: Record<string, unknown> = {}) => new CabalSpyID({ apiKey: 'k', fetch: (() => {}) as never, ...opts });
const EVENT: CopyInstructionEvent = { ...INSTRUCTION, external_id: 'u1' };

describe('CopyTradingStream', () => {
  afterEach(() => {
    FakeWS.all = [];
  });

  it('connects to /v1/copy-trading/stream with key and instance', async () => {
    const cs = streamClient({ instance: 'csid_abc' }).copyTradingStream({ WebSocketImpl: FakeWS });
    const p = cs.connect();
    const u = new URL(last().url);
    expect(`${u.protocol}//${u.host}${u.pathname}`).toBe('wss://api-id.cabalspy.xyz/v1/copy-trading/stream');
    expect(Object.fromEntries(u.searchParams)).toEqual({ api_key: 'k', instance: 'csid_abc' });
    expect(cs.safeUrl).toContain('api_key=***');
    last().ready();
    expect(await p).toEqual({ events: ['copy_trade.instruction'] });
    expect(cs.connected).toBe(true);
    cs.ping();
    expect(last().sent).toEqual([JSON.stringify({ op: 'ping' })]);
    cs.close();
  });

  it('honours copyTradingStreamUrl', () => {
    const cs = streamClient({ copyTradingStreamUrl: 'ws://localhost:9000/v1/copy-trading/stream/' }).copyTradingStream({ WebSocketImpl: FakeWS });
    expect(cs.safeUrl).toBe('ws://localhost:9000/v1/copy-trading/stream?api_key=***');
  });

  it('emits instructions, heartbeats and pongs', async () => {
    const cs = streamClient().copyTradingStream({ WebSocketImpl: FakeWS });
    const got: string[] = [];
    cs.on('copy_trade.instruction', (i) => got.push(`${i.id}:${i.action.side}:${i.external_id}`))
      .on('heartbeat', (h) => got.push(`hb:${h.ts}`))
      .on('pong', () => got.push('pong'));
    const p = cs.connect();
    last().ready();
    await p;
    last().push({ event: 'copy_trade.instruction', id: 'i1', data: { ...EVENT, id: 'i1' } });
    last().push({ event: 'heartbeat', ts: 7 });
    last().push({ event: 'pong' });
    last().push({ event: 'something.new', data: {} });
    expect(got).toEqual(['i1:buy:u1', 'hb:7', 'pong']);
    cs.close();
  });

  it('invalid_api_key before ready is fatal (no reconnect)', async () => {
    const cs = streamClient().copyTradingStream({ WebSocketImpl: FakeWS, reconnectDelay: 5 });
    const p = cs.connect();
    last().open();
    last().push({ event: 'error', error: { code: 'invalid_api_key', message: 'API key is invalid or does not exist' } });
    last().close(4403);
    await expect(p).rejects.toBeInstanceOf(PermissionError);
    await new Promise((r) => setTimeout(r, 40));
    expect(FakeWS.all).toHaveLength(1);
  });

  it('too_many_connections is not fatal: it reconnects', async () => {
    const cs = streamClient().copyTradingStream({ WebSocketImpl: FakeWS, reconnectDelay: 5 });
    const p = cs.connect();
    last().open();
    last().push({ event: 'error', error: { code: 'too_many_connections', message: 'At most 5' } });
    last().close(4403);
    await expect(p).rejects.toBeInstanceOf(RateLimitError);
    await new Promise((r) => setTimeout(r, 300));
    expect(FakeWS.all.length).toBeGreaterThanOrEqual(2);
    cs.close();
  });

  it('requires an API key', () => {
    expect(() => new CabalSpyID({ apiKey: '', fetch: (() => {}) as never }).copyTradingStream()).toThrow(/API key/);
  });

  it('iterates instructions as { event, id, data }', async () => {
    const cs = streamClient().copyTradingStream({ WebSocketImpl: FakeWS });
    const seen: string[] = [];
    const run = (async () => {
      for await (const ev of cs) {
        const e: CopyTradingStreamEvent = ev;
        seen.push(`${e.event}:${e.id}:${e.data.csid_id}`);
        if (seen.length === 2) break;
      }
    })();
    await new Promise((r) => setTimeout(r, 0));
    last().ready();
    await new Promise((r) => setTimeout(r, 0));
    last().push({ event: 'copy_trade.instruction', id: 'a', data: { ...EVENT, id: 'a' } });
    last().push({ event: 'copy_trade.instruction', id: 'b', data: { ...EVENT, id: 'b' } });
    await run;
    expect(seen).toEqual(['copy_trade.instruction:a:f-1', 'copy_trade.instruction:b:f-1']);
    expect(last().readyState).toBe(3);
  });
});

describe('entry points', () => {
  it('cabalspy-id/api exposes copy trading', () => {
    expect(api.CopyTradingStream).toBeTypeOf('function');
    expect(api.COPY_TRADING_EVENT_NAMES).toEqual(['copy_trade.instruction']);
    expect(api.COPY_MODES).toEqual(['fixed_usd', 'percent']);
    expect(api.COPY_SIDES).toEqual(['buys', 'both']);
    expect(api.COPY_INSTRUCTION_STATUSES).toContain('expired');
    expect(api.COPY_REPORT_STATUSES).toEqual(['executed', 'failed', 'skipped']);
    expect(api.DEFAULT_COPY_TRADING_STREAM_URL).toBe('wss://api-id.cabalspy.xyz/v1/copy-trading/stream');
    expect(typeof api.CabalSpyID.prototype.reportCopyInstruction).toBe('function');
  });
});
