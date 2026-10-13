// ═══════════════════════════════════════════════════════════════════════════
//  WEBHOOKS — Standard Webhooks signatures (standardwebhooks.com)
// ═══════════════════════════════════════════════════════════════════════════
//
//   webhook-id         event id, the same on every retry (dedupe on it)
//   webhook-timestamp  unix seconds
//   webhook-signature  "v1,<base64 HMAC-SHA256>" over "<id>.<timestamp>.<body>",
//                      keyed with the base64-decoded part of the whsec_ secret.
//                      During a secret roll: several, separated by spaces.

import { WebhookVerificationError } from './errors';
import type { WebhookEvent } from './types';
import { type Bytes, base64ToBytes, bytesToBase64, fromUtf8, getCrypto, timingSafeEqual, utf8 } from './util';

export type HeaderSource =
  | Headers
  | Record<string, string | string[] | undefined>
  | { get(name: string): string | null | undefined };

export interface VerifyWebhookOptions {
  /** The raw request body, exactly as received (do not re-serialize parsed JSON). */
  payload: string | Uint8Array | ArrayBuffer;
  /** Request headers (Fetch Headers, Node's IncomingHttpHeaders or a plain object). */
  headers: HeaderSource;
  /** Signing secret from the dashboard, `whsec_…`. */
  secret: string;
  /** Maximum age (and future skew) of webhook-timestamp in seconds. Default: 300 */
  toleranceSeconds?: number;
  /** Current time in seconds; for tests. */
  now?: number;
}

function header(headers: HeaderSource, name: string): string | undefined {
  if (typeof (headers as { get?: unknown }).get === 'function') {
    return (headers as { get(n: string): string | null | undefined }).get(name) ?? undefined;
  }
  const rec = headers as Record<string, string | string[] | undefined>;
  const key = Object.keys(rec).find((k) => k.toLowerCase() === name);
  const v = key === undefined ? undefined : rec[key];
  return Array.isArray(v) ? v[0] : v;
}

function toBytes(payload: string | Uint8Array | ArrayBuffer): Bytes {
  if (typeof payload === 'string') return utf8(payload);
  return new Uint8Array(payload instanceof Uint8Array ? payload : new Uint8Array(payload));
}

function secretKey(secret: string): Bytes {
  try {
    return base64ToBytes(secret.startsWith('whsec_') ? secret.slice(6) : secret);
  } catch {
    throw new WebhookVerificationError('The webhook secret is not valid base64 (expected whsec_…)', { code: 'invalid_secret' });
  }
}

async function hmac(secret: string, content: Bytes): Promise<string> {
  const c = await getCrypto();
  const key = await c.subtle.importKey('raw', secretKey(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return bytesToBase64(new Uint8Array(await c.subtle.sign('HMAC', key, content)));
}

function signedContent(id: string, timestamp: number | string, body: Uint8Array): Bytes {
  const prefix = utf8(`${id}.${timestamp}.`);
  const out = new Uint8Array(prefix.length + body.length);
  out.set(prefix, 0);
  out.set(body, prefix.length);
  return out;
}

/**
 * Computes the `webhook-signature` header value for a payload. Useful to
 * build test requests for your receiver.
 */
export async function signWebhook(
  secret: string,
  id: string,
  timestamp: number,
  payload: string | Uint8Array,
): Promise<string> {
  return `v1,${await hmac(secret, signedContent(id, timestamp, toBytes(payload)))}`;
}

/**
 * Verifies a webhook and returns the parsed event. Throws
 * WebhookVerificationError when a header is missing, the timestamp is outside
 * the tolerance or no signature matches.
 *
 *   const event = await verifyWebhook({ payload: rawBody, headers: req.headers, secret: process.env.CSID_WEBHOOK_SECRET });
 */
export async function verifyWebhook<D = Record<string, unknown>>(options: VerifyWebhookOptions): Promise<WebhookEvent<D>> {
  const { headers, secret } = options;
  if (!secret) throw new WebhookVerificationError('Missing webhook secret', { code: 'invalid_secret' });
  const id = header(headers, 'webhook-id');
  const ts = header(headers, 'webhook-timestamp');
  const sigs = header(headers, 'webhook-signature');
  if (!id || !ts || !sigs) {
    throw new WebhookVerificationError('Missing webhook-id, webhook-timestamp or webhook-signature header', {
      code: 'missing_headers',
    });
  }
  const timestamp = Number(ts);
  if (!/^\d+$/.test(ts) || !Number.isSafeInteger(timestamp)) {
    throw new WebhookVerificationError('Invalid webhook-timestamp', { code: 'invalid_timestamp' });
  }
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const tolerance = options.toleranceSeconds ?? 300;
  if (now - timestamp > tolerance) throw new WebhookVerificationError('Webhook timestamp is too old', { code: 'timestamp_too_old' });
  if (timestamp - now > tolerance) throw new WebhookVerificationError('Webhook timestamp is in the future', { code: 'timestamp_too_new' });

  const body = toBytes(options.payload);
  const expected = await hmac(secret, signedContent(id, ts, body));
  const match = sigs
    .split(' ')
    .map((s) => s.trim())
    .filter(Boolean)
    .some((s) => {
      const [version, sig] = s.split(',', 2);
      return version === 'v1' && sig !== undefined && timingSafeEqual(sig, expected);
    });
  if (!match) throw new WebhookVerificationError('No matching webhook signature', { code: 'invalid_signature' });

  try {
    return JSON.parse(fromUtf8(body)) as WebhookEvent<D>;
  } catch {
    throw new WebhookVerificationError('Webhook body is not valid JSON', { code: 'invalid_payload' });
  }
}
