// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CabalSpyLogin, WIDGET_SRC, useCabalSpyID, type CabalSpyIDLogin, type UseCabalSpyIDResult } from '../src/react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const mount = vi.fn();
const signOut = vi.fn();

function fakeWidgetLoad() {
  const script = document.querySelector<HTMLScriptElement>(`script[src="${WIDGET_SRC}"]`);
  expect(script).not.toBeNull();
  window.CSID = {
    __loaded: true,
    user: null,
    mount,
    login: vi.fn(async () => undefined),
    setUser: vi.fn(),
    signOut: (clientId: string) => {
      signOut(clientId);
      window.dispatchEvent(new CustomEvent('csid:logout', { detail: { clientId } }));
    },
    onLogin: vi.fn(),
  };
  script!.dispatchEvent(new Event('load'));
}

function idToken(aud: string) {
  const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '');
  return `${enc({ alg: 'ES256' })}.${enc({ aud, sub: 'user-1' })}.sig`;
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.head.innerHTML = '';
  delete window.CSID;
  mount.mockReset();
  signOut.mockReset();
});

describe('<CabalSpyLogin />', () => {
  it('maps props to data-* attributes and loads widget.js once', async () => {
    await act(async () => {
      root.render(
        <>
          <CabalSpyLogin clientId="csid_a" theme="light" textColor="#fff" shape="pill" size="lg" fullWidth showLogo={false} scope={['openid', 'profile', 'wallets']} />
          <CabalSpyLogin clientId="csid_a" href="/login" user="user-1" logoutHref="/logout" />
        </>,
      );
    });
    const [a, b] = Array.from(container.querySelectorAll('[data-csid-login]')) as HTMLElement[];
    expect(a!.dataset).toMatchObject({
      clientId: 'csid_a',
      theme: 'light',
      textColor: '#fff',
      shape: 'pill',
      size: 'lg',
      fullWidth: 'true',
      showLogo: 'false',
      scope: 'openid profile wallets',
    });
    expect(a!.hasAttribute('data-href')).toBe(false);
    expect(b!.dataset).toMatchObject({ href: '/login', user: 'user-1', logoutHref: '/logout' });
    expect(document.querySelectorAll(`script[src="${WIDGET_SRC}"]`)).toHaveLength(1);
    await act(async () => fakeWidgetLoad());
    expect(mount).toHaveBeenCalled();
  });

  it('calls onLogin for its own client and onLogout', async () => {
    const onLogin = vi.fn();
    const onLogout = vi.fn();
    await act(async () => {
      root.render(<CabalSpyLogin clientId="csid_a" onLogin={onLogin} onLogout={onLogout} />);
    });
    const detail: CabalSpyIDLogin = { user: { sub: 'user-1' }, idToken: idToken('csid_a'), accessToken: 'at', expiresIn: 900 };
    act(() => {
      window.dispatchEvent(new CustomEvent('csid:login', { detail }));
      window.dispatchEvent(new CustomEvent('csid:login', { detail: { ...detail, idToken: idToken('csid_other') } }));
      window.dispatchEvent(new CustomEvent('csid:logout', { detail: { clientId: 'csid_a' } }));
      window.dispatchEvent(new CustomEvent('csid:logout', { detail: { clientId: 'csid_other' } }));
    });
    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(onLogin).toHaveBeenCalledWith(detail);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});

describe('useCabalSpyID()', () => {
  it('follows login and logout events', async () => {
    let current: UseCabalSpyIDResult | null = null;
    function Probe() {
      current = useCabalSpyID({ clientId: 'csid_a' });
      return null;
    }
    await act(async () => root.render(<Probe />));
    expect(current!.user).toBeNull();
    expect(current!.ready).toBe(false);
    await act(async () => fakeWidgetLoad());
    expect(current!.ready).toBe(true);

    act(() => {
      window.dispatchEvent(
        new CustomEvent('csid:login', {
          detail: { user: { sub: 'anon_1', limited: true }, idToken: idToken('csid_a'), accessToken: 'at', expiresIn: 900 },
        }),
      );
    });
    expect(current!.user).toMatchObject({ sub: 'anon_1' });
    expect(current!.limited).toBe(true);
    expect(current!.idToken).toBe(idToken('csid_a'));

    act(() => current!.signOut());
    expect(signOut).toHaveBeenCalledWith('csid_a');
    expect(current!.user).toBeNull();
    expect(current!.idToken).toBeNull();
  });

  it('reads the person remembered on this device', async () => {
    localStorage.setItem('csid:user:csid_b', JSON.stringify({ sub: 'u2', username: 'bob' }));
    let current: UseCabalSpyIDResult | null = null;
    function Probe() {
      current = useCabalSpyID({ clientId: 'csid_b', load: false });
      return null;
    }
    await act(async () => root.render(<Probe />));
    expect(current!.user).toMatchObject({ username: 'bob' });
    expect(current!.idToken).toBeNull();
  });
});
