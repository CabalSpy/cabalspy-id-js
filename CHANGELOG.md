# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

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

[0.2.0]: https://github.com/CabalSpy/cabalspy-id-js/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/CabalSpy/cabalspy-id-js/releases/tag/v0.1.0
