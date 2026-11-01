# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.9.0] - 2026-11-01

Trade Feed: read and manage your users' Trade Feeds from your backend (the traders they follow,
every trade and thesis of those traders, alert filters and notifications), and get every new
trade and thesis for them live, with the users to tell.

### Added

- Trade Feed on `CabalSpyID`, every method in the name of one user (an external_id or
  `{ external_id | csid_id }`): `tradeFeed` / `tradeFeedRaw` / `iterTradeFeed` (`filter` all /
  buys / sells / theses, `limit` 1-100), `tradeFeedTraders` / `tradeFeedTradersRaw` /
  `iterTradeFeedTraders` (`limit` 1-300; pagination `total` and `max`), `addTradeFeedTrader`
  (`trader` / `trader_external_id`, `notify_buys`, `notify_sells`, `notify_theses`, `min_sol`,
  `min_bnb`, `min_eth` (0-1,000,000), `muted`; `created` tells 201 from 200),
  `removeTradeFeedTrader`, `tradeFeedNotifications` / `tradeFeedNotificationsRaw` /
  `iterTradeFeedNotifications` (`limit` 1-100). Values are checked before sending, like the
  server does.
- `TradeFeedStream` and `csid.tradeFeedStream()` for `/v1/trade-feed/stream`: `trade_feed.trade`
  and `trade_feed.thesis` (the item plus `recipients` and `recipients_external`), reconnects,
  heartbeat watchdog and `for await` (`{ event, id, data }`, `id` is the event id). New option
  `tradeFeedStreamUrl`, constant `DEFAULT_TRADE_FEED_STREAM_URL`.
- Types: `TradeFeedItem` (`TradeFeedTradeItem` | `TradeFeedThesisItem`), `TradeFeedTrade`,
  `TradeFeedThesis`, `TradeFeedLinks`, `TradeFeedTrader`, `TradeFeedSettings` (with the existing
  `CopySettings` as `copy`), `TradeFeedTraderResult`, `TradeFeedRemoveResult`,
  `TradeFeedNotification`, `TradeFeedRecipients`, `TradeFeedEvent` (`TradeFeedTradeEvent` |
  `TradeFeedThesisEvent`), `TradeFeedStreamEvent`; params `TradeFeedParams`,
  `TradeFeedTradersParams`, `TradeFeedNotificationsParams`, `TradeFeedTraderSettings`,
  `AddTradeFeedTraderParams`, `RemoveTradeFeedTraderParams`; constants `TRADE_FEED_FILTERS`,
  `TRADE_LABELS`, `MAX_TRADE_FEED_TRADERS`, `TRADE_FEED_CHANGES_PER_HOUR`,
  `TRADE_FEED_MAX_MIN_NATIVE`, `TRADE_FEED_EVENT_NAMES`; `Pagination.max`.
- Typed webhooks `trade_feed.trade` (`TradeFeedTradeData`) and `trade_feed.thesis`
  (`TradeFeedThesisData`) in `WebhookEventDataMap`.
- Error codes on the existing classes: `cannot_add_self` (`BadRequestError`), `trade_feed_full`
  (`ConflictError`), `trader_not_found`, `platform_user_not_found` (`NotFoundError`),
  `consent_required`, `trading_private` (`PermissionError`), `plan_user_limit`
  (`PlanUserLimitError`), `rate_limited` (`RateLimitError`, not retried).
- README section "Trade Feed" and `examples/trade-feed.mjs`.

## [0.8.0] - 2026-11-01

Copy trading: every trade of a trader one of your users copies becomes a ready-to-execute
instruction for that user, sized by their copy settings. CabalSpy ID never holds keys and never
executes; your app executes the instruction with the user's wallet and reports the status back.

### Added

- Copy trading on `CabalSpyID`: `copyTradingSettings` (an external_id or `{ external_id | csid_id }`
  for every trader; with `trader` / `trader_external_id` for one), `updateCopyTradingSettings`
  (`enabled`, `mode`, `amount_usd`, `percent`, `max_usd` (`null` removes the cap), `sides`,
  `slippage_bps`; only what you pass changes), `copyInstructions` / `copyInstructionsRaw` /
  `iterCopyInstructions` (`external_id` / `csid_id`, `status` incl. `expired`, `limit` 1-100),
  `copyInstruction`, `reportCopyInstruction` (`executed` / `failed` / `skipped`, `tx_signature`,
  `executed_amount_usd`, `note`). Values are checked before sending, like the server does.
- `CopyTradingStream` and `csid.copyTradingStream()` for `/v1/copy-trading/stream`:
  `copy_trade.instruction`, reconnects, heartbeat watchdog and `for await` (`{ event, id, data }`).
  New option `copyTradingStreamUrl`, constant `DEFAULT_COPY_TRADING_STREAM_URL`.
- Types: `CopyInstruction`, `CopyInstructionBase`, `CopyInstructionEvent` (webhook / stream, with
  `external_id`), `CopyAction`, `CopySourceTrade`, `CopyTrader`, `CopySettings`,
  `CopyTradingSetting`, `CopyTradingStreamEvent`; params `CopyTradingSettingsParams`,
  `UpdateCopyTradingSettingsParams`, `CopyInstructionsParams`, `ReportCopyInstructionParams`,
  `CopyTraderRef`; constants `COPY_MODES`, `COPY_SIDES`, `COPY_INSTRUCTION_STATUSES`,
  `COPY_REPORT_STATUSES`, `COPY_INSTRUCTION_TTL_SECONDS`, `COPY_MIN_USD`,
  `COPY_DEFAULT_SLIPPAGE_BPS`, `COPY_TRADING_EVENT_NAMES`.
- Typed webhook `copy_trade.instruction` (`CopyTradeInstructionData`) in `WebhookEventDataMap`.
- Error codes on the existing classes: `copy_managed_elsewhere`, `already_reported`,
  `trade_feed_full` (`ConflictError`), `not_in_trade_feed`, `trader_not_found`, `not_found`
  (`NotFoundError`), `consent_required`, `trading_private` (`PermissionError`).
- README section "Copy trading" and `examples/copy-trading.mjs`.

## [0.7.0] - 2026-10-31

Callouts, an extra that CabalSpy switches on per instance on request: a user calls a
token, the price and market cap are stamped and tracked (every minute for the first
24 hours, then scored on candles; after that every 5 minutes while the token is active,
until it stays below a $10k market cap for 24 hours in a row). Plus callout competitions.

### Added

- Callouts on `CabalSpyID`: `createCallout` (`external_id` or `{ csid_id }`, `chain`, `mint`,
  optional `note`), `removeCallout`, `callouts` / `calloutsRaw` / `iterCallouts`, `callout`,
  `calloutStats`, `calloutLeaderboard` / `calloutLeaderboardRaw` / `iterCalloutLeaderboard`,
  `calloutSettings`, `updateCalloutSettings`.
- `CalloutsStream` and `csid.calloutsStream({ chain?, mint? })` for `/v1/callouts/stream`:
  `callout.created`, `callout.update`, `callout.milestone`, `callout.scored`, `callout.final`,
  `callout.removed`, reconnects, heartbeat watchdog and `for await`. New option
  `calloutsStreamUrl`, constant `DEFAULT_CALLOUTS_STREAM_URL`.
- Callout competitions: `createCompetition({ kind: 'callouts', … })` with the callout metrics
  (`avg_peak_x`, `best_peak_x`, `sum_peak_x`, `hit_rate`, `callouts`), `chain: 'all'`,
  `min_callouts` and `hit_x`. `CreateCompetitionParams` is now a union of
  `CreateTradingCompetitionParams` and `CreateCalloutCompetitionParams`; kind-specific fields
  are checked before sending.
- Types: `Callout` (`at_call`, `now`, `peak`, `score_x`, `tracking` with `below_10k_since`,
  `first_day`), `CalloutStats`, `CalloutPeriodStats`, `CalloutLeaderboardEntry`,
  `CalloutLeaderboardResponse`, `CalloutSettings`, `CalloutUpdate`, `CalloutMilestone`,
  `CalloutRemoved`, `CalloutStreamEvent`, `CalloutCompetitionStanding`,
  `TradingCompetitionStanding`; constants `CALLOUT_LEADERBOARD_SORTS`, `CALLOUT_MILESTONES`,
  `CALLOUT_WHO`, `CALLOUT_MAX_NOTE`, `CALLOUT_ACTIVE_MCAP_USD`, `COMPETITION_KINDS`,
  `CALLOUT_COMPETITION_METRICS`.
- Typed webhooks `callout.created`, `callout.milestone`, `callout.scored` and `callout.final`
  (`data.callout`, plus `data.milestone_x`) in `WebhookEventDataMap`.
- `me().features`: the extras switched on for the instance (e.g. `callouts`).
- Errors: `FeatureNotEnabledError` (403 `feature_not_enabled`, a `PermissionError`),
  `CalloutCooldownError` (429 `callout_cooldown`, a `RateLimitError` with `retryAfter`, never
  retried automatically) and `UnprocessableError` (422, `no_price`). `already_called` is a
  `ConflictError`, `callout_not_found` a `NotFoundError`.
- README section "Callouts (on request)" and `examples/callouts.mjs`.

### Changed

- `Competition` has `kind`; `chain` can be `'all'`; `min_trades` / `min_volume_usd` are only
  present on trading competitions and `min_callouts` / `hit_x` only on callout competitions
  (all four are optional in the type now).
- `CompetitionStanding` holds either trading or callout stats, so its stat fields are optional;
  use `TradingCompetitionStanding` or `CalloutCompetitionStanding` for the exact shape.
- `CompetitionMetric` now includes the callout metrics (`TradingCompetitionMetric` is the old set;
  `COMPETITION_METRICS` is unchanged).

## [0.6.0] - 2026-10-28

White-label: a platform keeps its own login, imports its users (by its own user id,
`external_id`) and their existing wallets, and uses their trades, PnL, leaderboards and
trading competitions through the Data API.

### Added

- Platform users on `CabalSpyID`: `createPlatformUser`, `importPlatformUsers`, `platformUser`,
  `updatePlatformUser`, `platformUsers` / `platformUsersRaw` / `iterPlatformUsers`,
  `deletePlatformUser`, `addPlatformUserWallets`, `deletePlatformUserWallet`,
  `startWalletVerification`, `walletVerification`, `walletVerificationQr` (SVG),
  `cancelWalletVerification`, `platformUserProfile`, `platformLeaderboard` /
  `platformLeaderboardRaw` / `iterPlatformLeaderboard`, `platformSettings`,
  `updatePlatformSettings`, `inboundStatus`, `enableInbound`, `disableInbound`,
  `platformUserSession`, `platformUserClaimLink`, `connectPlatformUserX`,
  `disconnectPlatformUserX`, `linkPlatformUserTelegram`, `platformUserTelegram`,
  `unlinkPlatformUserTelegram`, `platformUserKol`, `requestPlatformUserVolumeCheck`,
  `applyPlatformUserKol`. Methods for one user take the `external_id` as a string or
  `{ external_id }` / `{ csid_id }`.
- `importAllPlatformUsers(users, options?)`: any number of users in chunks of at most 1,000
  (and under 1 MB), retries after HTTP 429 honouring Retry-After, re-sends only items rejected
  with `rate_limited`, never re-sends a chunk that succeeded, and returns one aggregated result
  in input order. Other errors throw `PlatformImportError` with `result` and `pending`.
- Trading competitions: `createCompetition`, `competitions` / `competitionsRaw` /
  `iterCompetitions`, `competition`, `updateCompetition`, `cancelCompetition`,
  `joinCompetition`, `leaveCompetition`, `competitionParticipants` (+ `Raw`, `iter`),
  `competitionStandings` (+ `Raw`, `iter`). The iterators page by offset.
- Types: `PlatformUser`, `PlatformWallet`, `PlatformSettings`, `PlatformImportResult`,
  `PlatformUserProfile`, `PlatformLeaderboardEntry`, `WalletVerification`, `InboundEvent`,
  `InboundEventResult`, `Competition`, `CompetitionStanding`, `CompetitionStandingsResponse`
  and more; constants `PLATFORM_IMPORT_MAX`, `PLATFORM_MAX_WALLETS_PER_REQUEST`,
  `WALLET_TRUST`, `DATA_SCOPES`, `INBOUND_FORMATS`, `COMPETITION_METRICS`,
  `COMPETITION_STATUSES`, `MAX_OPEN_COMPETITIONS`. All exported from `cabalspy-id` and
  `cabalspy-id/api`.
- Webhook types for `platform_user.created`, `platform_user.claimed`,
  `platform_user.x_connected`, `wallet.added`, `verification.expired`, `competition.started`,
  `competition.updated`, `competition.standings` and `competition.ended`
  (`WebhookEventDataMap`, `TypedWebhookEvent`), `isWebhookEvent(event, ...types)` to narrow a
  verified event and `verifyTypedWebhook()` for a `switch` on `event.type`.
- `ConflictError` (409) for `account_claimed`, `too_many_wallets`, `wallet_already_verified`,
  `last_wallet`, `kol_badge`, `x_required`, `kol_not_eligible`, `volume_check_unavailable`,
  `competition_limit`, `competition_closed`, `competition_full`, `late_join_closed`. Other new
  codes map to the existing classes (`platform_user_not_found` 404, `claim_disabled` 403,
  `wallet_required` 400, `rate_limited` 429, …).
- README section "White-label (platform users)" and `examples/white-label.mjs`.

### Changed

- 409 responses now throw `ConflictError` (a `CabalSpyIDError` subclass) instead of the base class.

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

[0.9.0]: https://github.com/CabalSpy/cabalspy-id-js/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/CabalSpy/cabalspy-id-js/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/CabalSpy/cabalspy-id-js/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/CabalSpy/cabalspy-id-js/compare/v0.5.2...v0.6.0
[0.5.2]: https://github.com/CabalSpy/cabalspy-id-js/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/CabalSpy/cabalspy-id-js/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/CabalSpy/cabalspy-id-js/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/CabalSpy/cabalspy-id-js/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/CabalSpy/cabalspy-id-js/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/CabalSpy/cabalspy-id-js/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/CabalSpy/cabalspy-id-js/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/CabalSpy/cabalspy-id-js/releases/tag/v0.1.0
