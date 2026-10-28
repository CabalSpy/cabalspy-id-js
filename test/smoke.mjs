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

// Subpath entry points share their classes with the root export (ESM and CJS).
{
  const require = createRequire(import.meta.url);
  const rootEsm = await import('cabalspy-id');
  const api = await import('cabalspy-id/api');
  const thesis = await import('cabalspy-id/thesis');
  const widget = await import('cabalspy-id/widget');
  assert.equal(api.CabalSpyID, rootEsm.CabalSpyID);
  assert.equal(api.NotFoundError, rootEsm.NotFoundError);
  assert.equal(api.ConflictError, rootEsm.ConflictError);
  assert.equal(api.PlatformImportError, rootEsm.PlatformImportError);
  assert.equal(typeof api.CabalSpyID.prototype.importAllPlatformUsers, 'function');
  assert.equal(typeof rootEsm.CabalSpyID.prototype.createCompetition, 'function');
  assert.equal(typeof api.isWebhookEvent, 'function');
  assert.equal(thesis.ThesisClient, rootEsm.ThesisClient);
  assert.equal(thesis.CabalSpyID, rootEsm.CabalSpyID);
  assert.throws(() => new thesis.ThesisClient({}), /client_id/);
  assert.equal(typeof widget.mountTheses, 'function');
  assert.equal(typeof widget.thesisWidgetAttributes({ chain: 'solana', mint: 'M', clientId: 'csid_x' })['data-mint'], 'string');
  const rootCjs = require('cabalspy-id');
  for (const sub of ['cabalspy-id/api', 'cabalspy-id/thesis']) {
    const m = require(sub);
    assert.equal(m.CabalSpyID, rootCjs.CabalSpyID, sub);
    assert.equal(m.CabalSpyIDError, rootCjs.CabalSpyIDError, sub);
  }
  assert.equal(new (require('cabalspy-id/api').NotFoundError)('x') instanceof rootCjs.CabalSpyIDError, true);
  console.log('subpath exports ok');
}
