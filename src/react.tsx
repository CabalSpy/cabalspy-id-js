/**
 * React bindings for "Login with CabalSpy ID", the token theses widget and the
 * Trade Feed widgets.
 *
 *   import { CabalSpyLogin, CabalSpyTheses, TradeFeedButton, TradeFeed, useCabalSpyID } from 'cabalspy-id/react';
 *
 *   <CabalSpyLogin clientId="csid_…" onLogin={({ idToken }) => sendToBackend(idToken)} />
 *   <CabalSpyTheses chain="solana" mint={mint} clientId="csid_…" />
 *   <TradeFeedButton trader="handle" clientId="csid_…" />
 *   <TradeFeed clientId="csid_…" filter="buys" />
 *
 * Loads https://id.cabalspy.xyz/widget.js once and maps props to its data-*
 * attributes (the same mapping as `cabalspy-id/widget`). Always verify `idToken`
 * on your backend (CabalSpyIDAuth.verifyIdToken) before you trust it.
 */

import { type CSSProperties, createElement, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import type { CabalSpyIDClaims, OidcScope } from './types';
import {
  type CabalSpyIDErrorEvent,
  type CabalSpyIDLogin,
  type CabalSpyIDLogoutEvent,
  type CabalSpyIDUserSummary,
  type LoginButtonOptions,
  type ThesisSignInHandler,
  type ThesisWidgetOptions,
  type TradeFeedButtonOptions,
  type TradeFeedSignInHandler,
  type TradeFeedWidgetOptions,
  isBrowser,
  loadCabalSpyIDWidget,
  loginButtonAttributes,
  onWidgetEvents,
  setThesisSignInHandler,
  thesisWidgetAttributes,
  tradeFeedButtonAttributes,
  tradeFeedWidgetAttributes,
} from './widget';

export {
  WIDGET_SRC,
  loadCabalSpyIDWidget,
  type CabalSpyIDLogin,
  type CabalSpyIDLogoutEvent,
  type CabalSpyIDErrorEvent,
  type CabalSpyIDUserSummary,
  type CSIDGlobal,
  type LoginButtonOptions,
  type ThesisSignInHandler,
  type ThesisWidgetOptions,
  type TradeFeedButtonOptions,
  type TradeFeedDesignOptions,
  type TradeFeedSignInHandler,
  type TradeFeedWidgetOptions,
} from './widget';

// ── <CabalSpyLogin /> ─────────────────────────────────────────────────────────

export interface CabalSpyLoginProps extends LoginButtonOptions {
  /** Fired after a browser-app login (window event `csid:login`). */
  onLogin?: (result: CabalSpyIDLogin) => void;
  /** Fired when the person signs out from the menu (window event `csid:logout`). */
  onLogout?: (event: CabalSpyIDLogoutEvent) => void;
  /** Fired when the browser flow fails (window event `csid:error`). */
  onError?: (event: CabalSpyIDErrorEvent) => void;
  /** Override the widget URL (e.g. for a self-hosted copy). */
  scriptSrc?: string;
  className?: string;
  style?: CSSProperties;
  id?: string;
}

/** "Sign in with CabalSpy ID" button (the official widget). */
export function CabalSpyLogin(props: CabalSpyLoginProps) {
  const { clientId, onLogin, onLogout, onError, scriptSrc } = props;
  const handlers = useRef({ onLogin, onLogout, onError });
  handlers.current = { onLogin, onLogout, onError };

  useEffect(
    () =>
      onWidgetEvents(
        {
          onLogin: (d) => handlers.current.onLogin?.(d),
          onLogout: (d) => handlers.current.onLogout?.(d),
          onError: (d) => handlers.current.onError?.(d),
        },
        clientId,
      ),
    [clientId],
  );

  const attrs = loginButtonAttributes(props);
  const key = JSON.stringify(attrs);

  useEffect(() => {
    if (!isBrowser()) return;
    let cancelled = false;
    loadCabalSpyIDWidget(scriptSrc).then(
      (csid) => {
        if (!cancelled) csid.mount();
      },
      (err: Error) => handlers.current.onError?.({ error: 'widget_load_failed', description: err.message }),
    );
    return () => {
      cancelled = true;
    };
  }, [key, scriptSrc]);

  return createElement('div', { ...attrs, id: props.id, className: props.className, style: props.style });
}

// ── <CabalSpyTheses /> ────────────────────────────────────────────────────────

export interface CabalSpyThesesProps extends ThesisWidgetOptions {
  /**
   * The signed-in user's CabalSpy ID access token (scope `thesis`), so they
   * write without signing in again inside the widget. After a browser login
   * through the widget this is set automatically. `null` signs the widget out.
   */
  accessToken?: string | null;
  /**
   * Your own sign-in for the widget's "Sign in to write" (instead of the page's
   * login button / popup): get a thesis-capable access token for the person,
   * pass it on (the `accessToken` prop or `setThesisAccessToken`) and resolve
   * `true`; resolve `false` when they are not signed in. While set, the page is
   * the source of truth for sign-in. Removed on unmount.
   */
  onSignIn?: ThesisSignInHandler;
  scriptSrc?: string;
  className?: string;
  style?: CSSProperties;
  id?: string;
}

/**
 * Token theses widget: holders' theses on a token with their real position,
 * replies, reactions, live updates.
 *
 *   <CabalSpyTheses chain="solana" mint={mint} clientId="csid_..." theme="dark" accessToken={accessToken} />
 */
export function CabalSpyTheses(props: CabalSpyThesesProps) {
  return useSignedInWidget(props, thesisWidgetAttributes(props));
}

// ── <TradeFeedButton /> and <TradeFeed /> ──────────────────────────────────────

interface SignedInWidgetProps {
  accessToken?: string | null;
  onSignIn?: ThesisSignInHandler;
  scriptSrc?: string;
  className?: string;
  style?: CSSProperties;
  id?: string;
}

export interface TradeFeedButtonProps extends TradeFeedButtonOptions {
  /**
   * The signed-in user's CabalSpy ID access token (scope `trade_feed`), so
   * they add the trader without signing in again. Shared with the theses
   * widgets. `null` signs the widgets out.
   */
  accessToken?: string | null;
  /**
   * Your own sign-in (instead of the page's login button / popup): get an
   * access token with the scope `trade_feed`, pass it on (the `accessToken`
   * prop or `setTradeFeedAccessToken`) and resolve `true`; `false` when the
   * person is not signed in. Removed on unmount. Shared with the theses widgets.
   */
  onSignIn?: TradeFeedSignInHandler;
  scriptSrc?: string;
  className?: string;
  style?: CSSProperties;
  id?: string;
}

/**
 * "+ Trade Feed" button for one trader: adds them to the signed-in person's
 * Trade Feed (or removes them), with the number of Trade Feeds they are in.
 *
 *   <TradeFeedButton trader="handle" clientId="csid_..." accessToken={accessToken} />
 */
export function TradeFeedButton(props: TradeFeedButtonProps) {
  return useSignedInWidget(props, tradeFeedButtonAttributes(props));
}

export interface TradeFeedProps extends TradeFeedWidgetOptions {
  /** The signed-in user's access token (scope `trade_feed`); see {@link TradeFeedButtonProps.accessToken}. */
  accessToken?: string | null;
  /** Your own sign-in; see {@link TradeFeedButtonProps.onSignIn}. */
  onSignIn?: TradeFeedSignInHandler;
  scriptSrc?: string;
  className?: string;
  style?: CSSProperties;
  id?: string;
}

/**
 * The signed-in person's Trade Feed, live: trades and theses of the traders in it.
 *
 *   <TradeFeed clientId="csid_..." filter="all" maxHeight={600} onSignIn={signIn} />
 */
export function TradeFeed(props: TradeFeedProps) {
  return useSignedInWidget(props, tradeFeedWidgetAttributes(props));
}

/** Mounts a widget that shares the page's thesis / Trade Feed sign-in (accessToken, onSignIn). */
function useSignedInWidget(props: SignedInWidgetProps, attrs: Record<string, string | undefined>) {
  const { accessToken, scriptSrc, onSignIn } = props;
  const key = JSON.stringify(attrs);
  const signIn = useRef(onSignIn);
  signIn.current = onSignIn;
  const hasSignIn = onSignIn !== undefined;

  useEffect(() => {
    if (!isBrowser() || !hasSignIn) return;
    let active = true;
    // A stable wrapper, so a new onSignIn function does not re-register.
    const handler: ThesisSignInHandler = () => (active && signIn.current ? signIn.current() : false);
    setThesisSignInHandler(handler, scriptSrc).catch(() => undefined);
    return () => {
      active = false;
      setThesisSignInHandler(null, scriptSrc).catch(() => undefined);
    };
  }, [hasSignIn, scriptSrc]);

  useEffect(() => {
    if (!isBrowser()) return;
    let cancelled = false;
    loadCabalSpyIDWidget(scriptSrc).then(
      (csid) => {
        if (!cancelled) csid.mount();
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [key, scriptSrc]);

  useEffect(() => {
    if (!isBrowser() || accessToken === undefined) return;
    let cancelled = false;
    loadCabalSpyIDWidget(scriptSrc).then(
      (csid) => {
        if (!cancelled) csid.thesis?.setAccessToken(accessToken);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [accessToken, scriptSrc]);

  // The widget mounts each element once; a new key gives a new element (and
  // iframe) when the token or the design changes.
  return createElement('div', {
    key,
    ...attrs,
    id: props.id,
    className: props.className,
    style: props.style,
  });
}

// ── useCabalSpyID() ───────────────────────────────────────────────────────────

interface AuthState {
  login: CabalSpyIDLogin | null;
}

let state: AuthState = { login: null };
const subscribers = new Set<() => void>();
let listening = false;

function setState(next: AuthState) {
  state = next;
  for (const s of subscribers) s();
}

function listen() {
  if (listening || !isBrowser()) return;
  listening = true;
  if (window.CSID?.user) state = { login: window.CSID.user };
  window.addEventListener('csid:login', (e) => setState({ login: (e as CustomEvent<CabalSpyIDLogin>).detail }));
  window.addEventListener('csid:logout', () => setState({ login: null }));
}

function subscribe(cb: () => void) {
  listen();
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

const getSnapshot = () => state;
const getServerSnapshot = () => state;

function remembered(clientId: string | undefined): CabalSpyIDUserSummary | null {
  if (!clientId || !isBrowser()) return null;
  try {
    return JSON.parse(localStorage.getItem(`csid:user:${clientId}`) ?? 'null') as CabalSpyIDUserSummary | null;
  } catch {
    return null;
  }
}

export interface UseCabalSpyIDOptions {
  /** Your client_id; needed for login(), signOut() and the remembered user. */
  clientId?: string;
  /** Load widget.js on mount (so a returning OAuth redirect completes). Default: true */
  load?: boolean;
  scriptSrc?: string;
}

export interface UseCabalSpyIDResult {
  /** userinfo claims from this page's login, else the person remembered on this device. */
  user: CabalSpyIDClaims | CabalSpyIDUserSummary | null;
  /** Only right after a browser login on this page. Verify it on your backend. */
  idToken: string | null;
  accessToken: string | null;
  /** True when the platform is over its plan's user limit for this person. */
  limited: boolean;
  /** widget.js is loaded. */
  ready: boolean;
  /** Starts the browser (public client) login flow. */
  login: (opts?: { redirectUri?: string; scope?: string | OidcScope[] }) => Promise<void>;
  /** Forgets the person on this device and fires `csid:logout`. */
  signOut: () => void;
}

/** Login state from the CabalSpy ID widget. */
export function useCabalSpyID(options: UseCabalSpyIDOptions = {}): UseCabalSpyIDResult {
  const { clientId, load = true, scriptSrc } = options;
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [ready, setReady] = useState(() => isBrowser() && !!window.CSID?.__loaded);
  const [stored, setStored] = useState<CabalSpyIDUserSummary | null>(null);

  useEffect(() => {
    setStored(remembered(clientId));
    if (!load || !isBrowser()) return;
    let cancelled = false;
    loadCabalSpyIDWidget(scriptSrc).then(
      () => !cancelled && setReady(true),
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [clientId, load, scriptSrc]);

  useEffect(() => {
    if (!snap.login) setStored(remembered(clientId));
  }, [snap.login, clientId]);

  const login = useCallback(
    async (opts: { redirectUri?: string; scope?: string | OidcScope[] } = {}) => {
      if (!clientId) throw new Error('useCabalSpyID: pass { clientId } to use login()');
      const csid = await loadCabalSpyIDWidget(scriptSrc);
      await csid.login({
        clientId,
        redirectUri: opts.redirectUri,
        scope: Array.isArray(opts.scope) ? opts.scope.join(' ') : opts.scope,
      });
    },
    [clientId, scriptSrc],
  );

  const signOut = useCallback(() => {
    if (clientId && isBrowser() && window.CSID) window.CSID.signOut(clientId);
    else setState({ login: null });
    setStored(null);
  }, [clientId]);

  const user = snap.login?.user ?? stored;
  return {
    user,
    idToken: snap.login?.idToken ?? null,
    accessToken: snap.login?.accessToken ?? null,
    limited: !!user?.limited,
    ready,
    login,
    signOut,
  };
}
