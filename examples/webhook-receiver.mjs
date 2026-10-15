// Webhook receiver.  CSID_WEBHOOK_SECRET=whsec_... node examples/webhook-receiver.mjs
import { createServer } from 'node:http';
import { verifyWebhook, WebhookVerificationError } from 'cabalspy-id';

const seen = new Set(); // dedupe on event id (retries reuse it); use your database in production

createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const payload = Buffer.concat(chunks); // the raw body, not re-serialized JSON
  try {
    const event = await verifyWebhook({ payload, headers: req.headers, secret: process.env.CSID_WEBHOOK_SECRET });
    if (!seen.has(event.id)) {
      seen.add(event.id);
      switch (event.type) {
        case 'wallet.verified':
        case 'wallet.removed':
        case 'profile.updated':
        case 'kol.granted':
          console.log(event.type, 'for user', event.data.sub, event.data);
          break;
        case 'consent.revoked':
          console.log('user', event.data.sub, 'removed access: delete their data');
          break;
        case 'trade_feed.trade': {
          // a trader in your users' Trade Feeds traded: tell event.data.recipients
          const { trader, trade, recipients } = event.data;
          console.log(`notify ${recipients.length} users: @${trader.username} ${trade.side} ${trade.symbol ?? trade.mint} (${trade.label})`);
          break;
        }
        case 'trade_feed.thesis':
          console.log(`notify ${event.data.recipients.length} users: @${event.data.trader.username} posted a thesis`);
          break;
        default:
          console.log('event', event.type);
      }
    }
    res.writeHead(204).end();
  } catch (err) {
    if (err instanceof WebhookVerificationError) return res.writeHead(400).end(err.code);
    res.writeHead(500).end();
  }
}).listen(3001, () => console.log('POST http://localhost:3001'));
