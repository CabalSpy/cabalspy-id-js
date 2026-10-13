// Smoke test of the built package on any Node >= 18 (no test framework):
//   npm run build && node test/smoke.mjs
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const esm = await import('../dist/index.js');
const cjs = createRequire(import.meta.url)('../dist/index.cjs');

for (const mod of [esm, cjs]) {
  assert.equal(typeof mod.CabalSpyID, 'function');
  assert.equal(typeof mod.CabalSpyIDAuth, 'function');
  const { codeVerifier, codeChallenge } = await mod.generatePkce();
  assert.match(codeVerifier, /^[A-Za-z0-9_-]{64}$/);
  assert.equal(codeChallenge.length, 43);
  const secret = 'whsec_' + Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');
  const body = JSON.stringify({ id: 'evt_1', type: 'webhook.test', created_at: 'now', sandbox: true, data: {} });
  const ts = Math.floor(Date.now() / 1000);
  const sig = await mod.signWebhook(secret, 'evt_1', ts, body);
  const event = await mod.verifyWebhook({ payload: body, secret, headers: { 'webhook-id': 'evt_1', 'webhook-timestamp': String(ts), 'webhook-signature': sig } });
  assert.equal(event.type, 'webhook.test');
}
console.log(`smoke ok on Node ${process.version} (SDK ${esm.SDK_VERSION})`);
