// What the old Preact app read from window globals (_CSRF, <html lang>,
// _indexers, _streamPrefs, _aiEnabled, _passthrough) and from its own i18n
// instance, in one place the page fills from its state (Discover.tsx). Kept
// free of React and of the app's i18n module so the plain modules next to
// it run under `node --test` as they are.

import type { IndexerSeed, StreamPrefsSeed } from "../types.ts";

export interface Env {
  csrf: string;
  sessionId: string;
  lang: string;
  indexers: IndexerSeed[];
  streamPrefs: StreamPrefsSeed;
  aiEnabled: boolean;
  passthrough: { hevc: string };
  /** the page's translator (useI18n().t) */
  t: (key: string) => string;
}

let env: Env = {
  csrf: "",
  sessionId: "",
  lang: "en",
  indexers: [],
  streamPrefs: { resolutions: [], language: "" },
  aiEnabled: false,
  passthrough: { hevc: "unknown" },
  t: (key) => key,
};

export function setEnv(patch: Partial<Env>) {
  env = { ...env, ...patch };
}

export function getEnv(): Env {
  return env;
}

export function getLang() {
  return env.lang;
}

/** Prefixes a path with the language, as the server's langPath does. */
export function langPath(path: string) {
  if (env.lang === "en") return path;
  if (path === "/") return `/${env.lang}`;
  return `/${env.lang}${path}`;
}

/** Plain text; a missing key comes back as the key. */
export function t(key: string) {
  return env.t(key) || key;
}

/** The old client's format: each %v in turn takes the next argument. */
export function tf(key: string, ...args: (string | number)[]) {
  let message = t(key);
  for (const arg of args) message = message.replace("%v", String(arg));
  return message;
}

type Umami = { track: (event: string, data?: Record<string, unknown>) => void };

/** Umami, where the page loaded it; every event is best-effort. */
export function track(event: string, data?: Record<string, unknown>) {
  try {
    const umami = (globalThis as { umami?: Umami }).umami;
    if (umami && typeof umami.track === "function") {
      if (data === undefined) umami.track(event);
      else umami.track(event, data);
    }
  } catch {
    /* an event that cannot be sent is not a reason to break the page */
  }
}
