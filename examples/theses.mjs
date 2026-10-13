// Token theses through the Data API.  CABALSPY_API_KEY=... CSID_USER=<sub> node examples/theses.mjs <mint>
// Writing needs a user who signed in to your app with the scope "thesis".
import { CabalSpyID, PermissionError, ThesisClient } from 'cabalspy-id';

const mint = process.argv[2] ?? 'So11111111111111111111111111111111111111112';
const csid = new CabalSpyID();

// Reading: any key, any token
const summary = await csid.thesisSummary({ blockchain: 'solana', mint });
console.log(`${summary.token.symbol}: ${summary.theses} theses (${summary.bull} bull / ${summary.bear} bear)`);
for await (const t of csid.iterTheses({ blockchain: 'solana', mint, sort: 'top' })) {
  const pos = t.position && 'now' in t.position && t.position.now ? ` [${t.position.now.status}, PnL $${t.position.now.pnl_usd}]` : '';
  console.log(`@${t.author.username} ${t.stance ?? ''}: ${t.body}${pos}`);
}

// Writing in the name of one of your users (their csid_id = the `sub` of their ID token)
const user = process.env.CSID_USER;
if (user) {
  const ok = await csid.thesisEligibility({ blockchain: 'solana', mint, csid_id: user });
  if (ok.can_post) {
    try {
      const t = await csid.postThesis({ blockchain: 'solana', mint, body: 'Posted from my platform.', stance: 'bull', csid_id: user });
      console.log('posted', t.id);
    } catch (err) {
      if (err instanceof PermissionError) console.log('not allowed:', err.code);
      else throw err;
    }
  } else {
    console.log('cannot post:', ok.reason ?? (ok.holder ? 'paused' : 'not a holder'));
  }
}

// Live: theses of this token (Pro plan stream) ...
const stream = csid.stream({ events: ['theses'], blockchain: 'solana', mint });
stream.on('thesis', (t) => console.log('new thesis', t.body)).on('thesis.reply', (r) => console.log('reply', r.body));
await stream.connect().catch((e) => console.log('stream:', e.code));

// ... or the public per-token socket (no key, also in browsers)
const live = new ThesisClient().live('solana', mint);
live.on('thesis', (t) => console.log('[public] new thesis', t.body));
await live.connect();
process.on('SIGINT', () => {
  stream.close();
  live.close();
});
