/**
 * `cabalspy-id/thesis` — token theses: holders-only opinions on a token with
 * the author's real position, replies, reactions, moderation notifications.
 *
 * - CabalSpyID:   Data API thesis methods (listTheses, postThesis in a user's name, …)
 * - ThesisClient: public thesis API for your own UI (user access token) with live()
 * - ThesesStream: live theses for up to 200 tokens per connection (every plan)
 *
 *   import { CabalSpyID, ThesisClient, ThesesStream } from 'cabalspy-id/thesis';
 *
 * Same classes as the root export (`cabalspy-id`). The theses widget:
 * `cabalspy-id/widget` (vanilla) and `cabalspy-id/react` (<CabalSpyTheses />).
 */

export {
  CabalSpyID,
  DEFAULT_THESES_STREAM_URL,
  type CabalSpyIDOptions,
  type ThesisTokenParams,
  type ThesisScopeParam,
  type ListThesesParams,
  type ThesisRepliesParams,
  type LatestThesesParams,
  type UserThesesParams,
  type ThesisWriter,
  type PostThesisParams,
  type ReplyToThesisParams,
  type ReactToThesisParams,
  type ReportThesisParams,
  type DeleteThesisParams,
} from '../client';

export {
  ThesesStream,
  MAX_THESES_STREAM_TOKENS,
  type ThesisTokenRef,
  type ThesesStreamOptions,
  type ThesesReadyEvent,
  type ThesesSubscribedEvent,
  type ThesesStreamEventMap,
} from '../thesesStream';

export { type ThesisStreamEvent } from '../stream';

export {
  ThesisClient,
  ThesisLive,
  DEFAULT_THESIS_URL,
  DEFAULT_THESIS_WS_URL,
  type ThesisClientOptions,
  type ThesisScopeOptions,
  type TokenThesesPage,
  type ThesisPage,
  type TokenThesesOptions,
  type ThesisViewer,
  type ThesisMe,
  type ThesisLiveOptions,
  type ThesisLiveEventMap,
} from '../thesis';

export { verifyWebhook, signWebhook, type VerifyWebhookOptions, type HeaderSource } from '../webhooks';

export * from './errors';

export { hasX, handleKind, type UserLike, type HandleKind } from '../users';

export {
  CHAINS,
  THESIS_EMOJIS,
  THESIS_REPORT_REASONS,
  THESIS_MAX_BODY,
  type Chain,
  type Scope,
  type Pagination,
  type WebhookEvent,
  type ThesisCreatedData,
  type ThesisReplyData,
  type ThesisReactionData,
  type ThesisStance,
  type ThesisSort,
  type ThesisEmoji,
  type ThesisReportReason,
  type ThesisAuthor,
  type ThesisPnl,
  type ThesisPositionPublic,
  type ThesisPositionPrivate,
  type ThesisPosition,
  type ThesisReactor,
  type Thesis,
  type ThesisToken,
  type ThesisCounts,
  type ThesisSummary,
  type ThesisEligibility,
  type ThesisNotificationKind,
  type ThesisNotification,
  type ThesisNotifications,
  type ThesisNotices,
  type ThesisReactions,
  type ThesisLiveItem,
  type ThesisRemoved,
  type ThesisReactionUpdate,
} from '../types';
