// Wire wrapper for POST /discover/reviews — fetches TMDB user reviews
// for the title open in the stream modal. Single-id endpoint (no grid
// batching: only the modal needs reviews).
//
// Module-level cache holds one verdict per IMDB id for the page
// lifetime: an array of reviews (possibly empty = server checked, none
// exist). Non-OK responses and network failures are NOT cached — the
// next modal open retries instead of pinning a transient TMDB failure
// as "no reviews" for the session.

import { langPath } from "./env.ts";
import { csrfHeaders } from "./http.ts";
import { bareImdbTitleID } from "./ids.ts";

export interface Review {
  author?: string;
  rating?: number;
  content?: string;
  url?: string;
  createdAt?: string;
}

const cache = new Map<string, Review[]>();
const pending = new Map<string, Promise<Review[]>>();

// fetchReviews resolves to an array of {author, rating, content, url,
// createdAt}. Resolves to [] for non-reviewable ids and on failure (the
// section just doesn't render); concurrent calls for the same id share
// one request.
export async function fetchReviews(id: string, type?: string): Promise<Review[]> {
  if (!bareImdbTitleID(id)) return [];
  const hit = cache.get(id);
  if (hit) return hit;
  const inFlight = pending.get(id);
  if (inFlight) return inFlight;

  const p = (async () => {
    try {
      const res = await fetch(langPath("/discover/reviews"), {
        method: "POST",
        headers: csrfHeaders(),
        body: JSON.stringify({ id, type: type === "series" ? "series" : "movie" }),
      });
      if (!res.ok) return []; // transient — leave uncached for retry
      const data = await res.json();
      const reviews: Review[] = Array.isArray(data.reviews) ? data.reviews : [];
      cache.set(id, reviews);
      return reviews;
    } catch {
      return [];
    } finally {
      pending.delete(id);
    }
  })();
  pending.set(id, p);
  return p;
}
