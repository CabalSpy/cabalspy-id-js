/**
 * React bindings for "Login with CabalSpy ID" and the token theses widget.
 *
 *   import { CabalSpyLogin, CabalSpyTheses, useCabalSpyID } from 'cabalspy-id/react';
 *
 *   <CabalSpyLogin clientId="csid_…" onLogin={({ idToken }) => sendToBackend(idToken)} />
 *   <CabalSpyTheses chain="solana" mint={mint} />
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
  type ThesisWidgetOptions,
  isBrowser,
  loadCabalSpyIDWidget,
  loginButtonAttributes,
  onWidgetEvents,
  thesisWidgetAttributes,
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
  type ThesisWidgetOptions,
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
  scriptSrc?: string;
  className?: string;
  style?: CSSProperties;
  id?: string;
}

/**
 * Token theses widget: holders' theses on a token with their real position,
 * replies, reactions, live updates.
 *
 *   <CabalSpyTheses chain="solana" mint={mint} theme="dark" accessToken={accessToken} />
 */
export function CabalSpyTheses(props: CabalSpyThesesProps) {
  const { accessToken, scriptSrc } = props;
  const attrs = thesisWidgetAttributes(props);
  const key = JSON.stringify(attrs);

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
