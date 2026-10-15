import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AuthenticationError,
  BadRequestError,
  CLIENT_ID_HEADER,
  CabalSpyID,
  ConnectionError,
  NotFoundError,
  PermissionError,
  PlanUserLimitError,
  RateLimitError,
  ServerError,
  type Thesis,
  ThesisClient,
  type ThesisCreatedData,
  signWebhook,
  verifyWebhook,
} from '../src/index';
import { apiError, json, mockFetch, ok } from './helpers';

const MINT = 'So11111111111111111111111111111111111111112';
const USER = '0b6a3a4e-5a4f-4a59-9a59-0f5c5f5c5f5c';

const thesis = (id = 't1', extra: Partial<Thesis> = {}): Thesis => ({
  id,
  chain: 'solana',
  mint: MINT,
  kind: 'thesis',
  parent_id: null,
  body: 'Strong community, early.',
  stance: 'bull',
  author: { csid_id: USER, username: 'alice', name: 'Alice', image_url: null, kol_badge: true, profile_url: 'https://id.cabalspy.xyz/u/alice' },
  likes: 0,
  replies: 0,
  reactions: {},
  reacted_by: [],
  my_reactions: [],
  via: 'Test App',
  created_at: '2026-10-13T00:00:00+00:00',
  is_mine: false,
  position: {
    at_post: { invested_usd: 150, realized_usd: 0, holding_value_usd: null, pnl_usd: null, pnl_percent: null, tokens_held: 5000, first_buy: null },
    now: { invested_usd: 150, realized_usd: 0, holding_value_usd: 180, pnl_usd: 30, pnl_percent: 20, tokens_held: 5000, status: 'holding' },
  },
  ...extra,
});

function client(handler: Parameters<typeof mockFetch>[0], opts: Record<string, unknown> = {}) {
  const m = mockFetch(handler);
  return { csid: new CabalSpyID({ apiKey: 'k', fetch: m.fetch, maxRetries: 0, ...opts }), calls: m.calls };
}

const pathAndQuery = (url: string) => {
  const u = new URL(url);
  return `${u.pathname}?${u.searchParams.toString()}`;
};

describe('Data API: theses', () => {
  it('reads with the right paths and parameters', async () => {
    const { csid, calls } = client(() => ok([thesis()], { pagination: { limit: 20, total: null, has_more: false, next_cursor: null } }));
    await csid.listTheses({ blockchain: 'solana', mint: MINT, sort: 'top', stance: 'bull', limit: 5, csid_id: USER });
    await csid.thesisSummary({ blockchain: 'solana', mint: MINT });
    await csid.thesis('t1', { csid_id: USER });
    await csid.thesisReplies({ id: 't1', limit: 10 });
    await csid.latestTheses({ users: 'instance', blockchain: 'base' });
    await csid.userTheses({ username: '@alice' });
    await csid.userTheses({ csid_id: USER, limit: 3 });
    await csid.thesisEligibility({ blockchain: 'solana', mint: MINT, csid_id: USER });
    expect(calls.map((c) => pathAndQuery(c.url))).toEqual([
      `/v1/theses?blockchain=solana&mint=${MINT}&sort=top&stance=bull&limit=5&csid_id=${USER}`,
      `/v1/theses/summary?blockchain=solana&mint=${MINT}`,
      `/v1/theses/item?id=t1&csid_id=${USER}`,
      '/v1/theses/replies?id=t1&limit=10',
      '/v1/theses/latest?users=instance&blockchain=base',
      '/v1/theses/user?username=alice',
      `/v1/theses/user?csid_id=${USER}&limit=3`,
      `/v1/theses/eligibility?blockchain=solana&mint=${MINT}&csid_id=${USER}`,
    ]);
  });

  it('writes with POST and a JSON body, instance in the query', async () => {
    const { csid, calls } = client((req) => {
      if (req.url.includes('/reactions')) return ok({ id: 't1', reactions: { like: 1 } });
      if (req.url.includes('/report')) return ok({ reported: true });
      if (req.url.includes('/delete')) return ok({ deleted: true });
      return ok(thesis());
    }, { instance: 'csid_inst' });
    const t = await csid.postThesis({ blockchain: 'solana', mint: MINT, body: 'gm', stance: 'bull', csid_id: USER });
    expect(t.position && 'at_post' in t.position ? t.position.at_post.invested_usd : null).toBe(150);
    await csid.replyToThesis({ thesis_id: 't1', body: 'Nice call', csid_id: USER });
    expect((await csid.reactToThesis({ thesis_id: 't1', emoji: 'like', csid_id: USER })).reactions.like).toBe(1);
    await csid.reportThesis({ thesis_id: 't1', reason: 'spam', csid_id: USER });
    await csid.deleteThesis({ thesis_id: 't1', csid_id: USER });
    expect(calls.map((c) => [c.method, pathAndQuery(c.url), JSON.parse(c.body!)])).toEqual([
      ['POST', '/v1/theses?instance=csid_inst', { blockchain: 'solana', mint: MINT, body: 'gm', stance: 'bull', csid_id: USER }],
      ['POST', '/v1/theses/replies?instance=csid_inst', { thesis_id: 't1', body: 'Nice call', csid_id: USER }],
      ['POST', '/v1/theses/reactions?instance=csid_inst', { thesis_id: 't1', emoji: 'like', on: true, csid_id: USER }],
      ['POST', '/v1/theses/report?instance=csid_inst', { thesis_id: 't1', reason: 'spam', csid_id: USER }],
      ['POST', '/v1/theses/delete?instance=csid_inst', { thesis_id: 't1', csid_id: USER }],
    ]);
    expect(calls[0]!.headers['content-type']).toBe('application/json');
  });

  it('validates before sending', async () => {
    const { csid, calls } = client(() => ok({}));
    await expect(csid.listTheses({ blockchain: 'solana', mint: '' })).rejects.toMatchObject({ parameter: 'mint' });
    // @ts-expect-error bad sort
    await expect(csid.listTheses({ blockchain: 'solana', mint: MINT, sort: 'hot' })).rejects.toBeInstanceOf(BadRequestError);
    // @ts-expect-error bad emoji
    await expect(csid.reactToThesis({ thesis_id: 't', emoji: '🙂', csid_id: USER })).rejects.toMatchObject({ parameter: 'emoji' });
    // @ts-expect-error bad reason
    await expect(csid.reportThesis({ thesis_id: 't', reason: 'meh', csid_id: USER })).rejects.toMatchObject({ parameter: 'reason' });
    // @ts-expect-error no writer
    await expect(csid.postThesis({ blockchain: 'solana', mint: MINT, body: 'x' })).rejects.toMatchObject({ parameter: 'csid_id' });
    // @ts-expect-error both identifiers
    await expect(csid.userTheses({ csid_id: USER, username: 'a' })).rejects.toBeInstanceOf(BadRequestError);
    expect(calls).toHaveLength(0);
  });

  it.each([
    [403, 'not_a_holder', PermissionError],
    [403, 'consent_required', PermissionError],
    [403, 'plan_user_limit', PlanUserLimitError],
    [404, 'not_found', NotFoundError],
    [400, 'invalid_body', BadRequestError],
    [400, 'duplicate', BadRequestError],
  ])('maps %i %s', async (status, code, cls) => {
    const { csid } = client(() => apiError(status, code));
    await expect(csid.postThesis({ blockchain: 'solana', mint: MINT, body: 'x', csid_id: USER })).rejects.toBeInstanceOf(cls);
  });

  it('never retries a write after a server or network error', async () => {
    const a = client(() => apiError(500, 'internal_error'), { maxRetries: 3 });
    await expect(a.csid.postThesis({ blockchain: 'solana', mint: MINT, body: 'x', csid_id: USER })).rejects.toBeInstanceOf(ServerError);
    expect(a.calls).toHaveLength(1);
    const b = client(() => {
      throw new TypeError('socket hang up');
    }, { maxRetries: 3 });
    await expect(b.csid.replyToThesis({ thesis_id: 't', body: 'x', csid_id: USER })).rejects.toBeInstanceOf(ConnectionError);
    expect(b.calls).toHaveLength(1);
  });

  it('retries a write refused by the API rate limit', async () => {
    let n = 0;
    const { csid, calls } = client(
      () => (n++ === 0 ? apiError(429, 'rate_limit_exceeded', 'slow', {}, { 'Retry-After': '0' }) : ok(thesis())),
      { maxRetries: 2 },
    );
    await csid.postThesis({ blockchain: 'solana', mint: MINT, body: 'x', csid_id: USER });
    expect(calls).toHaveLength(2);
  });

  it('iterTheses follows the cursor', async () => {
    const { csid } = client((req) =>
      new URL(req.url).searchParams.get('cursor')
        ? ok([thesis('t2')], { pagination: { limit: 1, total: null, has_more: false, next_cursor: null } })
        : ok([thesis('t1')], { pagination: { limit: 1, total: null, has_more: true, next_cursor: 'c' } }),
    );
    const ids: string[] = [];
    for await (const t of csid.iterTheses({ blockchain: 'solana', mint: MINT, limit: 1 })) ids.push(t.id);
    expect(ids).toEqual(['t1', 't2']);
  });

  it('thesis.created webhooks are typed', async () => {
    const secret = 'whsec_' + Buffer.from('k'.repeat(24)).toString('base64');
    const body = JSON.stringify({ id: 'e1', type: 'thesis.created', created_at: 'x', sandbox: false, data: { sub: USER, thesis: thesis() } });
    const ts = Math.floor(Date.now() / 1000);
    const sig = await signWebhook(secret, 'e1', ts, body);
    const ev = await verifyWebhook<ThesisCreatedData>({
      payload: body,
      secret,
      headers: { 'webhook-id': 'e1', 'webhook-timestamp': String(ts), 'webhook-signature': sig },
    });
    expect(ev.type).toBe('thesis.created');
    expect(ev.data.thesis.mint).toBe(MINT);
  });
});

// ── public thesis API ──────────────────────────────────────────────────────

describe('ThesisClient', () => {
  const base = 'https://id.cabalspy.xyz/thesis/v1';

  it('reads without a token and returns token info and counts', async () => {
    const m = mockFetch(() =>
      json({
        success: true,
        data: [thesis()],
        pagination: { limit: 20, has_more: false, next_cursor: null },
        token: { chain: 'solana', mint: MINT, name: 'Solana', symbol: 'SOL', logo: null, price_usd: 100 },
        summary: { theses: 1, bull: 1, bear: 0, authors: 1 },
      }),
    );
    const tc = new ThesisClient({ clientId: 'csid_app', fetch: m.fetch });
    const page = await tc.list('solana', MINT, { sort: 'top', limit: 20 });
    expect(page.items[0]!.id).toBe('t1');
    expect(page.token.symbol).toBe('SOL');
    expect(page.summary.bull).toBe(1);
    expect(m.calls[0]!.url).toBe(`${base}/tokens/solana/${MINT}?sort=top&limit=20`);
    expect(m.calls[0]!.headers.authorization).toBeUndefined();
    expect(m.calls[0]!.headers['x-csid-client-id']).toBe('csid_app');
  });

  it('writes with the user access token', async () => {
    const m = mockFetch((req) => {
      if (req.method === 'DELETE') return json({ success: true, data: { deleted: true } });
      if (req.url.endsWith('/reactions')) return json({ success: true, data: { id: 't1', reactions: { '🚀': 1 } } });
      if (req.url.endsWith('/report')) return json({ success: true, data: { reported: true } });
      if (req.url.endsWith('/me')) return json({ success: true, data: { can_post: true, can_reply: true, holder: true, paused: false, user: { csid_id: USER } } });
      return json({ success: true, data: thesis() }, 201);
    });
    const tc = new ThesisClient({ clientId: 'csid_app', fetch: m.fetch, accessToken: 'at-1' });
    expect((await tc.me('solana', MINT)).can_post).toBe(true);
    await tc.post('solana', MINT, { body: 'gm', stance: 'bear' });
    await tc.reply('t1', 'agree');
    await tc.react('t1', '🚀');
    await tc.report('t1', 'scam', 'rug');
    await tc.delete('t1');
    expect(m.calls.map((c) => [c.method, c.url.replace(base, ''), c.body ? JSON.parse(c.body) : null])).toEqual([
      ['GET', `/tokens/solana/${MINT}/me`, null],
      ['POST', `/tokens/solana/${MINT}`, { body: 'gm', stance: 'bear', client_id: 'csid_app' }],
      ['POST', '/items/t1/replies', { body: 'agree', client_id: 'csid_app' }],
      ['POST', '/items/t1/reactions', { emoji: '🚀', on: true }],
      ['POST', '/items/t1/report', { reason: 'scam', note: 'rug' }],
      ['DELETE', '/items/t1', null],
    ]);
    expect(m.calls.every((c) => c.headers.authorization === 'Bearer at-1')).toBe(true);
    expect(m.calls.every((c) => c.headers['x-csid-client-id'] === 'csid_app')).toBe(true);
  });

  it('needs a token to write, and maps API errors', async () => {
    const m = mockFetch((req) =>
      req.url.includes('/tokens/solana/')
        ? json({ success: false, error: { code: 'not_a_holder', message: 'Only holders can post a thesis' } }, 403)
        : json({ success: false, error: { code: 'invalid_token', message: 'Your sign-in expired.' } }, 401),
    );
    const tc = new ThesisClient({ clientId: 'csid_app', fetch: m.fetch });
    await expect(tc.post('solana', MINT, { body: 'x' })).rejects.toMatchObject({ code: 'sign_in_required' });
    expect(m.calls).toHaveLength(0);
    tc.setAccessToken('at');
    await expect(tc.post('solana', MINT, { body: 'x' })).rejects.toBeInstanceOf(PermissionError);
    await expect(tc.reply('t1', 'x')).rejects.toBeInstanceOf(AuthenticationError);
    // @ts-expect-error unknown chain
    expect(() => tc.live('tron', MINT)).toThrow(BadRequestError);
  });

  it('requires the public client_id at construction', () => {
    for (const opts of [undefined, {}, { clientId: '' }, { clientId: '   ' }, { clientId: null }]) {
      let err: unknown;
      try {
        new ThesisClient(opts as never);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(AuthenticationError);
      expect(err).toMatchObject({ code: 'client_id_required', parameter: 'clientId' });
      expect((err as Error).message).toMatch(/public client_id/);
      expect((err as Error).message).toMatch(/not the API key/);
    }
    expect(new ThesisClient({ clientId: ' csid_app ' }).clientId).toBe('csid_app');
  });

  it('sends X-CSID-Client-Id on every call, with or without a user token', async () => {
    const m = mockFetch((req) =>
      req.url.includes('/summary')
        ? json({ success: true, data: { theses: 0, bull: 0, bear: 0, authors: 0, token: {} } })
        : req.url.includes('/me/notifications')
          ? json({ success: true, data: { unread: 0, items: [] } })
          : json({ success: true, data: thesis() }),
    );
    const tc = new ThesisClient({ clientId: 'csid_app', fetch: m.fetch });
    await tc.summary('solana', MINT);
    await tc.get('t1');
    tc.setAccessToken('at');
    await tc.notifications();
    expect(CLIENT_ID_HEADER).toBe('X-CSID-Client-Id');
    expect(m.calls).toHaveLength(3);
    expect(m.calls.map((c) => c.headers['x-csid-client-id'])).toEqual(['csid_app', 'csid_app', 'csid_app']);
    // the header, not the query, carries it (global scope)
    expect(m.calls.map((c) => new URL(c.url).searchParams.get('client_id'))).toEqual([null, null, null]);
  });

  it('maps client_id errors to the SDK error classes with their code', async () => {
    const m = mockFetch((req) => {
      if (req.url.endsWith('/items/a')) return apiError(401, 'client_id_required', 'client_id is required');
      if (req.url.endsWith('/items/b')) return apiError(401, 'invalid_client', 'Unknown or inactive client_id');
      if (req.url.endsWith('/items/c')) return apiError(403, 'origin_not_allowed', 'Origin not allowed for this client_id');
      return apiError(429, 'rate_limited', 'Too many requests', {}, { 'Retry-After': '60' });
    });
    const tc = new ThesisClient({ clientId: 'csid_app', fetch: m.fetch });
    const fail = (id: string) => tc.get(id).catch((e: unknown) => e);
    const [a, b, c, d] = await Promise.all([fail('a'), fail('b'), fail('c'), fail('d')]);
    expect(a).toBeInstanceOf(AuthenticationError);
    expect(a).toMatchObject({ status: 401, code: 'client_id_required', docs: 'https://docs.cabalspy.xyz/cabalspy-id/errors#client_id_required' });
    expect(b).toBeInstanceOf(AuthenticationError);
    expect(b).toMatchObject({ status: 401, code: 'invalid_client' });
    expect(c).toBeInstanceOf(PermissionError);
    expect(c).toMatchObject({ status: 403, code: 'origin_not_allowed' });
    expect(d).toBeInstanceOf(RateLimitError);
    expect(d).toMatchObject({ status: 429, code: 'rate_limited', retryAfter: 60 });
  });
});

// ── live sockets ───────────────────────────────────────────────────────────

class FakeWS {
  static all: FakeWS[] = [];
  readyState = 0;
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  constructor(public url: string) {
    FakeWS.all.push(this);
  }
  send() {}
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
}

afterEach(() => {
  FakeWS.all = [];
});

describe('stream: theses', () => {
  it('subscribes to theses of one token and emits thesis events', async () => {
    const csid = new CabalSpyID({ apiKey: 'k', fetch: (() => {}) as never });
    const stream = csid.stream({ WebSocketImpl: FakeWS, events: ['trades', 'theses'], blockchain: 'solana', mint: MINT });
    const got: string[] = [];
    stream
      .on('thesis', (t) => got.push(`thesis:${t.id}`))
      .on('thesis.reply', (t) => got.push(`reply:${t.parent_id}`))
      .on('thesis.reaction', (r) => got.push(`reaction:${r.reactions.like}`))
      .on('thesis.removed', (r) => got.push(`removed:${r.id}`));
    const p = stream.connect();
    const ws = FakeWS.all[0]!;
    expect(Object.fromEntries(new URL(ws.url).searchParams)).toEqual({ api_key: 'k', events: 'trades,theses', blockchain: 'solana', mint: MINT });
    ws.open();
    ws.push({ event: 'subscribed', data: { blockchain: 'solana', events: ['theses', 'trades'], mint: MINT, scope: 'instance' } });
    expect((await p).mint).toBe(MINT);
    ws.push({ event: 'thesis', data: { blockchain: 'solana', ...thesis('t9') } });
    ws.push({ event: 'thesis.reply', data: { blockchain: 'solana', ...thesis('r1', { kind: 'reply', parent_id: 't9' }) } });
    ws.push({ event: 'thesis.reaction', data: { blockchain: 'solana', mint: MINT, id: 't9', reactions: { like: 2 } } });
    ws.push({ event: 'thesis.removed', data: { blockchain: 'solana', mint: MINT, id: 't9' } });
    expect(got).toEqual(['thesis:t9', 'reply:t9', 'reaction:2', 'removed:t9']);
    stream.close();
  });

  it('theses() iterates thesis events', async () => {
    const csid = new CabalSpyID({ apiKey: 'k', fetch: (() => {}) as never });
    const stream = csid.stream({ WebSocketImpl: FakeWS, events: ['theses'] });
    const seen: string[] = [];
    const run = (async () => {
      for await (const ev of stream.theses()) {
        seen.push(ev.event);
        if (seen.length === 2) break;
      }
    })();
    await new Promise((r) => setTimeout(r, 0));
    const ws = FakeWS.all[0]!;
    ws.open();
    ws.push({ event: 'subscribed', data: { blockchain: 'all', events: ['theses'], mint: null, scope: 'instance' } });
    await new Promise((r) => setTimeout(r, 0));
    ws.push({ event: 'thesis', data: thesis() });
    ws.push({ event: 'thesis.removed', data: { id: 't1' } });
    await run;
    expect(seen).toEqual(['thesis', 'thesis.removed']);
  });

  it('validates events and mint', () => {
    const csid = new CabalSpyID({ apiKey: 'k', fetch: (() => {}) as never });
    // @ts-expect-error unknown topic
    expect(() => csid.stream({ events: ['news'] })).toThrow(BadRequestError);
    expect(() => csid.stream({ events: ['theses'], mint: MINT })).toThrow(/mint needs blockchain/);
  });
});

describe('ThesisClient.live()', () => {
  it('emits public live events and treats 1008 as final', async () => {
    const live = new ThesisClient({ clientId: 'csid_app', fetch: (() => {}) as never }).live('solana', MINT, {
      WebSocketImpl: FakeWS,
      reconnectDelay: 5,
    });
    const got: string[] = [];
    const errors: unknown[] = [];
    live.on('thesis', (t) => got.push(t.id)).on('reaction', (r) => got.push(`r:${r.id}`)).on('removed', (r) => got.push(`x:${r.id}`));
    live.on('error', (e) => errors.push(e));
    const p = live.connect();
    const ws = FakeWS.all[0]!;
    expect(ws.url).toBe(`wss://id.cabalspy.xyz/thesis/v1/ws/solana/${MINT}?client_id=csid_app`);
    expect(new URL(ws.url).searchParams.get('client_id')).toBe('csid_app');
    ws.open();
    await p;
    ws.push({ type: 'thesis', chain: 'solana', mint: MINT, data: thesis('t5') });
    ws.push({ type: 'reaction', chain: 'solana', mint: MINT, data: { id: 't5', reactions: { like: 1 } } });
    ws.push({ type: 'removed', chain: 'solana', mint: MINT, data: { id: 't5' } });
    ws.push({ type: 'heartbeat' });
    expect(got).toEqual(['t5', 'r:t5', 'x:t5']);
    ws.close(1008);
    await new Promise((r) => setTimeout(r, 30));
    expect(FakeWS.all).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(PermissionError);
  });

  it('reconnects after a drop', async () => {
    vi.useFakeTimers();
    const live = new ThesisClient({ clientId: 'csid_app', fetch: (() => {}) as never }).live('base', '0xabc', {
      WebSocketImpl: FakeWS,
      reconnectDelay: 10,
    });
    const p = live.connect();
    FakeWS.all[0]!.open();
    await p;
    FakeWS.all[0]!.close(1006);
    await vi.advanceTimersByTimeAsync(300);
    expect(FakeWS.all).toHaveLength(2);
    live.close();
    vi.useRealTimers();
  });

  it('4401 and 4403 are final and map to the client_id error codes', async () => {
    vi.useFakeTimers();
    const tc = new ThesisClient({ clientId: 'csid_app', fetch: (() => {}) as never });
    const cases: [number, string, unknown, string][] = [
      [4401, 'client_id_required', AuthenticationError, 'client_id_required'],
      [4401, 'invalid_client', AuthenticationError, 'invalid_client'],
      [4403, 'origin_not_allowed', PermissionError, 'origin_not_allowed'],
    ];
    for (const [code, reason, cls, expected] of cases) {
      FakeWS.all = [];
      const live = tc.live('solana', MINT, { WebSocketImpl: FakeWS, reconnectDelay: 5 });
      const errors: unknown[] = [];
      live.on('error', (e) => errors.push(e));
      const p = live.connect().catch((e: unknown) => e);
      FakeWS.all[0]!.onclose?.({ code, reason });
      const rejected = await p;
      expect(rejected).toBeInstanceOf(cls as never);
      expect(rejected).toMatchObject({ code: expected });
      expect(errors[0]).toMatchObject({ code: expected });
      await vi.advanceTimersByTimeAsync(120_000);
      expect(FakeWS.all).toHaveLength(1); // no reconnect
    }
    vi.useRealTimers();
  });

  it('4429 backs off 60 s before reconnecting', async () => {
    vi.useFakeTimers();
    const live = new ThesisClient({ clientId: 'csid_app', fetch: (() => {}) as never }).live('solana', MINT, {
      WebSocketImpl: FakeWS,
      reconnectDelay: 10,
    });
    const errors: unknown[] = [];
    live.on('error', (e) => errors.push(e));
    const p = live.connect();
    FakeWS.all[0]!.open();
    await p;
    FakeWS.all[0]!.onclose?.({ code: 4429, reason: 'rate_limited' });
    expect(errors[0]).toBeInstanceOf(RateLimitError);
    expect(errors[0]).toMatchObject({ code: 'rate_limited', retryAfter: 60 });
    await vi.advanceTimersByTimeAsync(59_000);
    expect(FakeWS.all).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(FakeWS.all).toHaveLength(2);
    expect(new URL(FakeWS.all[1]!.url).searchParams.get('client_id')).toBe('csid_app');
    live.close();
    vi.useRealTimers();
  });
});
