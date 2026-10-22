import { useState, type MouseEvent } from "react";
import { Icon } from "../../../ui/Icon";
import { t } from "../lib/env.ts";
import type { Item, UserStatus } from "../types.ts";

/** The poster's own rating: ★ 7.6 (Cinemeta's 0-10 scale). */
export function StarRating({ rating }: { rating?: string | number }) {
  const r = parseFloat(String(rating ?? ""));
  if (!r || r <= 0) return null;
  return (
    <span className="d-rating">
      <Icon name="star" size={13} fill="currentColor" />
      {r.toFixed(1)}
    </span>
  );
}

type Click = (event: MouseEvent) => void;

// The three marks over a poster: watched (top right), your rating (top
// left) and the watchlist heart (bottom right). Set marks always show;
// unset ones appear on hover or focus, and always on touch screens. The
// heart stays visible as a constant invitation.

export function WatchedBadge({ watched, onClick }: { watched: boolean; onClick: Click }) {
  const label = watched ? t("discover.unmarkWatched") : t("discover.markWatched");
  return (
    <button
      type="button"
      onClick={onClick}
      className={watched ? "mark mark-tr set olive" : "mark mark-tr"}
      title={label}
      aria-label={label}
      aria-pressed={watched}
    >
      <span className="mark-dot">
        <Icon name={watched ? "check" : "eye"} size={16} strokeWidth={watched ? 2.4 : 1.8} />
      </span>
    </button>
  );
}

export function RatingBadge({ rating, onClick }: { rating: number; onClick: Click }) {
  const label = rating > 0 ? t("discover.changeRating") : t("discover.rate");
  return (
    <button
      type="button"
      onClick={onClick}
      className={rating > 0 ? "mark mark-tl set honey" : "mark mark-tl"}
      title={label}
      aria-label={rating > 0 ? `${label}: ${rating}` : label}
    >
      <span className="mark-dot">
        <Icon name="star" size={15} fill={rating > 0 ? "currentColor" : "none"} />
        {rating > 0 && <span className="mark-num">{rating}</span>}
      </span>
    </button>
  );
}

export function WatchlistBadge({ inWatchlist, onClick }: { inWatchlist: boolean; onClick: Click }) {
  const label = inWatchlist ? t("discover.removeFromWatchlist") : t("discover.addToWatchlist");
  return (
    <button
      type="button"
      onClick={onClick}
      className={inWatchlist ? "mark mark-br set olive always" : "mark mark-br always"}
      title={label}
      aria-label={label}
      aria-pressed={inWatchlist}
    >
      <span className="mark-dot">
        <Icon name="heart" size={16} fill={inWatchlist ? "currentColor" : "none"} />
      </span>
    </button>
  );
}

/** A poster, or the title on paper where there is none. */
export function Poster({ src, title, className = "" }: { src?: string; title?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={`d-poster ${className}`}>
      <span className="poster-fallback">{title || t("discover.unknown")}</span>
      {src && !failed && <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />}
    </span>
  );
}

export function ItemGrid({
  items,
  showBadges,
  userStatuses,
  watchlistIds,
  onClick,
  onToggleWatched,
  onRate,
  onToggleWatchlist,
}: {
  items: Item[];
  showBadges: boolean;
  userStatuses: Record<string, UserStatus>;
  watchlistIds: Set<string>;
  onClick: (item: Item) => void;
  onToggleWatched: (item: Item) => void;
  onRate: (item: Item) => void;
  onToggleWatchlist?: (item: Item) => void;
}) {
  if (!items.length) return null;
  return (
    <ul className="d-grid">
      {items.map((item) => {
        const status = userStatuses[item.id];
        return (
          <ItemCard
            key={item.id}
            item={item}
            showBadge={showBadges}
            watched={status ? !!status.watched : false}
            rating={status ? status.rating || 0 : 0}
            inWatchlist={watchlistIds.has(item.id)}
            onClick={onClick}
            onToggleWatched={onToggleWatched}
            onRate={onRate}
            onToggleWatchlist={onToggleWatchlist}
          />
        );
      })}
    </ul>
  );
}

function typeWord(type: string) {
  const key = `discover.type.${type.toLowerCase()}`;
  const translated = t(key);
  return translated !== key ? translated : type;
}

function ItemCard({
  item,
  showBadge,
  watched,
  rating,
  inWatchlist,
  onClick,
  onToggleWatched,
  onRate,
  onToggleWatchlist,
}: {
  item: Item;
  showBadge: boolean;
  watched: boolean;
  rating: number;
  inWatchlist: boolean;
  onClick: (item: Item) => void;
  onToggleWatched: (item: Item) => void;
  onRate: (item: Item) => void;
  onToggleWatchlist?: (item: Item) => void;
}) {
  const stop = (fn?: (item: Item) => void) => (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    fn?.(item);
  };
  const isImdb = item.id && item.id.startsWith("tt");
  const name = item.name || t("discover.unknown");
  const when = item.releaseInfo || item.year;

  return (
    <li className={watched ? "d-card watched" : "d-card"}>
      <div className="d-card-art">
        {/* the whole card opens the title; the marks sit above the link */}
        <button type="button" className="d-card-open" onClick={() => onClick(item)} aria-label={name}>
          <Poster src={item.poster} title={item.name} />
        </button>
        {isImdb && (
          <>
            <WatchedBadge watched={watched} onClick={stop(onToggleWatched)} />
            <RatingBadge rating={rating} onClick={stop(onRate)} />
            {onToggleWatchlist && <WatchlistBadge inWatchlist={inWatchlist} onClick={stop(onToggleWatchlist)} />}
          </>
        )}
      </div>
      <div className="d-card-text" onClick={() => onClick(item)}>
        <h3 className="d-card-title">{name}</h3>
        <p className="d-card-meta">
          {when && <span>{when}</span>}
          {showBadge && item.type && <span>{typeWord(item.type)}</span>}
          <StarRating rating={item.imdbRating} />
        </p>
      </div>
    </li>
  );
}
