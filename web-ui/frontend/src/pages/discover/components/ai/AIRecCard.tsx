import type { MouseEvent } from "react";
import { t } from "../../lib/env.ts";
import type { AIItem } from "../../types.ts";
import { Poster, RatingBadge, WatchedBadge, WatchlistBadge } from "../ItemGrid.tsx";

// AIRecCard — the poster half of an AI recommendation. Title, year,
// rating, plot, and the generated reason live in the sibling text column
// rendered by AIRecsGrid.
//
// Clicking the poster triggers the parent onClick, which is wired to the
// regular stream modal flow (DiscoverApp.handleAICardClick). The marks are
// the same as on the catalogue's posters; they stop propagation so a click
// on them never opens the modal.
export function AIRecCard({
  item,
  onClick,
  watched,
  rating,
  inWatchlist,
  onToggleWatched,
  onRate,
  onToggleWatchlist,
}: {
  item: AIItem;
  onClick: (item: AIItem) => void;
  watched: boolean;
  rating: number;
  inWatchlist: boolean;
  onToggleWatched?: () => void;
  onRate?: () => void;
  onToggleWatchlist?: () => void;
}) {
  const stop = (fn?: () => void) => (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    fn?.();
  };
  return (
    <div className={watched ? "d-card-art watched" : "d-card-art"}>
      <button type="button" className="d-card-open" onClick={() => onClick(item)} aria-label={item.title || t("discover.unknown")}>
        <Poster src={item.poster} title={item.title} />
      </button>
      {onToggleWatched && <WatchedBadge watched={watched} onClick={stop(onToggleWatched)} />}
      {onRate && <RatingBadge rating={rating} onClick={stop(onRate)} />}
      {onToggleWatchlist && <WatchlistBadge inWatchlist={inWatchlist} onClick={stop(onToggleWatchlist)} />}
    </div>
  );
}
