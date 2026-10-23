// AI recommendations API client for the /discover/ai/* routes served by
// handlers/discover_ai.
//
// Responsibilities
// - Build the request payload with the browser's local clock (the server
//   is UTC and cannot guess the user's time zone).
// - Parse JSON responses and expose a single typed error shape to callers.
// - Open SSE streams for the streaming recommend / refine endpoints.
//
// The server-side error contract for the JSON endpoints is:
//   200 OK                → parsed JSON body
//   400 Bad Request       → { code, message }
//   402 Payment Required  → { code: "quota_exceeded", tier }
//   404 Not Found         → { code: "disabled" }         ← feature flag off
//   500 Internal          → { code: "internal", message }
//
// Streaming endpoints emit SSE frames with named events: phase, item,
// done, error. See openAIStream below.

import type { AIChip, AIItem } from "../types.ts";
import { getEnv, getLang } from "./env.ts";

const AI_TIMEOUT_MS = 60000; // chips fetch — the model can take 20-30s on cold cache

// AIError is thrown for any non-2xx response so callers branch on `err.code`
// instead of parsing English messages. Network/abort errors surface as the
// native fetch error.
//
// dailyQuota / resetAt / upgradeQuota are populated for the quota_exceeded
// code (both via the JSON envelope and via the SSE error event) so the
// UI can render the full upgrade hint without a separate lookup:
//   - dailyQuota   — current tier's daily cap, for the "0 / N" headline
//   - resetAt      — unix-seconds the cap resets, for "resets in 10h 30m"
//   - upgradeQuota — paid tier's daily cap, only present for free users
export class AIError extends Error {
  status: number;
  code: string;
  tier?: string;
  dailyQuota?: number;
  resetAt?: number;
  upgradeQuota?: number;
  constructor(
    status: number,
    code?: string,
    message?: string,
    tier?: string,
    dailyQuota?: number,
    resetAt?: number,
    upgradeQuota?: number,
  ) {
    super(message || code || "ai error");
    this.name = "AIError";
    this.status = status;
    this.code = code || "unknown";
    this.tier = tier;
    this.dailyQuota = dailyQuota;
    this.resetAt = resetAt;
    this.upgradeQuota = upgradeQuota;
  }
}

// currentClock returns the browser's local day-of-week + hour, matching the
// Go server's ClientClock contract. Uses Intl for the weekday so we don't
// ship a locale map just for this one string.
export function currentClock() {
  const now = new Date();
  const day = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(now);
  return { day, hour: now.getHours() };
}

// currentLocale is the page's language: the server only renders languages
// it supports (services/i18n), which is the set normalizeLocale in
// services/recommendations/context.go accepts.
export function currentLocale() {
  return getLang() || "en";
}

interface ErrorBody {
  code?: string;
  message?: string;
  tier?: string;
  daily_quota?: number;
  reset_at?: number;
  upgrade_quota?: number;
}

async function parseError(resp: Response): Promise<never> {
  let body: ErrorBody = {};
  try {
    body = await resp.json();
  } catch {
    /* non-JSON body */
  }
  throw new AIError(resp.status, body.code, body.message, body.tier, body.daily_quota, body.reset_at, body.upgrade_quota);
}

function withTimeout(signal: AbortSignal | undefined, ms: number) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error("ai request timeout")), ms);
  if (signal) {
    if (signal.aborted) ac.abort(signal.reason);
    else signal.addEventListener("abort", () => ac.abort(signal.reason), { once: true });
  }
  return {
    signal: ac.signal,
    cancel: () => clearTimeout(timer),
  };
}

// fetchChips — GET /discover/ai/chips.
// Does not consume quota; the server reads from its distributed cache.
export async function fetchChips({ signal }: { signal?: AbortSignal } = {}) {
  const { day, hour } = currentClock();
  const locale = currentLocale();
  const params = new URLSearchParams({ day, hour: String(hour), locale });
  const t = withTimeout(signal, AI_TIMEOUT_MS);
  try {
    const resp = await fetch(`/discover/ai/chips?${params.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: t.signal,
    });
    if (!resp.ok) await parseError(resp);
    return await resp.json();
  } finally {
    t.cancel();
  }
}

// refreshChips — POST /discover/ai/chips/refresh.
// Explicit user action; consumes 1 quota unit.
export async function refreshChips({ signal }: { signal?: AbortSignal } = {}) {
  const body = { locale: currentLocale(), clock: currentClock() };
  const t = withTimeout(signal, AI_TIMEOUT_MS);
  try {
    const resp = await fetch("/discover/ai/chips/refresh", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-CSRF-TOKEN": getEnv().csrf,
      },
      body: JSON.stringify(body),
      signal: t.signal,
    });
    if (!resp.ok) await parseError(resp);
    return await resp.json();
  } finally {
    t.cancel();
  }
}

// HISTORY_TURNS_CAP is how many of the most recent conversation turns we
// forward to /refine/stream. We cap it on the client because the request
// rides in the URL (EventSource is GET-only) and a 5-refine conversation
// can otherwise grow to several KB of URL-encoded JSON. Four turns ≈
// 1.5KB encoded, well under any sane proxy limit.
const HISTORY_TURNS_CAP = 4;

export interface Turn {
  role: "user" | "assistant";
  content: string;
}

export interface StreamDone {
  total?: number;
  remaining_quota?: number;
  daily_quota?: number;
  tier?: string;
}

export interface StreamCallbacks {
  onPhase?: (data: { phase: string; expected?: number }) => void;
  onItem?: (item: AIItem) => void;
  onDone?: (data: StreamDone) => void;
  onError?: (err: AIError) => void;
}

// recommendStream / refineStream are the SSE-emitting variants of the
// recommend/refine endpoints. They use the browser's native EventSource
// (GET-only) so we don't need a custom fetch+ReadableStream parser, but
// that does mean every request parameter has to live in the query string
// and the CSRF token rides as a query param too.
//
// callbacks shape:
//   onPhase({phase, expected})  — "claude" | "resolving" | "done"
//   onItem(recommendation)      — single resolved card
//   onDone({total, remaining_quota, tier}) — terminal success
//   onError(AIError)            — terminal failure
// Returns a {close()} handle so callers can abort on unmount.
function buildStreamURL(path: string, { query, history }: { query: string; history?: Turn[] }) {
  const { day, hour } = currentClock();
  const locale = currentLocale();
  const params = new URLSearchParams({
    query: String(query || "").trim(),
    locale,
    day,
    hour: String(hour),
    _csrf: getEnv().csrf || "",
  });
  if (Array.isArray(history) && history.length > 0) {
    const trimmed = history.slice(-HISTORY_TURNS_CAP);
    params.set("history", JSON.stringify(trimmed));
  }
  return `${path}?${params.toString()}`;
}

function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function streamError(source: EventSource, closed: boolean, e: Event): AIError | null {
  // Two distinct error sources collapse into this handler:
  //  1. A named "error" SSE event sent by the backend (with payload)
  //  2. A transport-level error (network drop / EOF) where e.data
  //     is undefined and source.readyState === CLOSED.
  // Discriminate by checking for payload first.
  const raw = (e as MessageEvent).data;
  if (raw) {
    const data = safeParse<ErrorBody>(raw) || {};
    return new AIError(0, data.code, data.code, data.tier, data.daily_quota, data.reset_at, data.upgrade_quota);
  }
  if (source.readyState === EventSource.CLOSED && !closed) {
    return new AIError(0, "connection_lost", "lost connection to server");
  }
  return null;
}

function openAIStream(url: string, { onPhase, onItem, onDone, onError }: StreamCallbacks) {
  const source = new EventSource(url, { withCredentials: true });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    source.close();
  };

  source.addEventListener("phase", (e) => {
    const data = safeParse<{ phase: string; expected?: number }>((e as MessageEvent).data);
    if (data && onPhase) onPhase(data);
  });
  source.addEventListener("item", (e) => {
    const data = safeParse<AIItem>((e as MessageEvent).data);
    if (data && onItem) onItem(data);
  });
  source.addEventListener("done", (e) => {
    const data = safeParse<StreamDone>((e as MessageEvent).data) || {};
    if (onDone) onDone(data);
    close();
  });
  source.addEventListener("error", (e) => {
    const err = streamError(source, closed, e);
    if (err && onError) onError(err);
    close();
  });

  return { close };
}

export function recommendStream(query: string, callbacks: StreamCallbacks) {
  const url = buildStreamURL("/discover/ai/recommend/stream", { query });
  return openAIStream(url, callbacks);
}

export interface ChipsCallbacks {
  onChip?: (chip: AIChip) => void;
  onDone?: (data: StreamDone) => void;
  onError?: (err: AIError) => void;
}

// chipsStream — open an SSE connection to /discover/ai/chips/stream. The
// server emits `chip` events as each chip is produced (model stream) or
// replayed (cache hit / cold-start), then a terminal `done` or `error`.
//
// options.force=true triggers a quota-consuming refresh: the server busts
// the chips cache for this user, charges one daily-quota unit, and streams
// freshly-generated chips. Used by the manual refresh button so its TTFT
// flows through exactly the same path as the initial load.
//
// Returns a {close()} handle so callers can abort on unmount.
export function chipsStream(callbacks: ChipsCallbacks, options: { force?: boolean } = {}) {
  const { day, hour } = currentClock();
  const locale = currentLocale();
  const params = new URLSearchParams({
    locale,
    day,
    hour: String(hour),
    _csrf: getEnv().csrf || "",
  });
  if (options.force) params.set("force", "1");
  const url = `/discover/ai/chips/stream?${params.toString()}`;
  const source = new EventSource(url, { withCredentials: true });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    source.close();
  };

  source.addEventListener("chip", (e) => {
    const data = safeParse<AIChip>((e as MessageEvent).data);
    if (data && callbacks.onChip) callbacks.onChip(data);
  });
  source.addEventListener("done", (e) => {
    const data = safeParse<StreamDone>((e as MessageEvent).data) || {};
    if (callbacks.onDone) callbacks.onDone(data);
    close();
  });
  source.addEventListener("error", (e) => {
    const err = streamError(source, closed, e);
    if (err && callbacks.onError) callbacks.onError(err);
    close();
  });

  return { close };
}

export function refineStream(query: string, history: Turn[], callbacks: StreamCallbacks) {
  const url = buildStreamURL("/discover/ai/refine/stream", { query, history });
  return openAIStream(url, callbacks);
}
