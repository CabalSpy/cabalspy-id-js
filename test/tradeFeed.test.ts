import { afterEach, describe, expect, it } from 'vitest';

import {
  BadRequestError,
  CabalSpyID,
  ConflictError,
  NotFoundError,
  PermissionError,
  PlanUserLimitError,
  RateLimitError,
  ServerError,
  type TradeFeedItem,
  type TradeFeedNotification,
  type TradeFeedStreamEvent,
  type TradeFeedThesisEvent,
  type TradeFeedTradeEvent,
  type TradeFeedTrader,
  type TradeFeedTradeItem,
  type TradeFeedThesisItem,
} from '../src/index';
import * as api from '../src/entries/api';
import { type RecordedRequest, apiError, json, mockFetch, ok } from './helpers';

const KEY = 'csid_api_testkey';
const MINT = '3Pkrq4MmLvDXyn1fa3sz5MekKRkZkc1iLDcz5AzWpump';

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

const TRADER = { csid_id: 't-1', username: 'MazeCCC', name: 'Maze', image_url: null, kol: true, profile_url: 'https://id.cabalspy.xyz/u/MazeCCC' };
const LINKS = { token: 'https://app.cabalspy.xyz/token/x', terminal: null, profile: null };

/** Items exactly as the server's trade_item() / thesis_item() build them. */
const TRADE_ITEM: TradeFeedTradeItem = {
  id: 't3b1f0c9e8d7a6b5c4d3e2f1a0b9c8d7e',
  type: 'trade',
  timestamp: '2026-11-01T18:40:05Z',
  trader: TRADER,
  trade: {
    blockchain: 'solana',
    mint: MINT,
    symbol: 'CPT',
    name: 'Copycat',
    logo: null,
    side: 'sell',
    label: 'partial',
    sold_percent: 50,
    amount_native: 1.5,
    currency: 'SOL',
    amount_usd: 225,
    token_amount: 500,
    price_usd: 0.45,
    pnl_usd: 150,
    pnl_percent: 200,
    wallet: 'W1',
    wallet_url: null,
    tx_signature: '2Bq7',
    tx_url: null,
  },
  links: LINKS,
  cursor: 'c1',
};
const THESIS_ITEM: TradeFeedThesisItem = {
  id: 'h8a1d2c3b',
  type: 'thesis',
  timestamp: '2026-11-01T18:21:44Z',
  trader: TRADER,
  thesis: {
    id: '8a1d2c3b',
    blockchain: 'solana',
    mint: MINT,
    symbol: 'CPT',
    name: 'Copycat',
    logo: null,
    stance: 'bull',
    body: 'Dev still holding.',
    likes: 12,
    replies: 3,
    url: 'https://id.cabalspy.xyz/try/thesis?chain=solana&mint=x',
  },
  links: LINKS,
  cursor: 'c2',
};
const SETTINGS = {
  notify_buys: true,
  notify_sells: true,
  notify_theses: true,
  min_native: { SOL: 0.5, BNB: 0, ETH: 0 },
  muted: false,
  copy: { enabled: false, mode: 'fixed_usd', amount_usd: 50, percent: 100, max_usd: null, sides: 'both', slippage_bps: 300, updated_at: null },
} as const;
const ENTRY: TradeFeedTrader = { trader: TRADER, trading_public: true, added_at: '2026-10-20T09:12:00+00:00', in_trade_feeds: 128, settings: SETTINGS };
const NOTIFICATION: TradeFeedNotification = {
  id: 48213,
  event: 'trade_feed.trade',
  text: 'Trade Feed: @MazeCCC sold $CPT',
  created_at: '2026-11-01T18:40:06Z',
  data: TRADE_ITEM,
};

describe('trade feed: requests', () => {
  it('builds every endpoint path, query and body', async () => {
    const { csid, calls } = client(() => ok([], { pagination: { limit: 30, has_more: false, next_cursor: null } }));
    await csid.tradeFeed('u1');
    await csid.tradeFeed({ csid_id: 'f-1', filter: 'theses', limit: 5, cursor: 'abc' });
    await csid.tradeFeedTraders('u1');
    await csid.tradeFeedTradersRaw({ csid_id: 'f-1', limit: 300, cursor: 'MTAw' });
    await csid.addTradeFeedTrader({ external_id: 'u1', trader: '@MazeCCC', min_sol: 0.5 });
    await csid.addTradeFeedTrader({
      csid_id: 'f-1',
      trader_external_id: 'u2',
      notify_buys: true,
      notify_sells: false,
      notify_theses: true,
      min_sol: 0,
      min_bnb: 1,
      min_eth: 0.25,
      muted: false,
    });
    await csid.addTradeFeedTrader({ external_id: 'u1', trader: 't-1' });
    await csid.removeTradeFeedTrader({ external_id: 'u1', trader: 'MazeCCC' });
    await csid.removeTradeFeedTrader({ csid_id: 'f-1', trader_external_id: 'u2' });
    await csid.tradeFeedNotifications('u1');
    await csid.tradeFeedNotificationsRaw({ csid_id: 'f-1', limit: 20, cursor: 'n1' });

    expect(calls.map(describeCall)).toEqual([
      { call: 'GET /v1/trade-feed?external_id=u1', body: undefined },
      { call: 'GET /v1/trade-feed?csid_id=f-1&filter=theses&limit=5&cursor=abc', body: undefined },
      { call: 'GET /v1/trade-feed/traders?external_id=u1', body: undefined },
      { call: 'GET /v1/trade-feed/traders?csid_id=f-1&limit=300&cursor=MTAw', body: undefined },
      { call: 'POST /v1/trade-feed/traders', body: { external_id: 'u1', trader: '@MazeCCC', min_sol: 0.5 } },
      {
        call: 'POST /v1/trade-feed/traders',
        body: {
          csid_id: 'f-1',
          trader_external_id: 'u2',
          notify_buys: true,
          notify_sells: false,
          notify_theses: true,
          min_sol: 0,
          min_bnb: 1,
          min_eth: 0.25,
          muted: false,
        },
      },
      { call: 'POST /v1/trade-feed/traders', body: { external_id: 'u1', trader: 't-1' } },
      { call: 'POST /v1/trade-feed/traders/delete', body: { external_id: 'u1', trader: 'MazeCCC' } },
      { call: 'POST /v1/trade-feed/traders/delete', body: { csid_id: 'f-1', trader_external_id: 'u2' } },
      { call: 'GET /v1/trade-feed/notifications?external_id=u1', body: undefined },
      { call: 'GET /v1/trade-feed/notifications?csid_id=f-1&limit=20&cursor=n1', body: undefined },
    ]);
    for (const c of calls) expect(c.headers.authorization).toBe(`Bearer ${KEY}`);
  });

  it('returns typed items, traders and results', async () => {
    const { csid } = client((req) => {
      const path = new URL(req.url).pathname;
      if (path === '/v1/trade-feed') return ok([TRADE_ITEM, THESIS_ITEM], { pagination: { limit: 30, has_more: false, next_cursor: null } });
      if (path === '/v1/trade-feed/traders' && req.method === 'GET') {
        return ok([ENTRY], { pagination: { limit: 100, total: 1, max: 300, has_more: false, next_cursor: null } });
      }
      if (path === '/v1/trade-feed/traders') {
        return json({ success: true, data: { in_trade_feed: true, created: true, trader: TRADER, settings: SETTINGS } }, 201);
      }
      if (path === '/v1/trade-feed/traders/delete') return ok({ in_trade_feed: false, removed: true });
      return ok([NOTIFICATION], { pagination: { limit: 50, has_more: false, next_cursor: null } });
    });
    const items: TradeFeedItem[] = await csid.tradeFeed('u1');
    const labels = items.map((it) => (it.type === 'trade' ? it.trade.label : it.thesis.stance));
    expect(labels).toEqual(['partial', 'bull']);
    const traders = await csid.tradeFeedTradersRaw('u1');
    expect(traders.pagination).toMatchObject({ total: 1, max: 300 });
    expect(traders.data[0]!.settings.min_native.SOL).toBe(0.5);
    expect(traders.data[0]!.settings.copy.enabled).toBe(false);
    const added = await csid.addTradeFeedTrader({ external_id: 'u1', trader: 'MazeCCC' });
    expect(added).toMatchObject({ in_trade_feed: true, created: true });
    expect(added.trader.username).toBe('MazeCCC');
    expect(await csid.removeTradeFeedTrader({ external_id: 'u1', trader: 'MazeCCC' })).toEqual({ in_trade_feed: false, removed: true });
    const [n] = await csid.tradeFeedNotifications({ external_id: 'u1', limit: 5 });
    expect(n!.id).toBe(48213);
    expect(n!.data.id).toBe(TRADE_ITEM.id);
  });

  it('adds instance to every call', async () => {
    const { csid, calls } = client(() => ok([]), { instance: 'csid_abc' });
    await csid.tradeFeed('u1');
    await csid.addTradeFeedTrader({ external_id: 'u1', trader: 't-1' });
    for (const c of calls) expect(new URL(c.url).searchParams.get('instance')).toBe('csid_abc');
  });

  it('validates parameters before sending', async () => {
    const { csid, calls } = client(() => ok([]));
    // @ts-expect-error no user
    await expect(csid.tradeFeed({})).rejects.toMatchObject({ parameter: 'external_id|csid_id' });
    // @ts-expect-error at most one user
    await expect(csid.tradeFeed({ external_id: 'u1', csid_id: 'f-1' })).rejects.toBeInstanceOf(BadRequestError);
    // @ts-expect-error unknown filter
    await expect(csid.tradeFeed({ external_id: 'u1', filter: 'mints' })).rejects.toMatchObject({ parameter: 'filter', allowed: ['all', 'buys', 'sells', 'theses'] });
    for (const limit of [0, 101, 2.5]) {
      await expect(csid.tradeFeed({ external_id: 'u1', limit })).rejects.toMatchObject({ parameter: 'limit' });
    }
    await expect(csid.tradeFeedNotifications({ external_id: 'u1', limit: 101 })).rejects.toMatchObject({ parameter: 'limit' });
    await expect(csid.tradeFeedTraders({ external_id: 'u1', limit: 301 })).rejects.toMatchObject({ parameter: 'limit' });
    // @ts-expect-error no trader
    await expect(csid.addTradeFeedTrader({ external_id: 'u1' })).rejects.toMatchObject({ parameter: 'trader' });
    // @ts-expect-error at most one trader
    await expect(csid.addTradeFeedTrader({ external_id: 'u1', trader: 'a', trader_external_id: 'b' })).rejects.toMatchObject({
      parameter: 'trader|trader_external_id',
    });
    // @ts-expect-error no user
    await expect(csid.addTradeFeedTrader({ trader: 'a' })).rejects.toMatchObject({ parameter: 'external_id|csid_id' });
    const bad: [string, unknown][] = [
      ['notify_buys', 'yes'],
      ['notify_sells', 1],
      ['notify_theses', 'false'],
      ['muted', 0],
      ['min_sol', -1],
      ['min_bnb', 1_000_001],
      ['min_eth', '0.5'],
      ['min_sol', NaN],
      ['min_sol', Infinity],
    ];
    for (const [k, v] of bad) {
      await expect(csid.addTradeFeedTrader({ external_id: 'u1', trader: 't-1', [k]: v })).rejects.toMatchObject({ parameter: k });
    }
    // @ts-expect-error no trader
    await expect(csid.removeTradeFeedTrader({ external_id: 'u1' })).rejects.toMatchObject({ parameter: 'trader' });
    expect(calls).toHaveLength(0);
  });

  it('iterates the feed, traders and notifications, following next_cursor', async () => {
    const { csid, calls } = client((req) => {
      const cursor = new URL(req.url).searchParams.get('cursor');
      return cursor
        ? ok([{ id: 'b' }], { pagination: { limit: 1, has_more: false, next_cursor: null } })
        : ok([{ id: 'a' }], { pagination: { limit: 1, has_more: true, next_cursor: 'n1' } });
    });
    const ids: string[] = [];
    for await (const it of csid.iterTradeFeed({ external_id: 'u1', filter: 'buys', limit: 1 })) ids.push(it.id);
    for await (const t of csid.iterTradeFeedTraders('u1')) ids.push((t as unknown as { id: string }).id);
    for await (const n of csid.iterTradeFeedNotifications({ csid_id: 'f-1' })) ids.push(String(n.id));
    expect(ids).toEqual(['a', 'b', 'a', 'b', 'a', 'b']);
    expect(calls.map((c) => new URL(c.url).pathname + new URL(c.url).search)).toEqual([
      '/v1/trade-feed?external_id=u1&filter=buys&limit=1',
      '/v1/trade-feed?external_id=u1&filter=buys&limit=1&cursor=n1',
      '/v1/trade-feed/traders?external_id=u1',
      '/v1/trade-feed/traders?external_id=u1&cursor=n1',
      '/v1/trade-feed/notifications?csid_id=f-1',
      '/v1/trade-feed/notifications?csid_id=f-1&cursor=n1',
    ]);
  });
});

describe('trade feed: errors', () => {
  it.each([
    [400, 'cannot_add_self', BadRequestError],
    [403, 'consent_required', PermissionError],
    [403, 'trading_private', PermissionError],
    [403, 'plan_user_limit', PlanUserLimitError],
    [404, 'trader_not_found', NotFoundError],
    [404, 'platform_user_not_found', NotFoundError],
    [409, 'trade_feed_full', ConflictError],
    [429, 'rate_limited', RateLimitError],
    [503, 'service_unavailable', ServerError],
  ] as const)('add %i %s (never retried)', async (status, code, cls) => {
    const { csid, calls } = client(() => apiError(status, code, code, {}, { 'Retry-After': '0' }), { maxRetries: 2 });
    const err = await csid.addTradeFeedTrader({ external_id: 'u1', trader: 'MazeCCC' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(cls);
    expect(err).toMatchObject({ status, code });
    expect(calls).toHaveLength(1);
  });

  it.each([
    [403, 'consent_required', PermissionError],
    [403, 'plan_user_limit', PlanUserLimitError],
    [404, 'platform_user_not_found', NotFoundError],
    [400, 'invalid_parameter', BadRequestError],
  ] as const)('read %i %s', async (status, code, cls) => {
    const { csid } = client(() => apiError(status, code));
    const err = await csid.tradeFeed('u1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(cls);
    expect(err).toMatchObject({ status, code });
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
    this.push({ event: 'ready', data: { events: ['trade_feed.trade', 'trade_feed.thesis'] } });
  }
}

const last = () => FakeWS.all[FakeWS.all.length - 1]!;
const streamClient = (opts: Record<string, unknown> = {}) => new CabalSpyID({ apiKey: 'k', fetch: (() => {}) as never, ...opts });
const TRADE_EVENT: TradeFeedTradeEvent = { ...TRADE_ITEM, recipients: ['f-1', 'f-2'], recipients_external: ['u1'] };
const THESIS_EVENT: TradeFeedThesisEvent = { ...THESIS_ITEM, recipients: ['f-1'], recipients_external: [] };

describe('TradeFeedStream', () => {
  afterEach(() => {
    FakeWS.all = [];
  });

  it('connects to /v1/trade-feed/stream with key and instance', async () => {
    const tf = streamClient({ instance: 'csid_abc' }).tradeFeedStream({ WebSocketImpl: FakeWS });
    const p = tf.connect();
    const u = new URL(last().url);
    expect(`${u.protocol}//${u.host}${u.pathname}`).toBe('wss://api-id.cabalspy.xyz/v1/trade-feed/stream');
    expect(Object.fromEntries(u.searchParams)).toEqual({ api_key: 'k', instance: 'csid_abc' });
    expect(tf.safeUrl).toContain('api_key=***');
    last().ready();
    expect(await p).toEqual({ events: ['trade_feed.trade', 'trade_feed.thesis'] });
    expect(tf.connected).toBe(true);
    tf.ping();
    expect(last().sent).toEqual([JSON.stringify({ op: 'ping' })]);
    tf.close();
  });

  it('honours tradeFeedStreamUrl', () => {
    const tf = streamClient({ tradeFeedStreamUrl: 'ws://localhost:9000/v1/trade-feed/stream/' }).tradeFeedStream({ WebSocketImpl: FakeWS });
    expect(tf.safeUrl).toBe('ws://localhost:9000/v1/trade-feed/stream?api_key=***');
  });

  it('emits trades, theses, heartbeats and pongs', async () => {
    const tf = streamClient().tradeFeedStream({ WebSocketImpl: FakeWS });
    const got: string[] = [];
    tf.on('trade_feed.trade', (t) => got.push(`${t.id}:${t.trade.side}:${t.recipients_external.join(',')}`))
      .on('trade_feed.thesis', (t) => got.push(`${t.id}:${t.thesis.stance}:${t.recipients.join(',')}`))
      .on('heartbeat', (h) => got.push(`hb:${h.ts}`))
      .on('pong', () => got.push('pong'));
    const p = tf.connect();
    last().ready();
    await p;
    last().push({ event: 'trade_feed.trade', id: 'ev1', data: TRADE_EVENT });
    last().push({ event: 'trade_feed.thesis', id: 'ev2', data: THESIS_EVENT });
    last().push({ event: 'heartbeat', ts: 7 });
    last().push({ event: 'pong' });
    last().push({ event: 'something.new', data: {} });
    expect(got).toEqual([`${TRADE_ITEM.id}:sell:u1`, `${THESIS_ITEM.id}:bull:f-1`, 'hb:7', 'pong']);
    tf.close();
  });

  it('invalid_api_key before ready is fatal (no reconnect)', async () => {
    const tf = streamClient().tradeFeedStream({ WebSocketImpl: FakeWS, reconnectDelay: 5 });
    const p = tf.connect();
    last().open();
    last().push({ event: 'error', error: { code: 'invalid_api_key', message: 'API key is invalid or does not exist' } });
    last().close(4403);
    await expect(p).rejects.toBeInstanceOf(PermissionError);
    await new Promise((r) => setTimeout(r, 40));
    expect(FakeWS.all).toHaveLength(1);
  });

  it('too_many_connections is not fatal: it reconnects', async () => {
    const tf = streamClient().tradeFeedStream({ WebSocketImpl: FakeWS, reconnectDelay: 5 });
    const p = tf.connect();
    last().open();
    last().push({ event: 'error', error: { code: 'too_many_connections', message: 'At most 5' } });
    last().close(4403);
    await expect(p).rejects.toBeInstanceOf(RateLimitError);
    await new Promise((r) => setTimeout(r, 300));
    expect(FakeWS.all.length).toBeGreaterThanOrEqual(2);
    tf.close();
  });

  it('requires an API key', () => {
    expect(() => new CabalSpyID({ apiKey: '', fetch: (() => {}) as never }).tradeFeedStream()).toThrow(/API key/);
  });

  it('iterates events as { event, id, data } with the event id', async () => {
    const tf = streamClient().tradeFeedStream({ WebSocketImpl: FakeWS });
    const seen: string[] = [];
    const run = (async () => {
      for await (const ev of tf) {
        const e: TradeFeedStreamEvent = ev;
        seen.push(`${e.event}:${e.id}:${e.data.id}:${e.data.recipients.length}`);
        if (seen.length === 2) break;
      }
    })();
    await new Promise((r) => setTimeout(r, 0));
    last().ready();
    await new Promise((r) => setTimeout(r, 0));
    last().push({ event: 'trade_feed.trade', id: 'ev1', data: TRADE_EVENT });
    last().push({ event: 'trade_feed.thesis', id: 'ev2', data: THESIS_EVENT });
    await run;
    expect(seen).toEqual([`trade_feed.trade:ev1:${TRADE_ITEM.id}:2`, `trade_feed.thesis:ev2:${THESIS_ITEM.id}:1`]);
    expect(last().readyState).toBe(3);
  });
});

describe('entry points', () => {
  it('cabalspy-id/api exposes the Trade Feed', () => {
    expect(api.TradeFeedStream).toBeTypeOf('function');
    expect(api.TRADE_FEED_EVENT_NAMES).toEqual(['trade_feed.trade', 'trade_feed.thesis']);
    expect(api.TRADE_FEED_FILTERS).toEqual(['all', 'buys', 'sells', 'theses']);
    expect(api.TRADE_LABELS).toEqual(['new', 'add', 'partial', 'close', 'sell']);
    expect(api.MAX_TRADE_FEED_TRADERS).toBe(300);
    expect(api.TRADE_FEED_CHANGES_PER_HOUR).toBe(120);
    expect(api.DEFAULT_TRADE_FEED_STREAM_URL).toBe('wss://api-id.cabalspy.xyz/v1/trade-feed/stream');
    expect(typeof api.CabalSpyID.prototype.addTradeFeedTrader).toBe('function');
    expect(typeof api.CabalSpyID.prototype.iterTradeFeed).toBe('function');
  });
});
