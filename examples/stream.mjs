// Live trades of your users (Pro plan and up).  CABALSPY_API_KEY=... node examples/stream.mjs
// Node 22+ has a global WebSocket. On Node 18-21: npm i ws, then
//   import { WebSocket } from 'ws';  csid.stream({ WebSocketImpl: WebSocket })
import { CabalSpyID } from 'cabalspy-id';

const csid = new CabalSpyID();
const stream = csid.stream({ blockchain: 'solana' });

stream
  .on('subscribed', (s) => console.log('subscribed', s))
  .on('trade', (t) => console.log(`${t.trader?.username ?? t.wallet} ${t.transaction_type} ${t.token_symbol} for $${t.value_usd.toFixed(2)}`))
  .on('reconnecting', (r) => console.log(`reconnecting (#${r.attempt}) in ${Math.round(r.delay)} ms`))
  .on('error', (e) => console.error(e.code, e.message));

await stream.connect();
process.on('SIGINT', () => stream.close());

// or: for await (const trade of csid.stream()) console.log(trade);
