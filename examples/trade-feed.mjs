// Trade Feed tour: manage one user's Trade Feed, read it, and get new trades live.
//   CABALSPY_API_KEY=... node examples/trade-feed.mjs
// Every call acts in the name of one of your users: someone who signed in to your app with the
// scope trade_feed, or one of your platform users. User and trader are placeholders.
// On Node 18-21 install `ws` for the stream: npm i ws
import { CabalSpyID, ConflictError, NotFoundError, PermissionError, RateLimitError } from 'cabalspy-id';

const csid = new CabalSpyID(); // reads CABALSPY_ID_API_KEY or CABALSPY_API_KEY
const USER = 'user_1001'; // your platform's user id (external_id)
const TRADER = 'MazeCCC'; // a CabalSpy ID handle or csid_id

function line(item) {
  const who = item.trader.username ?? item.trader.name;
  if (item.type === 'thesis') return `${who} posted a ${item.thesis.stance ?? 'neutral'} thesis on ${item.thesis.symbol}: ${item.thesis.body.slice(0, 60)}`;
  const t = item.trade;
  const size = t.amount_usd ? `$${Math.round(t.amount_usd)}` : `${t.amount_native} ${t.currency}`;
  return `${who} ${t.side === 'buy' ? 'bought' : 'sold'} ${t.symbol} for ${size} (${t.label})`;
}

// 1. Add the trader: alerts for buys from 0.5 SOL, no sells.
try {
  const r = await csid.addTradeFeedTrader({ external_id: USER, trader: TRADER, min_sol: 0.5, notify_sells: false });
  console.log(r.created ? 'added' : 'already there:', r.trader.username, r.settings);
} catch (err) {
  if (err instanceof PermissionError) console.log('not allowed:', err.code); // consent_required, trading_private
  else if (err instanceof NotFoundError) console.log('not found:', err.code); // trader_not_found, platform_user_not_found
  else if (err instanceof ConflictError) console.log('full:', err.code); // trade_feed_full: 300 traders
  else if (err instanceof RateLimitError) console.log('slow down:', err.code); // rate_limited: 120 changes per hour
  else throw err;
}

// 2. Everyone in the Trade Feed, with alert and copy settings.
const { pagination } = await csid.tradeFeedTradersRaw(USER);
console.log(`${pagination?.total} of ${pagination?.max} traders`);
for await (const entry of csid.iterTradeFeedTraders(USER)) {
  const s = entry.settings;
  console.log(`  ${entry.trader.username}: muted=${s.muted} min SOL=${s.min_native.SOL} copy=${s.copy.enabled}`);
}

// 3. The feed, newest first (first 20 items).
let n = 0;
for await (const item of csid.iterTradeFeed({ external_id: USER })) {
  console.log(' ', line(item));
  if (++n === 20) break;
}

// 4. Alerts that passed the user's filters.
for (const alert of await csid.tradeFeedNotifications({ external_id: USER, limit: 5 })) {
  console.log('  alert:', alert.created_at, alert.text);
}

// 5. Live: new trades and theses (the webhooks trade_feed.trade / trade_feed.thesis carry the same).
const stream = csid.tradeFeedStream();
const onItem = (item) => console.log(line(item), '-> tell', item.recipients_external.length ? item.recipients_external : item.recipients);
stream
  .on('trade_feed.trade', onItem)
  .on('trade_feed.thesis', onItem)
  .on('error', (e) => console.log('stream:', e.code));
console.log('ready:', await stream.connect());

// 6. Mute the trader (updates the settings, the trader stays), then remove them.
await csid.addTradeFeedTrader({ external_id: USER, trader: TRADER, muted: true });
console.log('removed:', (await csid.removeTradeFeedTrader({ external_id: USER, trader: TRADER })).removed);

setTimeout(() => stream.close(), 60_000);
