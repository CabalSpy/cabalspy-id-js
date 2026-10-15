/**
 * `cabalspy-id/trade-feed` — Trade Feed: your users add CabalSpy ID traders
 * (public trading, verified wallets) to their Trade Feed and you tell them
 * about every trade and thesis of those traders.
 *
 * - CabalSpyID:       Data API Trade Feed methods in a user's name (scope `trade_feed`):
 *                     tradeFeed, tradeFeedTraders, addToTradeFeed, removeFromTradeFeed,
 *                     tradeFeedNotifications (+ iter… / …Raw)
 * - TradeFeedStream:  live `trade_feed.trade` / `trade_feed.thesis` events with `recipients`
 * - isTradeFeedEvent: type guards for the `trade_feed.*` webhooks (verifyWebhook)
 *
 *   import { CabalSpyID, TradeFeedStream, verifyWebhook, isTradeFeedTradeEvent } from 'cabalspy-id/trade-feed';
 *
 * Same classes as the root export (`cabalspy-id`). The widgets ("+ Trade Feed"
 * button, embedded feed): `cabalspy-id/widget` (vanilla) and `cabalspy-id/react`
 * (<TradeFeedButton />, <TradeFeed />).
 */

export {
  CabalSpyID,
  DEFAULT_TRADE_FEED_STREAM_URL,
  type CabalSpyIDOptions,
  type Envelope,
  type TradeFeedParams,
  type TradeFeedPageParams,
} from '../client';

export {
  TradeFeedStream,
  TRADE_FEED_EVENTS,
  type TradeFeedStreamOptions,
  type TradeFeedStreamEvent,
  type TradeFeedStreamEventMap,
  type TradeFeedReadyEvent,
} from '../tradeFeedStream';

export {
  verifyWebhook,
  signWebhook,
  isTradeFeedEvent,
  isTradeFeedTradeEvent,
  isTradeFeedThesisEvent,
  type VerifyWebhookOptions,
  type HeaderSource,
  type TradeFeedEvent,
  type TradeFeedTradeEvent,
  type TradeFeedThesisEvent,
} from '../webhooks';

export * from './errors';

export { hasX, handleKind, type UserLike, type HandleKind } from '../users';

export {
  CHAINS,
  CURRENCY_BY_CHAIN,
  TRADE_FEED_FILTERS,
  TRADE_FEED_MAX_TRADERS,
  type Chain,
  type Currency,
  type Pagination,
  type WebhookEvent,
  type WebhookEventType,
  type ThesisStance,
  type TradeFeedFilter,
  type TradeFeedLabel,
  type TradeFeedTrader,
  type TradeFeedTrade,
  type TradeFeedThesis,
  type TradeFeedLinks,
  type TradeFeedTradeItem,
  type TradeFeedThesisItem,
  type TradeFeedItem,
  type TradeFeedSettings,
  type TradeFeedSettingsInput,
  type TradeFeedEntry,
  type TradeFeedTradersPagination,
  type TradeFeedAddResult,
  type TradeFeedRemoveResult,
  type TradeFeedEventType,
  type TradeFeedNotification,
  type TradeFeedRecipients,
  type TradeFeedTradeData,
  type TradeFeedThesisData,
  type TradeFeedEventData,
} from '../types';
