import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Icon } from "../../../ui/Icon";
import type { StremioClient } from "../lib/client.ts";
import { getLang, t, tf, track } from "../lib/env.ts";
import type { Item, Meta, Video } from "../types.ts";
import { Empty } from "./EmptyStates.tsx";
import { Poster } from "./ItemGrid.tsx";

// Window for episode visibility, in days, relative to local midnight.
// Start at today: the calendar is a "what's coming" surface, not a
// recap log — already-aired episodes are noise and push the actually-
// upcoming releases off-screen. +4 weeks of future covers a typical
// season pace without dragging in episodes that may shift in scheduling.
const WINDOW_PAST_DAYS = 0;
const WINDOW_FUTURE_DAYS = 28;

// Five-way concurrency for fetchMeta. Higher numbers blow Cinemeta's
// rate limits on cold caches; lower stretches the loading skeleton.
const CONCURRENCY = 5;

function dateKeyLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseLocalDateKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDayHeader(dateKey: string, lang: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const d = parseLocalDateKey(dateKey);
  const formatted = d.toLocaleDateString(lang, { weekday: "long", month: "long", day: "numeric" });

  if (dateKey === dateKeyLocal(today)) return tf("discover.calendar.todayLabel", formatted);
  if (dateKey === dateKeyLocal(tomorrow)) return tf("discover.calendar.tomorrowLabel", formatted);
  if (dateKey === dateKeyLocal(yesterday)) return tf("discover.calendar.yesterdayLabel", formatted);
  return formatted;
}

function seasonEpisodeLabel(video: Video) {
  const s = Number(video.season);
  if (s === 0) return t("discover.specials");
  return `S${video.season}E${video.episode}`;
}

type Entry =
  | {
      kind: "episode";
      item: Item;
      meta: Meta;
      video: Video;
      dateKey: string;
      releasedAt: number;
      popularityIndex: number;
    }
  | {
      kind: "season-drop";
      item: Item;
      meta: Meta;
      season: number | undefined;
      episodeCount: number;
      dateKey: string;
      releasedAt: number;
      popularityIndex: number;
    };

function CardShell({
  item,
  primary,
  secondary,
  onClick,
  inWatchlist,
  onToggleWatchlist,
}: {
  item: Item;
  primary: ReactNode;
  secondary: ReactNode;
  onClick: () => void;
  inWatchlist: boolean;
  onToggleWatchlist?: (item: Item) => void;
}) {
  const isImdb = item.id && item.id.startsWith("tt");
  const showHeart = isImdb && !!onToggleWatchlist;
  const handleHeartClick = (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    onToggleWatchlist?.(item);
  };
  const heartLabel = inWatchlist ? t("discover.removeFromWatchlist") : t("discover.addToWatchlist");
  return (
    <div className="d-cal-row">
      <button type="button" className="d-cal-open" onClick={onClick}>
        <Poster src={item.poster} title={item.name} className="d-cal-poster" />
        <span className="d-cal-text">
          <span className="d-cal-title">{item.name || t("discover.unknown")}</span>
          <span className="d-cal-sub">
            {primary}
            {secondary}
          </span>
        </span>
      </button>
      {showHeart && (
        <button
          type="button"
          onClick={handleHeartClick}
          className={inWatchlist ? "icon-button d-cal-heart on" : "icon-button d-cal-heart"}
          title={heartLabel}
          aria-label={heartLabel}
          aria-pressed={inWatchlist}
        >
          <Icon name="heart" size={18} fill={inWatchlist ? "currentColor" : "none"} />
        </button>
      )}
    </div>
  );
}

function CalendarDay({
  dateKey,
  entries,
  lang,
  watchlistIds,
  onEpisodeClick,
  onSeasonDropClick,
  onToggleWatchlist,
}: {
  dateKey: string;
  entries: Entry[];
  lang: string;
  watchlistIds: Set<string>;
  onEpisodeClick: (item: Item, video: Video, meta: Meta) => void;
  onSeasonDropClick: (item: Item, season: number | undefined, meta: Meta) => void;
  onToggleWatchlist?: (item: Item) => void;
}) {
  return (
    <section className="d-cal-day">
      <h3>{formatDayHeader(dateKey, lang)}</h3>
      {/* Two columns on wide screens: each day's rows pair up so a page of
          25 series doesn't drag into a single tall column. */}
      <div className={entries.length === 1 ? "d-cal-list single" : "d-cal-list"}>
        {entries.map((entry) => {
          const inWatchlist = watchlistIds.has(entry.item.id);
          if (entry.kind === "season-drop") {
            // A same-day burst of episodes (a season released all at once)
            // collapses into one row pointing at the season.
            const seasonLabel =
              Number(entry.season) === 0 ? t("discover.specials") : tf("discover.calendar.seasonLabel", entry.season ?? "");
            return (
              <CardShell
                key={`drop:${entry.item.id}:${entry.season}`}
                item={entry.item}
                inWatchlist={inWatchlist}
                onToggleWatchlist={onToggleWatchlist}
                onClick={() => onSeasonDropClick(entry.item, entry.season, entry.meta)}
                primary={<span className="d-cal-se">{seasonLabel}</span>}
                secondary={<span>{tf("discover.calendar.episodeCount", entry.episodeCount)}</span>}
              />
            );
          }
          // Cinemeta puts the episode title on `name`; some other addons
          // use `title`.
          const epTitle = entry.video.name || entry.video.title;
          return (
            <CardShell
              key={`ep:${entry.item.id}:${entry.video.season}:${entry.video.episode}`}
              item={entry.item}
              inWatchlist={inWatchlist}
              onToggleWatchlist={onToggleWatchlist}
              onClick={() => onEpisodeClick(entry.item, entry.video, entry.meta)}
              primary={<span className="d-cal-se mono">{seasonEpisodeLabel(entry.video)}</span>}
              secondary={epTitle ? <span className="d-cal-ep">{epTitle}</span> : null}
            />
          );
        })}
      </div>
    </section>
  );
}

function CalendarSkeleton({ done, total }: { done: number; total: number }) {
  return (
    <div className="d-cal" aria-busy="true">
      {total > 0 && (
        <p className="d-loading" role="status">
          <span className="spinner" aria-hidden="true" />
          {tf("discover.calendar.loading", done, total)}
        </p>
      )}
      {[0, 1, 2].map((i) => (
        <div key={i} className="d-cal-day" aria-hidden="true">
          <span className="d-skel d-skel-head" />
          {[0, 1].map((j) => (
            <span key={j} className="d-skel d-skel-row" />
          ))}
        </div>
      ))}
    </div>
  );
}

// CalendarView renders the current series-only displayItems as a date-
// grouped episode timeline. It owns the meta-fetch lifecycle (5-way
// concurrent, abortable, cached via StremioClient.cache) so the parent
// just passes items + a click handler.
//
// items[] may include non-series rows (catalog mixes happen) — we filter
// internally and quietly drop them. If after filtering there are no
// episodes in the visibility window, an empty state is rendered.
export function CalendarView({
  items,
  client,
  watchlistIds,
  onEpisodeClick,
  onSeasonDropClick,
  onToggleWatchlist,
}: {
  items: Item[];
  client: StremioClient;
  watchlistIds: Set<string>;
  onEpisodeClick: (item: Item, video: Video, meta: Meta) => void;
  onSeasonDropClick: (item: Item, season: number | undefined, meta: Meta) => void;
  onToggleWatchlist?: (item: Item) => void;
}) {
  const seriesItems = useMemo(() => (items || []).filter((i) => i && i.type === "series"), [items]);
  // null = initial / re-fetching, [] = done with no episodes in window,
  // [{dateKey, entries}, ...] = grouped results
  const [grouped, setGrouped] = useState<{ dateKey: string; entries: Entry[] }[] | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const shownRef = useRef(false);

  useEffect(() => {
    // Fire the impression event once per CalendarView mount. Episode
    // CTR is reported as (calendar-episode-click / calendar-shown).
    if (shownRef.current) return;
    shownRef.current = true;
    track("discover-calendar-shown", { series_count: seriesItems.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!seriesItems.length) {
      setGrouped([]);
      setProgress({ done: 0, total: 0 });
      return;
    }
    const abort = new AbortController();
    let cancelled = false;
    setGrouped(null);
    setProgress({ done: 0, total: seriesItems.length });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const from = new Date(today);
    from.setDate(from.getDate() - WINDOW_PAST_DAYS);
    const to = new Date(today);
    to.setDate(to.getDate() + WINDOW_FUTURE_DAYS);

    // Carry the catalog index alongside each item so we can sort by
    // popularity (smaller index = higher rank). The parallel workers
    // shuffle completion order so we can't rely on push-order.
    const queue = seriesItems.map((item, popularityIndex) => ({ item, popularityIndex }));
    const fetched: { item: Item; meta: Meta; videos: Video[]; popularityIndex: number }[] = [];

    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length && !cancelled) {
        const { item, popularityIndex } = queue.shift()!;
        try {
          const meta = await client.fetchMeta("series", item.id, { signal: abort.signal });
          if (cancelled) return;
          if (meta?.videos?.length) {
            fetched.push({ item, meta, videos: meta.videos, popularityIndex });
          }
        } catch {
          /* drop failures, keep going */
        }
        if (!cancelled) setProgress((p) => ({ ...p, done: p.done + 1 }));
      }
    });

    void Promise.all(workers).then(() => {
      if (cancelled) return;
      const flat: { item: Item; meta: Meta; video: Video; dateKey: string; releasedAt: number; popularityIndex: number }[] = [];
      for (const { item, meta, videos, popularityIndex } of fetched) {
        for (const v of videos) {
          if (!v.released) continue;
          const d = new Date(v.released);
          if (isNaN(d.getTime()) || d < from || d > to) continue;
          flat.push({ item, meta, video: v, dateKey: dateKeyLocal(d), releasedAt: d.getTime(), popularityIndex });
        }
      }
      // Collapse season-drops: multiple episodes of the same series and
      // season landing on the same calendar day become one entry.
      const bucketMap = new Map<string, typeof flat>();
      for (const f of flat) {
        const key = `${f.item.id}|${f.video.season}|${f.dateKey}`;
        if (!bucketMap.has(key)) bucketMap.set(key, []);
        bucketMap.get(key)!.push(f);
      }
      const entries: Entry[] = [];
      for (const group of bucketMap.values()) {
        const ref = group[0];
        if (group.length > 1) {
          entries.push({
            kind: "season-drop",
            item: ref.item,
            meta: ref.meta,
            season: ref.video.season,
            episodeCount: group.length,
            dateKey: ref.dateKey,
            releasedAt: ref.releasedAt,
            popularityIndex: ref.popularityIndex,
          });
        } else {
          entries.push({ kind: "episode", ...ref });
        }
      }
      const byKey = new Map<string, Entry[]>();
      for (const e of entries) {
        if (!byKey.has(e.dateKey)) byKey.set(e.dateKey, []);
        byKey.get(e.dateKey)!.push(e);
      }
      const groups = [...byKey.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([dateKey, dayEntries]) => ({
          dateKey,
          // Within a day: popular series first; releasedAt is a stable
          // tiebreaker for items that share the same rank.
          entries: dayEntries.sort((a, b) => {
            const ai = a.popularityIndex ?? Number.MAX_SAFE_INTEGER;
            const bi = b.popularityIndex ?? Number.MAX_SAFE_INTEGER;
            if (ai !== bi) return ai - bi;
            return a.releasedAt - b.releasedAt;
          }),
        }));
      setGrouped(groups);
    });

    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [seriesItems, client]);

  const handleEpisodeClick = useCallback(
    (item: Item, video: Video, meta: Meta) => {
      track("discover-calendar-episode-click", {
        item_id: item.id,
        season: String(video.season),
        episode: String(video.episode),
      });
      // Forward the meta already fetched in the worker pool so the parent
      // can build backToEpisodes without a second fetchMeta.
      onEpisodeClick(item, video, meta);
    },
    [onEpisodeClick],
  );

  const handleSeasonDropClick = useCallback(
    (item: Item, season: number | undefined, meta: Meta) => {
      track("discover-calendar-season-drop-click", { item_id: item.id, season: String(season) });
      onSeasonDropClick(item, season, meta);
    },
    [onSeasonDropClick],
  );

  const lang = getLang();

  if (grouped === null) {
    return <CalendarSkeleton done={progress.done} total={progress.total} />;
  }
  if (grouped.length === 0) {
    return (
      <Empty icon="clock" title={t("discover.calendar.emptyTitle")}>
        {t("discover.calendar.empty")}
      </Empty>
    );
  }

  return (
    <div className="d-cal">
      {grouped.map((group) => (
        <CalendarDay
          key={group.dateKey}
          dateKey={group.dateKey}
          entries={group.entries}
          lang={lang}
          watchlistIds={watchlistIds}
          onEpisodeClick={handleEpisodeClick}
          onSeasonDropClick={handleSeasonDropClick}
          onToggleWatchlist={onToggleWatchlist}
        />
      ))}
    </div>
  );
}
