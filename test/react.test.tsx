// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CabalSpyLogin,
  CabalSpyTheses,
  TradeFeed,
  TradeFeedButton,
  WIDGET_SRC,
  useCabalSpyID,
  type CabalSpyIDLogin,
  type UseCabalSpyIDResult,
} from '../src/react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const mount = vi.fn();
const signOut = vi.fn();
const setAccessToken = vi.fn();
const setSignInHandler = vi.fn();

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
    thesis: { setAccessToken, setSignInHandler, clear: vi.fn() },
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
  setAccessToken.mockReset();
  setSignInHandler.mockReset();
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

describe('<CabalSpyTheses />', () => {
  it('renders the thesis element, mounts it and passes the access token', async () => {
    await act(async () => {
      root.render(<CabalSpyTheses chain="solana" mint="MintA" clientId="csid_a" theme="light" height={600} accessToken="at-1" />);
    });
    const el = container.querySelector('[data-csid-thesis]') as HTMLElement;
    expect(el.dataset).toMatchObject({ chain: 'solana', mint: 'MintA', clientId: 'csid_a', theme: 'light', height: '600' });
    expect(el.hasAttribute('data-radius')).toBe(false);
    await act(async () => fakeWidgetLoad());
    expect(mount).toHaveBeenCalled();
    expect(setAccessToken).toHaveBeenCalledWith('at-1');

    await act(async () => {
      root.render(<CabalSpyTheses chain="solana" mint="MintB" clientId="csid_a" theme="light" height={600} accessToken={null} />);
    });
    const next = container.querySelector('[data-csid-thesis]') as HTMLElement;
    expect(next).not.toBe(el); // a new element for the widget to mount
    expect(next.dataset.mint).toBe('MintB');
    expect(setAccessToken).toHaveBeenLastCalledWith(null);
  });
});

describe('<CabalSpyTheses onSignIn>', () => {
  it('registers a sign-in handler that calls the latest onSignIn, and removes it on unmount', async () => {
    const first = vi.fn(async () => false);
    const second = vi.fn(async () => true);
    await act(async () => {
      root.render(<CabalSpyTheses chain="solana" mint="MintA" clientId="csid_a" onSignIn={first} />);
    });
    await act(async () => fakeWidgetLoad());
    expect(setSignInHandler).toHaveBeenCalledTimes(1);
    const registered = setSignInHandler.mock.calls[0]![0] as () => Promise<boolean>;
    expect(await registered()).toBe(false);
    expect(first).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(<CabalSpyTheses chain="solana" mint="MintA" clientId="csid_a" onSignIn={second} />);
    });
    expect(setSignInHandler).toHaveBeenCalledTimes(1); // same wrapper, not registered again
    expect(await registered()).toBe(true);
    expect(second).toHaveBeenCalledTimes(1);

    await act(async () => root.render(<div />));
    await act(async () => undefined);
    expect(setSignInHandler).toHaveBeenLastCalledWith(null);
    expect(await registered()).toBe(false); // stale wrapper is inert
  });

  it('does not touch the sign-in handler without onSignIn', async () => {
    await act(async () => {
      root.render(<CabalSpyTheses chain="solana" mint="MintA" clientId="csid_a" />);
    });
    await act(async () => fakeWidgetLoad());
    expect(setSignInHandler).not.toHaveBeenCalled();
  });
});

describe('<CabalSpyTheses /> design props', () => {
  it('maps clientId and every design prop to data-*', async () => {
    await act(async () => {
      root.render(
        <CabalSpyTheses
          chain="base"
          mint="0xabc"
          clientId="csid_app"
          scope="instance"
          sort="top"
          font="Inter"
          radius={8}
          bg="#000"
          card="#111"
          text="#fff"
          muted="#999"
          border="#222"
          accent="#3ddc84"
          accentText="#04210f"
          bull="#0f0"
          bear="#f00"
          showHeader={false}
          showSentiment
          compact
          height={400}
        />,
      );
    });
    const el = container.querySelector('[data-csid-thesis]') as HTMLElement;
    expect({ ...el.dataset }).toEqual({
      csidThesis: '',
      chain: 'base',
      mint: '0xabc',
      clientId: 'csid_app',
      scope: 'instance',
      sort: 'top',
      font: 'Inter',
      radius: '8',
      bg: '#000',
      card: '#111',
      text: '#fff',
      muted: '#999',
      border: '#222',
      accent: '#3ddc84',
      accentText: '#04210f',
      bull: '#0f0',
      bear: '#f00',
      showHeader: 'false',
      showSentiment: 'true',
      compact: 'true',
      height: '400',
    });
  });
});

describe('<TradeFeedButton /> and <TradeFeed />', () => {
  it('render the Trade Feed elements, mount them and pass the access token', async () => {
    await act(async () => {
      root.render(
        <>
          <TradeFeedButton trader="alice" clientId="csid_a" size="sm" showCount accessToken="at-tf" />
          <TradeFeed clientId="csid_a" filter="theses" showFilters={false} maxHeight={500} theme="light" />
        </>,
      );
    });
    const btn = container.querySelector('[data-csid-trade-feed-button]') as HTMLElement;
    expect({ ...btn.dataset }).toEqual({ csidTradeFeedButton: '', trader: 'alice', clientId: 'csid_a', size: 'sm', showCount: 'true' });
    const feed = container.querySelector('[data-csid-trade-feed]') as HTMLElement;
    expect({ ...feed.dataset }).toEqual({ csidTradeFeed: '', clientId: 'csid_a', theme: 'light', filter: 'theses', showFilters: 'false', maxHeight: '500' });
    await act(async () => fakeWidgetLoad());
    expect(mount).toHaveBeenCalled();
    expect(setAccessToken).toHaveBeenCalledWith('at-tf');
  });

  it('onSignIn registers the shared sign-in handler and removes it on unmount', async () => {
    const signIn = vi.fn(async () => true);
    await act(async () => {
      root.render(<TradeFeed clientId="csid_a" onSignIn={signIn} />);
    });
    await act(async () => fakeWidgetLoad());
    expect(setSignInHandler).toHaveBeenCalledTimes(1);
    const registered = setSignInHandler.mock.calls[0]![0] as () => Promise<boolean>;
    expect(await registered()).toBe(true);
    await act(async () => root.render(<div />));
    await act(async () => undefined);
    expect(setSignInHandler).toHaveBeenLastCalledWith(null);
  });

  it('throws without clientId', () => {
    // @ts-expect-error clientId is required
    expect(() => TradeFeed({})).toThrow(/public client_id/);
  });
});
