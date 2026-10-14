# CabalSpy ID SDK — Login with CabalSpy ID, verified wallets and trading stats

Official TypeScript SDK for **[CabalSpy ID](https://id.cabalspy.xyz)**, the verified social layer for crypto trading.

People sign in with X, prove their wallets with a tiny on-chain payment (no wallet connect, no signatures) and can earn a reviewed **KOL badge**. Every verified wallet is tracked live on **Solana, BNB Chain, Base, Ethereum and Robinhood Chain**. Your platform adds "Login with CabalSpy ID" and receives the user's X profile, verified wallets, KOL badge and full trading stats — PnL, win rate, trades, holdings — for copy trading, leaderboards and social features.

```bash
npm install cabalspy-id
```

One package, everything you need:

| | |
|---|---|
| `CabalSpyIDAuth` | OpenID Connect for your server: PKCE, code exchange, refresh, revoke, userinfo, ID token verification (ES256 / JWKS) |
| `cabalspy-id/react` | `<CabalSpyLogin />` button, `<CabalSpyTheses />` widget and `useCabalSpyID()` hook |
| `ThesisClient` | public token thesis API for your own UI in the browser (user access token) with `live()` updates |
| `CabalSpyID` | Data API client for `https://api-id.cabalspy.xyz/v1`, typed responses, pagination, live trade stream |
| `verifyWebhook` | Standard Webhooks signature verification |

Zero runtime dependencies: crypto runs on WebCrypto. Works in Node 18+, browsers, Deno, Bun and edge runtimes. ESM and CommonJS.

Everything for developers — instance (client_id), client secrets, redirect URIs, button builder, webhooks, API keys — lives in the [API dashboard](https://apidashboard.cabalspy.xyz), tab **CabalSpy ID**.

## Login button

Plain HTML, no build step:

```html
<div data-csid-login data-client-id="csid_..."></div>
<script src="https://id.cabalspy.xyz/widget.js" async></script>
```

React:

```tsx
import { CabalSpyLogin, useCabalSpyID } from 'cabalspy-id/react';

export function Header() {
  const { user, limited } = useCabalSpyID({ clientId: 'csid_...' });
  return (
    <CabalSpyLogin
      clientId="csid_..."
      scope={['openid', 'profile', 'wallets']}
      theme="dark"
      shape="pill"
      onLogin={({ idToken }) => fetch('/api/session', { method: 'POST', body: JSON.stringify({ idToken }) })}
      onLogout={() => fetch('/api/session', { method: 'DELETE' })}
    />
  );
}
```

`<CabalSpyLogin>` loads `widget.js` once and maps its props to the widget's `data-*` attributes:

| Prop | Attribute | |
|---|---|---|
| `clientId` | `data-client-id` | your instance's client_id (required) |
| `theme`, `color`, `textColor`, `shape`, `size`, `label`, `fullWidth`, `showLogo` | `data-theme` … `data-show-logo` | override the design from the dashboard's button builder |
| `href` | `data-href` | **server apps:** your login route (you run the OIDC flow with your secret) |
| `redirectUri`, `scope` | `data-redirect-uri`, `data-scope` | **browser apps:** the widget runs PKCE itself |
| `user`, `logoutHref` | `data-user`, `data-logout-href` | **server apps:** show the signed-in person's avatar menu |
| `onLogin`, `onLogout`, `onError` | events `csid:login`, `csid:logout`, `csid:error` | |

Browser apps (public clients) get `{ user, idToken, accessToken, expiresIn }` in `onLogin`. **Always send `idToken` to your backend and verify it there** before you trust it:

```ts
import { CabalSpyIDAuth } from 'cabalspy-id';

const auth = new CabalSpyIDAuth({ clientId: 'csid_...' });
const claims = await auth.verifyIdToken(idToken); // ES256 via JWKS: iss, aud, azp, exp
```

`useCabalSpyID({ clientId })` returns `{ user, idToken, accessToken, limited, ready, login(), signOut() }`.

## Server-side login (OpenID Connect)

Authorization code flow with PKCE S256 (required for every client), state and nonce.

```ts
import { CabalSpyIDAuth, isLimited } from 'cabalspy-id';

const auth = new CabalSpyIDAuth({
  clientId: process.env.CSID_CLIENT_ID!,         // csid_...
  clientSecret: process.env.CSID_CLIENT_SECRET,  // csid_sk_... (omit for public clients)
  redirectUri: 'https://your.app/callback',      // registered in the dashboard
});

// GET /login
const login = await auth.createAuthorizationUrl({ scope: ['openid', 'profile', 'wallets', 'offline_access'] });
// keep login.state, login.nonce and login.codeVerifier (session or signed http-only cookie)
redirect(login.url);

// GET /callback
const { tokens, claims } = await auth.handleCallback(request.url, stored);
// checks error, state and iss, exchanges the code, verifies the ID token and its nonce

if (isLimited(claims)) {
  // over your plan's user limit: anonymous sub "anon_...", no profile or wallet data
} else {
  const user = await auth.userinfo(tokens.access_token); // x profile, wallets, onchain
}
```

| Method | |
|---|---|
| `discover()` | the discovery document (cached) |
| `createAuthorizationUrl({ scope?, prompt?, redirectUri?, state?, nonce? })` | returns `{ url, state, nonce, codeVerifier, redirectUri }` |
| `handleCallback(url, { state, nonce, codeVerifier })` | full callback handling, returns `{ tokens, claims }` |
| `exchangeCode({ code, codeVerifier, redirectUri? })` | `POST /oauth/token`, authorization_code |
| `refresh(refreshToken)` | `POST /oauth/token`, refresh_token. Tokens rotate: store the new one; reusing an old one revokes the chain |
| `revoke(token)` | `POST /oauth/revoke` |
| `userinfo(accessToken)` | `GET /oauth/userinfo` |
| `verifyIdToken(idToken, { nonce?, maxAge? })` | ES256 signature via JWKS, iss, aud, azp, exp, nonce |
| `verifyAccessToken(accessToken)` | for access tokens your frontend sends to your API (`typ: at+jwt`) |

Scopes: `openid` `profile` `wallets` `onchain` `thesis` `offline_access` (`thesis`: post theses and replies, react and report in the user's name). Client authentication: `client_secret_basic` (default with a secret), `client_secret_post`, `none` (public clients). Access and ID tokens live 15 minutes; refresh tokens 30 days of inactivity, 90 days absolute.

**Users over the plan's limit can always sign in.** Their token carries an anonymous `sub` (`anon_...`), `limited: true` and `reason: "plan_user_limit"`, and no profile or wallet data, until the platform upgrades. `isLimited(claims)` checks both.

A runnable server is in [examples/login-server.mjs](examples/login-server.mjs).

## Data API

```ts
import { CabalSpyID } from 'cabalspy-id';

const csid = new CabalSpyID({ apiKey: process.env.CABALSPY_API_KEY });

const me = await csid.me(); // instance, plan, rate limit, users with data

// The person who just signed in: look them up by the `sub` of their ID token
const profile = await csid.profile({ csid_id: claims.sub });
const wallet = profile.wallets.find((w) => w.chains.includes('solana'))!;

// Full trading profile for a period, same numbers as the CabalSpy API
const t = await csid.tracker({ blockchain: 'solana', address: wallet.address, period: '7d' });
console.log(t.period_stats.realized_pnl_usd, t.period_win_rate_distribution.win_rate_percentage);

// Your users ranked by PnL
const board = await csid.leaderboard({ blockchain: 'solana', period: '7d', sort: 'pnl_usd', limit: 25 });
```

The API key is the **same key as the CabalSpy API**, with the per-key toggle "CabalSpy ID" enabled on the API keys page. A key sees **its instance only**: users that signed in to its apps, within the plan's user limit. `scope: 'global'` (every CabalSpy ID user) is Enterprise only.

| Method | Endpoint |
|---|---|
| `health()` | `GET /v1/health` (no key needed) |
| `me()` | `GET /v1/me` |
| `users({ limit?, kol?, cursor?, scope? })` | `GET /v1/users` |
| `profile({ username } \| { csid_id } \| { address })` | `GET /v1/profile` |
| `walletLookup(address)` | `GET /v1/wallets/lookup` |
| `tracker({ blockchain, address, period? })` | `GET /v1/wallets/tracker` |
| `history({ blockchain, address, limit?, cursor? })` | `GET /v1/wallets/history` |
| `holdings({ blockchain, address })` | `GET /v1/wallets/holdings` |
| `pnlCalendar({ blockchain, address })` | `GET /v1/wallets/pnl_calendar` |
| `leaderboard({ blockchain, period?, sort?, limit?, cursor?, scope? })` | `GET /v1/wallets/leaderboard` |
| `latestTransactions({ blockchain?, limit? })` | `GET /v1/transactions/latest` |

Chains: `solana`, `bnb`, `base`, `eth`, `rh`. Periods: `6h`, `1d`, `7d`, `30d`. Leaderboard sorts: `volume`, `pnl`, `pnl_usd`, `win_rate`, `trades`. Every response is fully typed.

If your account has several CabalSpy ID instances, pass `instance: 'csid_...'` (the client_id) to the constructor.

### Pagination

Async iterators follow `next_cursor` for you:

```ts
for await (const user of csid.iterUsers({ kol: true })) console.log(user.username);
for await (const trade of csid.iterHistory({ blockchain: 'solana', address })) console.log(trade.tx_signature);
for await (const entry of csid.iterLeaderboard({ blockchain: 'base', period: '30d' })) console.log(entry.rank);
```

For whole pages with metadata, use the `*Raw` methods (`usersRaw`, `historyRaw`, `leaderboardRaw`) with `csid.pages()`.

### Errors

Every failure is a typed subclass of `CabalSpyIDError` carrying `.code`, `.status`, `.requestId`, `.docs` (a link to the error's documentation), and for validation errors `.parameter` and `.allowed`.

```ts
import { NotFoundError, PlanUserLimitError, RateLimitError } from 'cabalspy-id';

try {
  await csid.profile({ csid_id: claims.sub });
} catch (err) {
  if (err instanceof PlanUserLimitError) return showUpgradeNotice(); // anon_ sub: no data until you upgrade
  if (err instanceof NotFoundError) return null;                     // not one of your users
  if (err instanceof RateLimitError) console.log(err.retryAfter);
  throw err;
}
```

| Class | Status | Codes |
|---|---|---|
| `BadRequestError` | 400 | `missing_parameter`, `invalid_parameter`, `instance_required` |
| `AuthenticationError` | 401 | `missing_api_key` |
| `PermissionError` | 403 | `invalid_api_key`, `product_not_enabled`, `no_instance`, `scope_not_allowed` |
| `PlanUserLimitError` | 403 | `plan_user_limit` |
| `NotFoundError` | 404 | `profile_not_found`, `wallet_not_found`, `instance_not_found` |
| `RateLimitError` | 429 | `rate_limit_exceeded` |
| `ServerError` | 5xx | `internal_error`, `service_unavailable` |
| `ConnectionError` | – | network failure, timeout |
| `OAuthError` | 4xx | OAuth errors from the login endpoints (`invalid_grant`, `invalid_client`, …) |
| `TokenVerificationError` | – | ID / access token failed verification |
| `WebhookVerificationError` | – | webhook signature or timestamp invalid |

`429`, `5xx` and network errors are retried with exponential backoff (default 2 retries); `Retry-After` wins. The rate limit of the last call is in `csid.lastRateLimit` (`X-RateLimit-Limit/Remaining/Reset`).

## Token theses

A thesis is a short opinion on a token (up to 1000 characters), optionally tagged bull or bear. **Only holders post theses**: one of the author's verified wallets bought the token and still holds it. Every thesis shows the author's real position — what they bought when posting and their live PnL now (or "sold"); authors who keep their trading private show only that they hold. Anyone signed in can reply and react (`like` plus 🔥 🚀 💎 👀 😂 🤝 💀 🐂 🐻). The same theses appear in the widget, through the Data API and on every platform.

Writing needs the scope **`thesis`** in your login (`scope: ['openid', 'profile', 'thesis']`).

**Scope of reads.** Theses are shared across platforms. Every read (Data API `listTheses`, `thesisSummary`, `latestTheses`; `ThesisClient`; the widget; the live sockets) takes `scope`: `global` (default, every platform) or `instance` (only theses written on your instance). In the Data API your key decides the instance; the public API and widget need your `clientId`.

### Widget

```tsx
import { CabalSpyTheses, useCabalSpyID } from 'cabalspy-id/react';

const { accessToken } = useCabalSpyID({ clientId: 'csid_...' });
<CabalSpyTheses chain="solana" mint={mint} clientId="csid_..." theme="dark" accessToken={accessToken} />
```

With `clientId` the widget loads the design saved in the dashboard and credits posts to your app. Every design setting can be overridden by a prop (mapped to the widget's `data-*` attribute): `theme`, `scope`, `sort`, `font`, `radius`, `bg`, `card`, `text`, `muted`, `border`, `accent`, `accentText`, `bull`, `bear`, `showHeader`, `showSentiment`, `compact`, `height`.

Plain HTML: `<div data-csid-thesis data-chain="solana" data-mint="..." data-client-id="csid_..." data-theme="dark"></div>` with `widget.js`; `CSID.thesis.setAccessToken(token)` lets the signed-in person write without signing in again inside the widget (after a browser login through the widget this happens automatically).

### Your own UI in the browser: `ThesisClient`

The public thesis API (`https://id.cabalspy.xyz/thesis/v1`) needs no API key. Reading is open; writing uses the signed-in user's access token (scope `thesis`).

```ts
import { ThesisClient } from 'cabalspy-id';

const theses = new ThesisClient({ accessToken, clientId: 'csid_...' }); // token from csid:login / useCabalSpyID()
// add scope: 'instance' to show only theses written on your platform

const { items, token, summary } = await theses.list('solana', mint, { sort: 'top' });
const me = await theses.me('solana', mint);       // { can_post, can_reply, holder, paused, user }
if (me.can_post) await theses.post('solana', mint, { body: 'Strong community, still early.', stance: 'bull' });
await theses.reply(items[0].id, 'Agree, chart looks good');
await theses.react(items[0].id, '🚀');

const live = theses.live('solana', mint);         // public websocket for one token (also takes { scope, clientId })
live.on('thesis', (t) => prepend(t)).on('reply', addReply).on('reaction', updateCounts).on('removed', ({ id }) => drop(id));
await live.connect();
```

Methods: `list`, `iterate`, `summary`, `get`, `replies`, `byUser`, `me`, `post`, `reply`, `react`, `report`, `delete`, `notifications`, `markNotificationsRead`, `appeal`, `live`, `setAccessToken`.

### Data API (server to server)

Reading works with any key, for every token and user. Writing happens **in the name of one of your users**: pass their `csid_id` (the `sub` of their ID token); they must have signed in to your app with the scope `thesis` and be within your plan's user limit.

```ts
const list = await csid.listTheses({ blockchain: 'solana', mint, sort: 'new' });
const counts = await csid.thesisSummary({ blockchain: 'solana', mint });  // theses, bull, bear, authors, token

const { can_post, reason } = await csid.thesisEligibility({ blockchain: 'solana', mint, csid_id: claims.sub });
if (can_post) {
  const t = await csid.postThesis({ blockchain: 'solana', mint, body: 'Accumulating here.', stance: 'bull', csid_id: claims.sub });
}
```

| Method | Endpoint |
|---|---|
| `listTheses({ blockchain, mint, sort?, stance?, limit?, cursor?, csid_id? })` / `iterTheses()` | `GET /v1/theses` |
| `thesisSummary({ blockchain, mint })` | `GET /v1/theses/summary` |
| `thesis(id, { csid_id? })` | `GET /v1/theses/item` |
| `thesisReplies({ id, limit?, cursor? })` / `iterThesisReplies()` | `GET /v1/theses/replies` |
| `latestTheses({ blockchain?, users?: 'all' \| 'instance', limit?, cursor? })` | `GET /v1/theses/latest` |
| `userTheses({ csid_id } \| { username })` | `GET /v1/theses/user` |
| `thesisEligibility({ blockchain, mint, csid_id })` | `GET /v1/theses/eligibility` |
| `postThesis({ blockchain, mint, body, stance?, csid_id })` | `POST /v1/theses` |
| `replyToThesis({ thesis_id, body, csid_id })` | `POST /v1/theses/replies` |
| `reactToThesis({ thesis_id, emoji, on?, csid_id })` | `POST /v1/theses/reactions` |
| `reportThesis({ thesis_id, reason, note?, csid_id })` | `POST /v1/theses/report` |
| `deleteThesis({ thesis_id, csid_id })` | `POST /v1/theses/delete` |

| `thesisNotifications(csidId)` | `GET /v1/theses/notifications` |
| `appealThesisDecision(csidId, notificationId, message)` | `POST /v1/theses/appeal` |

Every thesis carries `reacted_by` (the latest reactions with who reacted) and, for theses, `latest_replies` (a preview of the newest replies).

**Moderation.** Posts hidden after reports, pauses and moderator decisions reach the author as notifications (`{ id, kind, text, data, created_at, read, appealable, appeal }`); `appealable` ones can be appealed within 30 days with 10-1000 characters. Through the Data API in your user's name: `thesisNotifications(csidId)` / `appealThesisDecision(...)`; in the browser: `ThesisClient.notifications()`, `markNotificationsRead()`, `appeal(id, message)`. `ThesisClient.me()` also returns `notices: { unread, latest, url }` so your UI can show a badge.

Thesis error codes: `not_a_holder`, `consent_required`, `scope_missing`, `plan_user_limit` (`PlanUserLimitError`), `posting_paused`, `reporting_paused`, `sandbox_user` (403, `PermissionError`); `invalid_body`, `duplicate` (400); `not_found` (404); `rate_limited` (429). Writes are never retried after a server or network error, so a post can't be duplicated; only the API's own rate limit is retried.

### Theses stream (every plan)

Live theses for the tokens you choose, e.g. to put markers on a chart. Up to 200 tokens per connection (or all), available on every plan; subscriptions are sent again after every reconnect.

```ts
const ts = csid.thesesStream({ scope: 'global' });  // or 'instance'
ts.on('thesis', (t) => addMarker(t.blockchain, t.mint, t));
ts.on('thesis.removed', ({ id }) => removeMarker(id));
await ts.connect();                                  // resolves on `ready`
ts.subscribe([{ blockchain: 'solana', mint: MINT_A }, { blockchain: 'base', mint: TOKEN_B }]);
ts.unsubscribe([{ blockchain: 'base', mint: TOKEN_B }]);
// ts.subscribeAll() / ts.unsubscribeAll()

for await (const { event, data } of csid.thesesStream()) { … }  // or iterate
```

Events: `ready`, `subscribed`, `thesis`, `thesis.reply`, `thesis.reaction`, `thesis.removed`, `heartbeat`, `reconnecting`, `close`, `error`. A refused connection (`invalid_api_key`, …) is fatal; a bad frame (`too_many_tokens`, an invalid address) is reported as `error` and the connection stays.

Also over the trade stream (Pro plan): `csid.stream({ events: ['theses'], blockchain: 'solana', mint })` emits `thesis`, `thesis.reply`, `thesis.reaction` and `thesis.removed` (or iterate `stream.theses()`). Your users' activity also arrives as webhooks: `thesis.created` (`event.data.thesis`), `thesis.reply` (`event.data.reply`) and `thesis.reaction` (`event.data`: `thesis_id`, `chain`, `mint`, `emoji`, `on`, `reactions`).

## Live stream

Every trade of your users the moment it is indexed, with the trader's profile (Pro plan and up).

```ts
const stream = csid.stream({ blockchain: 'solana' }); // omit blockchain for every chain
// events: ['trades'] (default), ['theses'] or both; mint: theses of one token

stream.on('trade', (t) => console.log(t.trader?.username, t.transaction_type, t.token_symbol, t.value_usd));
stream.on('error', (e) => console.error(e.code, e.message));
await stream.connect(); // resolves once the server confirmed the subscription

// or
for await (const trade of csid.stream()) console.log(trade);
```

The server sends a heartbeat every 30 seconds. The client reconnects with exponential backoff after a dropped connection or when heartbeats stop; configuration errors (`invalid_api_key`, `plan_required`, `scope_not_allowed`) are fatal and stop reconnecting. Events: `trade`, `thesis`, `thesis.reply`, `thesis.reaction`, `thesis.removed`, `subscribed`, `heartbeat`, `open`, `close`, `reconnecting`, `error`.

Browsers, Deno, Bun and Node 22+ have a global `WebSocket`. On Node 18–21 install `ws` and pass it:

```ts
import { WebSocket } from 'ws';
const stream = csid.stream({ WebSocketImpl: WebSocket });
```

## Webhooks

Deliveries follow the [Standard Webhooks](https://www.standardwebhooks.com) spec (`webhook-id`, `webhook-timestamp`, `webhook-signature`, secret `whsec_...`) and are retried for about 2 days. Events: `wallet.verified`, `wallet.removed`, `profile.updated`, `kol.granted`, `consent.revoked`, `thesis.created`, `thesis.reply`, `thesis.reaction` — only for users within the plan's limit.

```ts
import { verifyWebhook } from 'cabalspy-id';

// pass the RAW body, exactly as received
const event = await verifyWebhook({ payload: rawBody, headers: req.headers, secret: process.env.CSID_WEBHOOK_SECRET! });

switch (event.type) {
  case 'wallet.verified': /* event.data.sub, … */ break;
  case 'consent.revoked': /* delete the user's data */ break;
}
```

Timestamps older than 5 minutes are rejected (`toleranceSeconds`). During a secret roll several signatures are sent; any match is accepted. Dedupe on `event.id`, it is the same on every retry. `signWebhook()` builds test requests for your receiver.

## Configuration

```ts
new CabalSpyID({
  apiKey: process.env.CABALSPY_API_KEY, // env fallback: CABALSPY_ID_API_KEY, then CABALSPY_API_KEY
  instance: undefined,                  // client_id, when the account has several instances
  baseUrl: 'https://api-id.cabalspy.xyz/v1',
  streamUrl: 'wss://api-id.cabalspy.xyz/v1/stream',
  timeout: 30_000,
  maxRetries: 2,
  headers: {},
  fetch: undefined,                     // custom fetch (proxies, tests)
});

new CabalSpyIDAuth({
  clientId: 'csid_...',
  clientSecret: undefined,              // csid_sk_..., server apps only
  redirectUri: undefined,
  issuer: 'https://id.cabalspy.xyz',
  tokenEndpointAuthMethod: undefined,   // client_secret_basic | client_secret_post | none
  clockTolerance: 60,
  timeout: 15_000,
  fetch: undefined,
});
```

Never ship the API key or the client secret to a browser. The Data API key and `CabalSpyIDAuth` with a secret belong on your server.

## Pricing

Per month and registrable domain. Everyone can always sign in; above the limit the platform receives no data for the extra users until it upgrades.

| Plan | Price / month | Users with data | API rate | |
|---|---|---|---|---|
| Free | $0 | 50 | 1 req/s | |
| Starter | $49 | 200 | 5 req/s | |
| Pro | $149 | 500 | 10 req/s | + live stream |
| Business | $499 | 1,000 | 25 req/s | |
| Enterprise | custom | unlimited | custom + SLA | `scope=global` |

Yearly billing is 20% off. Card or crypto at [apidashboard.cabalspy.xyz/billing/csid](https://apidashboard.cabalspy.xyz/billing/csid).

## Docs

[docs.cabalspy.xyz/cabalspy-id](https://docs.cabalspy.xyz/cabalspy-id) · Discovery: [id.cabalspy.xyz/.well-known/openid-configuration](https://id.cabalspy.xyz/.well-known/openid-configuration)

## Related

- [CabalSpy ID](https://id.cabalspy.xyz) · [leaderboard](https://id.cabalspy.xyz/leaderboard) · [API dashboard](https://apidashboard.cabalspy.xyz)
- CabalSpy ID SDKs: [TypeScript](https://www.npmjs.com/package/cabalspy-id) · [Python](https://pypi.org/project/cabalspy-id/)
- CabalSpy API SDKs (KOL and smart money wallet tracking): [TypeScript](https://www.npmjs.com/package/cabalspy) · [Python](https://pypi.org/project/cabalspy/) · [Rust](https://crates.io/crates/cabalspy)
- [SDK overview](https://www.cabalspy.xyz/sdks/) · [MCP server](https://www.cabalspy.xyz/mcp/) · [CabalSpy Terminal](https://app.cabalspy.xyz/)

## License

MIT
