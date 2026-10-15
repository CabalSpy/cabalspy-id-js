/**
 * CabalSpy ID widgets for any web page (browser only, no framework):
 * the "Sign in with CabalSpy ID" button and the token theses widget.
 *
 *   import { mountLoginButton, mountTheses } from 'cabalspy-id/widget';
 *
 *   mountLoginButton('#login', { clientId: 'csid_…', onLogin: ({ idToken }) => sendToBackend(idToken) });
 *   mountTheses('#theses', { chain: 'solana', mint, clientId: 'csid_…', theme: 'dark' });
 *
 * Loads https://id.cabalspy.xyz/widget.js once and maps options to its data-*
 * attributes. React components: `cabalspy-id/react` (also `cabalspy-id/widget/react`).
 */

import { AuthenticationError } from './errors';
import type { CabalSpyIDClaims, Chain, OidcScope } from './types';

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
  /** Thesis widgets on the page (data-csid-thesis). */
  thesis?: {
    /** Lets thesis widgets write as this user (access token with the scope "thesis"). */
    setAccessToken(token: string | null): void;
    /**
     * Your own sign-in for the widget's "Sign in to write" (null removes it).
     * See {@link setThesisSignInHandler}.
     */
    setSignInHandler?(handler: ThesisSignInHandler | null): void;
    clear(): void;
  };
}

/**
 * Your page's sign-in for thesis widgets: obtain a thesis-capable access token
 * for the person (e.g. your platform's own CabalSpy ID access token with the
 * scope "thesis", from your backend), call `setThesisAccessToken(token)` (or
 * `CSID.thesis.setAccessToken(token)`) and resolve `true`; resolve `false` when
 * the person is not signed in.
 */
export type ThesisSignInHandler = () => Promise<boolean> | boolean;

declare global {
  interface Window {
    CSID?: CSIDGlobal;
  }
}

export const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined';

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

/** The `aud` of an (unverified) ID token, to route widget events to the right client. */
export function audOf(idToken: string): string | undefined {
  try {
    const part = idToken.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const aud = (JSON.parse(atob(part + '='.repeat((4 - (part.length % 4)) % 4))) as { aud?: string | string[] }).aud;
    return Array.isArray(aud) ? aud[0] : aud;
  } catch {
    return undefined;
  }
}

const bool = (v: boolean | undefined) => (v === undefined ? undefined : v ? 'true' : 'false');
const num = (v: number | undefined) => (v === undefined ? undefined : String(v));

// ── options ──────────────────────────────────────────────────────────────────

/** Design and behaviour of the login button. */
export interface LoginButtonOptions {
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
  /**
   * Browser apps: requested scopes (default: openid profile). Add `thesis` so
   * the person can write in thesis widgets on your page right after sign-in.
   */
  scope?: string | OidcScope[];
  /** Server-side apps: the signed-in person's `sub`, to show the avatar menu. */
  user?: string;
  /** Server-side apps: where "Sign out" goes. */
  logoutHref?: string;
}

/** Design and data of the token theses widget. */
export interface ThesisWidgetOptions {
  /** solana | bnb | base | eth | rh */
  chain: Chain;
  /** Token mint / contract address. */
  mint: string;
  /**
   * Required. Your instance's PUBLIC client_id (`csid_...`, shown in the
   * dashboard next to the API key; not the API key). The widget sends it on
   * every thesis API call; it also loads the design saved in the dashboard (the
   * options below override it), credits posts to your app and enables `scope: 'instance'`.
   */
  clientId: string;
  /** Default: dark */
  theme?: 'dark' | 'light';
  /** `global` (default): theses from every platform. `instance`: only the ones written on your instance. */
  scope?: 'global' | 'instance';
  /** Initial order. Default: new */
  sort?: 'new' | 'top';
  /** Font family, e.g. "Inter". */
  font?: string;
  /** Corner radius in px. Default: 12 */
  radius?: number;
  /** Colors (CSS colors, e.g. "#0d0f12"). */
  bg?: string;
  card?: string;
  text?: string;
  muted?: string;
  border?: string;
  accent?: string;
  accentText?: string;
  bull?: string;
  bear?: string;
  /** Show the token header. Default: true */
  showHeader?: boolean;
  /** Show the bull/bear sentiment bar. */
  showSentiment?: boolean;
  /** Denser layout. Default: false */
  compact?: boolean;
  /** Initial height in px; the widget then sizes itself to its content. Default: 520 */
  height?: number;
}

/** The widget's data-* attributes for a login button. */
export function loginButtonAttributes(o: LoginButtonOptions): Record<string, string | undefined> {
  return {
    'data-csid-login': '',
    'data-client-id': o.clientId,
    'data-theme': o.theme,
    'data-color': o.color,
    'data-text-color': o.textColor,
    'data-shape': o.shape,
    'data-size': o.size,
    'data-label': o.label,
    'data-full-width': bool(o.fullWidth),
    'data-show-logo': bool(o.showLogo),
    'data-href': o.href,
    'data-redirect-uri': o.redirectUri,
    'data-scope': Array.isArray(o.scope) ? o.scope.join(' ') : o.scope,
    'data-user': o.user,
    'data-logout-href': o.logoutHref,
  };
}

/** The widget's data-* attributes for a theses widget. Throws `client_id_required` without `clientId`. */
export function thesisWidgetAttributes(o: ThesisWidgetOptions): Record<string, string | undefined> {
  if (typeof o?.clientId !== 'string' || !o.clientId.trim()) {
    throw new AuthenticationError(
      "The theses widget needs your instance's public client_id (csid_..., shown in the dashboard next to the API key): " +
        "{ clientId: 'csid_...' }. It is not the API key; never put the API key in a browser.",
      { code: 'client_id_required', parameter: 'clientId', docs: 'https://docs.cabalspy.xyz/cabalspy-id/errors#client_id_required' },
    );
  }
  return {
    'data-csid-thesis': '',
    'data-chain': o.chain,
    'data-mint': o.mint,
    'data-client-id': o.clientId.trim(),
    'data-theme': o.theme,
    'data-scope': o.scope,
    'data-sort': o.sort,
    'data-font': o.font,
    'data-radius': num(o.radius),
    'data-bg': o.bg,
    'data-card': o.card,
    'data-text': o.text,
    'data-muted': o.muted,
    'data-border': o.border,
    'data-accent': o.accent,
    'data-accent-text': o.accentText,
    'data-bull': o.bull,
    'data-bear': o.bear,
    'data-show-header': bool(o.showHeader),
    'data-show-sentiment': bool(o.showSentiment),
    'data-compact': bool(o.compact),
    'data-height': num(o.height),
  };
}

// ── events ───────────────────────────────────────────────────────────────────

export interface WidgetEventHandlers {
  /** A browser-app login finished (window event `csid:login`). */
  onLogin?: (result: CabalSpyIDLogin) => void;
  /** The person signed out from the menu (window event `csid:logout`). */
  onLogout?: (event: CabalSpyIDLogoutEvent) => void;
  /** The browser flow failed (window event `csid:error`). */
  onError?: (event: CabalSpyIDErrorEvent) => void;
}

/**
 * Listens to the widget's window events. With `clientId`, logins and logouts of
 * other clients on the same page are ignored. Returns a function that stops listening.
 */
export function onWidgetEvents(handlers: WidgetEventHandlers, clientId?: string): () => void {
  if (!isBrowser()) return () => undefined;
  const login = (e: Event) => {
    const d = (e as CustomEvent<CabalSpyIDLogin>).detail;
    const aud = d?.idToken ? audOf(d.idToken) : undefined;
    if (clientId && aud !== undefined && aud !== clientId) return;
    handlers.onLogin?.(d);
  };
  const logout = (e: Event) => {
    const d = (e as CustomEvent<CabalSpyIDLogoutEvent>).detail;
    if (clientId && d?.clientId && d.clientId !== clientId) return;
    handlers.onLogout?.(d);
  };
  const error = (e: Event) => handlers.onError?.((e as CustomEvent<CabalSpyIDErrorEvent>).detail);
  window.addEventListener('csid:login', login);
  window.addEventListener('csid:logout', logout);
  window.addEventListener('csid:error', error);
  return () => {
    window.removeEventListener('csid:login', login);
    window.removeEventListener('csid:logout', logout);
    window.removeEventListener('csid:error', error);
  };
}

// ── mounting (vanilla) ───────────────────────────────────────────────────────

export interface MountedWidget<O> {
  /** The element carrying the data-* attributes. */
  readonly element: HTMLElement;
  /** Re-renders with new options (a fresh element, so the widget mounts it again). */
  update(options: Partial<O>): void;
  /** Removes the widget and its event listeners. */
  remove(): void;
}

function resolveTarget(target: Element | string): Element {
  if (!isBrowser()) throw new Error('CabalSpy ID widget needs a browser');
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) throw new Error(`CabalSpy ID widget: no element matches ${String(target)}`);
  return el;
}

function applyAttributes(el: HTMLElement, attrs: Record<string, string | undefined>): void {
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) el.setAttribute(k, v);
}

function mountWith<O>(
  target: Element | string,
  options: O,
  attributes: (o: O) => Record<string, string | undefined>,
  after: (csid: CSIDGlobal, o: O) => void,
  scriptSrc: string | undefined,
  onLoadError?: (err: Error) => void,
): MountedWidget<O> {
  const host = resolveTarget(target);
  let current = options;
  let el = document.createElement('div');
  const render = () => {
    const next = document.createElement('div');
    applyAttributes(next, attributes(current));
    if (el.parentNode) el.replaceWith(next);
    else host.appendChild(next);
    el = next;
    loadCabalSpyIDWidget(scriptSrc).then(
      (csid) => {
        if (el.isConnected) {
          csid.mount();
          after(csid, current);
        }
      },
      (err: Error) => onLoadError?.(err),
    );
  };
  render();
  return {
    get element() {
      return el;
    },
    update(partial) {
      current = { ...current, ...partial };
      render();
    },
    remove() {
      el.remove();
    },
  };
}

/**
 * Mounts the "Sign in with CabalSpy ID" button into `target` (an element or a
 * CSS selector).
 */
export function mountLoginButton(
  target: Element | string,
  options: LoginButtonOptions & WidgetEventHandlers & { scriptSrc?: string },
): MountedWidget<LoginButtonOptions> {
  const stop = onWidgetEvents(options, options.clientId);
  const mounted = mountWith<LoginButtonOptions>(
    target,
    options,
    loginButtonAttributes,
    () => undefined,
    options.scriptSrc,
    (err) => options.onError?.({ error: 'widget_load_failed', description: err.message }),
  );
  return {
    get element() {
      return mounted.element;
    },
    update: (o) => mounted.update(o),
    remove() {
      stop();
      mounted.remove();
    },
  };
}

/**
 * Mounts the token theses widget into `target` (an element or a CSS selector).
 * `clientId` (your instance's public client_id) is required. `accessToken`
 * (scope `thesis`) lets the signed-in person write right away.
 */
export function mountTheses(
  target: Element | string,
  options: ThesisWidgetOptions & { accessToken?: string | null; scriptSrc?: string },
): MountedWidget<ThesisWidgetOptions> {
  return mountWith<ThesisWidgetOptions>(
    target,
    options,
    thesisWidgetAttributes,
    (csid) => {
      if (options.accessToken !== undefined) csid.thesis?.setAccessToken(options.accessToken);
    },
    options.scriptSrc,
  );
}

/**
 * Lets thesis widgets on the page write as this user (an access token with the
 * scope `thesis`), or signs them out with `null`.
 */
export async function setThesisAccessToken(token: string | null, scriptSrc?: string): Promise<void> {
  const csid = await loadCabalSpyIDWidget(scriptSrc);
  csid.thesis?.setAccessToken(token);
}

/**
 * Lets your page handle the thesis widgets' "Sign in to write": the widget
 * calls `handler` instead of the page's login button / popup. While a handler
 * is set, the widget treats the page as the source of truth for sign-in (signed
 * out on the page = signed out in the widget). `null` removes it. Waits for
 * widget.js when it is not loaded yet; a no-op on the server.
 *
 *   setThesisSignInHandler(async () => {
 *     const token = await fetch('/api/csid-thesis-token').then((r) => (r.ok ? r.text() : null));
 *     if (!token) return false;
 *     await setThesisAccessToken(token);
 *     return true;
 *   });
 */
export async function setThesisSignInHandler(handler: ThesisSignInHandler | null, scriptSrc?: string): Promise<void> {
  if (!isBrowser()) return; // server rendering: nothing to register
  const csid = await loadCabalSpyIDWidget(scriptSrc);
  csid.thesis?.setSignInHandler?.(handler);
}

/** Starts the browser (public client) login flow. */
export async function startLogin(
  options: { clientId: string; redirectUri?: string; scope?: string | OidcScope[] },
  scriptSrc?: string,
): Promise<void> {
  const csid = await loadCabalSpyIDWidget(scriptSrc);
  await csid.login({
    clientId: options.clientId,
    redirectUri: options.redirectUri,
    scope: Array.isArray(options.scope) ? options.scope.join(' ') : options.scope,
  });
}
