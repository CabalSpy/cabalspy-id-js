/** Internal helpers: encoding, WebCrypto access, environment. */

export const SDK_VERSION = '0.7.0';
export const USER_AGENT = `cabalspy-id-sdk/${SDK_VERSION}`;

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Bytes backed by a plain ArrayBuffer, as WebCrypto expects. */
export type Bytes = Uint8Array<ArrayBuffer>;

export function utf8(text: string): Bytes {
  return enc.encode(text);
}

export function fromUtf8(bytes: Uint8Array): string {
  return dec.decode(bytes);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

export function base64ToBytes(b64: string): Bytes {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(text: string): Bytes {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  return base64ToBytes(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
}

/**
 * WebCrypto. Global in browsers, Deno, Bun and Node 19+; Node 18 exposes it as
 * `require('node:crypto').webcrypto`.
 */
let cryptoPromise: Promise<Crypto> | null = null;
export function getCrypto(): Promise<Crypto> {
  const g = (globalThis as { crypto?: Crypto }).crypto;
  if (g?.subtle) return Promise.resolve(g);
  if (!cryptoPromise) {
    const mod = 'node:crypto';
    cryptoPromise = (import(/* webpackIgnore: true */ /* @vite-ignore */ mod) as Promise<{ webcrypto: Crypto }>).then(
      (m) => m.webcrypto,
    );
  }
  return cryptoPromise;
}

export async function randomToken(bytes = 32): Promise<string> {
  const c = await getCrypto();
  const a = new Uint8Array(bytes);
  c.getRandomValues(a);
  return base64UrlEncode(a);
}

export async function sha256Base64Url(text: string): Promise<string> {
  const c = await getCrypto();
  return base64UrlEncode(new Uint8Array(await c.subtle.digest('SHA-256', utf8(text))));
}

/** Constant-time comparison of two strings. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function env(name: string): string | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
