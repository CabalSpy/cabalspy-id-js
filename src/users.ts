/**
 * People can sign in with X, Telegram or Google. Accounts without X have no
 * X profile: `x` is null, `twitter` is null and the handle is `tg.<name>`
 * (Telegram) or `id.<hex>` (Google). X handles never contain a dot.
 */

/** Anything that describes a CabalSpy ID user: claims, a Data API profile, a trader or thesis author. */
export interface UserLike {
  x?: unknown;
  twitter?: string | null;
  preferred_username?: string | null;
  username?: string | null;
}

/** The sign-in identity a handle belongs to. */
export type HandleKind = 'x' | 'telegram' | 'google';

/** Which identity a CabalSpy ID handle comes from: `tg.` = Telegram, `id.` = Google, else X. */
export function handleKind(handle: string): HandleKind {
  if (handle.startsWith('tg.')) return 'telegram';
  if (handle.startsWith('id.')) return 'google';
  return 'x';
}

/**
 * True when the user has an X account connected.
 *
 * Uses the most reliable field available: `x` (userinfo claims, Data API
 * profiles), then `twitter` (trading profiles, leaderboards), then the handle
 * (ID token claims, thesis authors). Returns false for null/undefined. The ID
 * token carries no `x` claim, so there the handle decides.
 */
export function hasX(user: UserLike | null | undefined): boolean {
  if (!user) return false;
  if (user.x !== undefined) return user.x !== null;
  if (user.twitter !== undefined) return Boolean(user.twitter);
  const handle = user.preferred_username ?? user.username;
  return typeof handle === 'string' && handle.length > 0 && handleKind(handle) === 'x';
}
