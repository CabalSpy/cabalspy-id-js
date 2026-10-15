// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as api from '../src/entries/api';
import * as thesis from '../src/entries/thesis';
import * as root from '../src/index';
import {
  WIDGET_SRC,
  loginButtonAttributes,
  mountLoginButton,
  mountTheses,
  onWidgetEvents,
  setThesisAccessToken,
  startLogin,
  thesisWidgetAttributes,
} from '../src/widget';

const mount = vi.fn();
const setAccessToken = vi.fn();
const login = vi.fn(async () => undefined);

function loadWidget() {
  const script = document.querySelector<HTMLScriptElement>(`script[src="${WIDGET_SRC}"]`);
  window.CSID = {
    __loaded: true,
    user: null,
    mount,
    login,
    setUser: vi.fn(),
    signOut: vi.fn(),
    onLogin: vi.fn(),
    thesis: { setAccessToken, clear: vi.fn() },
  };
  script?.dispatchEvent(new Event('load'));
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const token = (aud: string) => `${btoa(JSON.stringify({ alg: 'ES256' }))}.${btoa(JSON.stringify({ aud })).replace(/=+$/, '')}.s`;

let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement('div');
  host.id = 'host';
  document.body.appendChild(host);
});
afterEach(() => {
  host.remove();
  document.head.innerHTML = '';
  delete window.CSID;
  vi.clearAllMocks();
});

describe('cabalspy-id/widget', () => {
  it('mounts the login button with data-* attributes and routes events by client', async () => {
    const onLogin = vi.fn();
    const onLogout = vi.fn();
    const w = mountLoginButton('#host', { clientId: 'csid_a', shape: 'pill', fullWidth: true, scope: ['openid', 'thesis'], onLogin, onLogout });
    expect(w.element.parentElement).toBe(host);
    expect({ ...w.element.dataset }).toEqual({ csidLogin: '', clientId: 'csid_a', shape: 'pill', fullWidth: 'true', scope: 'openid thesis' });
    loadWidget();
    await tick();
    expect(mount).toHaveBeenCalled();
    const detail = { user: { sub: 'u' }, idToken: token('csid_a'), accessToken: 'at', expiresIn: 900 };
    window.dispatchEvent(new CustomEvent('csid:login', { detail }));
    window.dispatchEvent(new CustomEvent('csid:login', { detail: { ...detail, idToken: token('csid_b') } }));
    window.dispatchEvent(new CustomEvent('csid:logout', { detail: { clientId: 'csid_a' } }));
    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(onLogout).toHaveBeenCalledTimes(1);

    const before = w.element;
    w.update({ theme: 'light' });
    expect(w.element).not.toBe(before);
    expect(w.element.dataset.theme).toBe('light');
    expect(host.children).toHaveLength(1);

    w.remove();
    window.dispatchEvent(new CustomEvent('csid:login', { detail }));
    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(host.children).toHaveLength(0);
  });

  it('mounts the theses widget with design options and passes the access token', async () => {
    const w = mountTheses(host, {
      chain: 'base',
      mint: '0xabc',
      clientId: 'csid_a',
      accentText: '#fff',
      showHeader: false,
      height: 400,
      accessToken: 'at-1',
    });
    expect({ ...w.element.dataset }).toEqual({
      csidThesis: '',
      chain: 'base',
      mint: '0xabc',
      clientId: 'csid_a',
      accentText: '#fff',
      showHeader: 'false',
      height: '400',
    });
    loadWidget();
    await tick();
    expect(mount).toHaveBeenCalled();
    expect(setAccessToken).toHaveBeenCalledWith('at-1');
    await setThesisAccessToken(null);
    expect(setAccessToken).toHaveBeenLastCalledWith(null);
    await startLogin({ clientId: 'csid_a', scope: ['openid', 'thesis'] });
    expect(login).toHaveBeenCalledWith({ clientId: 'csid_a', redirectUri: undefined, scope: 'openid thesis' });
  });

  it('helpers', () => {
    expect(loginButtonAttributes({ clientId: 'c', showLogo: false })['data-show-logo']).toBe('false');
    expect(() => mountTheses('#missing', { chain: 'solana', mint: 'm', clientId: 'csid_a' })).toThrow(/no element/);
    // @ts-expect-error clientId is required
    expect(() => mountTheses(host, { chain: 'solana', mint: 'm' })).toThrow(/public client_id/);
    expect(() => thesisWidgetAttributes({ chain: 'solana', mint: 'm', clientId: ' ' })).toThrow(
      expect.objectContaining({ code: 'client_id_required' }),
    );
    expect(host.children).toHaveLength(0);
    expect(thesisWidgetAttributes({ chain: 'solana', mint: 'm', clientId: 'csid_a' })['data-client-id']).toBe('csid_a');
    const stop = onWidgetEvents({});
    stop();
  });
});

describe('subpath entry points', () => {
  it('api and thesis share the root classes and stay focused', () => {
    expect(api.CabalSpyID).toBe(root.CabalSpyID);
    expect(api.CabalSpyIDAuth).toBe(root.CabalSpyIDAuth);
    expect(api.NotFoundError).toBe(root.NotFoundError);
    expect(thesis.ThesisClient).toBe(root.ThesisClient);
    expect(thesis.ThesesStream).toBe(root.ThesesStream);
    expect('ThesisClient' in api).toBe(false);
    expect('CabalSpyIDAuth' in thesis).toBe(false);
    expect(thesis.THESIS_EMOJIS).toBe(root.THESIS_EMOJIS);
  });
});
