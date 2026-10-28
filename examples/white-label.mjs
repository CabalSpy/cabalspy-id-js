// White-label tour: your own login, your users and their existing wallets in CabalSpy ID,
// a profile page, a leaderboard and a trading competition.
//   CABALSPY_API_KEY=... node examples/white-label.mjs
// Use a development or sandbox instance to try it: they hold up to 25 platform users.
import { CabalSpyID, ConflictError, NotFoundError, PlatformImportError } from 'cabalspy-id';

const csid = new CabalSpyID(); // reads CABALSPY_ID_API_KEY or CABALSPY_API_KEY

// 1. Settings: count imported (unverified) wallets, keep users to your platform.
console.log(await csid.updatePlatformSettings({ wallet_trust: 'all', data_scope: 'platform' }));

// 2. One user, by YOUR user id, with the wallet they already have (e.g. from Privy).
const alice = await csid.createPlatformUser({
  external_id: 'user_1001',
  display_name: 'Alice',
  wallets: [{ address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', source: 'privy' }],
});
console.log(alice.created ? 'created' : 'updated', alice.csid_id, alice.wallets.map((w) => `${w.address} ${w.status}`));

// 3. Everyone else: any number of users, sent in chunks of 1000 with 429 retries.
const myUsers = [
  { external_id: 'user_1002', wallets: ['0x52908400098527886E0F7030069857D2E4169EE7'] },
  { external_id: 'user_1003', wallets: [{ address: '0x8617E340B3D01FA5F11F306F4090FD50E238070D', chains: ['base'] }] },
];
try {
  const r = await csid.importAllPlatformUsers(myUsers, {
    onProgress: (p) => console.log(`import ${p.done}/${p.total}`, p.summary),
  });
  for (const item of r.results.filter((x) => x.status === 'rejected')) console.log('rejected', item.external_id, item.error);
} catch (err) {
  if (err instanceof PlatformImportError) console.log('stopped:', err.code, `${err.pending.length} users still to import`);
  else throw err;
}

// 4. A profile page in one call; the rest of the API takes external_id in place of csid_id.
const profile = await csid.platformUserProfile({ external_id: 'user_1001', period: '30d' });
for (const t of profile.trading) console.log(t.blockchain, 'PnL', t.realized_pnl_usd, 'USD, win rate', t.win_rate_percentage, '%');

// 5. Leaderboard of your users (with your ids).
const board = await csid.platformLeaderboard({ blockchain: 'solana', period: '7d', sort: 'pnl_usd', limit: 10 });
for (const e of board.leaderboard) console.log(e.rank, e.external_id, e.period_stats.realized_pnl_usd);

// 6. Optional badge: payment verification of a wallet.
const v = await csid.startWalletVerification({ external_id: 'user_1001', chain: 'solana', address: alice.wallets[0].address });
console.log(v.instructions, v.payment_uri);
await csid.cancelWalletVerification(v.verification_id);

// 7. A one-week trading competition between your users.
try {
  const comp = await csid.createCompetition({
    name: 'Weekly PnL',
    chain: 'solana',
    metric: 'pnl_usd',
    duration_hours: 168,
    min_participants: 2,
    enrollment: 'opt_in',
    prizes: [{ rank: 1, prize: '1 SOL' }],
  });
  await csid.joinCompetition({ id: comp.id, external_id: 'user_1001' });
  await csid.joinCompetition({ id: comp.id, external_id: 'user_1002' });
  const standings = await csid.competitionStandings({ id: comp.id });
  console.log(comp.status, standings.standings.length, 'traders');
  await csid.cancelCompetition(comp.id);
} catch (err) {
  if (err instanceof ConflictError) console.log('competition:', err.code); // e.g. competition_limit
  else throw err;
}

// 8. Clean up.
for (const id of ['user_1001', 'user_1002', 'user_1003']) {
  try {
    console.log(await csid.deletePlatformUser(id));
  } catch (err) {
    if (err instanceof NotFoundError) console.log(id, 'was not imported');
    else throw err;
  }
}
