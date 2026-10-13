/**
 * React bindings for "Login with CabalSpy ID".
 *
 *   import { CabalSpyLogin, useCabalSpyID } from 'cabalspy-id/react';
 *
 *   <CabalSpyLogin clientId="csid_…" onLogin={({ idToken }) => sendToBackend(idToken)} />
 *
 * Loads https://id.cabalspy.xyz/widget.js once and maps props to its data-*
 * attributes. Always verify `idToken` on your backend (CabalSpyIDAuth.verifyIdToken)
 * before you trust it.
 */

import { type CSSProperties, createElement, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import type { CabalSpyIDClaims, OidcScope } from './types';

export const WIDGET_SRC = 'https://id.cabalspy.xyz/widget.js';

/** Detail of the widget's `csid:login` event. */
export interface CabalSpyIDLogin {
  /** userinfo claims; `limited: true` (anonymous sub) when the platform is over its plan's user limit. */
  user: CabalSpyIDClaims;
  /** Send this to your backend and verify it there. */
  idToken: string;
  accessToken: string;
  /** Seconds. */
  expiresIn: number;
}

export interface CabalSpyIDLogoutEvent {
  clientId: string;
}

export interface CabalSpyIDErrorEvent {
  error: string;
  description?: string;
}

/** The signed-in person as the widget remembers them on this device. */
export interface CabalSpyIDUserSummary {
  sub: string;
  username?: string;
  name?: string | null;
  picture?: string | null;
  kol_badge?: boolean;
  limited?: boolean;
}

/** The global the widget defines (window.CSID). */
export interface CSIDGlobal {
  __loaded: true;
  user: CabalSpyIDLogin | null;
  mount(): void;
  login(opts: { clientId: string; redirectUri?: string; scope?: string }): Promise<void>;
  setUser(clientId: string, user: CabalSpyIDUserSummary | CabalSpyIDClaims): void;
  signOut(clientId: string): void;
  onLogin(cb: (r: CabalSpyIDLogin) => void): void;
}

declare global {
  interface Window {
    CSID?: CSIDGlobal;
  }
}

const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined';

const loaders = new Map<string, Promise<CSIDGlobal>>();

/** Loads widget.js once per page. Resolves with window.CSID. */
export function loadCabalSpyIDWidget(src: string = WIDGET_SRC): Promise<CSIDGlobal> {
  if (!isBrowser()) return Promise.reject(new Error('CabalSpy ID widget needs a browser'));
  if (window.CSID?.__loaded) return Promise.resolve(window.CSID);
  let p = loaders.get(src);
  // The script tag was removed (e.g. by a test or a head manager): load again.
  if (p && !document.querySelector(`script[src="${src}"]`)) {
    loaders.delete(src);
    p = undefined;
  }
  if (!p) {
    p = new Promise<CSIDGlobal>((resolve, reject) => {
      const done = () => (window.CSID ? resolve(window.CSID) : reject(new Error('widget.js loaded but window.CSID is missing')));
      let script = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
      if (script && window.CSID) return done();
      if (!script) {
        script = document.createElement('script');
        script.src = src;
        script.async = true;
        document.head.appendChild(script);
      }
      script.addEventListener('load', done, { once: true });
      script.addEventListener(
        'error',
        () => {
          loaders.delete(src);
          reject(new Error(`Could not load ${src}`));
        },
        { once: true },
      );
    });
    loaders.set(src, p);
  }
  return p;
}

function audOf(idToken: string): string | undefined {
  try {
    const part = idToken.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const aud = (JSON.parse(atob(part + '='.repeat((4 - (part.length % 4)) % 4))) as { aud?: string | string[] }).aud;
    return Array.isArray(aud) ? aud[0] : aud;
  } catch {
    return undefined;
  }
}

// ── <CabalSpyLogin /> ─────────────────────────────────────────────────────────

export interface CabalSpyLoginProps {
  /** Your instance's client_id (`csid_…`). */
  clientId: string;
  /** Button design overrides; defaults come from the dashboard's button builder. */
  theme?: 'dark' | 'light' | (string & {});
  color?: string;
  textColor?: string;
  shape?: 'square' | 'rounded' | 'pill';
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  fullWidth?: boolean;
  showLogo?: boolean;
  /**
   * Server-side apps: your own login route that starts the OIDC flow with your
   * client secret. Without it, a public client runs PKCE in the browser.
   */
  href?: string;
  /** Browser apps: redirect URI (default: the current page). */
  redirectUri?: string;
  /** Browser apps: requested scopes (default: openid profile). */
  scope?: string | OidcScope[];
  /** Server-side apps: the signed-in person's `sub`, to show the avatar menu. */
  user?: string;
  /** Server-side apps: where "Sign out" goes. */
  logoutHref?: string;
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

const bool = (v: boolean | undefined) => (v === undefined ? undefined : v ? 'true' : 'false');

/** "Sign in with CabalSpy ID" button (the official widget). */
export function CabalSpyLogin(props: CabalSpyLoginProps) {
  const { clientId, onLogin, onLogout, onError, scriptSrc } = props;
  const handlers = useRef({ onLogin, onLogout, onError });
  handlers.current = { onLogin, onLogout, onError };

  useEffect(() => {
    if (!isBrowser()) return;
    const login = (e: Event) => {
      const d = (e as CustomEvent<CabalSpyIDLogin>).detail;
      if (d?.idToken && audOf(d.idToken) !== undefined && audOf(d.idToken) !== clientId) return;
      handlers.current.onLogin?.(d);
    };
    const logout = (e: Event) => {
      const d = (e as CustomEvent<CabalSpyIDLogoutEvent>).detail;
      if (d?.clientId && d.clientId !== clientId) return;
      handlers.current.onLogout?.(d);
    };
    const error = (e: Event) => handlers.current.onError?.((e as CustomEvent<CabalSpyIDErrorEvent>).detail);
    window.addEventListener('csid:login', login);
    window.addEventListener('csid:logout', logout);
    window.addEventListener('csid:error', error);
    return () => {
      window.removeEventListener('csid:login', login);
      window.removeEventListener('csid:logout', logout);
      window.removeEventListener('csid:error', error);
    };
  }, [clientId]);

  const scope = Array.isArray(props.scope) ? props.scope.join(' ') : props.scope;
  const attrs: Record<string, string | undefined> = {
    'data-csid-login': '',
    'data-client-id': clientId,
    'data-theme': props.theme,
    'data-color': props.color,
    'data-text-color': props.textColor,
    'data-shape': props.shape,
    'data-size': props.size,
    'data-label': props.label,
    'data-full-width': bool(props.fullWidth),
    'data-show-logo': bool(props.showLogo),
    'data-href': props.href,
    'data-redirect-uri': props.redirectUri,
    'data-scope': scope,
    'data-user': props.user,
    'data-logout-href': props.logoutHref,
  };
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
