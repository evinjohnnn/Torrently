import { useCallback, useEffect, useRef, useState, type Dispatch } from "react";
import { Icon } from "../../../../ui/Icon";
import * as aiClient from "../../lib/aiClient.ts";
import { getEnv, langPath, t, tf, track } from "../../lib/env.ts";
import type { AIChip, AIItem, Item, UserStatus } from "../../types.ts";
import type { Action, AIState } from "../discoverReducer.ts";
import { AIChipsRow } from "./AIChipsRow.tsx";
import { AIQueryInput } from "./AIQueryInput.tsx";
import { AIRecsGrid } from "./AIRecsGrid.tsx";

// AISection is the self-contained AI recommendations UI above the
// catalogue browser on /discover. It owns no catalog state — a card click
// hands control back to the regular stream modal flow.
//
// The section hides itself entirely where the instance runs no
// recommendations (the page's aiEnabled).

// formatRelativeReset turns a future unix-seconds timestamp into a
// localised "in 10h 30m" string. Returns:
//   - null   → resetAt is missing or already in the past
//   - 'soon' → less than 1 minute remaining
//   - string → formatted relative time
function formatRelativeReset(resetAt: number | null) {
  if (!resetAt || typeof resetAt !== "number") return null;
  const deltaMs = resetAt * 1000 - Date.now();
  if (deltaMs <= 0) return null;
  if (deltaMs < 60_000) return "soon";
  const totalMinutes = Math.floor(deltaMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return tf("discover.ai.relativeTimeHM", hours, minutes);
  if (hours > 0) return tf("discover.ai.relativeTimeH", hours);
  return tf("discover.ai.relativeTimeM", minutes);
}

// Placeholder pills while chips load, so the section doesn't jump.
function ChipsSkeleton() {
  return (
    <div className="ai-chips" aria-hidden="true">
      {[28, 22, 34, 20, 26].map((w, i) => (
        <span key={i} className="d-skel ai-chip-skel" style={{ width: `${w * 6}px` }} />
      ))}
    </div>
  );
}

// Placeholder rows while recommendations load.
function RecsSkeleton() {
  return (
    <ul className="ai-recs" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <li key={i} className="ai-rec">
          <span className="d-skel d-skel-poster" />
          <div className="ai-rec-text">
            <span className="d-skel d-skel-line wide" />
            <span className="d-skel d-skel-line" />
            <span className="d-skel d-skel-line short" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function AISection({
  aiState,
  dispatch,
  onCardClick,
  userStatuses,
  watchlistIds,
  onToggleWatched,
  onRate,
  onToggleWatchlist,
}: {
  aiState: AIState;
  dispatch: Dispatch<Action>;
  onCardClick: (item: AIItem) => void;
  userStatuses: Record<string, UserStatus>;
  watchlistIds: Set<string>;
  onToggleWatched?: (item: AIItem) => void;
  onRate?: (item: AIItem) => void;
  onToggleWatchlist?: (item: AIItem | Item) => void;
}) {
  const abortRef = useRef<{ abort: () => void } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // nowTick is a once-a-minute clock used by the quota card to re-render
  // its "resets in 10h 30m" line, run only while that card is visible.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (aiState.phase !== "quotaExceeded") return undefined;
    setNowTick(Date.now());
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [aiState.phase]);

  // Wrap the card-click / watched / rate handlers so Umami captures every
  // interaction that can originate from an AI recommendation.
  const trackedCardClick = useCallback(
    (aiItem: AIItem) => {
      track("ai-card-clicked", { id: aiItem.video_id });
      onCardClick(aiItem);
    },
    [onCardClick],
  );

  const trackedToggleWatched = useCallback(
    (aiItem: AIItem) => {
      if (!onToggleWatched) return;
      const willBeWatched = !userStatuses[aiItem.video_id]?.watched;
      track("ai-watched-toggled", { id: aiItem.video_id, on: willBeWatched });
      onToggleWatched(aiItem);
    },
    [onToggleWatched, userStatuses],
  );

  const trackedRate = useCallback(
    (aiItem: AIItem) => {
      if (!onRate) return;
      track("ai-rate-opened", { id: aiItem.video_id });
      onRate(aiItem);
    },
    [onRate],
  );

  const trackedToggleWatchlist = useCallback(
    (aiItem: AIItem) => {
      if (!onToggleWatchlist) return;
      const willBeIn = !watchlistIds.has(aiItem.video_id);
      track("ai-watchlist-toggled", { id: aiItem.video_id, on: willBeIn });
      onToggleWatchlist(aiItem);
    },
    [onToggleWatchlist, watchlistIds],
  );

  // Abort any in-flight chips request on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  // loadChips streams chips in; `force` is the quota-consuming refresh.
  const loadChips = useCallback(
    (force: boolean) => {
      dispatch({ type: "AI_LOAD_CHIPS_START" });
      let cancelled = false;
      let count = 0;
      const handle = aiClient.chipsStream(
        {
          onChip(chip: AIChip) {
            if (cancelled) return;
            count++;
            dispatch({ type: "AI_LOAD_CHIPS_CHIP", chip });
          },
          onDone(data) {
            if (cancelled) return;
            dispatch({
              type: "AI_LOAD_CHIPS_SUCCESS",
              generatedAt: Math.floor(Date.now() / 1000),
              tier: data.tier,
              remainingQuota: data.remaining_quota,
              dailyQuota: data.daily_quota,
            });
            track(force ? "ai-chips-refreshed" : "ai-chips-loaded", { count, tier: data.tier || null });
            setRefreshing(false);
          },
          onError(err) {
            if (cancelled) return;
            if (!force && err.status === 404) {
              dispatch({ type: "AI_DISABLED" });
              track("ai-disabled");
              return;
            }
            if (force && err.code === "quota_exceeded") {
              dispatch({
                type: "AI_QUOTA_EXCEEDED",
                tier: err.tier,
                dailyQuota: err.dailyQuota,
                upgradeQuota: err.upgradeQuota,
                quotaResetAt: err.resetAt,
              });
              track("ai-quota-hit", { tier: err.tier, phase: "chips-refresh" });
            } else {
              dispatch({ type: "AI_LOAD_CHIPS_ERROR", error: { code: err.code, message: err.message } });
              track("ai-chips-error", { code: err.code });
            }
            setRefreshing(false);
          },
        },
        { force },
      );
      abortRef.current = {
        abort: () => {
          cancelled = true;
          handle.close();
          setRefreshing(false);
        },
      };
    },
    [dispatch],
  );

  // Initial chip load — exactly once on mount. The page says whether the
  // feature exists at all (aiEnabled): chips arrive over an EventSource,
  // which cannot see an HTTP status, so an instance without the service
  // would otherwise draw the section and then report a failure.
  useEffect(() => {
    if (!getEnv().aiEnabled) {
      dispatch({ type: "AI_DISABLED" });
      return;
    }
    loadChips(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // streamRef holds the current EventSource handle so we can close it on
  // unmount or when the user starts a new request mid-stream.
  const streamRef = useRef<{ close: () => void } | null>(null);

  // runRecommendation takes the `query` that actually goes to the model,
  // plus an optional `displayQuery` the "Showing results for" line shows:
  // for a chip, its short label rather than the long expanded prompt.
  const runRecommendation = useCallback(
    (query: string, isRefine = false, displayQuery: string | null = null) => {
      streamRef.current?.close();
      streamRef.current = null;

      dispatch({ type: "AI_STREAM_START", query, displayQuery: displayQuery || query, isRefine });

      const callbacks: aiClient.StreamCallbacks = {
        onPhase: (data) => dispatch({ type: "AI_STREAM_PHASE", phase: data.phase, expected: data.expected }),
        onItem: (item) => dispatch({ type: "AI_STREAM_ITEM", item }),
        onDone: (data) => {
          dispatch({
            type: "AI_STREAM_DONE",
            query,
            remainingQuota: data.remaining_quota,
            dailyQuota: data.daily_quota,
            tier: data.tier,
          });
          track(isRefine ? "ai-refine" : "ai-recommend", { items: data.total || 0, tier: data.tier });
          streamRef.current = null;
        },
        onError: (err) => {
          if (err?.code === "quota_exceeded") {
            dispatch({
              type: "AI_QUOTA_EXCEEDED",
              tier: err.tier,
              dailyQuota: err.dailyQuota,
              upgradeQuota: err.upgradeQuota,
              quotaResetAt: err.resetAt,
            });
            track("ai-quota-hit", { tier: err.tier, phase: isRefine ? "refine" : "recommend" });
          } else {
            dispatch({ type: "AI_STREAM_ERROR", error: { code: err?.code || "unknown", message: err?.message || "" } });
            track("ai-recommend-error", { code: err?.code || "unknown", phase: isRefine ? "refine" : "recommend" });
          }
          streamRef.current = null;
        },
      };

      streamRef.current = isRefine
        ? aiClient.refineStream(query, aiState.conversation, callbacks)
        : aiClient.recommendStream(query, callbacks);
    },
    [dispatch, aiState.conversation],
  );

  // Tear down any open EventSource on unmount.
  useEffect(
    () => () => {
      streamRef.current?.close();
      streamRef.current = null;
    },
    [],
  );

  const handleChipClick = useCallback(
    (chip: AIChip) => {
      track("ai-chip-clicked", { id: chip.id });
      runRecommendation(chip.query, false, chip.label);
    },
    [runRecommendation],
  );

  const handleQuerySubmit = useCallback(
    (q: string) => {
      track("ai-query-submitted");
      runRecommendation(q, false);
    },
    [runRecommendation],
  );

  const handleRefineSubmit = useCallback(
    (q: string) => {
      track("ai-refine-submitted");
      runRecommendation(q, true);
    },
    [runRecommendation],
  );

  const handleNewSearch = useCallback(() => {
    track("ai-new-search");
    dispatch({ type: "AI_RESET" });
  }, [dispatch]);

  const handleRetry = useCallback(() => {
    track("ai-retry");
    dispatch({ type: "AI_RESET" });
  }, [dispatch]);

  const handleRefreshChips = useCallback(() => {
    if (refreshing) return;
    setRefreshing(true);
    track("ai-chips-refresh-requested");
    // Same SSE path as the initial load, with force=1 so the server
    // consumes a quota unit and busts its cache.
    loadChips(true);
  }, [refreshing, loadChips]);

  if (aiState.phase === "disabled") return null;

  const showQuotaCounter = Number.isFinite(aiState.remainingQuota) && (aiState.remainingQuota ?? -1) >= 0;
  const streaming = aiState.phase === "streamingClaude" || aiState.phase === "streamingResolve";
  const busy = aiState.phase === "loadingChips" || streaming || refreshing;
  const withResults = streaming || aiState.phase === "recsReady";

  return (
    <section className="ai glass" aria-labelledby="ai-title">
      <header className="ai-head">
        <h2 id="ai-title">
          <Icon name="sparkle" size={20} />
          {t("discover.ai.title")}
          <span className="chip olive">{t("discover.ai.beta")}</span>
        </h2>
        {showQuotaCounter && (
          <span className="ai-quota">
            {aiState.dailyQuota != null && aiState.dailyQuota > 0
              ? tf("discover.ai.remainingQuota", aiState.remainingQuota!, aiState.dailyQuota)
              : tf("discover.ai.remainingQuotaSimple", aiState.remainingQuota!)}
          </span>
        )}
      </header>

      {/* The query input is there except while results stream in or are
          shown (the refine input takes its place) and in the quota state. */}
      {aiState.phase !== "quotaExceeded" && !withResults && (
        <AIQueryInput mode="initial" disabled={busy} onSubmit={handleQuerySubmit} />
      )}

      {aiState.phase === "loadingChips" && (
        <>
          <p className="ai-status" role="status">
            <span className="spinner" aria-hidden="true" />
            {t("discover.ai.loadingChips")}
          </p>
          <ChipsSkeleton />
        </>
      )}

      {aiState.phase === "chipsError" && (
        <p className="ai-status">
          {t("discover.ai.errorGeneric")}{" "}
          <button type="button" onClick={handleRetry} className="d-link">
            {t("discover.ai.tryAgain")}
          </button>
        </p>
      )}

      {aiState.phase === "chipsReady" && aiState.chips.length > 0 && (
        <>
          <div className="ai-chips-head">
            <p className="fine">{t("discover.ai.tryThese")}</p>
            <button
              type="button"
              onClick={handleRefreshChips}
              disabled={busy}
              className="button quiet small"
              title={t("discover.ai.refresh")}
              aria-label={t("discover.ai.refresh")}
            >
              {refreshing ? <span className="spinner" aria-hidden="true" /> : <Icon name="refresh" size={16} />}
              <span className="ai-refresh-label">{t("discover.ai.refresh")}</span>
            </button>
          </div>
          {/* Chips are tappable as soon as the first one arrives — a chip
              that already landed can be picked while the rest stream in. */}
          <AIChipsRow chips={aiState.chips} onSelect={handleChipClick} disabled={aiState.phase !== "chipsReady"} />
        </>
      )}

      {/* Streaming and ready share one block so the list stays mounted as
          items stream in. */}
      {withResults && (
        <>
          <div className="ai-showing">
            <p>
              {t("discover.ai.showingFor")} <strong>{aiState.currentQuery}</strong>
            </p>
            {aiState.phase === "recsReady" && (
              <button type="button" onClick={handleNewSearch} className="button quiet small">
                {t("discover.ai.newSearch")}
              </button>
            )}
          </div>

          {streaming && (
            <p className="ai-status" role="status">
              <span className="spinner" aria-hidden="true" />
              {aiState.phase === "streamingClaude"
                ? t("discover.ai.findingFilms")
                : aiState.streamExpected > 0
                  ? tf("discover.ai.findingFilmsProgress", aiState.recommendations.length, aiState.streamExpected)
                  : tf("discover.ai.findingFilmsCount", aiState.recommendations.length)}
            </p>
          )}

          {aiState.phase === "streamingClaude" && <RecsSkeleton />}

          {aiState.recommendations.length > 0 && (
            <AIRecsGrid
              items={aiState.recommendations}
              onCardClick={trackedCardClick}
              userStatuses={userStatuses}
              watchlistIds={watchlistIds}
              onToggleWatched={trackedToggleWatched}
              onRate={trackedRate}
              onToggleWatchlist={onToggleWatchlist ? trackedToggleWatchlist : undefined}
              expanded={aiState.recsExpanded}
              onExpand={() => {
                track("ai-show-more");
                dispatch({ type: "AI_EXPAND_RECS" });
              }}
            />
          )}

          {aiState.phase === "recsReady" && aiState.recommendations.length === 0 && (
            <p className="ai-status d-center">{t("discover.ai.noResults")}</p>
          )}

          {aiState.phase === "recsReady" && (
            <div className="ai-refine">
              <AIQueryInput mode="refine" disabled={busy} onSubmit={handleRefineSubmit} />
            </div>
          )}
        </>
      )}

      {aiState.phase === "recsError" && (
        <div className="d-modal-empty">
          <p>{t("discover.ai.errorGeneric")}</p>
          <button type="button" onClick={handleRetry} className="button primary">
            {t("discover.ai.tryAgain")}
          </button>
        </div>
      )}

      {aiState.phase === "quotaExceeded" && <QuotaCard aiState={aiState} nowTick={nowTick} />}
    </section>
  );
}

function QuotaCard({ aiState, nowTick }: { aiState: AIState; nowTick: number }) {
  // Recomputed on every render; nowTick re-renders it once a minute.
  void nowTick;
  const rel = formatRelativeReset(aiState.quotaResetAt);
  let resetLine: string | null = null;
  if (aiState.quotaResetAt) {
    if (rel === "soon") resetLine = t("discover.ai.quotaResetSoon");
    else if (rel === null) resetLine = t("discover.ai.quotaResetNow");
    else resetLine = tf("discover.ai.quotaResetIn", rel);
  }
  return (
    <div className="ai-quota-card">
      <p className="ai-quota-num">
        {aiState.dailyQuota != null && aiState.dailyQuota > 0 ? `0 / ${aiState.dailyQuota}` : "0"}
      </p>
      <h3>{t("discover.ai.quotaTitle")}</h3>
      <p>{aiState.tier === "free" ? t("discover.ai.quotaFreeBody") : t("discover.ai.quotaPaidBody")}</p>
      {resetLine && <p className="fine">{resetLine}</p>}
      {aiState.tier === "free" && (
        <>
          <a
            href={langPath("/donate")}
            target="_blank"
            rel="noopener noreferrer"
            className="button accent"
            onClick={() => track("ai-upgrade-clicked")}
          >
            {t("discover.ai.becomeSupporterCTA")}
          </a>
          <p className="fine">
            {(aiState.upgradeQuota ?? 0) > 0
              ? tf("discover.ai.unlockRequests", aiState.upgradeQuota!)
              : t("discover.ai.unlockRequestsGeneric")}
          </p>
        </>
      )}
    </div>
  );
}
