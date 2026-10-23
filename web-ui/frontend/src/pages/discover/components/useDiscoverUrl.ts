import { useCallback, useEffect, useRef } from "react";
import { claimHistory } from "../../../app/router";
import { LANGUAGES } from "../../../i18n";

type Params = Record<string, string | number | null | undefined>;

/** Marks the history entries Discover pushed itself. */
const MARK = { torrently: true, discover: true };

function buildUrl(params: Params) {
  const url = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") url.set(k, String(v));
    else url.delete(k);
  }
  const search = url.toString() ? `?${url}` : "";
  return window.location.pathname + search;
}

function buildUrlClean(params: Params) {
  const url = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") url.set(k, String(v));
  }
  const search = url.toString() ? `?${url}` : "";
  return window.location.pathname + search;
}

// Strip a leading /{lang} prefix so the pathname can be compared against
// the canonical (lang-less) '/discover'.
function stripLangPrefix(pathname: string) {
  const m = pathname.match(/^\/([a-z]{2})(\/|$)/);
  if (m && LANGUAGES.includes(m[1]) && m[1] !== "en") return pathname.slice(3) || "/";
  return pathname;
}

/** Whether the current history entry is one this page pushed. */
export function isOwnEntry() {
  return Boolean((window.history.state as { discover?: boolean } | null)?.discover);
}

export interface DiscoverUrl {
  push(params: Params): void;
  replace(params: Params): void;
  replaceAll(params: Params): void;
  isPopstate: { current: boolean };
  withPopstate(fn: () => void): void;
  onPopstate(handler: (params: URLSearchParams) => void): void;
}

/**
 * The page's state in its address: type, catalog, page, search, the open
 * title (?id, ?season, ?episode, ?tab). Pushed entries are claimed from the
 * app's router (claimHistory), so back and forward between them stay on
 * this page and are handed to `onPopstate`.
 */
export function useDiscoverUrl(pathPrefix: string): DiscoverUrl {
  const isPopstate = useRef(false);
  const handlerRef = useRef<((params: URLSearchParams) => void) | null>(null);

  const push = useCallback((params: Params) => {
    const url = buildUrl(params);
    window.history.pushState(MARK, "", url);
  }, []);

  const replace = useCallback((params: Params) => {
    const newUrl = buildUrl(params);
    window.history.replaceState({ ...(window.history.state || {}), torrently: true }, "", newUrl);
  }, []);

  const replaceAll = useCallback((params: Params) => {
    const newUrl = buildUrlClean(params);
    window.history.replaceState({ ...(window.history.state || {}), torrently: true }, "", newUrl);
  }, []);

  const withPopstate = useCallback((fn: () => void) => {
    isPopstate.current = true;
    try {
      fn();
    } finally {
      isPopstate.current = false;
    }
  }, []);

  const onPopstate = useCallback((handler: (params: URLSearchParams) => void) => {
    handlerRef.current = handler;
  }, []);

  useEffect(() => {
    const matches = (pathname: string) => stripLangPrefix(pathname).startsWith(pathPrefix);
    const release = claimHistory((url) => matches(url.pathname));
    const listener = () => {
      if (!matches(window.location.pathname)) return;
      handlerRef.current?.(new URLSearchParams(window.location.search));
    };
    window.addEventListener("popstate", listener);
    return () => {
      release();
      window.removeEventListener("popstate", listener);
    };
  }, [pathPrefix]);

  return { push, replace, replaceAll, isPopstate, withPopstate, onPopstate };
}
