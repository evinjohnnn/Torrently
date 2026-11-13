import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useNavigation } from "../../../app/router";
import { useI18n } from "../../../i18n";
import { JobSteps } from "../../../jobs/JobSteps";
import { useJobLog } from "../../../jobs/useJobLog";
import { Icon } from "../../../ui/Icon";
import { getLang, t, tf, track } from "../lib/env.ts";
import { extractLanguages, supportsFlagEmoji, type Language } from "../lib/lang.ts";
import {
  browserDecodesHevc,
  browserDecodesPq,
  emptyStateKey,
  hiddenBy,
  switchCounts,
  switchStates,
  type PlaybackContext,
  type SwitchKind,
  type SwitchStates,
} from "../lib/playback.ts";
import { loadPrefs, savePrefs } from "../lib/prefs.ts";
import { rememberRelease } from "../lib/release-check.ts";
import { releaseText, releaseVideo, type ReleaseVideo } from "../lib/release-video.ts";
import type { Review } from "../lib/reviewsClient.ts";
import { isSeasonUnfinished } from "../lib/seasonStatus.ts";
import { extractFileIdx, extractInfoHash, parseStreamName, type ParsedName } from "../lib/stream.ts";
import { getStreamPrefs, noneMatchPrefs } from "../lib/streamPrefs.ts";
import type { Item, Modal, Stream, SubTarget, UserStatus, Video } from "../types.ts";
import { RetryButton } from "./EmptyStates.tsx";
import { ExpandableText } from "./ExpandableText.tsx";
import { DIcon } from "./icons.tsx";
import { Poster, StarRating } from "./ItemGrid.tsx";
import { ReviewsList, useReviews } from "./Reviews.tsx";
import { Segmented } from "./Tabs.tsx";
import { OnAirDot, SubscribeButton } from "./SubscribeButton.tsx";

/** The dead-magnet card the load job ends with (load/errors/magnet). */
export interface MagnetError {
  kind: "dead" | "invalid";
  waitedSec: number;
  long: boolean;
  query: string;
  hintVideoId?: string;
}

export interface StreamModalProps {
  modal: Modal;
  onClose: () => void;
  onEpisodeSelect: (episode: Video, modal: Modal) => void;
  onStreamClick: (infoHash: string, fileIdx: number | null) => void;
  onRetryLong: (card: MagnetError) => void;
  onBackToEpisodes?: () => void;
  onSeasonChange: (season: number) => void;
  hasCustomAddons: boolean;
  onSetupAddons: () => void;
  onRetryStreams: () => Promise<void>;
  userStatuses: Record<string, UserStatus>;
  watchlistIds: Set<string>;
  onToggleWatched: (item: Item) => void;
  onRate: (item: Item) => void;
  onToggleWatchlist: (item: Item) => void;
  onTabChange: (tab: "primary" | "reviews") => void;
  subscriptionKeys: Set<string>;
  onToggleSubscription: (target: SubTarget) => void;
  hasSources: boolean;
  playback: PlaybackContext;
}

/** The title's dialog: its episodes, its streams, and the load of the one picked. */
export function StreamModal(props: StreamModalProps) {
  const { modal, onClose, onBackToEpisodes } = props;
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const showBack = onBackToEpisodes && (modal.view === "streams" || modal.view === "loading");

  return (
    <dialog
      ref={dialogRef}
      className="dialog glass d-modal"
      aria-label={modal.title || t("discover.unknown")}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className="d-modal-bar">
        {showBack ? (
          <button type="button" className="button quiet small d-back" onClick={onBackToEpisodes}>
            <DIcon name="chevronLeft" size={18} />
            {t("discover.episodes")}
          </button>
        ) : (
          <span />
        )}
        <button type="button" className="icon-button" onClick={onClose} aria-label={t("discover.cancel")}>
          <Icon name="close" />
        </button>
      </div>
      <div className="d-modal-body">
        <ModalBody {...props} />
      </div>
    </dialog>
  );
}

interface HeaderMeta {
  year?: string | number;
  imdbRating?: string | number;
  description?: string;
}

function ModalBody(props: StreamModalProps) {
  const { modal, userStatuses, watchlistIds, onToggleWatched, onRate, onToggleWatchlist } = props;
  const videoId = modal.metaId || modal.itemId;
  const videoType = modal.itemType;
  const isImdb = !!videoId && videoId.startsWith("tt") && !videoId.includes(":");
  const status = isImdb && videoType ? userStatuses[videoId] : null;
  const inWatchlist = isImdb && watchlistIds.has(videoId);
  const statusButtons =
    isImdb && videoType ? (
      <WatchedRateButtons
        videoId={videoId}
        videoType={videoType}
        watched={status?.watched || false}
        rating={status?.rating || 0}
        inWatchlist={inWatchlist}
        onToggleWatched={onToggleWatched}
        onRate={onRate}
        onToggleWatchlist={onToggleWatchlist}
      />
    ) : null;
  const headerMeta: HeaderMeta = {
    year: modal.year || modal.releaseInfo,
    imdbRating: modal.imdbRating,
    description: modal.description,
  };

  if (modal.view === "loading") {
    return (
      <div>
        <ModalHeader title={modal.title} poster={modal.poster} extra={statusButtons} {...headerMeta} />
        <div className="d-modal-wait" role="status">
          <span className="spinner" aria-hidden="true" />
          {modal.subtitle || t("discover.loading")}
        </div>
      </div>
    );
  }

  if (modal.view === "fetching") {
    return <FetchingView modal={modal} statusButtons={statusButtons} headerMeta={headerMeta} />;
  }

  if (modal.view === "progress") {
    return <ProgressView modal={modal} onRetryLong={props.onRetryLong} />;
  }

  // Both settled views carry the same tab row — Episodes (N) / Reviews (M)
  // in the episodes view, Streams (N) / Reviews (M) + the video switches
  // in the streams view. Transient views stay reviews-free.
  const reviewsVideoId = isImdb && videoType ? videoId : null;

  if (modal.view === "episodes") {
    return (
      <EpisodePicker
        key={modal._seasonKey}
        {...props}
        statusButtons={statusButtons}
        headerMeta={headerMeta}
        videoId={reviewsVideoId}
        videoType={videoType}
      />
    );
  }

  if (modal.view === "streams") {
    return (
      <StreamContent
        {...props}
        statusButtons={statusButtons}
        headerMeta={headerMeta}
        videoId={reviewsVideoId}
        videoType={videoType}
      />
    );
  }

  return null;
}

function WatchedRateButtons({
  videoId,
  videoType,
  watched,
  rating,
  inWatchlist,
  onToggleWatched,
  onRate,
  onToggleWatchlist,
}: {
  videoId: string;
  videoType: string;
  watched: boolean;
  rating: number;
  inWatchlist: boolean;
  onToggleWatched: (item: Item) => void;
  onRate: (item: Item) => void;
  onToggleWatchlist?: (item: Item) => void;
}) {
  const item = { id: videoId, type: videoType };
  const run = (fn?: (item: Item) => void) => (event: MouseEvent) => {
    event.stopPropagation();
    fn?.(item);
  };
  return (
    <div className="d-title-actions">
      <button
        type="button"
        className={watched ? "button small on" : "button small"}
        onClick={run(onToggleWatched)}
        aria-pressed={watched}
        title={watched ? t("discover.unmarkWatched") : t("discover.markWatched")}
      >
        <Icon name={watched ? "check" : "eye"} size={16} />
        {t("discover.watched")}
      </button>
      <button
        type="button"
        className={rating > 0 ? "button small on honey" : "button small"}
        onClick={run(onRate)}
        title={rating > 0 ? t("discover.changeRating") : t("discover.rate")}
      >
        <Icon name="star" size={16} fill={rating > 0 ? "currentColor" : "none"} />
        {rating > 0 ? rating : t("discover.rate")}
      </button>
      {onToggleWatchlist && (
        <button
          type="button"
          className={inWatchlist ? "button small on" : "button small"}
          onClick={run(onToggleWatchlist)}
          aria-pressed={inWatchlist}
          title={inWatchlist ? t("discover.removeFromWatchlist") : t("discover.addToWatchlist")}
        >
          <Icon name="heart" size={16} fill={inWatchlist ? "currentColor" : "none"} />
          {t("discover.watchlist.label")}
        </button>
      )}
    </div>
  );
}

function ModalHeader({
  title,
  poster,
  subtitle,
  extra,
  year,
  imdbRating,
  description,
}: {
  title?: string;
  poster?: string;
  subtitle?: string;
  extra?: ReactNode;
} & HeaderMeta) {
  return (
    <header className="d-title">
      <Poster src={poster} title={title} className="d-title-poster" />
      <div className="d-title-main">
        <h2>{title || t("discover.unknown")}</h2>
        {(year || imdbRating) && (
          <p className="d-title-meta">
            {year && <span>{year}</span>}
            <StarRating rating={imdbRating} />
          </p>
        )}
        {extra}
        {description && <ExpandableText text={description} lines={3} className="d-title-plot" />}
        {subtitle && <p className="d-title-sub">{subtitle}</p>}
      </div>
    </header>
  );
}

// --- Progress View ---

/**
 * Follows the load job POST / started for the picked release, then opens
 * the torrent's page on the file the release named (?file-idx).
 */
function ProgressView({ modal, onRetryLong }: { modal: Modal; onRetryLong: (card: MagnetError) => void }) {
  const { navigate } = useNavigation();
  const i18n = useI18n();
  const job = useJobLog(modal.logUrl);
  const fileIdx = modal.fileIdx;

  useEffect(() => {
    const result = job.result;
    if (result?.level !== "redirect" || !result.location) return;
    const target = new URL(result.location, location.href);
    if (fileIdx != null) target.searchParams.set("file-idx", String(fileIdx));
    void navigate(target.pathname + target.search);
  }, [job.result, navigate, fileIdx]);

  const card =
    job.result?.level === "custom" && job.result.template === "load/errors/magnet"
      ? (job.result.data as MagnetError | undefined)
      : undefined;

  return (
    <div>
      <ModalHeader title={modal.title} poster={modal.poster} subtitle={t("discover.preparingResource")} />
      {card ? (
        <div className="notice error d-magnet">
          <Icon name="alert" />
          <div>
            <strong>{t(card.kind === "dead" ? "load.magnet.deadTitle" : "load.magnet.invalidTitle")}</strong>
            <p>
              {t(
                card.kind !== "dead"
                  ? "load.magnet.invalidBody"
                  : card.long
                    ? "load.magnet.deadBodyLong"
                    : "load.magnet.deadBody",
              )}
            </p>
            {card.kind === "dead" && card.waitedSec > 0 && (
              <p className="fine">{i18n.t("load.magnet.waited", { Seconds: card.waitedSec })}</p>
            )}
            {card.kind === "dead" && !card.long && (
              <button type="button" className="button primary small" onClick={() => onRetryLong(card)}>
                {t("load.magnet.retryLong")}
              </button>
            )}
          </div>
        </div>
      ) : modal.logUrl ? (
        <JobSteps job={job} />
      ) : (
        <div className="d-modal-wait" role="status">
          <span className="spinner" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

// --- Fetching View (per-source progress) ---

function FetchingView({
  modal,
  statusButtons,
  headerMeta,
}: {
  modal: Modal;
  statusButtons: ReactNode;
  headerMeta: HeaderMeta;
}) {
  // No "fetching streams (N/M)" subtitle — the per-source rows below carry
  // the same progress with more detail.
  return (
    <div>
      <ModalHeader title={modal.title} poster={modal.poster} extra={statusButtons} {...headerMeta} />
      <ul className="d-sources" aria-live="polite">
        {(modal.addons || []).map((addon, i) => (
          <li key={i} className={`d-source ${addon.status}`}>
            <span className="job-mark" aria-hidden="true">
              {addon.status === "fetching" ? (
                <span className="spinner" />
              ) : addon.status === "done" ? (
                <Icon name="check" size={16} />
              ) : (
                <Icon name="close" size={16} />
              )}
            </span>
            <span className="d-source-text">
              {addon.status === "fetching" && tf("discover.fetchingAddon", addon.host)}
              {addon.status === "done" && tf("discover.addonStreams", addon.host, addon.count ?? 0)}
              {addon.status === "error" && tf("discover.errorFetchingAddon", addon.host)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Modal tabs (shared by episodes & streams views) ---

// ModalTabs — the Primary (N) / Reviews (M) row. `extra` lands
// right-aligned (the video switches in the streams view). The reviews tab is
// disabled until reviews arrive and stays disabled at zero.
function ModalTabs({
  tab,
  onSwitch,
  primaryLabel,
  reviews,
  showReviews,
  extra,
}: {
  tab: "primary" | "reviews";
  onSwitch: (tab: "primary" | "reviews") => void;
  primaryLabel: string;
  reviews: Review[] | null;
  showReviews: boolean;
  extra?: ReactNode;
}) {
  const options: { key: "primary" | "reviews"; label: string; disabled?: boolean }[] = [
    { key: "primary", label: primaryLabel },
  ];
  if (showReviews) {
    options.push({
      key: "reviews",
      label: tf("discover.tabReviews", reviews === null ? "…" : reviews.length),
      disabled: !reviews || reviews.length === 0,
    });
  }
  return (
    <div className="d-tabs">
      <Segmented options={options} value={tab} onSelect={onSwitch} small />
      {extra}
    </div>
  );
}

function ReviewsTabContent({ reviews }: { reviews: Review[] | null }) {
  if (reviews === null) {
    return (
      <div className="d-modal-wait" role="status">
        <span className="spinner" aria-hidden="true" />
      </div>
    );
  }
  return <ReviewsList reviews={reviews} />;
}

// --- Stream Content ---

function is4kStream(parsedInfo: ParsedName) {
  return parsedInfo.labels.some((l) => l === "4K");
}

// The three switches: what the viewer's choice is stored under, and the
// name of its Umami events. The 4K ones keep the names they have always
// had, and no fields, so their series goes on.
const SWITCHES: Record<SwitchKind, { pref: "showHevc" | "showHdr" | "show4k"; event: string }> = {
  hevc: { pref: "showHevc", event: "discover-hevc" },
  hdr: { pref: "showHdr", event: "discover-hdr" },
  uhd: { pref: "show4k", event: "discover-4k" },
};

const answerOf = (v: boolean | null) => (v === true ? "yes" : v === false ? "no" : "unknown");

interface Row {
  stream: Stream;
  parsed: ParsedName;
  video: ReleaseVideo;
  langs: string[];
  visible: boolean;
}

function StreamContent(
  props: StreamModalProps & {
    statusButtons: ReactNode;
    headerMeta: HeaderMeta;
    videoId: string | null;
    videoType?: string;
  },
) {
  const {
    modal,
    onStreamClick,
    hasCustomAddons,
    onSetupAddons,
    onRetryStreams,
    statusButtons,
    headerMeta,
    videoId,
    videoType,
    onTabChange,
    subscriptionKeys,
    onToggleSubscription,
    hasSources,
    playback,
  } = props;
  const { title, poster, error } = modal;
  const streams = useMemo(() => modal.streams || [], [modal.streams]);
  const failed = modal.failedAddons || [];
  // Tab state lives in the modal (synced to the ?tab= URL param by
  // DiscoverApp) so browser back/forward walks streams ⇄ reviews.
  const tab = modal.tab === "reviews" ? "reviews" : "primary";
  const reviews = useReviews(videoId, videoType);
  const switchTab = useCallback(
    (next: "primary" | "reviews") => {
      if (next !== tab) onTabChange(next);
    },
    [tab, onTabChange],
  );

  // The viewer's own choices, as stored: a boolean only where they flipped
  // the switch. Everything else is a default (lib/playback.ts).
  const [choices, setChoices] = useState(() => {
    const prefs = loadPrefs();
    return { showHevc: prefs.showHevc, showHdr: prefs.showHdr, show4k: prefs.show4k };
  });
  const [warningFor, setWarningFor] = useState<SwitchKind | null>(null);
  const ctx = playback;
  const states = useMemo(() => switchStates({ ...ctx, prefs: choices }), [ctx, choices]);

  const parsed = useMemo(() => streams.map((s) => parseStreamName(s.name)), [streams]);

  const streamLangs = useMemo(() => streams.map((s) => extractLanguages(s.title || "").map((l) => l.name)), [streams]);

  // What each release's name says about its video, and whether it is 4K.
  const rows = useMemo(
    () =>
      streams.map((s, i) => ({
        video: releaseVideo(releaseText(s)),
        uhd: is4kStream(parsed[i]),
      })),
    [streams, parsed],
  );

  // How many releases each switch is about, before any filtering (the 4K
  // switch's depends on whether 4K plays here).
  const counts = useMemo(() => switchCounts(rows, states), [rows, states]);

  // Base streams: the ones no switch hides.
  const { baseStreams, baseParsed, baseLangs, baseRows } = useMemo(() => {
    const indices: number[] = [];
    for (let i = 0; i < rows.length; i++) {
      if (hiddenBy(rows[i], states).length === 0) indices.push(i);
    }
    return {
      baseStreams: indices.map((i) => streams[i]),
      baseParsed: indices.map((i) => parsed[i]),
      baseLangs: indices.map((i) => streamLangs[i]),
      baseRows: indices.map((i) => rows[i]),
    };
  }, [streams, parsed, streamLangs, rows, states]);

  // Every release is hidden by a switch: say which, rather than show an
  // empty list.
  const emptyKey = useMemo(() => emptyStateKey(rows, states), [rows, states]);

  // Once per list (a new list is a new `streams`; flipping a switch is
  // not): how the names read and how much the switches hide as they
  // stand -- the measure of the defaults (docs/discover.md).
  useEffect(() => {
    if (!streams.length) return;
    track("discover-streams-classified", {
      n: rows.length,
      hevc: counts.hevc,
      hdr: counts.hdr,
      uhd: rows.filter((r) => r.uhd).length,
      dv5: rows.filter((r) => r.video.dv5).length,
      unknown_codec: rows.filter((r) => r.video.codec === "unknown").length,
      hidden: rows.length - baseStreams.length,
      empty: baseStreams.length === 0,
      dec_hevc: answerOf(browserDecodesHevc(ctx.decodes)),
      dec_pq: answerOf(browserDecodesPq(ctx.decodes)),
      caps: ctx.caps,
      uhd_plays: states.uhd.plays,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streams]);

  const { allSources, allLabels, allLangs } = useMemo(() => {
    const sources: string[] = [];
    const labels: string[] = [];
    const seenLabelsLower: Record<string, boolean> = {};
    for (let i = 0; i < baseParsed.length; i++) {
      const info = baseParsed[i];
      // A source that only ever returned torrents another source also
      // had would otherwise have no chip at all: dedup keeps one row,
      // and that row is labelled with the winning source.
      for (const src of sourcesOf(baseStreams[i], info)) {
        if (!sources.includes(src)) sources.push(src);
      }
      for (const lbl of info.labels) {
        const lower = lbl.toLowerCase();
        if (!seenLabelsLower[lower]) {
          seenLabelsLower[lower] = true;
          labels.push(lbl);
        }
      }
    }
    const langs: Language[] = [];
    const seenLangs: Record<string, boolean> = {};
    for (const s of baseStreams) {
      for (const lang of extractLanguages(s.title || "")) {
        if (!seenLangs[lang.name]) {
          seenLangs[lang.name] = true;
          langs.push(lang);
        }
      }
    }
    return { allSources: sources, allLabels: labels, allLangs: langs };
  }, [baseParsed, baseStreams]);

  const [activeSources, setActiveSources] = useState<Record<string, boolean>>(() => {
    const prefs = loadPrefs();
    if (!prefs.sources) return {};
    const result: Record<string, boolean> = {};
    for (const src of prefs.sources) {
      if (allSources.includes(src)) result[src] = true;
    }
    return result;
  });

  const [activeLabels, setActiveLabels] = useState<Record<string, boolean>>(() => {
    const prefs = loadPrefs();
    if (!prefs.labels) return {};
    const result: Record<string, boolean> = {};
    for (const lbl of prefs.labels) {
      if (allLabels.some((l) => l.toLowerCase() === lbl.toLowerCase())) result[lbl] = true;
    }
    return result;
  });

  const [activeLang, setActiveLang] = useState<string | null>(() => {
    const prefs = loadPrefs();
    if (!prefs.lang) return null;
    return allLangs.some((l) => l.name === prefs.lang) ? prefs.lang : null;
  });

  const hasFilters = allSources.length > 1 || allLabels.length > 0 || allLangs.length > 1;

  const filteredStreams: Row[] = useMemo(() => {
    const activeSrcKeys = Object.keys(activeSources);
    const activeLblKeys = Object.keys(activeLabels);
    if (!activeSrcKeys.length && !activeLblKeys.length && !activeLang) {
      return baseStreams.map((s, i) => ({
        stream: s,
        parsed: baseParsed[i],
        video: baseRows[i].video,
        langs: baseLangs[i],
        visible: true,
      }));
    }
    return baseStreams.map((s, i) => {
      let show = true;
      if (activeSrcKeys.length > 0 && !sourcesOf(s, baseParsed[i]).some((src) => activeSources[src])) show = false;
      if (show && activeLblKeys.length > 0) {
        const lblLower = baseParsed[i].labels.map((l) => l.toLowerCase());
        if (!activeLblKeys.every((k) => lblLower.includes(k.toLowerCase()))) show = false;
      }
      if (show && activeLang && !baseLangs[i].includes(activeLang)) show = false;
      return { stream: s, parsed: baseParsed[i], video: baseRows[i].video, langs: baseLangs[i], visible: show };
    });
  }, [baseStreams, baseParsed, baseLangs, baseRows, activeSources, activeLabels, activeLang]);

  const visibleCount = filteredStreams.filter((s) => s.visible).length;
  const hasActiveFilters =
    Object.keys(activeSources).length > 0 || Object.keys(activeLabels).length > 0 || !!activeLang;

  // trackSwitch: the switch's Umami event. HEVC and HDR say what the
  // browser answered; the 4K events stay as they were.
  const trackSwitch = useCallback(
    (kind: SwitchKind, what: string) => {
      const name = `${SWITCHES[kind].event}-${what}`;
      if (kind === "uhd") track(name);
      else {
        const decoded = kind === "hevc" ? browserDecodesHevc(ctx.decodes) : browserDecodesPq(ctx.decodes);
        track(name, { browser: answerOf(decoded) });
      }
    },
    [ctx],
  );

  const choose = useCallback((kind: SwitchKind, on: boolean) => {
    const pref = SWITCHES[kind].pref;
    setChoices((prev) => ({ ...prev, [pref]: on }));
    savePrefs({ [pref]: on });
  }, []);

  // Turning a switch off is always quiet. Turning one on warns where the
  // releases it shows will not play well here: 4K always (its switch only
  // holds 4K that does not play here), HEVC and HDR only where the browser
  // answered that it does not decode them.
  const toggleSwitch = useCallback(
    (kind: SwitchKind) => {
      if (states[kind].shown) {
        choose(kind, false);
        trackSwitch(kind, "disabled");
        return;
      }
      if (kind === "uhd" || states[kind].warns) {
        setWarningFor(kind);
        trackSwitch(kind, "toggle-attempt");
        return;
      }
      choose(kind, true);
      trackSwitch(kind, "enabled");
    },
    [states, choose, trackSwitch],
  );

  const confirmSwitch = useCallback(() => {
    if (!warningFor) return;
    choose(warningFor, true);
    trackSwitch(warningFor, "enabled");
    setWarningFor(null);
  }, [warningFor, choose, trackSwitch]);

  const cancelSwitch = useCallback(() => {
    if (!warningFor) return;
    trackSwitch(warningFor, "cancelled");
    setWarningFor(null);
  }, [warningFor, trackSwitch]);

  const toggleSource = useCallback((src: string) => {
    setActiveSources((prev) => {
      const next = { ...prev };
      if (next[src]) delete next[src];
      else next[src] = true;
      savePrefs({ sources: Object.keys(next) });
      return next;
    });
  }, []);

  const toggleLabel = useCallback((lbl: string) => {
    setActiveLabels((prev) => {
      const next = { ...prev };
      if (next[lbl]) delete next[lbl];
      else next[lbl] = true;
      savePrefs({ labels: Object.keys(next) });
      return next;
    });
  }, []);

  const toggleLang = useCallback((langName: string) => {
    setActiveLang((prev) => {
      const next = prev === langName ? null : langName;
      savePrefs({ lang: next });
      return next;
    });
  }, []);

  // Nothing in the list is what this account asked for. Discover shows
  // every stream on purpose, so this is a note above the list, not a
  // filter: the streams stay, and the offer to be told about a better one
  // sits next to the explanation.
  const prefsMiss = useMemo(() => noneMatchPrefs(parsed, streamLangs, getStreamPrefs()), [parsed, streamLangs]);

  // The subscribe offer both empty states end with. A user with no
  // sources configured is offered nothing here: the poller searches the
  // addons and indexers they set up, so a subscription would be a promise
  // we cannot keep. That case already has its own "set up addons" prompt.
  const subscribeCTA = (note: string, source: string) => {
    if (!modal.subTarget || !hasSources) return null;
    return (
      <div className="d-subscribe">
        <p>{note}</p>
        <SubscribeButton
          target={{ ...modal.subTarget, source }}
          subscriptionKeys={subscriptionKeys}
          onToggle={onToggleSubscription}
        />
      </div>
    );
  };

  // Streams-tab content. Empty states render inside the tab so the
  // Streams/Reviews row stays visible — a title with zero streams can
  // still have readable reviews.
  let streamsContent: ReactNode;
  if (streams.length === 0 && failed.length > 0) {
    // When the empty result is caused (or partly caused) by addon
    // failures, surface that explicitly instead of the generic
    // "no streams" copy.
    const onlyFailure = failed[0];
    const headline =
      failed.length === 1
        ? tf("discover.streamsFailedOne", onlyFailure.name || onlyFailure.host)
        : tf("discover.streamsFailedMany", failed.length);
    streamsContent = (
      <div className="d-modal-empty">
        <span className="d-empty-mark honey">
          <Icon name="alert" size={24} />
        </span>
        <p className="d-modal-empty-title">{headline}</p>
        <p className="fine">{t("discover.streamsFailedBody")}</p>
        {failed.length > 1 && (
          <ul className="d-failed">
            {failed.map((f) => (
              <li key={f.host}>{f.name || f.host}</li>
            ))}
          </ul>
        )}
        <RetryButton onRetry={onRetryStreams} className="button primary" />
      </div>
    );
  } else if (streams.length === 0) {
    streamsContent = (
      <div className="d-modal-empty">
        <p className="d-modal-empty-title">{error || t("discover.noStreams")}</p>
        {!hasCustomAddons && (
          <>
            <p className="fine">{t("discover.installAddonsHint")}</p>
            <button type="button" className="button" onClick={onSetupAddons}>
              <Icon name="puzzle" size={16} />
              {t("discover.setupAddonsBtn")}
            </button>
          </>
        )}
        {subscribeCTA(t("discover.subscriptions.emptyText"), "empty_streams")}
      </div>
    );
  } else {
    streamsContent = (
      <>
        {failed.length > 0 && (
          <div className="notice warn d-partial">
            <Icon name="alert" />
            <span>
              {failed.length === 1
                ? tf("discover.streamsPartialFailureOne", failed[0].name || failed[0].host)
                : tf("discover.streamsPartialFailureMany", failed.length)}
            </span>
            <RetryButton onRetry={onRetryStreams} className="button small quiet" />
          </div>
        )}

        {prefsMiss && modal.subTarget && hasSources && (
          <div className="notice d-prefs-miss">
            <Icon name="info" />
            <div>
              <p>{t("discover.subscriptions.prefsMiss")}</p>
              <SubscribeButton
                target={{ ...modal.subTarget, source: "prefs_miss" }}
                subscriptionKeys={subscriptionKeys}
                onToggle={onToggleSubscription}
                size="xs"
              />
            </div>
          </div>
        )}

        {hasFilters && (
          <FilterChips
            allSources={allSources}
            allLabels={allLabels}
            allLangs={allLangs}
            activeSources={activeSources}
            activeLabels={activeLabels}
            activeLang={activeLang}
            onToggleSource={toggleSource}
            onToggleLabel={toggleLabel}
            onToggleLang={toggleLang}
          />
        )}

        {emptyKey ? (
          <p className="d-modal-empty-title d-center">{tf(emptyKey, rows.length)}</p>
        ) : (
          <>
            <ul className="d-streams">
              {filteredStreams.map(
                ({ stream, parsed: info, video, visible }, i) =>
                  visible && <StreamRow key={i} stream={stream} info={info} video={video} onStreamClick={onStreamClick} />,
              )}
            </ul>

            {hasActiveFilters && visibleCount === 0 && (
              <div className="d-modal-empty">
                <p className="d-modal-empty-title">{t("discover.noFilterMatch")}</p>
                {subscribeCTA(t("discover.subscriptions.emptyText"), "empty_filters")}
              </div>
            )}
          </>
        )}
      </>
    );
  }

  // No stream-count subtitle — the count already lives in the
  // "Streams (N)" tab. Only the addon-failure headline remains.
  const headerSubtitle = streams.length === 0 && failed.length > 0 ? t("discover.streamsFailedTitle") : undefined;
  const warning = warningFor ? switchTexts(warningFor, states) : null;

  return (
    <div>
      <ModalHeader title={title} poster={poster} subtitle={headerSubtitle} extra={statusButtons} {...headerMeta} />

      <ModalTabs
        tab={tab}
        onSwitch={switchTab}
        primaryLabel={tf("discover.tabStreams", baseStreams.length)}
        reviews={reviews}
        showReviews={!!videoId}
        extra={tab === "primary" ? <VideoSwitches states={states} counts={counts} onToggle={toggleSwitch} /> : null}
      />

      {/* The warning hangs under the whole row, so it stays inside the
          dialog whichever switch asked for it and however the row wraps. */}
      {tab === "primary" && warning && (
        <div className="notice warn d-switch-warning" data-switch-warning={warningFor} role="alertdialog" aria-label={warning.title}>
          <Icon name="alert" />
          <div>
            <strong>{warning.title}</strong>
            <p>{warning.body}</p>
            <div className="d-switch-warning-actions">
              <button type="button" className="button small quiet" onClick={cancelSwitch}>
                {t("discover.cancel")}
              </button>
              <button type="button" className="button small" onClick={confirmSwitch}>
                {warning.confirm}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === "reviews" ? <ReviewsTabContent reviews={reviews} /> : streamsContent}
    </div>
  );
}

// The texts of each switch: its label, and the warning shown before it
// turns on. The 4K warning's body depends on why 4K does not play here
// (playback.ts uhdWarningKey).
function switchTexts(kind: SwitchKind, states: SwitchStates) {
  if (kind === "hevc") {
    return {
      label: t("discover.hevc"),
      title: t("discover.warningHevcTitle"),
      body: t("discover.warningHevcBody"),
      confirm: t("discover.showHevc"),
    };
  }
  if (kind === "hdr") {
    return {
      label: t("discover.hdr"),
      title: t("discover.warningHdrTitle"),
      body: t("discover.warningHdrBody"),
      confirm: t("discover.showHdr"),
    };
  }
  return {
    label: t("discover.include4k"),
    title: t("discover.warning4kTitle"),
    body: t(states.uhd.warningKey),
    confirm: t("discover.show4k"),
  };
}

// VideoSwitches: HEVC, HDR and 4K, each only where the list has releases
// it is about -- for 4K, releases that will not play here.
function VideoSwitches({
  states,
  counts,
  onToggle,
}: {
  states: SwitchStates;
  counts: Record<SwitchKind, number>;
  onToggle: (kind: SwitchKind) => void;
}) {
  const shown: SwitchKind[] = [];
  if (counts.hevc > 0) shown.push("hevc");
  if (counts.hdr > 0) shown.push("hdr");
  if (counts.uhd > 0) shown.push("uhd");
  if (!shown.length) return null;
  return (
    <div className="d-switches">
      {shown.map((kind) => (
        <label key={kind} className="d-switch" data-switch={kind}>
          <input type="checkbox" role="switch" checked={states[kind].shown} onChange={() => onToggle(kind)} />
          <span>
            {switchTexts(kind, states).label} <span className="muted">({counts[kind]})</span>
          </span>
        </label>
      ))}
    </div>
  );
}

// sourcesOf lists every source that returned a stream: the one whose copy
// survived dedup, plus the ones recorded on it (see dedupeStreamsByHash).
function sourcesOf(stream: Stream | undefined, info: ParsedName) {
  const out = [info.source];
  for (const name of stream?.alsoFrom || []) {
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

function FilterChips({
  allSources,
  allLabels,
  allLangs,
  activeSources,
  activeLabels,
  activeLang,
  onToggleSource,
  onToggleLabel,
  onToggleLang,
}: {
  allSources: string[];
  allLabels: string[];
  allLangs: Language[];
  activeSources: Record<string, boolean>;
  activeLabels: Record<string, boolean>;
  activeLang: string | null;
  onToggleSource: (src: string) => void;
  onToggleLabel: (lbl: string) => void;
  onToggleLang: (lang: string) => void;
}) {
  // Windows renders flag emoji as bare letter pairs ("RU") — drop the
  // flag there and let the language name carry the chip.
  const showFlags = supportsFlagEmoji();
  const chip = (on: boolean, key: string, label: string, onClick: () => void, mono?: boolean) => (
    <button
      key={key}
      type="button"
      className={["d-filter", on ? "on" : "", mono ? "mono" : ""].filter(Boolean).join(" ")}
      aria-pressed={on}
      onClick={onClick}
    >
      {label}
    </button>
  );
  return (
    <div className="d-filters">
      {allSources.map((src) => chip(!!activeSources[src], `src-${src}`, src, () => onToggleSource(src)))}
      {allLabels.map((lbl) => chip(!!activeLabels[lbl], `lbl-${lbl}`, lbl, () => onToggleLabel(lbl), true))}
      {allLangs.map((lang) =>
        chip(
          activeLang === lang.name,
          `lang-${lang.name}`,
          showFlags ? `${lang.flag} ${lang.name}` : lang.name,
          () => onToggleLang(lang.name),
        ),
      )}
    </div>
  );
}

function StreamRow({
  stream,
  info,
  video,
  onStreamClick,
}: {
  stream: Stream;
  info: ParsedName;
  video: ReleaseVideo;
  onStreamClick: (infoHash: string, fileIdx: number | null) => void;
}) {
  const infoHash = extractInfoHash(stream);
  const fileIdx = extractFileIdx(stream);
  const titleLines = (stream.title || "").split("\n").filter(Boolean);

  const content = (
    <>
      <span className="d-stream-play" aria-hidden="true">
        <Icon name="play" size={16} />
      </span>
      <span className="d-stream-main">
        <span className="d-stream-head">
          <strong>{info.source}</strong>
          {info.labels.map((label) => (
            <span key={label} className="d-tag mono">
              {label}
            </span>
          ))}
          {/* Dolby Vision profile 5 by name (release-video.ts): no HDR10 or
              SDR layer, so a browser shows it with wrong colours on every
              route -- said for every browser, and the row stays, since
              "Download" is one click on. */}
          {video && video.dv5 && (
            <span className="d-tag honey" title={t("discover.badgeDv5Hint")} data-badge="dv5">
              {t("discover.badgeDv5")}
            </span>
          )}
          {/* Sources that returned the same torrent: which of your sources
              found a release is what you look at when checking whether an
              indexer works. */}
          {(stream.alsoFrom || []).map((name) => (
            <span key={name} className="d-tag line" title={t("discover.alsoFrom")}>
              + {name}
            </span>
          ))}
          {/* Last: the tags before it describe the release, this one is an
              extra about the wait. Being filled is what makes it findable. */}
          {stream.cached && (
            <span className="d-tag cached" title={t("discover.cachedHint")}>
              <Icon name="bolt" size={12} fill="currentColor" />
              {t("discover.cached")}
            </span>
          )}
        </span>
        {titleLines.map((line, i) => (
          <span key={i} className="d-stream-line mono">
            {line}
          </span>
        ))}
      </span>
      {!infoHash && <span className="d-stream-none">{t("discover.noTorrent")}</span>}
    </>
  );

  if (infoHash) {
    return (
      <li>
        <button
          type="button"
          className="d-stream"
          onClick={() => {
            // What the name said, for the player to check against the
            // file (release-check.ts).
            rememberRelease(window, infoHash, video, is4kStream(info));
            onStreamClick(infoHash, fileIdx);
          }}
        >
          {content}
        </button>
      </li>
    );
  }

  return (
    <li>
      <div className="d-stream disabled">{content}</div>
    </li>
  );
}

// --- Episode Picker ---

function EpisodePicker(
  props: StreamModalProps & {
    statusButtons: ReactNode;
    headerMeta: HeaderMeta;
    videoId: string | null;
    videoType?: string;
  },
) {
  const {
    modal,
    onEpisodeSelect,
    onSeasonChange,
    statusButtons,
    headerMeta,
    videoId,
    videoType,
    onTabChange,
    subscriptionKeys,
    onToggleSubscription,
    hasSources,
  } = props;
  const defaultSeason = modal.defaultSeason;
  const { title, poster, meta } = modal;
  const videos = useMemo(() => meta?.videos || [], [meta]);
  // Same tab mechanics as StreamContent — Episodes (N) / Reviews (M),
  // synced to ?tab= through DiscoverApp for history navigation.
  const tab = modal.tab === "reviews" ? "reviews" : "primary";
  const reviews = useReviews(videoId, videoType);
  const switchTab = useCallback(
    (next: "primary" | "reviews") => {
      if (next !== tab) onTabChange(next);
    },
    [tab, onTabChange],
  );

  const { seasons, seasonNums } = useMemo(() => {
    const s: Record<number, Video[]> = {};
    for (const v of videos) {
      const sn = v.season != null ? v.season : 0;
      if (!s[sn]) s[sn] = [];
      s[sn].push(v);
    }
    const nums = Object.keys(s)
      .map(Number)
      .sort((a, b) => {
        if (a === 0) return 1;
        if (b === 0) return -1;
        return a - b;
      });
    return { seasons: s, seasonNums: nums };
  }, [videos]);

  const [activeSeason, setActiveSeason] = useState(() => {
    if (defaultSeason != null && seasonNums.includes(Number(defaultSeason))) {
      return Number(defaultSeason);
    }
    return seasonNums[0] ?? 0;
  });

  // Sync activeSeason when defaultSeason changes (e.g. popstate — the
  // component is already mounted, the useState initializer won't re-run)
  useEffect(() => {
    if (defaultSeason != null && seasonNums.includes(Number(defaultSeason))) {
      setActiveSeason(Number(defaultSeason));
    } else if (defaultSeason == null) {
      setActiveSeason(seasonNums[0] ?? 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultSeason]);

  const episodes = useMemo(
    () => (seasons[activeSeason] || []).slice().sort((a, b) => (a.episode || 0) - (b.episode || 0)),
    [seasons, activeSeason],
  );

  // Tab counts every episode across all seasons, specials excluded — the
  // seasons map buckets specials (and unknown-season videos) under 0.
  const totalEpisodes = videos.length - (seasons[0]?.length || 0);

  // Which seasons are still running. The same rule the subscribe target
  // uses, computed once for the whole row.
  const airingSeasons = useMemo(() => {
    const out = new Set<number>();
    for (const sn of seasonNums) {
      if (sn > 0 && isSeasonUnfinished(videos, sn, { status: meta?.status })) out.add(sn);
    }
    return out;
  }, [seasonNums, videos, meta]);

  // Subscribe target for the season currently in view. Null for specials,
  // for a finished season, and for anything whose id no external source
  // could resolve.
  const subTarget = useMemo((): SubTarget | null => {
    const id = modal.itemId;
    if (!id || !id.startsWith("tt") || activeSeason <= 0) return null;
    if (!isSeasonUnfinished(videos, activeSeason, { status: meta?.status })) return null;
    return { kind: "season", videoId: id, season: activeSeason, source: "discover_season" };
  }, [modal.itemId, activeSeason, videos, meta]);

  if (!videos.length) {
    return (
      <div>
        <ModalHeader title={title} poster={poster} subtitle={t("discover.selectEpisode")} extra={statusButtons} {...headerMeta} />
        <p className="d-modal-empty-title d-center">{t("discover.noEpisodes")}</p>
      </div>
    );
  }

  const lang = getLang();

  return (
    <div>
      <ModalHeader
        title={title}
        poster={poster}
        subtitle={tab === "primary" ? t("discover.selectEpisode") : undefined}
        extra={statusButtons}
        {...headerMeta}
      />

      <ModalTabs
        tab={tab}
        onSwitch={switchTab}
        primaryLabel={tf("discover.tabEpisodes", totalEpisodes)}
        reviews={reviews}
        showReviews={!!videoId}
      />

      {tab === "reviews" ? (
        <ReviewsTabContent reviews={reviews} />
      ) : (
        <>
          <div className="d-seasons">
            {seasonNums.length > 1 && (
              <Segmented
                small
                label={t("discover.episodes")}
                options={seasonNums.map((sn) => ({
                  key: sn,
                  label: (
                    // A season that still has episodes coming says so on
                    // its own chip — it is why the bell next to it exists.
                    <span className="d-season-label">
                      {sn === 0 ? t("discover.specials") : `S${sn}`}
                      {airingSeasons.has(sn) && <OnAirDot />}
                    </span>
                  ),
                }))}
                value={activeSeason}
                onSelect={(sn) => {
                  setActiveSeason(sn);
                  onSeasonChange(sn);
                }}
              />
            )}
            {seasonNums.length <= 1 && airingSeasons.has(activeSeason) && (
              <span className="d-onair-label">
                <OnAirDot />
                {t("discover.subscriptions.onAir")}
              </span>
            )}
            {/* The bell only appears on a season that still has episodes
                coming — subscribing to a finished one would be a poll that
                can never fire, and the server refuses it anyway. hasSources
                gates it like the other two subscribe affordances. */}
            {subTarget && hasSources && (
              <span className="d-seasons-bell">
                <SubscribeButton
                  target={subTarget}
                  subscriptionKeys={subscriptionKeys}
                  onToggle={onToggleSubscription}
                  size="xs"
                />
              </span>
            )}
          </div>

          <ul className="d-episodes">
            {episodes.map((episode) => (
              <li key={episode.id || `${episode.season}-${episode.episode}`}>
                <button type="button" className="d-episode" onClick={() => onEpisodeSelect(episode, modal)}>
                  <span className="d-episode-num mono">{episode.episode != null ? String(episode.episode) : "?"}</span>
                  <span className="d-episode-main">
                    <span className="d-episode-title">
                      {episode.title || episode.name || tf("discover.episodeLabel", episode.episode || "?")}
                    </span>
                    {(episode.released || episode.overview) && (
                      <span className="d-episode-sub">
                        {episode.released ? new Date(episode.released).toLocaleDateString(lang) : episode.overview || ""}
                      </span>
                    )}
                  </span>
                  <Icon name="chevronRight" size={18} className="d-episode-go" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
