import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { PageState, Session } from "./state";

/** Sent with the app's own requests: the server answers with page JSON. */
const PAGE_HEADER = "X-Torrently-Page";

export interface Navigation {
  state: PageState;
  /** True while the next page is on its way. */
  busy: boolean;
  /** Opens a URL inside the app; anything the app cannot show loads in full. */
  navigate(url: string, options?: { replace?: boolean; scroll?: boolean }): Promise<void>;
  /**
   * Sends a form the way the templates did (POST, CSRF in a header) and shows
   * the page the server answers with, following its redirect.
   */
  submit(url: string, body: FormData, options?: { scroll?: boolean }): Promise<PageState | null>;
  /** Re-reads the current page, e.g. after a change made elsewhere. */
  refresh(): Promise<void>;
}

const NavigationContext = createContext<Navigation | null>(null);

export function useNavigation() {
  const value = useContext(NavigationContext);
  if (!value) throw new Error("useNavigation outside <Router>");
  return value;
}
/** The state of the page on screen, which lags `navigation.state` while the
 * next page loads. Pages read this, never the navigation's. */
const ShownContext = createContext<PageState | null>(null);
export const ShownPage = ShownContext.Provider;
export function usePage<T>() {
  const shown = useContext(ShownContext);
  if (!shown) throw new Error("usePage outside a page");
  return shown as PageState<T>;
}
export const useSession = (): Session => usePage().session;

/** Headers every mutation needs: the session's CSRF token and id. */
export function sessionHeaders(session: Session): Record<string, string> {
  return {
    "X-CSRF-TOKEN": session.csrf,
    "X-Session-ID": session.sessionId,
    "X-Return-Url": location.pathname + location.search,
  };
}

/**
 * Pages that keep history entries of their own (a dialog or a filter in the
 * query string, like Discover's ?id= and ?search=) claim them, so going back
 * and forth between them is left to the page instead of reloading it.
 * Returns the release.
 */
const claims = new Set<(url: URL) => boolean>();
export function claimHistory(test: (url: URL) => boolean) {
  claims.add(test);
  return () => void claims.delete(test);
}

function sameOrigin(url: URL) {
  return url.origin === location.origin;
}

// Paths the app never renders: files, feeds, protocol endpoints. Whole
// path segments, with or without a language prefix.
const PASS_THROUGH =
  /^(?:\/[a-z]{2})?\/(?:assets|pub|api|s|token|embed|stremio|webdav|s3|queue|sitemap\.xml|lib\/poster|lib\/(?:movie|series|episode)\/|user-subtitle\/file|auth\/(?:dashboard|callback))(?:\/|$|\?)/;

export function Router({
  initial,
  onChange,
  children,
}: {
  initial: PageState;
  onChange?: (state: PageState) => void;
  children: ReactNode;
}) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const ticket = useRef(0);

  const show = useCallback(
    (next: PageState, url: string, mode: "push" | "replace" | "none", scroll: boolean) => {
      if (mode === "push") history.pushState({ torrently: true }, "", url);
      if (mode === "replace") history.replaceState({ torrently: true }, "", url);
      if (next.title) document.title = next.title;
      document.documentElement.lang = next.session.lang;
      setState(next);
      onChange?.(next);
      if (scroll) {
        const hash = new URL(url, location.href).hash;
        const target = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
        if (target) target.scrollIntoView();
        else window.scrollTo({ top: 0 });
      }
    },
    [onChange],
  );

  const load = useCallback(
    async (url: string, init: RequestInit, mode: "push" | "replace" | "none", scroll: boolean) => {
      const id = ++ticket.current;
      setBusy(true);
      try {
        const response = await fetch(url, {
          credentials: "same-origin",
          ...init,
          headers: { [PAGE_HEADER]: "1", ...(init.headers ?? {}) },
        });
        if (id !== ticket.current) return null;
        const type = response.headers.get("Content-Type") ?? "";
        if (!type.includes("application/json")) {
          // a page the app has no screen for yet: let the server render it
          location.assign(response.url || url);
          return null;
        }
        const next = (await response.json()) as PageState;
        if (id !== ticket.current) return null;
        const final = response.redirected ? response.url : url;
        show(next, final, mode, scroll);
        return next;
      } catch {
        if (id === ticket.current) location.assign(url);
        return null;
      } finally {
        if (id === ticket.current) setBusy(false);
      }
    },
    [show],
  );

  const navigate = useCallback(
    async (url: string, options: { replace?: boolean; scroll?: boolean } = {}) => {
      const target = new URL(url, location.href);
      if (!sameOrigin(target) || PASS_THROUGH.test(target.pathname)) {
        location.assign(target.href);
        return;
      }
      await load(target.href, {}, options.replace ? "replace" : "push", options.scroll ?? true);
    },
    [load],
  );

  const submit = useCallback(
    (url: string, body: FormData, options: { scroll?: boolean } = {}) =>
      load(
        new URL(url, location.href).href,
        { method: "POST", body, headers: sessionHeaders(state.session) },
        // a mutation lands back on the page it was made from
        "replace",
        options.scroll ?? false,
      ),
    [load, state.session],
  );

  const refresh = useCallback(async () => {
    await load(location.href, {}, "none", false);
  }, [load]);

  useEffect(() => {
    history.replaceState({ torrently: true }, "");
    const onPop = () => {
      const url = new URL(location.href);
      for (const test of claims) if (test(url)) return;
      void load(location.href, {}, "none", false);
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, [load]);

  return (
    <NavigationContext.Provider value={{ state, busy, navigate, submit, refresh }}>
      {children}
    </NavigationContext.Provider>
  );
}

/** An <a> that stays inside the app for its own pages. */
export function Link({
  href,
  onClick,
  children,
  scroll,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; scroll?: boolean }) {
  const { navigate } = useNavigation();
  const click = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      rest.target === "_blank" ||
      rest.download !== undefined
    )
      return;
    const target = new URL(href, location.href);
    if (!sameOrigin(target) || PASS_THROUGH.test(target.pathname)) return;
    event.preventDefault();
    void navigate(target.href, { scroll });
  };
  return (
    <a href={href} onClick={click} {...rest}>
      {children}
    </a>
  );
}
