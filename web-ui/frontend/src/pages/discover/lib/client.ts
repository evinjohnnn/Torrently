// Stremio addon API client with caching, abort support, and timeouts.
//
// Manifest fetch is special: failures don't drop the addon from the list,
// they get reported with a status so the UI can show "addon unavailable"
// while still rendering the addon's last-known catalogs (from
// manifestCache) as disabled options. See manifestCache.ts.

import type { AddonHealth, AddonSeed, AddonStatus, Item, Manifest, Meta, Stream } from "../types.ts";
import { isSnapshotStale, refreshSnapshot } from "./addonsApi.ts";
import { getLang } from "./env.ts";
import * as manifestCache from "./manifestCache.ts";

const FETCH_TIMEOUT = 10000;
const CACHE_MAX = 100;

function fetchWithTimeout(url: string, signal?: AbortSignal, timeout = FETCH_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // If an external signal is provided, forward its abort
  if (signal) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  const headers = { "Accept-Language": getLang() };

  return fetch(url, { signal: controller.signal, headers }).finally(() => clearTimeout(timeoutId));
}

class LRUCache<V> {
  private map = new Map<string, V>();
  private max: number;
  constructor(max = CACHE_MAX) {
    this.max = max;
  }

  get(key: string): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key)!;
    // Move to end (most recently used)
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: string, value: V) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.max) {
      // Delete oldest entry
      const first = this.map.keys().next().value;
      if (first !== undefined) this.map.delete(first);
    }
  }
}

export const CINEMETA_BASE = "https://v3-cinemeta.strem.io";

class ManifestError extends Error {
  kind: AddonHealth;
  constructor(message: string, kind: AddonHealth) {
    super(message);
    this.kind = kind;
  }
}

// Map an HTTP status / fetch error into one of the two failure buckets we
// surface to the user. 4xx (except 408/429) means the addon is responding
// but rejecting our request — likely a stale URL or revoked auth — so the
// fix is in the user's profile. Everything else (network, timeout, 5xx,
// malformed JSON) is treated as a temporary outage.
function classifyError(httpStatus: number): AddonHealth {
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 404) {
    return "misconfigured";
  }
  return "unreachable";
}

function serves(manifest: Manifest, resource: string) {
  return (manifest.resources || []).some(
    (r) => (typeof r === "string" && r === resource) || (r && typeof r === "object" && r.name === resource),
  );
}

export interface SearchCatalog {
  id: string;
  type: string;
  name: string;
  addonName: string;
  baseUrl: string;
}

export type StreamAddon = AddonStatus & { manifest: Manifest };

export class StremioClient {
  addonUrls: string[];
  cache = new LRUCache<unknown>();
  // addonStatuses is the source of truth for per-addon health, see
  // fetchAllManifests below.
  addonStatuses: AddonStatus[] | null = null;
  seedsByUrl = new Map<string, AddonSeed>();

  // addonSeeds is the per-addon snapshot the server puts in the page's
  // data. Each seed: { id, url, name, manifestId, version, resources,
  // types, fetchedAt }. Used as a fallback for the addon's human-readable
  // name + capabilities when its manifest is currently unreachable AND we
  // have no localStorage cache (e.g. new browser / private window). The
  // lazy refresh below pings the server when a fresh manifest arrives and
  // the seed is missing or stale.
  constructor(addonUrls: string[], addonSeeds: AddonSeed[] = []) {
    this.addonUrls = addonUrls.map((u) => u.replace(/\/manifest\.json$/, ""));
    for (const s of addonSeeds || []) {
      const baseUrl = (s.url || "").replace(/\/manifest\.json$/, "");
      if (baseUrl) this.seedsByUrl.set(baseUrl, s);
    }
    manifestCache.prune(this.addonUrls);
  }

  // Build a synthetic manifest from a server seed so the UI can render
  // a name + capabilities for an addon whose live manifest fetch just
  // failed. Catalogs are intentionally absent — we never persist them
  // server-side because addons mutate their catalog list far more
  // often than name/version/resources.
  seedToManifest(seed: AddonSeed | undefined): Manifest | null {
    if (!seed) return null;
    return {
      id: seed.manifestId || "",
      name: seed.name || "",
      version: seed.version || "",
      resources: seed.resources || [],
      types: seed.types || [],
      catalogs: [],
    };
  }

  // Drops the known manifests so the next fetchAllManifests starts over
  // (retry, wizard).
  resetManifests() {
    this.addonStatuses = null;
  }

  async fetchManifest(baseUrl: string): Promise<Manifest> {
    const url = `${baseUrl}/manifest.json`;
    let res: Response;
    try {
      res = await fetchWithTimeout(url);
    } catch {
      throw new ManifestError(`Failed to reach ${url}`, "unreachable");
    }
    if (!res.ok) {
      throw new ManifestError(`Manifest fetch returned ${res.status} for ${url}`, classifyError(res.status));
    }
    try {
      return await res.json();
    } catch {
      throw new ManifestError(`Malformed manifest at ${url}`, "unreachable");
    }
  }

  // Returns full per-addon status, never silently filters failures.
  // Fallback chain on fetch failure: localStorage cache → server seed
  // (whatever the server captured at add-time) → null. On success,
  // also fires off a lazy backfill request so the server-side snapshot
  // catches up if it's missing or older than 7 days.
  async fetchAllManifests(): Promise<AddonStatus[]> {
    const tasks = this.addonUrls.map(async (url): Promise<AddonStatus> => {
      const seed = this.seedsByUrl.get(url);
      try {
        const manifest = await this.fetchManifest(url);
        manifestCache.write(url, manifest);
        // Lazy backfill — server captures snapshots at add-time,
        // but old rows from before migration #52 carry NULLs and
        // long-lived addons may have evolved their manifest. We
        // ping the server to update on any successful client-side
        // fetch when its copy looks stale. Fire-and-forget.
        if (seed?.id && isSnapshotStale(seed.fetchedAt)) {
          void refreshSnapshot(seed.id);
        }
        return { baseUrl: url, manifest, status: "ok", source: "fresh" };
      } catch (e) {
        const err = e as ManifestError;
        const cached = manifestCache.read(url);
        const status = err?.kind || "unreachable";
        if (cached) {
          return {
            baseUrl: url,
            manifest: cached.manifest,
            status,
            source: "cache",
            error: err?.message,
            lastSuccessAt: cached.lastSuccessAt,
          };
        }
        if (seed) {
          const seedManifest = this.seedToManifest(seed);
          if (seedManifest) {
            const lastSuccessAt = seed.fetchedAt ? Date.parse(seed.fetchedAt) : null;
            return { baseUrl: url, manifest: seedManifest, status, source: "seed", error: err?.message, lastSuccessAt };
          }
        }
        return { baseUrl: url, manifest: null, status, source: null, error: err?.message };
      }
    });
    const results = await Promise.all(tasks);
    this.addonStatuses = results;
    return results;
  }

  async fetchCatalog(
    baseUrl: string,
    type: string,
    catalogId: string,
    skip = 0,
    { signal }: { signal?: AbortSignal } = {},
  ): Promise<{ metas?: Item[] }> {
    const cacheKey = `${baseUrl}/${type}/${catalogId}/${skip}`;
    const cached = this.cache.get(cacheKey) as { metas?: Item[] } | undefined;
    if (cached) return cached;

    const url = `${baseUrl}/catalog/${type}/${catalogId}${skip > 0 ? `/skip=${skip}` : ""}.json`;
    const res = await fetchWithTimeout(url, signal);
    if (!res.ok) throw new Error("Failed to fetch catalog");
    const data = await res.json();
    this.cache.set(cacheKey, data);
    return data;
  }

  async fetchMeta(type: string, id: string, { signal }: { signal?: AbortSignal } = {}): Promise<Meta | null> {
    // Cache only confirmed hits (meta with videos[]). A meta-without-
    // videos response can be transient — caching it would freeze a
    // series out of the calendar until the page reloads, even after
    // Cinemeta recovers.
    const cacheKey = `meta:${type}:${id}`;
    const cached = this.cache.get(cacheKey) as Meta | undefined;
    if (cached !== undefined) return cached;

    let result: Meta | null = null;

    try {
      const url = `${CINEMETA_BASE}/meta/${type}/${id}.json`;
      const res = await fetchWithTimeout(url, signal);
      if (res.ok) {
        const data = await res.json();
        if (data.meta?.videos?.length > 0) {
          this.cache.set(cacheKey, data.meta);
          return data.meta;
        }
        if (data.meta) result = data.meta;
      }
    } catch {
      /* fall through to user addons */
    }

    // Fall back to user's meta-capable addons (status='ok' only — no
    // point hammering an addon we already know is unreachable).
    const metaAddons = this.okAddons().filter((m) => serves(m.manifest, "meta"));

    const results = await Promise.allSettled(
      metaAddons.map(async (addon) => {
        const url = `${addon.baseUrl}/meta/${type}/${id}.json`;
        const res = await fetchWithTimeout(url, signal);
        if (!res.ok) throw new Error("Failed to fetch meta");
        const data = await res.json();
        return (data.meta || null) as Meta | null;
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value?.videos?.length) {
        this.cache.set(cacheKey, r.value);
        return r.value;
      }
    }
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) return r.value;
    }
    return result;
  }

  private okAddons(): StreamAddon[] {
    return (this.addonStatuses || []).filter((a): a is StreamAddon => a.status === "ok" && !!a.manifest);
  }

  getSearchCatalogs(): SearchCatalog[] {
    const catalogs: SearchCatalog[] = [];
    for (const m of this.okAddons()) {
      for (const cat of m.manifest.catalogs || []) {
        const hasSearch = cat.extraSupported?.includes("search") || cat.extra?.some((e) => e.name === "search");
        if (hasSearch) {
          catalogs.push({
            id: cat.id,
            type: cat.type,
            name: cat.name || cat.id,
            addonName: m.manifest.name || "Unknown",
            baseUrl: m.baseUrl,
          });
        }
      }
    }
    return catalogs;
  }

  async searchCatalog(
    baseUrl: string,
    type: string,
    catalogId: string,
    query: string,
    { signal }: { signal?: AbortSignal } = {},
  ): Promise<Item[]> {
    const url = `${baseUrl}/catalog/${type}/${catalogId}/search=${encodeURIComponent(query)}.json`;
    const res = await fetchWithTimeout(url, signal, 8000);
    if (!res.ok) throw new Error("Search failed");
    const data = await res.json();
    return data.metas || [];
  }

  getStreamAddons(): StreamAddon[] {
    return this.okAddons().filter((m) => serves(m.manifest, "stream"));
  }

  async fetchStreamFromAddon(
    addon: StreamAddon,
    type: string,
    id: string,
    { signal }: { signal?: AbortSignal } = {},
  ): Promise<Stream[]> {
    const url = `${addon.baseUrl}/stream/${type}/${id}.json`;
    const res = await fetchWithTimeout(url, signal);
    if (!res.ok) throw new Error("Failed to fetch streams");
    const data = await res.json();
    return ((data.streams || []) as Stream[]).map((s) => ({
      ...s,
      addonName: addon.manifest.name || "Unknown",
    }));
  }

  async fetchStreams(type: string, id: string, { signal }: { signal?: AbortSignal } = {}): Promise<Stream[]> {
    const streamAddons = this.getStreamAddons();

    const results = await Promise.allSettled(
      streamAddons.map((addon) => this.fetchStreamFromAddon(addon, type, id, { signal })),
    );

    const streams: Stream[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") streams.push(...r.value);
    }
    return streams;
  }
}

/** Whether an addon's manifest says it serves streams (or is unknown). */
export function mayServeStreams(manifest: Manifest | null) {
  return !manifest || serves(manifest, "stream");
}
