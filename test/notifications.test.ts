import { describe, expect, it } from 'vitest';

import {
  BadRequestError,
  CabalSpyID,
  PermissionError,
  type Thesis,
  ThesisClient,
  type ThesisNotification,
  type ThesisReactionData,
  type ThesisReplyData,
  signWebhook,
  verifyWebhook,
} from '../src/index';
import { apiError, json, mockFetch, ok } from './helpers';

const USER = '0b6a3a4e-5a4f-4a59-9a59-0f5c5f5c5f5c';
const notice: ThesisNotification = {
  id: 7,
  kind: 'post_hidden',
  text: 'Your post was hidden after several reports.',
  data: { thesis_id: 't1' },
  created_at: '2026-10-14T00:00:00+00:00',
  read: false,
  appealable: true,
  appeal: null,
};

describe('Data API: moderation notifications', () => {
  it('reads notifications and appeals in the user name', async () => {
    const m = mockFetch((req) => (req.method === 'GET' ? ok({ unread: 1, items: [notice] }) : ok({ appealed: true })));
    const csid = new CabalSpyID({ apiKey: 'k', fetch: m.fetch, maxRetries: 0 });
    const n = await csid.thesisNotifications(USER);
    expect(n.unread).toBe(1);
    expect(n.items[0]!.appealable).toBe(true);
    await csid.appealThesisDecision(USER, 7, 'The token was not a scam, see the contract.');
    const [get, post] = m.calls;
    expect(new URL(get!.url).pathname + new URL(get!.url).search).toBe(`/v1/theses/notifications?csid_id=${USER}`);
    expect(post!.method).toBe('POST');
    expect(new URL(post!.url).pathname).toBe('/v1/theses/appeal');
    expect(JSON.parse(post!.body!)).toEqual({ csid_id: USER, notification_id: 7, message: 'The token was not a scam, see the contract.' });
    await expect(csid.thesisNotifications('')).rejects.toBeInstanceOf(BadRequestError);
  });

  it('reporting_paused is a PermissionError', async () => {
    const m = mockFetch(() => apiError(403, 'reporting_paused', "You can't report until 2026-10-20 UTC"));
    const csid = new CabalSpyID({ apiKey: 'k', fetch: m.fetch, maxRetries: 0 });
    await expect(csid.reportThesis({ thesis_id: 't', reason: 'spam', csid_id: USER })).rejects.toMatchObject({
      code: 'reporting_paused',
      status: 403,
    });
    await expect(csid.reportThesis({ thesis_id: 't', reason: 'spam', csid_id: USER })).rejects.toBeInstanceOf(PermissionError);
  });
});

describe('ThesisClient: notifications', () => {
  it('lists, marks read and appeals with the user token', async () => {
    const m = mockFetch((req) => {
      if (req.url.endsWith('/me/notifications')) return json({ success: true, data: { unread: 1, items: [notice] } });
      if (req.url.endsWith('/read')) return json({ success: true, data: { read: true } });
      if (req.url.endsWith('/appeal')) return json({ success: true, data: { appealed: true } }, 201);
      return json({
        success: true,
        data: {
          can_post: true,
          can_reply: true,
          holder: true,
          paused: false,
          user: { csid_id: USER },
          notices: { unread: 1, latest: notice.text, url: 'https://id.cabalspy.xyz/me/notifications' },
        },
      });
    });
    const tc = new ThesisClient({ clientId: 'csid_app', fetch: m.fetch, accessToken: 'at' });
    expect((await tc.notifications()).items[0]!.kind).toBe('post_hidden');
    await tc.markNotificationsRead();
    await tc.appeal(7, 'Please look again, this was a real analysis.');
    const me = await tc.me('solana', 'So11111111111111111111111111111111111111112');
    expect(me.notices.unread).toBe(1);
    const base = 'https://id.cabalspy.xyz/thesis/v1';
    expect(m.calls.slice(0, 3).map((c) => [c.method, c.url.replace(base, ''), c.body ? JSON.parse(c.body) : null])).toEqual([
      ['GET', '/me/notifications', null],
      ['POST', '/me/notifications/read', null],
      ['POST', '/me/notifications/7/appeal', { message: 'Please look again, this was a real analysis.' }],
    ]);
    expect(m.calls.every((c) => c.headers.authorization === 'Bearer at')).toBe(true);
    await expect(new ThesisClient({ clientId: 'csid_app', fetch: m.fetch }).notifications()).rejects.toMatchObject({ code: 'sign_in_required' });
  });
});

describe('thesis shapes and webhooks', () => {
  it('reacted_by and latest_replies are typed', () => {
    const t = {
      id: 't1',
      reacted_by: [{ emoji: '🚀', csid_id: USER, username: 'bob', at: '2026-10-14T00:00:00+00:00' }],
      latest_replies: [{ id: 'r1', kind: 'reply', parent_id: 't1' }],
    } as unknown as Thesis;
    expect(t.reacted_by[0]!.emoji).toBe('🚀');
    expect(t.latest_replies?.[0]?.parent_id).toBe('t1');
  });

  it('verifies thesis.reply and thesis.reaction webhooks', async () => {
    const secret = 'whsec_' + Buffer.from('s'.repeat(24)).toString('base64');
    const ts = Math.floor(Date.now() / 1000);
    const check = async <D>(type: string, data: unknown) => {
      const body = JSON.stringify({ id: 'e', type, created_at: 'x', sandbox: false, data });
      const sig = await signWebhook(secret, 'e', ts, body);
      return verifyWebhook<D>({ payload: body, secret, headers: { 'webhook-id': 'e', 'webhook-timestamp': String(ts), 'webhook-signature': sig } });
    };
    const reply = await check<ThesisReplyData>('thesis.reply', { sub: USER, reply: { id: 'r1', kind: 'reply' } });
    expect(reply.data.reply.id).toBe('r1');
    const reaction = await check<ThesisReactionData>('thesis.reaction', {
      sub: USER,
      thesis_id: 't1',
      chain: 'solana',
      mint: 'M',
      emoji: 'like',
      on: true,
      reactions: { like: 3 },
    });
    expect(reaction.data.reactions.like).toBe(3);
  });
});
