# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.6.0] - 2026-10-15

Trade Feed: your users add CabalSpy ID traders (public trading, verified wallets) to their Trade
Feed and your platform tells them about every trade and thesis of those traders. Needs the new
OIDC scope `trade_feed`. Nothing existing changed.

### Added

- Data API methods in a user's name (`csid_id`; PermissionError `consent_required` without the
  scope): `tradeFeed(csidId, { filter, limit, cursor })` (+ `tradeFeedRaw`, `iterTradeFeed`),
  `tradeFeedTraders(csidId, …)` (+ `tradeFeedTradersRaw` with `pagination.total` / `max`,
  `iterTradeFeedTraders`), `addToTradeFeed(csidId, trader, settings?)` (`created` = 201 / 200),
  `removeFromTradeFeed(csidId, trader)`, `tradeFeedNotifications(csidId, …)`
  (+ `tradeFeedNotificationsRaw`, `iterTradeFeedNotifications`).
- `TradeFeedStream` (`csid.tradeFeedStream()`, `wss://api-id.cabalspy.xyz/v1/trade-feed/stream`,
  every plan): typed `trade_feed.trade` / `trade_feed.thesis` events with `data.recipients` and the
  event id, reconnect with backoff, heartbeat watchdog, async iterator. Option `tradeFeedStreamUrl`,
  constant `DEFAULT_TRADE_FEED_STREAM_URL`.
- Webhooks `trade_feed.trade` and `trade_feed.thesis` in `WebhookEventType`, payload types
  (`TradeFeedTradeData`, `TradeFeedThesisData`) and type guards `isTradeFeedEvent`,
  `isTradeFeedTradeEvent`, `isTradeFeedThesisEvent`.
- Types: `TradeFeedItem` (trade / thesis), `TradeFeedTrader`, `TradeFeedTrade`, `TradeFeedThesis`,
  `TradeFeedLinks`, `TradeFeedEntry`, `TradeFeedSettings`, `TradeFeedSettingsInput`,
  `TradeFeedAddResult`, `TradeFeedRemoveResult`, `TradeFeedNotification`, `TradeFeedFilter`,
  `TradeFeedLabel`, `TRADE_FEED_FILTERS`, `TRADE_FEED_MAX_TRADERS`; `OidcScope` includes `trade_feed`.
- Widgets (`cabalspy-id/widget`): `mountTradeFeedButton`, `mountTradeFeed`,
  `tradeFeedButtonAttributes`, `tradeFeedWidgetAttributes` (`clientId` required),
  `setTradeFeedAccessToken`, `setTradeFeedSignInHandler`; `CSIDGlobal.tradeFeed`.
- React (`cabalspy-id/react`): `<TradeFeedButton>` and `<TradeFeed>` with `accessToken` and
  `onSignIn` (the sign-in is shared with `<CabalSpyTheses>`).
- New entry point `cabalspy-id/trade-feed` (Data API client, stream, webhook guards, types);
  `cabalspy-id/api` exports the Trade Feed parts too.
- Theses widget: `frameless` and `maxHeight` options (`data-frameless`, `data-max-height`).

## [0.5.2] - 2026-10-15

The public thesis API (`https://id.cabalspy.xyz/thesis/v1/...`) and its live socket
(`wss://id.cabalspy.xyz/thesis/v1/ws/{chain}/{mint}`) now require your instance's public
client_id on every call. It is shown in the dashboard next to the API key; it is not a secret
and not the API key. The Data API (`CabalSpyID`, API key) is unchanged.

### Changed (breaking for the thesis client)

- `ThesisClient` requires `clientId`: `new ThesisClient({ clientId: 'csid_...', accessToken? })`.
  Without it (or with an empty string) the constructor throws an `AuthenticationError` with
  `code: 'client_id_required'`.
- Every `ThesisClient` call sends the header `X-CSID-Client-Id: <clientId>`; `live()` adds
  `client_id=<clientId>` to the socket URL (`scope=instance` keeps working with the same client_id).
  `post()` and `reply()` always send `client_id` in the body.
- The theses widget helpers require `clientId`: `mountTheses()`, `thesisWidgetAttributes()` and
  `<CabalSpyTheses>` throw `client_id_required` without it (the widget passes it as `data-client-id`).

### Added

- New server error codes, mapped to the existing error classes: `client_id_required` and
  `invalid_client` (401, `AuthenticationError`), `origin_not_allowed` (403, `PermissionError`),
  `rate_limited` (429, `RateLimitError`, `retryAfter` from Retry-After, 60 s).
- `ThesisLive` handles the close codes 4401 (`client_id_required` / `invalid_client`) and 4403
  (`origin_not_allowed`) as final (no reconnect) and backs off 60 s after 4429 (`rate_limited`).
- Exports `CLIENT_ID_HEADER`, `THESIS_WS_CLOSE_CODES` and `thesisCloseError()`.
- `setThesisSignInHandler(fn | null)` in `cabalspy-id/widget` (forwards to widget.js'
  `CSID.thesis.setSignInHandler`, waiting for widget.js when needed) and the `onSignIn` prop of
  `<CabalSpyTheses>` (removed on unmount): the widget's "Sign in to write" calls your function
  instead of the page's login button / popup; it gets a thesis-capable token, passes it with
  `setThesisAccessToken(token)` and resolves `true` (`false` = not signed in). While a handler is
  set, the page is the source of truth for sign-in. New type `ThesisSignInHandler`.

## [0.5.1] - 2026-10-15

### Changed

- People can sign in with X, Telegram or Google. Types match accounts without X: `x` is
  `null` in userinfo claims and Data API profiles, `twitter` is `null` in profiles, trading
  profile blocks and leaderboards, `telegram` is documented (`https://t.me/<name>` or `""`),
  handles may be `tg.<name>` or `id.<hex>`.

### Added

- `hasX()` and `handleKind()` helpers and a README section "Users without X".

## [0.5.0] - 2026-10-14

### Added

- Entry points `cabalspy-id/api` (Data API, trade stream, login, webhooks), `cabalspy-id/thesis`
  (thesis methods, `ThesisClient`, `ThesesStream`) and `cabalspy-id/widget` (browser:
  `mountLoginButton`, `mountTheses`, `setThesisAccessToken`, `startLogin`, `onWidgetEvents`,
  `loginButtonAttributes`, `thesisWidgetAttributes`), plus `cabalspy-id/widget/react`
  (same as `cabalspy-id/react`). The root export is unchanged.
- Shared chunks in the ESM and CommonJS builds, so classes are identical across entry points.
- Packages table (socialfi-api, socialfi-thesis, socialfi-widget) in the README.

### Changed

- The React components use the same attribute mapping as `cabalspy-id/widget`.

## [0.4.1] - 2026-10-14

### Changed

- Package description, keywords and README: CabalSpy ID as a SocialFi API & SDK. No code changes.

## [0.4.0] - 2026-10-14

### Added

- `Thesis.reacted_by` (who reacted recently) and `Thesis.latest_replies` (reply preview on theses).
- Moderation notifications: Data API `thesisNotifications(csidId)` and
  `appealThesisDecision(csidId, notificationId, message)`; public `ThesisClient.notifications()`,
  `markNotificationsRead()` and `appeal(notificationId, message)`. Types `ThesisNotification`,
  `ThesisNotifications`; `ThesisClient.me()` returns `notices` ({ unread, latest, url }).
- Webhook types `thesis.reply` (`ThesisReplyData`) and `thesis.reaction` (`ThesisReactionData`).
- Error code `reporting_paused` (403, `PermissionError`) documented.

## [0.3.0] - 2026-10-13

### Added

- `scope` (`global` | `instance`) on `listTheses`, `iterTheses`, `thesisSummary` and `latestTheses`.
- `ThesesStream` (`csid.thesesStream()`) for `wss://api-id.cabalspy.xyz/v1/theses/stream` (every plan):
  `subscribe` / `unsubscribe` up to 200 tokens, `subscribeAll` / `unsubscribeAll`, subscriptions
  restored after reconnects, heartbeat watchdog, events and async iteration.
- `ThesisClient`: `scope` and `clientId` options (reads, `live()`, and post attribution).
- React `<CabalSpyTheses>`: `clientId` and every design prop (`scope`, `sort`, `font`, `radius`,
  `bg`, `card`, `text`, `muted`, `border`, `accent`, `accentText`, `bull`, `bear`, `showHeader`,
  `showSentiment`, `compact`, `height`).

## [0.2.0] - 2026-10-13

### Added

- Token theses in the Data API: `listTheses` / `iterTheses`, `thesisSummary`, `thesis`,
  `thesisReplies` / `iterThesisReplies`, `latestTheses`, `userTheses`, `thesisEligibility`,
  and writes in a user's name: `postThesis`, `replyToThesis`, `reactToThesis`, `reportThesis`,
  `deleteThesis`. Typed `Thesis`, `ThesisPosition`, `ThesisSummary`, `ThesisEligibility`.
- `CabalSpyID.postRaw` / `post`. Writes are only retried after the API's own rate limit
  (`rate_limit_exceeded`), never after a server or network error.
- Stream: `events: ['trades', 'theses']` and `mint`; events `thesis`, `thesis.reply`,
  `thesis.reaction`, `thesis.removed`; `stream.theses()` iterator.
- `ThesisClient` for the public thesis API (`https://id.cabalspy.xyz/thesis/v1`) with the user's
  access token, and `ThesisClient.live()` for the public per-token websocket.
- React: `<CabalSpyTheses chain mint theme height radius accessToken />`.
- Webhook type `thesis.created` (`ThesisCreatedData`), OAuth scope `thesis`.

## [0.1.0] - 2026-10-13

First release.

### Added

- `CabalSpyID` Data API client for `https://api-id.cabalspy.xyz/v1`: `health`, `me`, `users`,
  `profile`, `walletLookup`, `tracker`, `history`, `holdings`, `pnlCalendar`, `leaderboard`,
  `latestTransactions`, with typed responses, `*Raw` envelope variants, `instance` support,
  retries with backoff, rate limit info and async iterators (`iterUsers`, `iterHistory`,
  `iterLeaderboard`).
- `CabalSpyIDStream` for the live trade stream (`/v1/stream`): auto-reconnect, heartbeat
  watchdog, fatal configuration errors, async iteration.
- `CabalSpyIDAuth` OpenID Connect helpers: discovery, `createAuthorizationUrl` (PKCE S256,
  state, nonce), `handleCallback`, `exchangeCode`, `refresh`, `revoke`, `userinfo`,
  `verifyIdToken` and `verifyAccessToken` (ES256 via JWKS with WebCrypto), `isLimited`.
- `verifyWebhook` / `signWebhook` for Standard Webhooks signatures.
- `cabalspy-id/react`: `<CabalSpyLogin />` and `useCabalSpyID()`.
- Typed errors: `BadRequestError`, `AuthenticationError`, `PermissionError`,
  `PlanUserLimitError`, `NotFoundError`, `RateLimitError`, `ServerError`, `ConnectionError`,
  `InvalidResponseError`, `OAuthError`, `TokenVerificationError`, `WebhookVerificationError`.

[0.6.0]: https://github.com/CabalSpy/cabalspy-id-js/compare/v0.5.2...v0.6.0
[0.5.2]: https://github.com/CabalSpy/cabalspy-id-js/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/CabalSpy/cabalspy-id-js/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/CabalSpy/cabalspy-id-js/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/CabalSpy/cabalspy-id-js/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/CabalSpy/cabalspy-id-js/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/CabalSpy/cabalspy-id-js/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/CabalSpy/cabalspy-id-js/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/CabalSpy/cabalspy-id-js/releases/tag/v0.1.0
