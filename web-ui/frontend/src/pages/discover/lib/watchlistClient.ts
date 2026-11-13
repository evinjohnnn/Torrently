// Wire-format wrappers for /discover/watchlist/*. The handler is JSON-only;
// these helpers handle CSRF, error normalisation, and shape conversion so
// the reducer + DiscoverApp don't have to know about the HTTP layer.
//
// Item shape returned by GET /discover/watchlist comes back as
//   { video_id, type, title, year, poster_url, rating, source, created_at }
// which we adapt into the Cinemeta-flavoured shape ItemGrid expects:
//   { id, type, name, year, poster, imdbRating }
// so the same grid component renders both modes (catalogs / watchlist) with
// no source-of-truth branching.

import type { Item } from "../types.ts";
import { langPath } from "./env.ts";
import { csrfHeaders } from "./http.ts";
import type { Result } from "./subscriptionsClient.ts";

interface Row {
  video_id: string;
  type: string;
  title: string;
  year?: number;
  poster_url?: string;
  rating?: number | null;
}

function adaptItem(row: Row): Item {
  return {
    id: row.video_id,
    type: row.type,
    name: row.title,
    year: row.year || undefined,
    poster: row.poster_url || `/lib/${row.type}/poster/${row.video_id}/500.jpg`,
    imdbRating: row.rating != null ? row.rating : undefined,
  };
}

// fetchWatchlistIds is a cheap prefetch for the bookmark-badge highlight in
// catalog/search/AI grids. It returns just the ids — we don't need metadata
// to draw the filled icon.
export async function fetchWatchlistIds(): Promise<{ ids: string[]; limit: number }> {
  try {
    const res = await fetch(langPath("/discover/watchlist/ids"), {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { ids: [], limit: -1 };
    const data = await res.json();
    return { ids: data.video_ids || [], limit: data.limit ?? -1 };
  } catch {
    return { ids: [], limit: -1 };
  }
}

// fetchWatchlist returns the full grid: items in Cinemeta shape, plus the
// id list (for the highlight Set in non-filter mode) and the soft-cap limit.
export async function fetchWatchlist(): Promise<{ items: Item[]; ids: string[]; limit: number }> {
  try {
    const res = await fetch(langPath("/discover/watchlist"), {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { items: [], ids: [], limit: -1 };
    const data = await res.json();
    const items = ((data.items || []) as Row[]).map(adaptItem);
    return { items, ids: data.video_ids || [], limit: data.limit ?? -1 };
  } catch {
    return { items: [], ids: [], limit: -1 };
  }
}

// addToWatchlist returns:
//   { ok: true, added: bool, message } — server accepted; message is the
//                                        server-localised toast string
//                                        (empty when added=false on conflict)
//   { ok: false, code, message, limit? } — server-localised error
//
// Error message ALWAYS comes from the server so the toast stays in the
// current i18n locale — same convention as toggleWatched / rateVideo (see
// apiPost in discoverUtils).
export async function addToWatchlist(videoId: string, type: string, source: string): Promise<Result> {
  try {
    const res = await fetch(langPath("/discover/watchlist"), {
      method: "POST",
      headers: csrfHeaders(),
      body: JSON.stringify({ video_id: videoId, type, source: source || "other" }),
    });
    let body: { added?: boolean; message?: string; code?: string; limit?: number } = {};
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    if (res.ok) {
      return { ok: true, added: !!body.added, message: body.message || "" };
    }
    return {
      ok: false,
      code: body.code || `http_${res.status}`,
      message: body.message || "",
      limit: body.limit,
    };
  } catch {
    return { ok: false, code: "network", message: "" };
  }
}

export async function removeFromWatchlist(videoId: string, type: string): Promise<Result> {
  try {
    const res = await fetch(langPath(`/discover/watchlist/${type}/${encodeURIComponent(videoId)}`), {
      method: "DELETE",
      headers: csrfHeaders(),
    });
    let body: { message?: string; code?: string } = {};
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    if (res.ok) return { ok: true, message: body.message || "" };
    return { ok: false, code: body.code || `http_${res.status}`, message: body.message || "" };
  } catch {
    return { ok: false, code: "network", message: "" };
  }
}
