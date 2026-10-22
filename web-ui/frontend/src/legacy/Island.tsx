import { useEffect, useRef } from "react";
import type { Session } from "../app/state";

/*
 * The app still hosts a few server-rendered pieces of the classic interface
 * whose scripts carry years of fixes: above all the video player
 * (assets/src/js/lib/player, ~34k lines with its tests). They arrive as HTML
 * in a job's log (`rendertemplate`, services/job) and their scripts register
 * through window.av (assets/src/js/lib/av.js). This file stands in for the
 * classic page around them: the globals they read, the window.av registry
 * (lib/asyncView.js) and the async:<view>_destroy event that tells a view it
 * is going away.
 */

type Init = (this: Element) => unknown;
type Entry = { init: Init; destroy?: Init | null };

declare global {
  interface Window {
    av?: unknown;
    _CSRF?: string;
    _sessionID?: string;
    _domain?: string;
    _showAdult?: boolean;
    _umami?: unknown;
  }
}

const registry = new Map<string, Entry>();
const loaded = new Set<string>();

function viewName(src: string) {
  return new URL(src, location.href).pathname.replace(/\.js$/, "");
}

/** The view a target belongs to: its last script, as asyncView.js has it. */
function nameOf(target: Element) {
  const scripts = target.getElementsByTagName("script");
  const last = scripts[scripts.length - 1];
  return last?.src ? viewName(last.src) : null;
}

function start(target: Element, entry: Entry, name: string) {
  target.setAttribute("data-async-view", name);
  const host = target as Element & { reload?: () => Promise<void> };
  // a classic view may ask its layout to reload it; here nothing reloads
  host.reload ??= () => Promise.resolve();
  void entry.init.call(target);
}

let installed = false;

/** Sets up what the classic scripts expect of their page. Idempotent. */
export function installLegacy(session: Session) {
  window._CSRF = session.csrf;
  window._sessionID = session.sessionId;
  window._domain = session.domain;
  window._showAdult = session.showAdult;
  if (session.umami) window._umami = session.umami;
  if (installed) return;
  installed = true;
  window.av = {
    push([target, init, destroy]: [Element, Init, Init | null]) {
      const name = nameOf(target);
      if (!name || registry.has(name)) return;
      const entry = { init, destroy };
      registry.set(name, entry);
      start(target, entry, name);
    },
  };
  if (session.legacyCss && !document.querySelector("link[data-legacy-css]")) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = session.legacyCss;
    link.dataset.legacyCss = "";
    document.head.prepend(link);
  }
}

function runScripts(container: Element) {
  for (const old of Array.from(container.querySelectorAll("script"))) {
    const src = old.getAttribute("src");
    if (src) {
      const name = viewName(src);
      if (loaded.has(name)) {
        // the script ran for an earlier piece; start this one with it
        const entry = registry.get(name);
        if (entry && old.parentElement) start(old.parentElement, entry, name);
        continue;
      }
      loaded.add(name);
    }
    const script = document.createElement("script");
    for (const attribute of Array.from(old.attributes)) script.setAttribute(attribute.name, attribute.value);
    script.async = false;
    script.text = old.text;
    old.replaceWith(script);
  }
}

function stopViews(container: Element) {
  for (const el of Array.from(container.querySelectorAll("[data-async-view]"))) {
    const name = el.getAttribute("data-async-view")!;
    void registry.get(name)?.destroy?.call(el);
    dispatchEvent(new CustomEvent(`async:${name}_destroy`, { detail: { target: el } }));
  }
}

/**
 * Server-rendered markup with live scripts, kept out of React's way: React
 * owns the box, the classic code owns what is inside it.
 */
export function Island({
  html,
  session,
  className,
  hidden,
}: {
  html: string;
  session: Session;
  className?: string;
  hidden?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = box.current;
    if (!container) return;
    installLegacy(session);
    container.innerHTML = html;
    runScripts(container);
    return () => {
      stopViews(container);
      container.innerHTML = "";
    };
    // the session's tokens are read once, when the piece starts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html]);
  return <div ref={box} className={className} hidden={hidden} />;
}
