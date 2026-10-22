import { useEffect, useState } from "react";
import { Icon } from "../../../ui/Icon";
import { getLang, t } from "../lib/env.ts";
import { fetchReviews, type Review } from "../lib/reviewsClient.ts";
import { ExpandableText } from "./ExpandableText.tsx";

// useReviews — fetches TMDB reviews for the modal's title id. Returns
// null while loading, then the (possibly empty) array. Non-IMDB ids
// resolve to [] without a network call; the per-id cache lives in
// reviewsClient.
export function useReviews(videoId: string | null, videoType?: string) {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  useEffect(() => {
    let alive = true;
    setReviews(null);
    if (!videoId) {
      setReviews([]);
      return;
    }
    void fetchReviews(videoId, videoType).then((r) => {
      if (alive) setReviews(r);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);
  return reviews;
}

// ReviewsList — plain list of TMDB reviews, the content of the
// "Reviews (M)" tab in both the episodes and streams views.
export function ReviewsList({ reviews }: { reviews: Review[] | null }) {
  if (!reviews || reviews.length === 0) return null;
  return (
    <ul className="d-reviews">
      {reviews.map((r, i) => (
        <li key={r.url || i}>
          <div className="d-review-head">
            <strong>{r.author || t("discover.unknown")}</strong>
            {(r.rating ?? 0) > 0 && (
              <span className="d-rating">
                <Icon name="star" size={13} fill="currentColor" />
                {Number(r.rating).toFixed(0)}
              </span>
            )}
            {r.createdAt && <span className="d-review-date">{new Date(r.createdAt).toLocaleDateString(getLang())}</span>}
          </div>
          <ExpandableText text={r.content} lines={4} className="d-review-text" />
        </li>
      ))}
    </ul>
  );
}
