// Copy trading tour: copy a trader for one of your users, execute the instructions, report back.
//   CABALSPY_API_KEY=... node examples/copy-trading.mjs
// CabalSpy ID never holds keys and never executes: every trade of a copied trader becomes an
// instruction for your app, which executes it with the user's wallet and reports the result.
// The user needs to have allowed your app the scope trade_feed. User and trader are placeholders.
// On Node 18-21 install `ws` for the stream: npm i ws
import { CabalSpyID, ConflictError, NotFoundError, PermissionError } from 'cabalspy-id';

const csid = new CabalSpyID(); // reads CABALSPY_ID_API_KEY or CABALSPY_API_KEY
const USER = 'user_1001'; // your platform's user id (external_id)
const TRADER = 'ctkol'; // a CabalSpy ID handle or csid_id

/** Your swap with the user's wallet. Returns the transaction signature, or null. */
async function execute(instruction) {
  const a = instruction.action;
  if (a.side === 'buy') console.log(`  buy $${a.amount_usd} of ${a.symbol} on ${a.blockchain}, at most $${a.max_price_usd}`);
  else console.log(`  sell ${a.sell_percent} % of the copied ${a.symbol}, at least $${a.min_price_usd}`);
  return null; // placeholder: nothing is executed in this example
}

async function handle(instruction) {
  const sig = await execute(instruction);
  const report = sig
    ? { id: instruction.id, status: 'executed', tx_signature: sig, executed_amount_usd: instruction.action.amount_usd ?? undefined }
    : { id: instruction.id, status: 'skipped', note: 'example: not executed' };
  const done = await csid.reportCopyInstruction(report);
  console.log('  reported', done.id, done.status);
}

// 1. Copy the trader: $25 per buy, at most $20, buys and sells, 1.5 % price limit.
try {
  const s = await csid.updateCopyTradingSettings({
    external_id: USER,
    trader: TRADER,
    enabled: true,
    mode: 'fixed_usd',
    amount_usd: 25,
    max_usd: 20,
    sides: 'both',
    slippage_bps: 150,
  });
  console.log('copying', s.trader.username, s.copy);
} catch (err) {
  if (err instanceof ConflictError) console.log('managed elsewhere:', err.code); // copy_managed_elsewhere
  else if (err instanceof PermissionError) console.log('not allowed:', err.code); // consent_required
  else if (err instanceof NotFoundError) console.log('no such trader:', err.code); // trader_not_found
  else throw err;
}

// 2. Everyone in the user's Trade Feed and how they are copied.
for (const s of await csid.copyTradingSettings(USER)) {
  console.log(`  ${s.trader.username}: ${s.copy.enabled} (elsewhere: ${s.managed_by_other_platform})`);
}

// 3. Pending instructions, newest first: execute and report each.
for await (const i of csid.iterCopyInstructions({ external_id: USER, status: 'pending' })) await handle(i);

// 4. Live: new instructions as they happen (the webhook copy_trade.instruction carries the same).
const stream = csid.copyTradingStream();
stream
  .on('copy_trade.instruction', (i) => {
    console.log('instruction', i.id, 'for', i.external_id ?? i.csid_id, i.action.side);
    handle(i).catch((e) => console.log('report failed:', e.code));
  })
  .on('error', (e) => console.log('stream:', e.code));
console.log('ready:', await stream.connect());

// 5. Percent mode, buys only, no cap.
await csid.updateCopyTradingSettings({ external_id: USER, trader: TRADER, mode: 'percent', percent: 10, sides: 'buys', max_usd: null });

setTimeout(() => stream.close(), 60_000);
