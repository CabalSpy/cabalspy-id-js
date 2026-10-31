// Callouts tour: a user calls a token, the call is tracked and scored, a leaderboard of
// callers, the live stream and a callout competition.
//   CABALSPY_API_KEY=... node examples/callouts.mjs
// Callouts are an extra: CabalSpy switches them on per instance on request. Without it,
// every call throws FeatureNotEnabledError (me().features shows what is on).
// On Node 18-21 install `ws` for the stream: npm i ws
import {
  CabalSpyID,
  CalloutCooldownError,
  ConflictError,
  FeatureNotEnabledError,
  PermissionError,
  UnprocessableError,
} from 'cabalspy-id';

const csid = new CabalSpyID(); // reads CABALSPY_ID_API_KEY or CABALSPY_API_KEY

// 0. Is the extra on?
const me = await csid.me();
if (!me.features.includes('callouts')) {
  console.log('Callouts are not enabled for this instance. Ask CabalSpy to switch them on.');
  process.exit(0);
}

// 1. Rules: everyone may call, holders only, one callout every 6 hours per user.
console.log(await csid.updateCalloutSettings({ who: 'all', require_holding: true, cooldown_minutes: 360 }));

// 2. Live: every callout event of the instance (optionally one chain or one token).
const stream = csid.calloutsStream({ chain: 'solana' });
stream
  .on('callout.created', (c) => console.log('called', c.token.symbol, 'at', c.at_call.market_cap_usd, 'USD mcap by', c.author.username))
  .on('callout.milestone', (c) => console.log(c.token.symbol, `hit ${c.milestone_x}x`))
  .on('callout.scored', (c) => console.log(c.token.symbol, 'first day scored: peak', c.first_day?.peak_x, 'x'))
  .on('callout.final', (c) => console.log(c.token.symbol, 'tracking stopped, final score', c.score_x, 'x'))
  .on('error', (e) => console.log('stream:', e.code));
await stream.connect();

// 3. A user (by your own user id, or { csid_id }) calls a token.
const MINT = 'So11111111111111111111111111111111111111112';
try {
  const c = await csid.createCallout({ external_id: 'user_1001', chain: 'solana', mint: MINT, note: 'Breakout incoming' });
  console.log('callout', c.id, 'entry', c.at_call.price_usd, 'tracking', c.tracking.phase);

  // Later: the current numbers, the peak and the score.
  const again = await csid.callout(c.id);
  console.log('now', again.now.x, 'x, peak', again.peak.x, 'x, score', again.score_x, 'x');
} catch (err) {
  if (err instanceof CalloutCooldownError) console.log(`cooldown: next callout in ${err.retryAfter} s`);
  else if (err instanceof ConflictError) console.log('already called this token in the last 24 hours');
  else if (err instanceof FeatureNotEnabledError) console.log('callouts are off for this instance');
  else if (err instanceof PermissionError) console.log('not allowed:', err.code); // not_a_holder, kol_only, …
  else if (err instanceof UnprocessableError) console.log('no market price yet:', err.code);
  else throw err;
}

// 4. Recent callouts of one token (e.g. markers on a chart), newest first.
for (const c of await csid.callouts({ chain: 'solana', mint: MINT, limit: 20 })) {
  console.log(c.called_at, c.author.username, `${c.score_x}x`);
}

// 5. One user's stats per period, and the callers leaderboard.
const stats = await csid.calloutStats({ external_id: 'user_1001', hit_x: 2 });
console.log('7d:', stats.periods['7d'].callouts, 'callouts, avg', stats.periods['7d'].avg_peak_x, 'x, hit rate', stats.periods['7d'].hit_rate, '%');
const board = await csid.calloutLeaderboard({ period: '7d', sort: 'avg_peak_x', min_callouts: 3 });
for (const e of board.leaderboard) console.log(e.rank, e.author?.username, e.avg_peak_x, 'x, best', e.best_call.symbol, e.best_call.peak_x, 'x');

// 6. A three-day callout competition on every chain.
try {
  const comp = await csid.createCompetition({
    kind: 'callouts',
    name: 'Caller of the week',
    chain: 'all',
    metric: 'avg_peak_x',
    duration_hours: 72,
    min_callouts: 3,
    hit_x: 2,
  });
  await csid.joinCompetition({ id: comp.id, external_id: 'user_1001' });
  const { standings } = await csid.competitionStandings({ id: comp.id });
  for (const s of standings) console.log(s.rank, s.external_id, s.score, s.best_call?.symbol);
  await csid.cancelCompetition(comp.id); // only a demo
} catch (err) {
  if (err instanceof ConflictError) console.log('competition:', err.code);
  else throw err;
}

stream.close();
