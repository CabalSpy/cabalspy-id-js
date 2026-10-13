// Data API tour.  CABALSPY_API_KEY=... node examples/data-api.mjs
// The key is your CabalSpy API key with "CabalSpy ID" enabled on the API keys page.
import { CabalSpyID, NotFoundError, PlanUserLimitError } from 'cabalspy-id';

const csid = new CabalSpyID(); // reads CABALSPY_ID_API_KEY or CABALSPY_API_KEY

console.log(await csid.health());
const me = await csid.me();
console.log(`${me.instance}: ${me.plan} plan, ${me.rate_limit_rps} req/s, ${me.users_with_data} users with data`);

// Every user of your instance (follows the cursor for you)
for await (const user of csid.iterUsers({ limit: 100 })) {
  console.log(`@${user.username}`, user.kol.badge ? 'KOL' : '', user.wallets.map((w) => w.address));

  const wallet = user.wallets.find((w) => w.chains.includes('solana'));
  if (!wallet) continue;
  const t = await csid.tracker({ blockchain: 'solana', address: wallet.address, period: '7d' });
  console.log('  7d PnL', t.period_stats.realized_pnl_usd.toFixed(2), 'USD, win rate', t.period_win_rate_distribution.win_rate_percentage, '%');
}

// Leaderboard of your users
const board = await csid.leaderboard({ blockchain: 'solana', period: '7d', sort: 'pnl_usd', limit: 10 });
for (const e of board.leaderboard) console.log(e.rank, e.profile.username, e.period_stats.realized_pnl_usd);

// Latest trades of your users on every chain
console.log(await csid.latestTransactions({ limit: 5 }));

// Look someone up by the `sub` of their ID token
try {
  await csid.profile({ csid_id: 'anon_example' });
} catch (err) {
  if (err instanceof PlanUserLimitError) console.log('over the plan user limit:', err.docs);
  else if (err instanceof NotFoundError) console.log('not one of your users');
  else throw err;
}
console.log('rate limit after the last call:', csid.lastRateLimit);
