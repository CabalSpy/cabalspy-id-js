# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

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

[0.5.0]: https://github.com/CabalSpy/cabalspy-id-js/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/CabalSpy/cabalspy-id-js/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/CabalSpy/cabalspy-id-js/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/CabalSpy/cabalspy-id-js/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/CabalSpy/cabalspy-id-js/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/CabalSpy/cabalspy-id-js/releases/tag/v0.1.0
