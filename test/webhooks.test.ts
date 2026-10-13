import { createHmac, randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { WebhookVerificationError, signWebhook, verifyWebhook } from '../src/index';

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
