import { Icon } from "../../../../ui/Icon";
import { t, tf } from "../../lib/env.ts";
import type { AIItem, UserStatus } from "../../types.ts";
import { ExpandableText } from "../ExpandableText.tsx";
import { StarRating } from "../ItemGrid.tsx";
import { AIRecCard } from "./AIRecCard.tsx";

// AIRecsGrid — the recommendations as rows: poster on one side, title,
// metadata and the generated "reason" on the other, a hairline between.
//
// The grid is also the bridge between the AI item shape ({video_id, title,
// ...}) and the regular discover watched/rate callbacks: per-item closures
// keep AIRecCard ignorant of the conversion.
export function AIRecsGrid({
  items,
  onCardClick,
  userStatuses,
  watchlistIds,
  onToggleWatched,
  onRate,
  onToggleWatchlist,
  initialVisible = 4,
  expanded = false,
  onExpand,
}: {
  items: AIItem[];
  onCardClick: (item: AIItem) => void;
  userStatuses: Record<string, UserStatus>;
  watchlistIds: Set<string>;
  onToggleWatched?: (item: AIItem) => void;
  onRate?: (item: AIItem) => void;
  onToggleWatchlist?: (item: AIItem) => void;
  initialVisible?: number;
  expanded?: boolean;
  onExpand: () => void;
}) {
  if (!items || items.length === 0) return null;

  // Slice the visible window. When `expanded` is true (or there are fewer
  // items than the initial cap), show everything; otherwise show only the
  // first `initialVisible` and offer a "Show more" button.
  const visibleCount = expanded ? items.length : Math.min(initialVisible, items.length);
  const visible = items.slice(0, visibleCount);
  const hidden = items.length - visibleCount;

  return (
    <>
      <ul className="ai-recs">
        {visible.map((item) => {
          const status = userStatuses[item.video_id] || {};
          return (
            <li key={item.video_id} className="ai-rec">
              <AIRecCard
                item={item}
                onClick={onCardClick}
                watched={!!status.watched}
                rating={status.rating || 0}
                inWatchlist={watchlistIds.has(item.video_id)}
                onToggleWatched={onToggleWatched ? () => onToggleWatched(item) : undefined}
                onRate={onRate ? () => onRate(item) : undefined}
                onToggleWatchlist={onToggleWatchlist ? () => onToggleWatchlist(item) : undefined}
              />
              <div className="ai-rec-text">
                <h3>
                  <button type="button" className="ai-rec-title" onClick={() => onCardClick(item)}>
                    {item.title || t("discover.unknown")}
                  </button>
                </h3>
                <p className="d-card-meta">
                  {item.year && <span>{item.year}</span>}
                  <StarRating rating={item.rating} />
                </p>
                {item.reason && <p className="ai-reason">{item.reason}</p>}
                {item.plot && <ExpandableText text={item.plot} lines={3} className="ai-plot" />}
              </div>
            </li>
          );
        })}
      </ul>

      {hidden > 0 && (
        <div className="d-more">
          <button type="button" onClick={onExpand} className="button">
            {tf("discover.ai.showMore", hidden)}
            <Icon name="chevron" size={16} />
          </button>
        </div>
      )}
    </>
  );
}
