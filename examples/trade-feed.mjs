// Trade Feed in a user's name.  CABALSPY_API_KEY=... CSID_USER=<sub> node examples/trade-feed.mjs alice
// The user must have signed in to your app with the scope "trade_feed".
import { CabalSpyID } from 'cabalspy-id';

const csid = new CabalSpyID(); // CABALSPY_API_KEY from the environment
const user = process.env.CSID_USER;
const trader = process.argv[2] ?? 'alice';

const added = await csid.addToTradeFeed(user, trader, { notify_theses: true, min_sol: 0.1 });
console.log(added.created ? 'added' : 'updated', added.trader.username, added.settings);

for (const entry of await csid.tradeFeedTraders(user)) {
  console.log('in the Trade Feed:', entry.trader.username, entry.trading_public ? '' : '(private)');
}

let n = 0;
for await (const item of csid.iterTradeFeed(user, { filter: 'all' })) {
  if (item.type === 'trade') {
    const t = item.trade;
    console.log(item.timestamp, item.trader.username, t.side, t.symbol ?? t.mint, t.amount_native, t.currency, t.label, t.pnl_usd ?? '');
  } else {
    console.log(item.timestamp, item.trader.username, 'thesis', item.thesis.stance ?? '', item.thesis.body.slice(0, 60));
  }
  if (++n >= 20) break;
}

// Live, for every user of your instance (the same events as the webhooks):
const stream = csid.tradeFeedStream();
stream.on('trade_feed.trade', (data) => console.log('tell', data.recipients, '→', data.trader.username, data.trade.label));
stream.on('error', (e) => console.error(e.code, e.message));
await stream.connect();
