import { afterEach, describe, expect, it, vi } from 'vitest';

import { BadRequestError, CabalSpyID, PermissionError, ThesisClient } from '../src/index';
import { json, mockFetch, ok } from './helpers';

const MINT = 'So11111111111111111111111111111111111111112';
const EVM = '0xAbC0000000000000000000000000000000000001';

class FakeWS {
  static all: FakeWS[] = [];
  readyState = 0;
  sent: unknown[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  constructor(public url: string) {
    FakeWS.all.push(this);
  }
  send(d: string) {
    this.sent.push(JSON.parse(d));
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
  ready(scope = 'global') {
    this.open();
    this.push({ event: 'ready', data: { scope, max_tokens: 200 } });
  }
}

const last = () => FakeWS.all[FakeWS.all.length - 1]!;
const csid = () => new CabalSpyID({ apiKey: 'k', fetch: (() => {}) as never });

afterEach(() => {
  FakeWS.all = [];
  vi.useRealTimers();
});

describe('ThesesStream', () => {
  it('connects with key and scope, sends remembered subscriptions on ready', async () => {
    const ts = csid().thesesStream({ WebSocketImpl: FakeWS, scope: 'instance' });
    ts.subscribe([{ blockchain: 'solana', mint: MINT }]);
    const p = ts.connect();
    expect(Object.fromEntries(new URL(last().url).searchParams)).toEqual({ api_key: 'k', scope: 'instance' });
    expect(new URL(last().url).pathname).toBe('/v1/theses/stream');
    expect(ts.safeUrl).toContain('api_key=***');
    last().ready('instance');
    expect(await p).toEqual({ scope: 'instance', max_tokens: 200 });
    expect(last().sent).toEqual([{ op: 'subscribe', tokens: [{ blockchain: 'solana', mint: MINT }] }]);

    ts.subscribe([{ blockchain: 'solana', mint: MINT }, { blockchain: 'base', mint: EVM }]); // duplicate skipped
    ts.unsubscribe([{ blockchain: 'base', mint: EVM.toLowerCase() }]); // EVM case-insensitive
    ts.subscribeAll();
    ts.unsubscribeAll();
    expect(last().sent.slice(1)).toEqual([
      { op: 'subscribe', tokens: [{ blockchain: 'base', mint: EVM }] },
      { op: 'unsubscribe', tokens: [{ blockchain: 'base', mint: EVM.toLowerCase() }] },
      { op: 'subscribe', all: true },
      { op: 'unsubscribe', all: true },
    ]);
    expect(ts.subscriptions).toEqual({ all: false, tokens: [] });
    ts.close();
  });

  it('emits thesis events; bad frames are not fatal', async () => {
    const ts = csid().thesesStream({ WebSocketImpl: FakeWS });
    const got: string[] = [];
    ts.on('thesis', (t) => got.push(`thesis:${t.id}`))
      .on('thesis.reply', (t) => got.push(`reply:${t.id}`))
      .on('thesis.reaction', (r) => got.push(`reaction:${r.id}`))
      .on('thesis.removed', (r) => got.push(`removed:${r.id}`))
      .on('subscribed', (s) => got.push(`subscribed:${s.tokens.length}`))
      .on('heartbeat', () => got.push('hb'))
      .on('error', (e) => got.push(`error:${e.code}`));
    const p = ts.connect();
    last().ready();
    await p;
    const ws = last();
    ws.push({ event: 'subscribed', data: { all: false, tokens: [{ blockchain: 'solana', mint: MINT }] } });
    ws.push({ event: 'thesis', data: { id: 't1', blockchain: 'solana', mint: MINT } });
    ws.push({ event: 'thesis.reply', data: { id: 'r1' } });
    ws.push({ event: 'thesis.reaction', data: { id: 't1', reactions: { like: 1 } } });
    ws.push({ event: 'thesis.removed', data: { id: 't1' } });
    ws.push({ event: 'heartbeat', ts: 1 });
    ws.push({ event: 'error', error: { code: 'too_many_tokens', message: 'At most 200 tokens per connection.' } });
    expect(got).toEqual(['subscribed:1', 'thesis:t1', 'reply:r1', 'reaction:t1', 'removed:t1', 'hb', 'error:too_many_tokens']);
    expect(ts.connected).toBe(true);
    ts.close();
  });

  it('a refusal before ready is fatal', async () => {
    const ts = csid().thesesStream({ WebSocketImpl: FakeWS, reconnectDelay: 5 });
    const p = ts.connect();
    last().open();
    last().push({ event: 'error', error: { code: 'invalid_api_key', message: 'API key is invalid' } });
    last().close(4403);
    await expect(p).rejects.toBeInstanceOf(PermissionError);
    await new Promise((r) => setTimeout(r, 40));
    expect(FakeWS.all).toHaveLength(1);
  });

  it('reconnects and subscribes again', async () => {
    const ts = csid().thesesStream({ WebSocketImpl: FakeWS, reconnectDelay: 5 });
    ts.subscribeAll().subscribe([{ blockchain: 'solana', mint: MINT }]);
    const p = ts.connect();
    last().ready();
    await p;
    last().close(1006);
    await new Promise((r) => setTimeout(r, 300));
    expect(FakeWS.all).toHaveLength(2);
    last().ready();
    expect(last().sent).toEqual([
      { op: 'subscribe', all: true },
      { op: 'subscribe', tokens: [{ blockchain: 'solana', mint: MINT }] },
    ]);
    ts.close();
  });

  it('reopens on a missing heartbeat', async () => {
    vi.useFakeTimers();
    const ts = csid().thesesStream({ WebSocketImpl: FakeWS, heartbeatTimeout: 1000, reconnectDelay: 10 });
    const p = ts.connect();
    last().ready();
    await p;
    await vi.advanceTimersByTimeAsync(1600);
    expect(FakeWS.all.length).toBeGreaterThanOrEqual(2);
    ts.close();
  });

  it('validates tokens locally', () => {
    const ts = csid().thesesStream({ WebSocketImpl: FakeWS });
    // @ts-expect-error unknown chain
    expect(() => ts.subscribe([{ blockchain: 'tron', mint: 'x' }])).toThrow(BadRequestError);
    const many = Array.from({ length: 201 }, (_, i) => ({ blockchain: 'base' as const, mint: `0x${i.toString(16).padStart(40, '0')}` }));
    expect(() => ts.subscribe(many)).toThrow(/At most 200/);
    // @ts-expect-error bad scope
    expect(() => csid().thesesStream({ scope: 'mine' })).toThrow(BadRequestError);
  });

  it('iterates thesis events', async () => {
    const ts = csid().thesesStream({ WebSocketImpl: FakeWS });
    const seen: string[] = [];
    const run = (async () => {
      for await (const { event } of ts) {
        seen.push(event);
        if (seen.length === 2) break;
      }
    })();
    await new Promise((r) => setTimeout(r, 0));
    last().ready();
    await new Promise((r) => setTimeout(r, 0));
    last().push({ event: 'thesis', data: { id: 'a' } });
    last().push({ event: 'thesis.removed', data: { id: 'a' } });
    await run;
    expect(seen).toEqual(['thesis', 'thesis.removed']);
    expect(last().readyState).toBe(3);
  });
});

describe('scope on thesis reads', () => {
  it('Data API passes scope', async () => {
    const m = mockFetch(() => ok([], { pagination: { limit: 20, total: null, has_more: false, next_cursor: null } }));
    const c = new CabalSpyID({ apiKey: 'k', fetch: m.fetch, maxRetries: 0 });
    await c.listTheses({ blockchain: 'solana', mint: MINT, scope: 'instance' });
    await c.thesisSummary({ blockchain: 'solana', mint: MINT, scope: 'global' });
    await c.latestTheses({ scope: 'instance', users: 'all' });
    expect(m.calls.map((x) => new URL(x.url).searchParams.get('scope'))).toEqual(['instance', 'global', 'instance']);
    // @ts-expect-error bad scope
    await expect(c.listTheses({ blockchain: 'solana', mint: MINT, scope: 'mine' })).rejects.toBeInstanceOf(BadRequestError);
  });

  it('ThesisClient: scope + clientId on reads, live and writes', async () => {
    const m = mockFetch((req) =>
      req.url.includes('/summary')
        ? json({ success: true, data: { theses: 0, bull: 0, bear: 0, authors: 0, token: {} } })
        : req.method === 'POST'
          ? json({ success: true, data: { id: 't' } }, 201)
          : json({ success: true, data: [], pagination: {}, token: {}, summary: {} }),
    );
    const tc = new ThesisClient({ fetch: m.fetch, scope: 'instance', clientId: 'csid_app', accessToken: 'at' });
    await tc.list('solana', MINT);
    await tc.summary('solana', MINT, { scope: 'global' });
    await tc.post('solana', MINT, { body: 'gm' });
    await tc.reply('t', 'yes');
    const q = (i: number) => Object.fromEntries(new URL(m.calls[i]!.url).searchParams);
    expect(q(0)).toEqual({ scope: 'instance', client_id: 'csid_app' });
    expect(q(1)).toEqual({ scope: 'global' });
    expect(JSON.parse(m.calls[2]!.body!)).toEqual({ body: 'gm', client_id: 'csid_app' });
    expect(JSON.parse(m.calls[3]!.body!)).toEqual({ body: 'yes', client_id: 'csid_app' });
    const live = tc.live('solana', MINT, { WebSocketImpl: FakeWS });
    expect(live.url).toBe(`wss://id.cabalspy.xyz/thesis/v1/ws/solana/${MINT}?client_id=csid_app&scope=instance`);
    expect(new ThesisClient({ clientId: 'csid_app', fetch: m.fetch }).live('solana', MINT, { scope: 'global' }).url).toBe(
      `wss://id.cabalspy.xyz/thesis/v1/ws/solana/${MINT}?client_id=csid_app&scope=global`,
    );
    // @ts-expect-error clientId is required
    expect(() => new ThesisClient({ scope: 'instance' })).toThrow(/client_id/);
  });
});
