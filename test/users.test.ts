import { describe, expect, it } from 'vitest';

import { CabalSpyID, type CabalSpyIDClaims, type Profile, type TraderProfile, handleKind, hasX } from '../src/index';
import { hasX as hasXApi } from '../src/entries/api';
import { mockFetch, ok } from './helpers';

const telegramProfile: Profile = {
  csid_id: 'u-tg',
  username: 'tg.alice',
  name: 'Alice',
  image_url: null,
  bio: null,
  twitter: null,
  telegram: 'https://t.me/alice',
  x: null,
  kol: { badge: false, since: null },
  profile_url: 'https://id.cabalspy.xyz/u/tg.alice',
  wallets: [],
  joined_at: '2026-10-15T00:00:00Z',
};

describe('users without X', () => {
  it('hasX uses x, then twitter, then the handle', () => {
    expect(hasX(telegramProfile)).toBe(false);
    expect(hasX({ ...telegramProfile, username: 'alice', twitter: 'https://x.com/alice', x: { id: '1', followers: 1, following: 1, verified: false, verified_type: null } })).toBe(true);
    const userinfo: CabalSpyIDClaims = { sub: 'u', preferred_username: 'id.0a1b2c3d4e', x: null };
    expect(hasX(userinfo)).toBe(false);
    expect(hasX({ sub: 'u', preferred_username: 'alice' } as CabalSpyIDClaims)).toBe(true); // ID token: no x claim
    expect(hasX({ sub: 'u', preferred_username: 'tg.bob' } as CabalSpyIDClaims)).toBe(false);
    const trader = { twitter: null, telegram: '', username: 'id.ff' } as Partial<TraderProfile>;
    expect(hasX(trader)).toBe(false);
    expect(hasX({ username: 'alice', twitter: '' })).toBe(false);
    expect(hasX({ username: null })).toBe(false);
    expect(hasX(null)).toBe(false);
    expect(hasX(undefined)).toBe(false);
    expect(hasXApi).toBe(hasX);
  });

  it('handleKind', () => {
    expect(handleKind('tg.alice')).toBe('telegram');
    expect(handleKind('id.0a1b2c3d4e')).toBe('google');
    expect(handleKind('alice')).toBe('x');
  });

  it('profiles with null X data pass through the client unchanged', async () => {
    const m = mockFetch(() => ok(telegramProfile));
    const csid = new CabalSpyID({ apiKey: 'k', fetch: m.fetch, maxRetries: 0 });
    const p = await csid.profile({ username: 'tg.alice' });
    expect(p.x).toBeNull();
    expect(p.twitter).toBeNull();
    expect(p.telegram).toBe('https://t.me/alice');
    expect(new URL(m.calls[0]!.url).searchParams.get('username')).toBe('tg.alice');
  });
});
