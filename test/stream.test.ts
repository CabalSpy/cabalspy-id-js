import { afterEach, describe, expect, it, vi } from 'vitest';

import { CabalSpyID, ConnectionError, PermissionError, type Trade } from '../src/index';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close(code = 1000, reason = '') {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
  // server side
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  push(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  drop(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code, reason: '' });
  }
}

const trade = (sig: string): Trade => ({
  signature: sig,
  blockchain: 'solana',
  wallet: 'W1',
  mint: 'M1',
  transaction_type: 'buy',
  token_symbol: 'TKN',
  token_name: 'Token',
  token_logo: null,
  token_amount: 10,
  value: 1.5,
  value_usd: 300,
  currency: 'SOL',
  timestamp: '2026-10-13T00:00:00Z',
  trader: { csid_id: 'u1', username: 'alice', name: 'Alice', image_url: null, kol: true },
});

const latest = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
const flush = () => new Promise((r) => setTimeout(r, 0));

function makeStream(opts: Record<string, unknown> = {}) {
  const csid = new CabalSpyID({ apiKey: 'csid_api_k/ey', instance: 'csid_inst', fetch: (() => {}) as never });
  return csid.stream({ WebSocketImpl: FakeWebSocket, blockchain: 'solana', reconnectDelay: 10, ...opts });
}

afterEach(() => {
  FakeWebSocket.instances = [];
  vi.useRealTimers();
});

describe('stream', () => {
  it('connects with key, chain and instance, and resolves on subscribed', async () => {
    const stream = makeStream();
    const p = stream.connect();
    const ws = latest();
    const url = new URL(ws.url);
    expect(url.origin + url.pathname).toBe('wss://api-id.cabalspy.xyz/v1/stream');
    expect(Object.fromEntries(url.searchParams)).toEqual({ api_key: 'csid_api_k/ey', blockchain: 'solana', instance: 'csid_inst' });
    expect(stream.safeUrl).toContain('api_key=***');
    ws.open();
    ws.push({ event: 'subscribed', data: { blockchain: 'solana', scope: 'instance' } });
    await expect(p).resolves.toEqual({ blockchain: 'solana', scope: 'instance' });
    stream.close();
  });

  it('emits trades, heartbeats and pongs', async () => {
    const stream = makeStream();
    const trades: Trade[] = [];
    const beats: number[] = [];
    let pongs = 0;
    stream.on('trade', (t) => trades.push(t)).on('heartbeat', (h) => beats.push(h.ts)).on('pong', () => pongs++);
    const p = stream.connect();
    const ws = latest();
    ws.open();
    ws.push({ event: 'subscribed', data: { blockchain: 'solana', scope: 'instance' } });
    await p;
    ws.push({ event: 'trade', data: trade('s1') });
    ws.push({ event: 'heartbeat', ts: 1760000000 });
    stream.ping();
    expect(ws.sent).toEqual(['ping']);
    ws.push({ event: 'pong' });
    expect(trades.map((t) => t.signature)).toEqual(['s1']);
    expect(beats).toEqual([1760000000]);
    expect(pongs).toBe(1);
    stream.close();
  });

  it('a plan error rejects connect() and does not reconnect', async () => {
    const stream = makeStream();
    const errors: unknown[] = [];
    stream.on('error', (e) => errors.push(e));
    const p = stream.connect();
    const ws = latest();
    ws.open();
    ws.push({ event: 'error', error: { code: 'plan_required', message: 'The live stream is included from the Pro plan.' } });
    ws.close(4403);
    const err = await p.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PermissionError);
    expect(err).toMatchObject({ code: 'plan_required' });
    await new Promise((r) => setTimeout(r, 50));
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });

  it('reconnects after a dropped connection', async () => {
    const stream = makeStream();
    const reconnects: number[] = [];
    stream.on('reconnecting', (r) => reconnects.push(r.attempt));
    const p = stream.connect();
    latest().open();
    latest().push({ event: 'subscribed', data: { blockchain: 'solana', scope: 'instance' } });
    await p;
    latest().drop();
    expect(reconnects).toEqual([1]);
    await new Promise((r) => setTimeout(r, 300));
    expect(FakeWebSocket.instances).toHaveLength(2);
    const subscribed = new Promise((r) => stream.on('subscribed', r));
    latest().open();
    latest().push({ event: 'subscribed', data: { blockchain: 'solana', scope: 'instance' } });
    await subscribed;
    stream.close();
    await new Promise((r) => setTimeout(r, 50));
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('reopens the socket when heartbeats stop', async () => {
    vi.useFakeTimers();
    const stream = makeStream({ heartbeatTimeout: 1000 });
    const errors: unknown[] = [];
    stream.on('error', (e) => errors.push(e));
    const p = stream.connect();
    latest().open();
    latest().push({ event: 'subscribed', data: { blockchain: 'solana', scope: 'instance' } });
    await p;
    await vi.advanceTimersByTimeAsync(900);
    latest().push({ event: 'heartbeat', ts: 1 });
    await vi.advanceTimersByTimeAsync(900);
    expect(errors).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(200);
    expect(errors[0]).toBeInstanceOf(ConnectionError);
    expect(errors[0]).toMatchObject({ code: 'heartbeat_timeout' });
    await vi.advanceTimersByTimeAsync(500);
    expect(FakeWebSocket.instances).toHaveLength(2);
    stream.close();
  });

  it('works as an async iterator', async () => {
    const stream = makeStream();
    const got: string[] = [];
    const run = (async () => {
      for await (const t of stream) {
        got.push(t.signature);
        if (got.length === 2) break;
      }
    })();
    await flush();
    const ws = latest();
    ws.open();
    ws.push({ event: 'subscribed', data: { blockchain: 'solana', scope: 'instance' } });
    await flush();
    ws.push({ event: 'trade', data: trade('a') });
    ws.push({ event: 'trade', data: trade('b') });
    await run;
    expect(got).toEqual(['a', 'b']);
    expect(ws.readyState).toBe(3); // breaking out closed the socket
  });

  it('explains how to get a WebSocket on old Node', async () => {
    const csid = new CabalSpyID({ apiKey: 'k', fetch: (() => {}) as never });
    const g = globalThis as { WebSocket?: unknown };
    const saved = g.WebSocket;
    g.WebSocket = undefined;
    try {
      await expect(csid.stream().connect()).rejects.toMatchObject({ code: 'no_websocket' });
    } finally {
      g.WebSocket = saved;
    }
  });
});
