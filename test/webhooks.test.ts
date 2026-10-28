import { createHmac, randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  type CompetitionStandingsData,
  type CompetitionStartedData,
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
