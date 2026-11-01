import { createHmac, randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  type CalloutCreatedData,
  type CalloutMilestoneData,
  type CompetitionStandingsData,
  type CompetitionStartedData,
  type CopyTradeInstructionData,
  type TradeFeedThesisData,
  type TradeFeedTradeData,
  WebhookVerificationError,
  isWebhookEvent,
  signWebhook,
  verifyTypedWebhook,
  verifyWebhook,
} from '../src/index';

const rawKey = randomBytes(24);
const SECRET = `whsec_${rawKey.toString('base64')}`;
const body = JSON.stringify({
  id: 'evt_1',
  type: 'wallet.verified',
  created_at: '2026-10-13T00:00:00+00:00',
  sandbox: false,
  data: { sub: 'user-1', address: 'So1', chain: 'solana' },
});
const now = 1_760_000_000;

/** Signs exactly like the server (csid/app/events.py sign()). */
function serverSign(key: Buffer, id: string, ts: number, payload: string) {
  return 'v1,' + createHmac('sha256', key).update(`${id}.${ts}.${payload}`).digest('base64');
}

describe('webhooks', () => {
  it('verifies a server-signed delivery and returns the event', async () => {
    const event = await verifyWebhook({
      payload: body,
      headers: { 'webhook-id': 'evt_1', 'webhook-timestamp': String(now), 'webhook-signature': serverSign(rawKey, 'evt_1', now, body) },
      secret: SECRET,
      now,
    });
    expect(event.type).toBe('wallet.verified');
    expect(event.data.sub).toBe('user-1');
  });

  it('accepts Fetch Headers, Node header objects and Uint8Array bodies', async () => {
    const sig = serverSign(rawKey, 'evt_1', now, body);
    const h = new Headers({ 'Webhook-Id': 'evt_1', 'Webhook-Timestamp': String(now), 'Webhook-Signature': sig });
    await expect(verifyWebhook({ payload: new TextEncoder().encode(body), headers: h, secret: SECRET, now })).resolves.toBeTruthy();
    const node = { 'webhook-id': ['evt_1'], 'webhook-timestamp': String(now), 'webhook-signature': sig };
    await expect(verifyWebhook({ payload: Buffer.from(body), headers: node, secret: SECRET, now })).resolves.toBeTruthy();
  });

  it('accepts any of several signatures (secret roll)', async () => {
    const old = serverSign(randomBytes(24), 'evt_1', now, body);
    const cur = serverSign(rawKey, 'evt_1', now, body);
    await expect(
      verifyWebhook({ payload: body, headers: { 'webhook-id': 'evt_1', 'webhook-timestamp': String(now), 'webhook-signature': `${old} ${cur}` }, secret: SECRET, now }),
    ).resolves.toBeTruthy();
  });

  it('signWebhook matches the server', async () => {
    expect(await signWebhook(SECRET, 'evt_1', now, body)).toBe(serverSign(rawKey, 'evt_1', now, body));
  });

  it.each([
    ['tampered body', { payload: body.replace('So1', 'So2') }, 'invalid_signature'],
    ['wrong id', { id: 'evt_2' }, 'invalid_signature'],
    ['old timestamp', { now: now + 301 }, 'timestamp_too_old'],
    ['future timestamp', { now: now - 301 }, 'timestamp_too_new'],
    ['missing header', { drop: 'webhook-signature' }, 'missing_headers'],
    ['wrong secret', { secret: `whsec_${randomBytes(24).toString('base64')}` }, 'invalid_signature'],
  ])('rejects %s', async (_name, o: Record<string, unknown>, code) => {
    const headers: Record<string, string> = {
      'webhook-id': (o.id as string) ?? 'evt_1',
      'webhook-timestamp': String(now),
      'webhook-signature': serverSign(rawKey, 'evt_1', now, body),
    };
    if (o.drop) delete headers[o.drop as string];
    const err = await verifyWebhook({
      payload: (o.payload as string) ?? body,
      headers,
      secret: (o.secret as string) ?? SECRET,
      now: (o.now as number) ?? now,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WebhookVerificationError);
    expect(err).toMatchObject({ code });
  });
});

describe('white-label and competition webhooks', () => {
  const events = {
    'platform_user.created': { sub: 'c-1', wallets: [{ address: 'So1', family: 'solana', chains: ['solana'] }] },
    'platform_user.claimed': { sub: 'c-2', previous_csid_id: 'c-1', wallets_moved: 1 },
    'platform_user.x_connected': { sub: 'c-1', x: { id: '42', username: 'alice', name: 'Alice' } },
    'wallet.added': { sub: 'c-1', address: '0xabc', family: 'evm', chains: ['base', 'eth'], source: 'privy', verified: false },
    'verification.expired': { sub: 'c-1', verification_id: 'v-1', address: 'So1', chain: 'solana', family: 'solana' },
    'competition.started': { competition_id: 'cmp', name: 'Weekly', started_at: '2026-11-01T18:00:00Z', ends_at: '2026-11-08T18:00:00Z', participants: 12 },
    'competition.updated': { competition_id: 'cmp', rules_version: 2, during: 'running', changes: { min_trades: { from: 0, to: 3 } }, note: null },
    'competition.standings': { competition_id: 'cmp', metric: 'pnl_usd', top: [{ rank: 1, ranked: true, external_id: 'u1', csid_id: 'c-1', score: 12.5 }] },
    'competition.ended': { competition_id: 'cmp', cancelled: true, results: [] },
  } as const;

  async function deliver(type: string, data: unknown) {
    const payload = JSON.stringify({ id: `evt_${type}`, type, created_at: '2026-10-28T00:00:00Z', sandbox: false, data });
    const headers = { 'webhook-id': `evt_${type}`, 'webhook-timestamp': String(now), 'webhook-signature': serverSign(rawKey, `evt_${type}`, now, payload) };
    return { payload, headers };
  }

  it.each(Object.entries(events))('verifies and narrows %s', async (type, data) => {
    const { payload, headers } = await deliver(type, data);
    const event = await verifyWebhook({ payload, headers, secret: SECRET, now });
    expect(event.type).toBe(type);
    expect(isWebhookEvent(event, type as keyof typeof events)).toBe(true);
    expect(isWebhookEvent(event, 'thesis.created')).toBe(false);
    expect(event.data).toEqual(data);
  });

  it('types data per event (switch on verifyTypedWebhook, isWebhookEvent guard)', async () => {
    const seen: string[] = [];
    for (const [type, data] of Object.entries(events)) {
      const { payload, headers } = await deliver(type, data);
      const event = await verifyTypedWebhook({ payload, headers, secret: SECRET, now });
      switch (event.type) {
        case 'platform_user.created':
          seen.push(event.data.wallets[0]!.family);
          break;
        case 'platform_user.claimed':
          seen.push(event.data.previous_csid_id);
          break;
        case 'platform_user.x_connected':
          seen.push(event.data.x.id);
          break;
        case 'wallet.added':
          seen.push(event.data.chains.join('+'));
          break;
        case 'verification.expired':
          seen.push(event.data.verification_id);
          break;
        case 'competition.started':
          seen.push(String(event.data.participants));
          break;
        case 'competition.updated':
          seen.push(String(event.data.changes.min_trades!.to));
          break;
        case 'competition.standings':
          seen.push(String(event.data.top[0]!.rank));
          break;
        case 'competition.ended':
          seen.push(String(event.data.cancelled));
          break;
        default:
          seen.push('other');
      }
    }
    expect(seen).toEqual(['solana', 'c-1', '42', 'base+eth', 'v-1', '12', '3', '1', 'true']);

    const { payload, headers } = await deliver('competition.standings', events['competition.standings']);
    const event = await verifyWebhook({ payload, headers, secret: SECRET, now });
    if (isWebhookEvent(event, 'competition.started', 'competition.standings')) {
      const data: CompetitionStartedData | CompetitionStandingsData = event.data;
      expect('top' in data).toBe(true);
    } else {
      throw new Error('not narrowed');
    }
  });

  it('rejects a tampered white-label delivery', async () => {
    const { payload, headers } = await deliver('wallet.added', events['wallet.added']);
    await expect(verifyWebhook({ payload: payload.replace('0xabc', '0xdef'), headers, secret: SECRET, now })).rejects.toMatchObject({ code: 'invalid_signature' });
  });
});

describe('callout webhooks', () => {
  const callout = {
    id: 'co-1',
    chain: 'solana',
    mint: 'So1',
    token: { name: 'T', symbol: 'T', logo: null },
    author: { csid_id: 'c-1', external_id: 'u1', name: null, username: null, avatar_url: null, kol: false },
    note: null,
    called_at: '2026-10-31T12:00:00Z',
    window_ends_at: '2026-11-01T12:00:00Z',
    status: 'tracking',
    at_call: { price_usd: 1, market_cap_usd: 100000 },
    now: { price_usd: 2, market_cap_usd: 200000, x: 2, at: '2026-10-31T13:00:00Z' },
    peak: { price_usd: 5, market_cap_usd: 500000, x: 5, at: '2026-10-31T12:30:00Z' },
    score_x: 5,
    source: 'birdeye',
    tracking: { active: true, phase: 'first_day', next_check_at: null, below_10k_since: null, daily_checks: 0, stopped_at: null, stop_reason: null },
  };
  const firstDay = { kind: 'candles', entry_price_usd: 1, peak_x: 5, close_x: 2, minutes_to_peak: 30, flags: [] };
  const events = {
    'callout.created': { callout },
    'callout.milestone': { callout, milestone_x: 5 },
    'callout.scored': { callout: { ...callout, first_day: firstDay } },
    'callout.final': { callout: { ...callout, status: 'final', tracking: { ...callout.tracking, active: false, phase: 'stopped', stop_reason: 'inactive', stopped_at: '2026-11-03T00:00:00Z' } } },
  };

  async function deliver(type: string, data: unknown) {
    const payload = JSON.stringify({ id: `evt_${type}`, type, created_at: '2026-10-31T00:00:00Z', sandbox: false, data });
    const headers = { 'webhook-id': `evt_${type}`, 'webhook-timestamp': String(now), 'webhook-signature': serverSign(rawKey, `evt_${type}`, now, payload) };
    return { payload, headers };
  }

  it('narrows each callout event to its typed data', async () => {
    const seen: string[] = [];
    for (const [type, data] of Object.entries(events)) {
      const { payload, headers } = await deliver(type, data);
      const event = await verifyTypedWebhook({ payload, headers, secret: SECRET, now });
      switch (event.type) {
        case 'callout.created':
          seen.push(`created:${event.data.callout.score_x}`);
          break;
        case 'callout.milestone':
          seen.push(`milestone:${event.data.milestone_x}`);
          break;
        case 'callout.scored':
          seen.push(`scored:${event.data.callout.first_day.peak_x}`);
          break;
        case 'callout.final':
          seen.push(`final:${event.data.callout.tracking.stop_reason}`);
          break;
        default:
          seen.push('other');
      }
    }
    expect(seen).toEqual(['created:5', 'milestone:5', 'scored:5', 'final:inactive']);

    const { payload, headers } = await deliver('callout.milestone', events['callout.milestone']);
    const event = await verifyWebhook({ payload, headers, secret: SECRET, now });
    expect(isWebhookEvent(event, 'callout.created')).toBe(false);
    if (isWebhookEvent(event, 'callout.milestone', 'callout.created')) {
      const data: CalloutMilestoneData | CalloutCreatedData = event.data;
      expect(data.callout.id).toBe('co-1');
    } else {
      throw new Error('not narrowed');
    }
  });
});

describe('copy trading webhooks', () => {
  it('narrows copy_trade.instruction to the instruction plus external_id', async () => {
    const data = {
      id: 'i-1',
      type: 'copy_instruction',
      status: 'pending',
      created_at: '2026-11-01T12:00:00Z',
      expires_at: '2026-11-01T12:02:00Z',
      csid_id: 'f-1',
      external_id: 'u1',
      trader: { csid_id: 't-1', username: 'ctkol', name: null, image_url: null, kol: false, profile_url: null },
      action: { blockchain: 'solana', mint: 'So1', symbol: 'CPT', name: null, logo: null, side: 'sell', amount_usd: null, amount_native: null, currency: 'SOL', sell_percent: 50, price_usd: 0.3, max_price_usd: null, min_price_usd: 0.291, slippage_bps: 300 },
      source_trade: { blockchain: 'solana', mint: 'So1', side: 'sell', label: 'partial', sold_percent: 50 },
      settings: { enabled: true, mode: 'percent', amount_usd: 50, percent: 10, max_usd: null, sides: 'both', slippage_bps: 300, updated_at: null },
      links: { token: null, terminal: null, profile: null },
    };
    const payload = JSON.stringify({ id: 'evt_ct', type: 'copy_trade.instruction', created_at: '2026-11-01T12:00:00Z', sandbox: false, data });
    const headers = { 'webhook-id': 'evt_ct', 'webhook-timestamp': String(now), 'webhook-signature': serverSign(rawKey, 'evt_ct', now, payload) };
    const event = await verifyTypedWebhook({ payload, headers, secret: SECRET, now });
    if (event.type !== 'copy_trade.instruction') throw new Error('not narrowed');
    expect(event.data.action.sell_percent).toBe(50);
    expect(event.data.external_id).toBe('u1');
    const plain = await verifyWebhook({ payload, headers, secret: SECRET, now });
    expect(isWebhookEvent(plain, 'callout.created')).toBe(false);
    if (isWebhookEvent(plain, 'copy_trade.instruction')) {
      const d: CopyTradeInstructionData = plain.data;
      expect(d.action.min_price_usd).toBe(0.291);
    } else {
      throw new Error('not narrowed');
    }
  });
});

describe('trade feed webhooks', () => {
  const trader = { csid_id: 't-1', username: 'MazeCCC', name: 'Maze', image_url: null, kol: true, profile_url: null };
  const links = { token: null, terminal: null, profile: null };

  it('narrows trade_feed.trade to the trade item plus recipients', async () => {
    const data = {
      id: 'tk1',
      type: 'trade',
      timestamp: '2026-11-01T18:40:05Z',
      trader,
      trade: { blockchain: 'solana', mint: 'So1', symbol: 'CPT', name: null, logo: null, side: 'buy', label: 'new', sold_percent: null, amount_native: 1.5, currency: 'SOL', amount_usd: 225, token_amount: 500, price_usd: 0.45, pnl_usd: null, pnl_percent: null, wallet: 'W1', wallet_url: null, tx_signature: 'sig', tx_url: null },
      links,
      recipients: ['f-1'],
      recipients_external: ['u1'],
    };
    const payload = JSON.stringify({ id: 'evt_tf', type: 'trade_feed.trade', created_at: '2026-11-01T18:40:06Z', sandbox: false, data });
    const headers = { 'webhook-id': 'evt_tf', 'webhook-timestamp': String(now), 'webhook-signature': serverSign(rawKey, 'evt_tf', now, payload) };
    const event = await verifyTypedWebhook({ payload, headers, secret: SECRET, now });
    if (event.type !== 'trade_feed.trade') throw new Error('not narrowed');
    expect(event.data.trade.amount_native).toBe(1.5);
    expect(event.data.recipients_external).toEqual(['u1']);
    const plain = await verifyWebhook({ payload, headers, secret: SECRET, now });
    expect(isWebhookEvent(plain, 'trade_feed.thesis')).toBe(false);
    if (isWebhookEvent(plain, 'trade_feed.trade')) {
      const d: TradeFeedTradeData = plain.data;
      expect(d.recipients).toEqual(['f-1']);
    } else {
      throw new Error('not narrowed');
    }
  });

  it('narrows trade_feed.thesis to the thesis item plus recipients', async () => {
    const data = {
      id: 'h9',
      type: 'thesis',
      timestamp: '2026-11-01T18:41:00Z',
      trader,
      thesis: { id: '9', blockchain: 'solana', mint: 'So1', symbol: 'CPT', name: null, logo: null, stance: 'bear', body: 'Top is in.', likes: 0, replies: 0, url: 'https://id.cabalspy.xyz/try/thesis' },
      links,
      recipients: ['f-1', 'f-2'],
      recipients_external: [],
    };
    const payload = JSON.stringify({ id: 'evt_th', type: 'trade_feed.thesis', created_at: '2026-11-01T18:41:01Z', sandbox: false, data });
    const headers = { 'webhook-id': 'evt_th', 'webhook-timestamp': String(now), 'webhook-signature': serverSign(rawKey, 'evt_th', now, payload) };
    const plain = await verifyWebhook({ payload, headers, secret: SECRET, now });
    if (isWebhookEvent(plain, 'trade_feed.thesis')) {
      const d: TradeFeedThesisData = plain.data;
      expect(d.thesis.stance).toBe('bear');
      expect(d.recipients).toHaveLength(2);
    } else {
      throw new Error('not narrowed');
    }
  });
});
