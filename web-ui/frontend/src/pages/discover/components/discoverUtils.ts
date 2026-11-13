import { toast } from "../../../chrome/Toasts";
import type { StremioClient } from "../lib/client.ts";
import { getEnv, langPath, t } from "../lib/env.ts";
import { csrfHeaders } from "../lib/http.ts";
import type { UserStatus } from "../types.ts";
import { buildAddons, buildCatalogs, getTypes } from "./discoverReducer.ts";
import { isOwnEntry, type DiscoverUrl } from "./useDiscoverUrl.ts";

// reviewsTab reads the stream-modal tab from the ?tab= URL param —
// 'reviews' or undefined (= primary tab). Single point of truth for the
// param's shape; used by modal seeding (loadStreams / cardClick) and the
// popstate handler in DiscoverApp.
export function reviewsTab(params?: URLSearchParams): "reviews" | undefined {
  const p = params || new URLSearchParams(window.location.search);
  return p.get("tab") === "reviews" ? "reviews" : undefined;
}

// Dedup: modal restore logic used in two effects
export function restoreModalFromUrl(
  id: string,
  url: DiscoverUrl,
  openModalById: (id: string) => void,
  modalEpisodeRef: { current: { season: string; episode: string } | null },
) {
  if (modalEpisodeRef.current) {
    if (isOwnEntry()) {
      url.withPopstate(() => openModalById(id));
    } else {
      url.replace({ id, season: null, episode: null });
      openModalById(id);
    }
  } else {
    url.withPopstate(() => openModalById(id));
  }
}

// Dedup: manifest loading shared between init and retry. Returns the full
// per-addon status list so the UI can show health (chip + disabled
// catalogs) alongside the catalog list itself.
export async function loadManifests(client: StremioClient) {
  const addonStatuses = await client.fetchAllManifests();
  const catalogs = buildCatalogs(addonStatuses);
  const types = getTypes(catalogs);
  const addons = buildAddons(addonStatuses);
  // manifests kept for anything still reading the old shape (filtered to
  // entries with a manifest, ignoring health).
  const manifests = addonStatuses
    .filter((a) => a.manifest)
    .map((a) => ({ baseUrl: a.baseUrl, manifest: a.manifest! }));
  return { manifests, catalogs, types, addons };
}

// Generic API POST wrapper for the library endpoints, which answer JSON
// when asked with Accept: application/json:
//   { status: "success"|"error", message?: string, ... }
// The toast is shown from the server-provided message.
async function apiPost(url: string, body?: URLSearchParams): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "X-CSRF-TOKEN": getEnv().csrf,
        "X-Return-Url": window.location.pathname + window.location.search,
      },
      body,
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status === "success" && data.message) {
      toast(data.message);
    } else if (data.status === "error") {
      toast(data.message || t("discover.somethingWrong"), "error");
      return null;
    }
    return data;
  } catch {
    toast(t("discover.networkError"), "error");
    return null;
  }
}

export async function toggleWatched(videoID: string, type: string, currentlyWatched: boolean) {
  const action = currentlyWatched ? "unmark" : "mark";
  const data = await apiPost(langPath(`/library/${type}/${videoID}/${action}`));
  if (!data) return null;
  return { watched: !currentlyWatched, rateForm: !!data["rate-form"] };
}

export async function rateVideo(videoID: string, type: string, rating: number) {
  const body = new URLSearchParams();
  body.set("rating", String(rating));
  const data = await apiPost(langPath(`/library/${type}/${videoID}/rate`), body);
  return !!data;
}

export async function unrateVideo(videoID: string, type: string) {
  const data = await apiPost(langPath(`/library/${type}/${videoID}/unrate`));
  return !!data;
}

// Fetches user statuses (watched + rating) for IMDB ids in one request.
// Returns { "tt123": { watched: true, rating: 7 }, ... }. Filters out
// non-IMDB ids (episodes carry ':'). On failure returns an empty object —
// a failed marker query must never block discover rendering.
export async function fetchUserStatuses(ids: string[]): Promise<Record<string, UserStatus>> {
  const titleIds = (ids || []).filter((id) => typeof id === "string" && id.startsWith("tt") && !id.includes(":"));
  if (titleIds.length === 0) return {};
  try {
    const res = await fetch(langPath("/library/status"), {
      method: "POST",
      headers: csrfHeaders(),
      body: JSON.stringify({ ids: titleIds }),
    });
    if (!res.ok) return {};
    const data = await res.json();
    return data.statuses || {};
  } catch {
    return {};
  }
}
