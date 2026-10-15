import { afterEach, describe, expect, it, vi } from 'vitest';

import * as api from '../src/entries/api';
import * as tf from '../src/entries/tradeFeed';
import {
  BadRequestError,
  CabalSpyID,
  CabalSpyIDError,
  NotFoundError,
  PermissionError,
  RateLimitError,
  SDK_VERSION,
  type TradeFeedEntry,
  type TradeFeedItem,
  type TradeFeedNotification,
  type TradeFeedStreamEvent,
  type TradeFeedTradeData,
  isTradeFeedEvent,
  isTradeFeedThesisEvent,
  isTradeFeedTradeEvent,
  signWebhook,
  verifyWebhook,
} from '../src/index';
import * as root from '../src/index';
import { apiError, json, mockFetch, ok } from './helpers';

const USER = '0b6a3a4e-5a4f-4a59-9a59-0f5c5f5c5f5c';
const TRADER = { csid_id: '11111111-2222-4333-8444-555555555555', username: 'alice', name: 'Alice', image_url: null, kol: true, profile_url: 'https://id.cabalspy.xyz/u/alice' };
const MINT = 'So11111111111111111111111111111111111111112';

const tradeItem: TradeFeedItem = {
  id: 't0123456789abcdef0123456789abcdef',
  type: 'trade',
  timestamp: '2026-10-15T12:00:00Z',
  trader: TRADER,
  trade: {
    blockchain: 'solana',
    mint: MINT,
    symbol: 'ABC',
    name: 'Abc',
    logo: null,
    side: 'sell',
    label: 'partial',
    sold_percent: 50,
    amount_native: 1.5,
    currency: 'SOL',
    amount_usd: 300,
    token_amount: 1000,
    price_usd: 0.3,
    pnl_usd: 120,
    pnl_percent: 66.67,
    wallet: 'WaLLet',
    wallet_url: 'https://solscan.io/account/WaLLet',
    tx_signature: 'sig',
    tx_url: 'https://solscan.io/tx/sig',
  },
  links: { token: `https://app.cabalspy.xyz/token/${MINT}`, terminal: `https://app.cabalspy.xyz/token/${MINT}`, profile: TRADER.profile_url },
  cursor: 'c1',
};

const thesisItem: TradeFeedItem = {
  id: 'h42',
  type: 'thesis',
  timestamp: '2026-10-15T11:00:00Z',
  trader: TRADER,
  thesis: { id: '42', blockchain: 'base', mint: '0xabc', symbol: null, name: null, logo: null, stance: 'bull', body: 'up', likes: 1, replies: 0, url: 'https://id.cabalspy.xyz/try/thesis?chain=base&mint=0xabc' },
  links: { token: 'https://id.cabalspy.xyz/try/thesis?chain=base&mint=0xabc', terminal: null, profile: TRADER.profile_url },
  cursor: 'c2',
};

const settings = { notify_buys: true, notify_sells: true, notify_theses: false, min_native: { SOL: 0.5, BNB: 0, ETH: 0 }, muted: false };

const pathOf = (u: string) => {
  const url = new URL(u);
  return url.pathname + url.search;
};

describe('Data API: Trade Feed', () => {
  it('reads the feed with filter and follows cursors', async () => {
    const m = mockFetch((req) => {
      const cursor = new URL(req.url).searchParams.get('cursor');
      return cursor
        ? ok([thesisItem], { pagination: { limit: 1, next_cursor: null, has_more: false } })
        : ok([tradeItem], { pagination: { limit: 1, next_cursor: 'c1', has_more: true } });
    });
    const csid = new CabalSpyID({ apiKey: 'k', fetch: m.fetch, maxRetries: 0 });
    const page = await csid.tradeFeed(USER, { filter: 'sells', limit: 1 });
    expect(page[0]!.type).toBe('trade');
    expect(pathOf(m.calls[0]!.url)).toBe(`/v1/trade-feed?csid_id=${USER}&filter=sells&limit=1`);
    expect(m.calls[0]!.headers.authorization).toBe('Bearer k');
    expect(m.calls[0]!.headers['user-agent']).toBe(`cabalspy-id-sdk/${SDK_VERSION}`);

    const all: TradeFeedItem[] = [];
    for await (const item of csid.iterTradeFeed(USER, { limit: 1 })) all.push(item);
    expect(all.map((i) => i.id)).toEqual([tradeItem.id, 'h42']);
    expect(pathOf(m.calls[2]!.url)).toBe(`/v1/trade-feed?csid_id=${USER}&limit=1&cursor=c1`);
    const first = all[0]!;
    if (first.type === 'trade') expect(first.trade.label).toBe('partial');

    await expect(csid.tradeFeed(USER, { filter: 'everything' as never })).rejects.toBeInstanceOf(BadRequestError);
    await expect(csid.tradeFeed('')).rejects.toMatchObject({ code: 'missing_parameter', parameter: 'csid_id' });
  });

  it('lists traders with total and max', async () => {
    const entry: TradeFeedEntry = { trader: TRADER, trading_public: true, added_at: '2026-10-15T00:00:00+00:00', in_trade_feeds: 3, settings };
    const m = mockFetch(() => ok([entry], { pagination: { limit: 100, total: 1, max: 300, next_cursor: null, has_more: false } }));
    const csid = new CabalSpyID({ apiKey: 'k', fetch: m.fetch, maxRetries: 0 });
    const raw = await csid.tradeFeedTradersRaw(USER, { limit: 100 });
    expect(raw.pagination).toMatchObject({ total: 1, max: 300 });
    expect(raw.data[0]!.settings.min_native.SOL).toBe(0.5);
    expect(pathOf(m.calls[0]!.url)).toBe(`/v1/trade-feed/traders?csid_id=${USER}&limit=100`);
    const list: TradeFeedEntry[] = [];
    for await (const e of csid.iterTradeFeedTraders(USER)) list.push(e);
    expect(list).toHaveLength(1);
    expect(await csid.tradeFeedTraders(USER)).toHaveLength(1);
  });

  it('adds (201 / 200) and removes traders', async () => {
    let status = 201;
    const m = mockFetch((req) => {
      if (req.url.includes('/delete')) return ok({ in_trade_feed: false, removed: true });
      const res = json({ success: true, data: { in_trade_feed: true, created: status === 201, trader: TRADER, settings }, meta: {} }, status);
      status = 200;
      return res;
    });
    const csid = new CabalSpyID({ apiKey: 'k', fetch: m.fetch, maxRetries: 0 });
    const added = await csid.addToTradeFeed(USER, '@alice', { notify_theses: false, min_sol: 0.5 });
    expect(added.created).toBe(true);
    expect(m.calls[0]!.method).toBe('POST');
    expect(pathOf(m.calls[0]!.url)).toBe('/v1/trade-feed/traders');
    expect(JSON.parse(m.calls[0]!.body!)).toEqual({ notify_theses: false, min_sol: 0.5, csid_id: USER, trader: '@alice' });
    expect((await csid.addToTradeFeed(USER, 'alice', { muted: true })).created).toBe(false);

    const removed = await csid.removeFromTradeFeed(USER, 'alice');
    expect(removed).toEqual({ in_trade_feed: false, removed: true });
    expect(pathOf(m.calls[2]!.url)).toBe('/v1/trade-feed/traders/delete');
    expect(JSON.parse(m.calls[2]!.body!)).toEqual({ csid_id: USER, trader: 'alice' });
    await expect(csid.addToTradeFeed(USER, '')).rejects.toMatchObject({ code: 'missing_parameter', parameter: 'trader' });
  });

  it('maps the Trade Feed errors', async () => {
    const cases: [number, string, unknown][] = [
      [404, 'trader_not_found', NotFoundError],
      [400, 'cannot_add_self', BadRequestError],
      [403, 'trading_private', PermissionError],
      [403, 'consent_required', PermissionError],
      [409, 'trade_feed_full', CabalSpyIDError],
      [429, 'rate_limited', RateLimitError],
      [400, 'invalid_cursor', BadRequestError],
    ];
    for (const [status, code, cls] of cases) {
      const m = mockFetch(() => apiError(status, code));
      const csid = new CabalSpyID({ apiKey: 'k', fetch: m.fetch, maxRetries: 0 });
      const err = await csid.addToTradeFeed(USER, 'bob').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(cls as typeof CabalSpyIDError);
      expect(err).toMatchObject({ code, status });
    }
    // a POST is not retried after rate_limited (only the API's own rate_limit_exceeded)
    const m = mockFetch(() => apiError(429, 'rate_limited'));
    const csid = new CabalSpyID({ apiKey: 'k', fetch: m.fetch, maxRetries: 2 });
    await expect(csid.addToTradeFeed(USER, 'bob')).rejects.toBeInstanceOf(RateLimitError);
    expect(m.calls).toHaveLength(1);
  });

  it('reads notifications', async () => {
    const n: TradeFeedNotification = { id: 9, event: 'trade_feed.trade', text: 'Trade Feed: @alice sold $ABC', created_at: '2026-10-15T12:00:01+00:00', data: tradeItem };
    const m = mockFetch((req) =>
      new URL(req.url).searchParams.get('cursor')
        ? ok([], { pagination: { limit: 1, next_cursor: null, has_more: false } })
        : ok([n], { pagination: { limit: 1, next_cursor: 'n9', has_more: true } }),
    );
    const csid = new CabalSpyID({ apiKey: 'k', fetch: m.fetch, maxRetries: 0 });
    expect((await csid.tradeFeedNotifications(USER, { limit: 1 }))[0]!.event).toBe('trade_feed.trade');
    expect(pathOf(m.calls[0]!.url)).toBe(`/v1/trade-feed/notifications?csid_id=${USER}&limit=1`);
    const all: TradeFeedNotification[] = [];
    for await (const x of csid.iterTradeFeedNotifications(USER, { limit: 1 })) all.push(x);
    expect(all).toHaveLength(1);
    expect(pathOf(m.calls[2]!.url)).toBe(`/v1/trade-feed/notifications?csid_id=${USER}&limit=1&cursor=n9`);
  });
});

// ── stream ─────────────────────────────────────────────────────────────────

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
const { cursor: _c, ...tradeData } = tradeItem;
const eventData = { ...tradeData, recipients: [USER] } as TradeFeedTradeData;

afterEach(() => {
  FakeWS.all = [];
  vi.useRealTimers();
});

describe('TradeFeedStream', () => {
  it('connects with the key and instance and emits typed events with the event id', async () => {
    const csid = new CabalSpyID({ apiKey: 'k', instance: 'csid_i', fetch: (() => {}) as never });
    const s = csid.tradeFeedStream({ WebSocketImpl: FakeWS });
    const got: string[] = [];
    s.on('trade_feed.trade', (d, id) => got.push(`trade:${d.trade.label}:${d.recipients.join(',')}:${id}`));
    s.on('trade_feed.thesis', (d) => got.push(`thesis:${d.thesis.stance}`));
    s.on('heartbeat', (h) => got.push(`hb:${h.ts}`));
    s.on('pong', () => got.push('pong'));
    const p = s.connect();
    const url = new URL(last().url);
    expect(url.origin + url.pathname).toBe('wss://api-id.cabalspy.xyz/v1/trade-feed/stream');
    expect(Object.fromEntries(url.searchParams)).toEqual({ api_key: 'k', instance: 'csid_i' });
    expect(s.safeUrl).toContain('api_key=***');
    last().ready();
    expect(await p).toEqual({ events: ['trade_feed.trade', 'trade_feed.thesis'] });
    expect(s.connected).toBe(true);
    last().push({ event: 'trade_feed.trade', id: 'ev-1', data: eventData });
    last().push({ event: 'trade_feed.thesis', id: 'ev-2', data: { ...thesisItem, recipients: [USER] } });
    last().push({ event: 'heartbeat', ts: 5 });
    s.ping();
    expect(last().sent).toEqual(['ping']);
    last().push({ event: 'pong' });
    expect(got).toEqual([`trade:partial:${USER}:ev-1`, 'thesis:bull', 'hb:5', 'pong']);
    s.close();
    expect(s.connected).toBe(false);
  });

  it('an invalid key is final; too_many_connections is retried', async () => {
    const csid = new CabalSpyID({ apiKey: 'bad', fetch: (() => {}) as never });
    const s = csid.tradeFeedStream({ WebSocketImpl: FakeWS, reconnectDelay: 1 });
    const p = s.connect();
    last().open();
    last().push({ event: 'error', error: { code: 'invalid_api_key', message: 'API key is invalid' } });
    last().close(4403);
    await expect(p).rejects.toBeInstanceOf(PermissionError);
    expect(FakeWS.all).toHaveLength(1);

    vi.useFakeTimers();
    const s2 = csid.tradeFeedStream({ WebSocketImpl: FakeWS, reconnectDelay: 10 });
    const reconnecting = vi.fn();
    s2.on('reconnecting', reconnecting);
    const p2 = s2.connect();
    last().open();
    last().push({ event: 'error', error: { code: 'too_many_connections', message: 'At most 5' } });
    last().close(4403);
    await expect(p2).rejects.toBeInstanceOf(RateLimitError);
    expect(reconnecting).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeWS.all).toHaveLength(3);
    s2.close();
  });

  it('reconnects after a dropped connection and a missed heartbeat', async () => {
    vi.useFakeTimers();
    const csid = new CabalSpyID({ apiKey: 'k', fetch: (() => {}) as never });
    const s = csid.tradeFeedStream({ WebSocketImpl: FakeWS, reconnectDelay: 10, heartbeatTimeout: 100 });
    const errors: string[] = [];
    s.on('error', (e) => errors.push(e.code));
    const p = s.connect();
    last().ready();
    await p;
    await vi.advanceTimersByTimeAsync(150); // no heartbeat: closes and reconnects
    expect(errors).toContain('heartbeat_timeout');
    await vi.advanceTimersByTimeAsync(400);
    expect(FakeWS.all.length).toBeGreaterThanOrEqual(2);
    s.close();
  });

  it('iterates over events and closes the connection it opened', async () => {
    const csid = new CabalSpyID({ apiKey: 'k', fetch: (() => {}) as never });
    const s = csid.tradeFeedStream({ WebSocketImpl: FakeWS });
    const seen: TradeFeedStreamEvent[] = [];
    const run = (async () => {
      for await (const e of s) {
        seen.push(e);
        if (seen.length === 2) break;
      }
    })();
    await Promise.resolve();
    last().ready();
    await new Promise((r) => setTimeout(r, 0));
    last().push({ event: 'trade_feed.trade', id: 'a', data: eventData });
    last().push({ event: 'trade_feed.thesis', id: 'b', data: { ...thesisItem, recipients: [] } });
    await run;
    expect(seen.map((e) => `${e.event}:${e.id}`)).toEqual(['trade_feed.trade:a', 'trade_feed.thesis:b']);
    expect(s.connected).toBe(false);
  });

  it('needs an API key', () => {
    const prev = [process.env.CABALSPY_ID_API_KEY, process.env.CABALSPY_API_KEY];
    delete process.env.CABALSPY_ID_API_KEY;
    delete process.env.CABALSPY_API_KEY;
    try {
      expect(() => new CabalSpyID({ fetch: (() => {}) as never }).tradeFeedStream()).toThrow(/API key/);
    } finally {
      if (prev[0] !== undefined) process.env.CABALSPY_ID_API_KEY = prev[0];
      if (prev[1] !== undefined) process.env.CABALSPY_API_KEY = prev[1];
    }
  });
});

// ── webhooks ───────────────────────────────────────────────────────────────

describe('Trade Feed webhooks', () => {
  it('verifies a trade_feed.trade delivery and narrows it with the type guards', async () => {
    const secret = 'whsec_' + Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');
    const body = JSON.stringify({ id: 'evt_tf', type: 'trade_feed.trade', created_at: '2026-10-15T12:00:02+00:00', sandbox: false, data: eventData });
    const ts = Math.floor(Date.now() / 1000);
    const headers = { 'webhook-id': 'evt_tf', 'webhook-timestamp': String(ts), 'webhook-signature': await signWebhook(secret, 'evt_tf', ts, body) };
    const event = await verifyWebhook({ payload: body, headers, secret });
    expect(isTradeFeedEvent(event)).toBe(true);
    expect(isTradeFeedThesisEvent(event)).toBe(false);
    if (!isTradeFeedTradeEvent(event)) throw new Error('expected a trade event');
    expect(event.data.recipients).toEqual([USER]);
    expect(event.data.trade.pnl_usd).toBe(120);
    expect(isTradeFeedEvent({ type: 'thesis.created' })).toBe(false);
    expect(isTradeFeedThesisEvent({ type: 'trade_feed.thesis' })).toBe(true);
  });
});

describe('entry points', () => {
  it('cabalspy-id/trade-feed and cabalspy-id/api share the root classes', () => {
    expect(tf.CabalSpyID).toBe(root.CabalSpyID);
    expect(tf.TradeFeedStream).toBe(root.TradeFeedStream);
    expect(api.TradeFeedStream).toBe(root.TradeFeedStream);
    expect(tf.PermissionError).toBe(root.PermissionError);
    expect(tf.isTradeFeedTradeEvent).toBe(root.isTradeFeedTradeEvent);
    expect(api.isTradeFeedEvent).toBe(root.isTradeFeedEvent);
    expect(tf.TRADE_FEED_FILTERS).toEqual(['all', 'buys', 'sells', 'theses']);
    expect(tf.TRADE_FEED_MAX_TRADERS).toBe(300);
    expect(tf.DEFAULT_TRADE_FEED_STREAM_URL).toBe('wss://api-id.cabalspy.xyz/v1/trade-feed/stream');
  });
});
