import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { toast } from "../../../chrome/Toasts";
import { Icon } from "../../../ui/Icon";
import { withCached } from "../lib/availabilityClient.ts";
import { CINEMETA_BASE, StremioClient, mayServeStreams } from "../lib/client.ts";
import { DECODE } from "../lib/decodeDeclaration.ts";
import { getEnv, langPath, t, tf, track } from "../lib/env.ts";
import { fetchLocalized, getCachedLocalized, localizedTitle, withLocalized } from "../lib/localizeClient.ts";
import { getViewMode, loadPrefs, savePrefs } from "../lib/prefs.ts";
import { subscriptionTargetFor } from "../lib/seasonStatus.ts";
import { dedupeStreamsByHash, interleaveBySource } from "../lib/stream.ts";
import { fetchSubscriptionIds, subscribe, subscriptionKey, unsubscribe } from "../lib/subscriptionsClient.ts";
import { fetchTorznabStreams, hasIndexers, indexerLabel } from "../lib/torznabClient.ts";
import { usePlaybackContext } from "../lib/usePlaybackContext.ts";
import { addToWatchlist, fetchWatchlist, fetchWatchlistIds, removeFromWatchlist } from "../lib/watchlistClient.ts";
import type {
  AddonSeed,
  AIItem,
  BackToEpisodes,
  Catalog,
  Item,
  Meta,
  Modal,
  SourceProgress,
  Stream,
  SubTarget,
  Video,
} from "../types.ts";
import { AddonHealthChip } from "./AddonHealthChip.tsx";
import { AddonWizard, type BatchResult } from "./AddonWizard.tsx";
import { AISection } from "./ai/AISection.tsx";
import { CalendarView } from "./CalendarView.tsx";
import {
  discoverReducer,
  getCatalogsForType,
  getSearchResultsForType,
  getSearchTypes,
  getTypes,
  initialState,
  overlayLocalized,
  type Action,
  type DiscoverState,
} from "./discoverReducer.ts";
import {
  fetchUserStatuses,
  loadManifests,
  rateVideo,
  restoreModalFromUrl,
  reviewsTab,
  toggleWatched,
  unrateVideo,
} from "./discoverUtils.ts";
import {
  CatalogUnavailable,
  Empty,
  ErrorState,
  LoadingSpinner,
  LoadMore,
  NoAddons,
  NoCatalogs,
  NoResults,
} from "./EmptyStates.tsx";
import { DIcon } from "./icons.tsx";
import { ItemGrid } from "./ItemGrid.tsx";
import { RatingDialog } from "./RatingDialog.tsx";
import { SearchBar } from "./SearchBar.tsx";
import { StreamModal, type MagnetError } from "./StreamModal.tsx";
import { CatalogSelector, SearchTabs, TypeTabs } from "./Tabs.tsx";
import { useDiscoverUrl } from "./useDiscoverUrl.ts";

// episodesModalFromBack rebuilds the episodes-view modal from the
// backToEpisodes snapshot carried by an episode-streams modal. Shared by
// the "‹ Episodes" button and the popstate restore path so the two can't
// drift apart.
function episodesModalFromBack(
  back: BackToEpisodes,
  { tab, defaultSeason }: { tab?: "reviews"; defaultSeason?: number } = {},
): Modal {
  return {
    view: "episodes",
    title: back.title,
    poster: back.poster,
    meta: back.meta,
    itemId: back.itemId,
    itemType: back.itemType,
    year: back.year,
    releaseInfo: back.releaseInfo,
    imdbRating: back.imdbRating,
    description: back.description,
    tab,
    defaultSeason: defaultSeason != null ? defaultSeason : back.season != null ? Number(back.season) : undefined,
  };
}

// modalIdentity extracts the fields every SHOW_MODAL recreation must
// carry forward — the watched/rate buttons and the reviews tab are gated
// on them (see ModalBody in StreamModal). Dropping any of these on a
// rebuilt modal silently hides those surfaces.
function modalIdentity(m: Modal | null | undefined) {
  return {
    metaId: m?.metaId,
    itemId: m?.itemId,
    itemType: m?.itemType,
    year: m?.year,
    releaseInfo: m?.releaseInfo,
    imdbRating: m?.imdbRating,
    description: m?.description,
  };
}

function hostOf(baseUrl: string) {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return baseUrl;
  }
}

interface PendingStream {
  streamId: string;
  type: string;
  title?: string;
  poster?: string;
  backToEpisodes?: BackToEpisodes;
  id: string;
  season: string | null;
  episode: string | null;
  modal: Modal | null;
}

interface RatingTarget {
  item: Item;
  type: string;
  currentRating: number;
}

export function DiscoverApp({
  addonUrls,
  addonSeeds,
  hasCustomAddons,
}: {
  addonUrls: string[];
  addonSeeds: AddonSeed[];
  hasCustomAddons: boolean;
}) {
  const [state, rawDispatch] = useReducer(discoverReducer, initialState);
  // stateRef is the state as of the last action, not the last render:
  // the async flows below (card click → streams → meta) read it between
  // dispatches, before React has rendered them.
  const stateRef = useRef<DiscoverState>(state);
  const dispatch = useCallback((action: Action) => {
    stateRef.current = discoverReducer(stateRef.current, action);
    rawDispatch(action);
  }, []);
  const [showWizard, setShowWizard] = useState(false);
  const [addonsInstalled, setAddonsInstalled] = useState(false);
  const [ratingTarget, setRatingTarget] = useState<RatingTarget | null>(null);
  const clientRef = useRef<StremioClient | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Stream loads are generation-guarded: closing the modal or opening
  // another title invalidates the run in flight, so its late dispatch
  // cannot re-open a modal the user closed or overwrite a newer one.
  const streamGenRef = useRef(0);
  const streamAbortRef = useRef<AbortController | null>(null);
  const searchGenRef = useRef(0);
  const searchAfterInit = useRef<string | null>(null);
  const restoredPageRef = useRef(0);
  const modalItemIdRef = useRef<string | null>(null);
  const modalEpisodeRef = useRef<{ season: string; episode: string } | null>(null);
  const modalSeasonRef = useRef<string | null>(null); // season-only (no episode) from URL
  const restoreInProgressRef = useRef(false);
  const openModalByIdRef = useRef<(id: string) => void>(() => {});
  const performSearchRef = useRef<(query: string) => void>(() => {});
  const pendingStreamRef = useRef<PendingStream | null>(null); // stream to reload after wizard
  const loadGenRef = useRef(0); // the load job the progress view follows

  const url = useDiscoverUrl("/discover");

  // What the stream modal's video switches go by (lib/playback.ts),
  // gathered from the page's first render, so the browser's probe has
  // answered by the time a modal opens (usePlaybackContext).
  const playback = usePlaybackContext(window, DECODE);

  // Create client once
  if (!clientRef.current) {
    clientRef.current = new StremioClient(addonUrls, addonSeeds);
  }
  const client = clientRef.current;

  function abortCatalog() {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }

  // --- Load catalog ---
  const loadCatalog = useCallback(
    async (catalog: Catalog | null, skip: number, currentItems: Item[]) => {
      if (!catalog) return;
      // Skip the fetch for catalogs whose addon is currently down — the
      // UI renders CatalogUnavailable for these so users see why nothing
      // loads.
      if (catalog.disabled) return;
      dispatch({ type: "CATALOG_LOADING" });
      abortCatalog();
      abortRef.current = new AbortController();
      const { signal } = abortRef.current;

      try {
        const data = await client.fetchCatalog(catalog.baseUrl, catalog.type, catalog.id, skip, { signal });
        let metas = data.metas || [];
        if (skip > 0) {
          const existingIds = new Set(currentItems.map((i) => i.id));
          metas = metas.filter((m) => !existingIds.has(m.id));
        }
        dispatch({ type: "CATALOG_LOADED", items: metas, append: skip > 0, hasMore: (data.metas || []).length > 0 });
        track("discover-catalog-loaded", { type: catalog.type, catalog: catalog.id });
        // Fire-and-forget user status query for the newly arrived batch.
        void fetchUserStatuses(metas.map((m) => m.id)).then((statuses) => {
          if (Object.keys(statuses).length) dispatch({ type: "USER_STATUSES_MERGED", statuses });
        });
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        dispatch({ type: "CATALOG_ERROR", message: t("discover.catalogLoadError") });
      }
    },
    [client],
  );

  // --- Init (with URL state restoration) ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { manifests, catalogs, types, addons } = await loadManifests(client);
        if (cancelled) return;

        if (!types.length) {
          dispatch({ type: "ADDONS_UPDATED", addons });
          dispatch({ type: "SET_PHASE", phase: "no-catalogs" });
          return;
        }

        // Restore state from URL params
        const urlParams = new URLSearchParams(window.location.search);
        const urlType = urlParams.get("type");
        const urlSearch = urlParams.get("search");
        const urlSearchType = urlParams.get("search-type");
        const urlPage = parseInt(urlParams.get("page") || "", 10) || 0;
        const urlId = urlParams.get("id");
        const urlSeason = urlParams.get("season");
        const urlEpisode = urlParams.get("episode");
        const urlCatalogBase = urlParams.get("catalog-base");
        const urlCatalogId = urlParams.get("catalog-id");

        const prefs = loadPrefs();
        let selectedType = types[0];

        // Type: URL > localStorage > default
        if (urlType && types.includes(urlType)) {
          selectedType = urlType;
        } else if (prefs.type && types.includes(prefs.type)) {
          selectedType = prefs.type;
        }

        let selectedCatalog = getCatalogsForType(catalogs, selectedType)[0] || null;

        // Catalog: URL > localStorage > default
        if (urlCatalogBase && urlCatalogId) {
          const match = getCatalogsForType(catalogs, selectedType).find(
            (c) => c.baseUrl === urlCatalogBase && c.id === urlCatalogId,
          );
          if (match) selectedCatalog = match;
        } else if (prefs.catalogBase && prefs.catalogId) {
          const match = getCatalogsForType(catalogs, selectedType).find(
            (c) => c.baseUrl === prefs.catalogBase && c.id === prefs.catalogId,
          );
          if (match) selectedCatalog = match;
        }

        dispatch({
          type: "INIT_SUCCESS",
          manifests,
          catalogs,
          selectedType,
          selectedCatalog,
          addons,
          viewMode: getViewMode(),
        });

        // Store page/modal restore targets
        if (urlPage > 0) restoredPageRef.current = urlPage;
        if (urlId) modalItemIdRef.current = urlId;
        if (urlSeason != null && urlEpisode != null) {
          modalEpisodeRef.current = { season: urlSeason, episode: urlEpisode };
        } else if (urlSeason != null) {
          modalSeasonRef.current = urlSeason;
        }

        // Enter search mode if URL has search param
        if (urlSearch) {
          dispatch({ type: "SEARCH_START", query: urlSearch });
          if (urlSearchType && urlSearchType !== "all") {
            dispatch({ type: "SELECT_SEARCH_TYPE", searchType: urlSearchType });
          }
          searchAfterInit.current = urlSearch;
        } else if (urlParams.get("watchlist") === "1") {
          // Restore watchlist mode from URL. Items load via the lazy
          // fetch effect below.
          dispatch({ type: "WATCHLIST_FILTER_SET", enabled: true });
          const wlType = urlParams.get("watchlist-type");
          if (wlType && wlType !== "all") {
            dispatch({ type: "SELECT_WATCHLIST_TYPE", watchlistType: wlType });
          }
        }
      } catch {
        if (!cancelled) dispatch({ type: "INIT_ERROR", message: t("discover.manifestLoadError") });
      }
    })();
    return () => {
      cancelled = true;
      abortCatalog();
    };
  }, [client]);

  // Load catalog when selection changes after init
  const prevCatalogRef = useRef<string | null>(null);
  useEffect(() => {
    if (state.phase !== "ready" || state.isSearchMode) return;
    if (!state.selectedCatalog) return;
    const key = `${state.selectedCatalog.baseUrl}::${state.selectedCatalog.id}::${state.selectedType}`;
    if (prevCatalogRef.current === key && state.skip > 0) return;
    prevCatalogRef.current = key;
    void loadCatalog(state.selectedCatalog, 0, []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.selectedCatalog, state.selectedType, state.isSearchMode, loadCatalog]);

  // Batch-localize whatever grid is on screen through the server
  // enrichment pipeline (POST /discover/localize). localizeClient holds a
  // per-id session cache; English sessions short-circuit inside
  // fetchLocalized without touching the network.
  useEffect(() => {
    const src = state.isSearchMode
      ? state.searchResults
      : state.watchlistFilterEnabled
        ? state.watchlistItems
        : state.items;
    if (!src.length) return;
    void fetchLocalized(src.map((i) => ({ id: i.id, type: i.type || state.selectedType || undefined }))).then(
      (found) => {
        if (Object.keys(found).length) dispatch({ type: "LOCALIZED_MERGED", localized: found });
      },
    );
  }, [
    state.items,
    state.searchResults,
    state.watchlistItems,
    state.isSearchMode,
    state.watchlistFilterEnabled,
    state.selectedType,
  ]);

  // --- Type/Catalog selection ---
  const selectType = useCallback(
    (type: string) => {
      abortCatalog();
      savePrefs({ type });
      const catalog = getCatalogsForType(state.catalogs, type)[0] || null;
      url.push({
        type,
        "catalog-base": catalog?.baseUrl,
        "catalog-id": catalog?.id,
        id: null,
        season: null,
        episode: null,
        search: null,
        "search-type": null,
      });
      dispatch({ type: "SELECT_TYPE", selectedType: type });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.catalogs],
  );

  const selectCatalog = useCallback(
    (catalog: Catalog) => {
      abortCatalog();
      savePrefs({ catalogBase: catalog.baseUrl, catalogId: catalog.id });
      url.push({ "catalog-base": catalog.baseUrl, "catalog-id": catalog.id, id: null, season: null, episode: null });
      dispatch({ type: "SELECT_CATALOG", catalog });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // --- Load more ---
  const loadMore = useCallback(() => {
    void loadCatalog(state.selectedCatalog, state.items.length, state.items);
  }, [state.selectedCatalog, state.items, loadCatalog]);

  // --- Search ---
  const exitSearch = useCallback(() => {
    abortCatalog();
    if (!url.isPopstate.current) {
      const types = getTypes(state.catalogs);
      const type = types[0] || null;
      const catalog = type ? getCatalogsForType(state.catalogs, type)[0] : null;
      url.push({
        type,
        "catalog-base": catalog?.baseUrl,
        "catalog-id": catalog?.id,
        search: null,
        "search-type": null,
        id: null,
        season: null,
        episode: null,
      });
    }
    dispatch({ type: "EXIT_SEARCH" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.catalogs]);

  const performSearch = useCallback(
    async (raw: string) => {
      const query = raw.trim();
      if (query.length < 2) {
        if (stateRef.current.isSearchMode) exitSearch();
        return;
      }

      // Push history entry when first entering search mode (not during popstate)
      if (!stateRef.current.isSearchMode && !url.isPopstate.current) {
        url.push({
          search: query,
          "search-type": null,
          type: null,
          "catalog-base": null,
          "catalog-id": null,
          id: null,
          season: null,
          episode: null,
        });
      }

      const gen = ++searchGenRef.current;
      dispatch({ type: "SEARCH_START", query });
      abortCatalog();
      abortRef.current = new AbortController();
      const { signal } = abortRef.current;

      const searchCatalogs = client.getSearchCatalogs();
      const sources: { baseUrl: string; type: string; id: string }[] = [];
      const hasCinemetaMovie = searchCatalogs.some(
        (sc) => sc.baseUrl === CINEMETA_BASE && sc.type === "movie" && sc.id === "top",
      );
      const hasCinemetaSeries = searchCatalogs.some(
        (sc) => sc.baseUrl === CINEMETA_BASE && sc.type === "series" && sc.id === "top",
      );
      if (!hasCinemetaMovie) sources.push({ baseUrl: CINEMETA_BASE, type: "movie", id: "top" });
      if (!hasCinemetaSeries) sources.push({ baseUrl: CINEMETA_BASE, type: "series", id: "top" });
      sources.push(...searchCatalogs);

      const results = await Promise.allSettled(
        sources.map((src) => client.searchCatalog(src.baseUrl, src.type, src.id, query, { signal })),
      );

      if (gen !== searchGenRef.current) return;

      const seen = new Set<string>();
      const merged: Item[] = [];
      for (let k = 0; k < results.length; k++) {
        const r = results[k];
        if (r.status !== "fulfilled") continue;
        const srcType = sources[k].type;
        for (const item of r.value) {
          if (!item.type) item.type = srcType;
          if (!seen.has(item.id)) {
            seen.add(item.id);
            merged.push(item);
          }
        }
      }

      dispatch({ type: "SEARCH_RESULTS", results: merged });
      track("discover-search", { query, count: merged.length });
      void fetchUserStatuses(merged.map((m) => m.id)).then((statuses) => {
        if (Object.keys(statuses).length) dispatch({ type: "USER_STATUSES_MERGED", statuses });
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, exitSearch],
  );

  // Trigger search restored from URL after init
  useEffect(() => {
    if (state.phase !== "ready") return;
    if (!searchAfterInit.current) return;
    const query = searchAfterInit.current;
    searchAfterInit.current = null;
    void performSearch(query);
  }, [state.phase, performSearch]);

  // --- Card click & streams ---
  const loadStreams = useCallback(
    async (type: string, id: string, item: Item, modalExtra: Partial<Modal> = {}) => {
      const gen = ++streamGenRef.current;
      streamAbortRef.current?.abort();
      streamAbortRef.current = new AbortController();
      const streamSignal = streamAbortRef.current.signal;
      const current = () => streamGenRef.current === gen;

      const title = item.name || item.title;
      const poster = item.poster;
      const metaId = id.split(":")[0];
      const itemType = type;
      const addons = client.getStreamAddons();
      // What a subscription from this modal would be about. An episode id
      // (tt…:S:E) means the season; a movie means the film. The tab is
      // seeded from the URL so deep links with ?tab=reviews land on it.
      const subTarget = subscriptionTargetFor(type, id, metaId, modalExtra?.backToEpisodes?.meta);
      const itemMeta = {
        year: item.year,
        releaseInfo: item.releaseInfo,
        imdbRating: item.imdbRating,
        description: item.description,
        tab: reviewsTab(),
        subTarget,
      };

      // Addons we couldn't even probe for streams because their manifest
      // is unreachable or returned a 4xx. Without surfacing these, an
      // empty stream list reads as "no content" when the real cause is
      // an outage on the user's stream addon.
      const inferredFailures: SourceProgress[] = (client.addonStatuses || [])
        .filter((a) => a.status !== "ok")
        .filter((a) => mayServeStreams(a.manifest))
        .map((a) => {
          const host = hostOf(a.baseUrl);
          return { name: a.manifest?.name || host, host, status: "error", kind: a.status };
        });

      // Torznab indexers are fetched through the server (torznabClient)
      // and appear in this list as one extra source, so a user with only
      // indexers still gets streams.
      const useIndexers = hasIndexers();
      const base = { title, poster, metaId, itemType, ...itemMeta, ...modalExtra };

      if (!addons.length && !useIndexers) {
        if (current()) {
          dispatch({ type: "SHOW_MODAL", modal: { view: "streams", ...base, streams: [], failedAddons: inferredFailures } });
        }
        return;
      }

      const sourceStatuses: SourceProgress[] = addons.map((a) => {
        const host = hostOf(a.baseUrl);
        return { name: a.manifest.name || host, host, status: "fetching" };
      });

      const indexerIdx = useIndexers ? sourceStatuses.length : -1;
      if (useIndexers) {
        // host, not just name: FetchingView labels every row from `host`.
        const label = indexerLabel();
        sourceStatuses.push({ name: label, host: label, status: "fetching" });
      }

      const showFetching = () => {
        if (current()) dispatch({ type: "SHOW_MODAL", modal: { view: "fetching", ...base, addons: [...sourceStatuses] } });
      };
      showFetching();

      // Per-source buckets rather than one shared array: the merge order
      // has to be deterministic (addons before indexers) so that the
      // dedup below keeps the addon copy of a shared torrent, which is
      // the one carrying a file index.
      const bySource: Stream[][] = sourceStatuses.map(() => []);
      const promises = addons.map(async (addon, i) => {
        try {
          const streams = await client.fetchStreamFromAddon(addon, type, id, { signal: streamSignal });
          sourceStatuses[i] = { ...sourceStatuses[i], status: "done", count: streams.length };
          bySource[i] = streams;
        } catch {
          sourceStatuses[i] = { ...sourceStatuses[i], status: "error" };
        }
        showFetching();
      });

      if (useIndexers) {
        promises.push(
          (async () => {
            try {
              const streams = await fetchTorznabStreams(type, id, { signal: streamSignal });
              // Relabel: the response carries the indexer's current name.
              const done = indexerLabel();
              sourceStatuses[indexerIdx] = {
                ...sourceStatuses[indexerIdx],
                name: done,
                host: done,
                status: "done",
                count: streams.length,
              };
              bySource[indexerIdx] = streams;
            } catch {
              sourceStatuses[indexerIdx] = { ...sourceStatuses[indexerIdx], status: "error" };
            }
            showFetching();
          })(),
        );
      }

      await Promise.allSettled(promises);
      if (!current()) return;
      // Dedup first (order decides which copy wins), then interleave so
      // every source is visible near the top, and what Webtor already
      // holds goes above all of it, marked (availabilityClient). Awaited,
      // so the order is final when shown.
      const allStreams = await withCached(interleaveBySource(dedupeStreamsByHash(bySource.flat())));
      if (!current()) return;
      // Carry per-source statuses into the streams view so the modal can
      // surface "Torrentio failed" instead of the generic empty state.
      const failedFromFetch = sourceStatuses.filter((s) => s.status === "error");
      const failedAddons = [...failedFromFetch, ...inferredFailures];
      dispatch({
        type: "SHOW_MODAL",
        modal: { view: "streams", ...base, streams: allStreams, addons: [...sourceStatuses], failedAddons },
      });
      track("discover-streams-loaded", {
        type,
        id,
        count: allStreams.length,
        cached: allStreams.filter((s) => s.cached).length,
        failedAddons: failedAddons.length,
      });
    },
    [client],
  );

  const cardClick = useCallback(
    async (clicked: Item) => {
      let item = clicked;
      const type = item.type || stateRef.current.selectedType || "movie";
      const id = item.id;
      const restoreSeason = modalSeasonRef.current;
      modalSeasonRef.current = null;

      // Grid items arrive already overlaid via displayItems, but deep
      // links don't — apply the cached translation here so every modal
      // dispatch sees the localized name/description. On a cold cache,
      // fetch this one id and patch the open modal in place.
      if (getCachedLocalized(id)) {
        item = withLocalized(item);
      } else {
        void fetchLocalized([{ id, type }]).then((found) => {
          if (!Object.keys(found).length) return;
          dispatch({ type: "LOCALIZED_MERGED", localized: found });
          const l = found[id];
          const cur = stateRef.current.modal;
          if (l && cur && (cur.metaId === id || cur.itemId === id) && !cur.backToEpisodes) {
            dispatch({
              type: "SHOW_MODAL",
              modal: { ...cur, title: l.title || cur.title, description: l.plot || cur.description },
            });
          }
        });
      }

      // Watchlist conversion telemetry: a click from the watchlist view
      // is the only signal that "saved → opened to stream".
      if (stateRef.current.watchlistFilterEnabled) track("stream-from-watchlist");

      if (url.isPopstate.current) {
        url.replace({ id, season: restoreSeason ?? null, episode: null });
      } else {
        url.push({ id, season: null, episode: null });
      }

      // Build metadata from catalog item; fetchMeta fills in missing fields.
      const cardMeta = {
        year: item.year,
        releaseInfo: item.releaseInfo,
        imdbRating: item.imdbRating,
        description: item.description,
      };
      const enrichFromMeta = (meta: Meta | null) => {
        if (!meta) return;
        if (!cardMeta.description && meta.description) cardMeta.description = meta.description;
        if (!cardMeta.imdbRating && meta.imdbRating) cardMeta.imdbRating = meta.imdbRating;
        if (!cardMeta.releaseInfo && meta.releaseInfo) cardMeta.releaseInfo = meta.releaseInfo;
        if (!cardMeta.year && meta.year) cardMeta.year = meta.year;
      };

      if (type === "series") {
        dispatch({
          type: "SHOW_MODAL",
          modal: {
            view: "loading",
            title: item.name,
            poster: item.poster,
            subtitle: t("discover.loadingEpisodes"),
            itemType: type,
            itemId: id,
            ...cardMeta,
          },
        });
        try {
          const meta = await client.fetchMeta(type, id);
          enrichFromMeta(meta);
          if (meta?.videos?.length) {
            // A localized title beats Cinemeta's English meta.name; the
            // cache is re-read at dispatch time.
            dispatch({
              type: "SHOW_MODAL",
              modal: {
                view: "episodes",
                title: localizedTitle(id, meta.name, item.name),
                poster: meta.poster || item.poster,
                meta,
                itemId: id,
                itemType: type,
                ...cardMeta,
                tab: reviewsTab(),
                defaultSeason: restoreSeason != null ? Number(restoreSeason) : undefined,
              },
            });
          } else {
            await loadStreams(type, id, { ...item, ...cardMeta });
          }
        } catch {
          await loadStreams(type, id, { ...item, ...cardMeta });
        }
      } else {
        // Fetch meta in parallel with streams to enrich the modal.
        const metaPromise = client.fetchMeta(type, id).catch(() => null);
        const streamsPromise = loadStreams(type, id, { ...item, ...cardMeta });
        const meta = await metaPromise;
        await streamsPromise;
        if (meta) {
          enrichFromMeta(meta);
          const cur = stateRef.current.modal;
          if (cur && cur.metaId === id.split(":")[0]) {
            dispatch({
              type: "SHOW_MODAL",
              modal: {
                ...cur,
                ...cardMeta,
                title: localizedTitle(id, meta.name, cur.title),
                poster: meta.poster || cur.poster,
              },
            });
          }
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, loadStreams],
  );

  // Bridge from an AI recommendation card to the regular stream-loading flow.
  const handleAICardClick = useCallback(
    (aiItem: AIItem) => {
      if (!aiItem?.video_id) return;
      void cardClick({
        id: aiItem.video_id,
        name: aiItem.title,
        poster: aiItem.poster,
        type: aiItem.type || "movie",
        year: aiItem.year,
        imdbRating: aiItem.rating,
        description: aiItem.plot,
      });
    },
    [cardClick],
  );

  const openModalById = useCallback(
    async (id: string) => {
      const cur = stateRef.current;
      // Try to find the item in loaded items or search results
      const item =
        cur.items.find((i) => i.id === id) ||
        cur.searchResults.find((i) => i.id === id) ||
        cur.watchlistItems.find((i) => i.id === id);
      const ep = modalEpisodeRef.current;
      modalEpisodeRef.current = null;

      if (ep) {
        // Restore directly to streams for a specific episode, fetching meta for back-nav
        const type = item?.type || cur.selectedType || "series";
        const epId = `${id}:${ep.season}:${ep.episode}`;
        const name = item?.name || id;
        const epName = `${name} - ${Number(ep.season) === 0 ? t("discover.specials") : `S${ep.season}`} E${ep.episode}`;
        const poster = item?.poster;
        if (url.isPopstate.current) {
          url.replace({ id, season: ep.season, episode: ep.episode });
        } else {
          url.push({ season: ep.season, episode: ep.episode });
        }

        // Fetch meta in parallel with stream loading so we can offer "back to episodes"
        const metaPromise = client.fetchMeta(type, id).catch(() => null);

        await loadStreams(
          type,
          epId,
          {
            id: epId,
            name: epName,
            poster,
            year: item?.year,
            releaseInfo: item?.releaseInfo,
            imdbRating: item?.imdbRating,
            description: item?.description,
          },
          {},
        );

        const meta = await metaPromise;
        if (meta?.videos?.length) {
          const backToEpisodes: BackToEpisodes = {
            title: name,
            poster,
            meta,
            itemId: id,
            itemType: type,
            season: ep.season,
            year: item?.year,
            releaseInfo: item?.releaseInfo,
            imdbRating: item?.imdbRating,
            description: item?.description,
          };
          const open = stateRef.current.modal;
          if (open) dispatch({ type: "SHOW_MODAL", modal: { ...open, backToEpisodes } });
        }
      } else if (item) {
        void cardClick(item);
      } else {
        // Item not in loaded data — open with minimal info, the modal loads via API
        void cardClick({ id, name: id, type: cur.selectedType || undefined });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, cardClick, loadStreams],
  );

  const onEpisodeSelect = useCallback(
    async (episode: Video, item: Modal) => {
      const type = item.itemType || "series";
      const epId = episode.id || `${item.itemId}:${episode.season}:${episode.episode}`;
      const epName = `${item.title} - ${
        Number(episode.season) === 0 ? t("discover.specials") : `S${episode.season || "?"}`
      } E${episode.episode || "?"}`;
      // tab: null — drilling into an episode leaves the reviews tab of the
      // episodes view behind; the episode's streams open on the primary tab.
      url.push({ season: episode.season, episode: episode.episode, tab: null });

      const backToEpisodes: BackToEpisodes = {
        title: item.title,
        poster: item.poster,
        meta: item.meta,
        itemId: item.itemId || "",
        itemType: item.itemType,
        season: episode.season,
        year: item.year,
        releaseInfo: item.releaseInfo,
        imdbRating: item.imdbRating,
        description: item.description,
      };

      await loadStreams(
        type,
        epId,
        {
          id: epId,
          name: epName,
          poster: item.poster,
          year: item.year,
          releaseInfo: item.releaseInfo,
          imdbRating: item.imdbRating,
          description: item.description,
        },
        { backToEpisodes },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadStreams],
  );

  // Direct jump to the episodes view — NOT history.back(): the history
  // may contain tab-switch entries (?tab=reviews), and the button
  // promises "Episodes", not "previous step". Pushes a proper episodes
  // URL so browser-back from there returns to these streams.
  const onBackToEpisodes = useCallback(() => {
    const back = stateRef.current.modal?.backToEpisodes;
    if (!back) {
      window.history.back();
      return;
    }
    url.push({ episode: null, tab: null });
    dispatch({ type: "SHOW_MODAL", modal: episodesModalFromBack(back) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSeasonChange = useCallback(
    (season: number) => url.push({ season, episode: null }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // startLoad posts POST / for its JSON answer (the load job's log) and
  // shows the job's progress in the modal; ProgressView opens the
  // torrent's page when the job redirects.
  const startLoad = useCallback(async (fields: Record<string, string>, fileIdx: number | null, infoHash: string) => {
    const before = stateRef.current.modal;
    const shown = {
      title: before?.title,
      poster: before?.poster,
      ...modalIdentity(before),
      fileIdx,
      infoHash,
    };
    const gen = ++loadGenRef.current;
    dispatch({ type: "SHOW_MODAL", modal: { view: "progress", ...shown, logUrl: null } });

    try {
      const formData = new FormData();
      for (const [name, value] of Object.entries(fields)) formData.append(name, value);
      formData.append("_csrf", getEnv().csrf);
      const response = await fetch(langPath("/"), {
        method: "POST",
        body: formData,
        credentials: "same-origin",
        headers: { Accept: "application/json", "X-CSRF-TOKEN": getEnv().csrf },
      });
      if (!response.ok) throw new Error("POST failed");
      const data = await response.json();
      const logUrl = data.job_log_url;
      if (!logUrl) throw new Error("No job log URL");
      if (gen !== loadGenRef.current || !stateRef.current.modal) return;
      dispatch({ type: "SHOW_MODAL", modal: { view: "progress", ...shown, logUrl } });
    } catch {
      if (gen !== loadGenRef.current || !stateRef.current.modal) return;
      dispatch({
        type: "SHOW_MODAL",
        modal: {
          view: "streams",
          title: before?.title,
          poster: before?.poster,
          ...modalIdentity(before),
          streams: [],
          error: t("discover.resourcePrepError"),
          backToEpisodes: before?.backToEpisodes,
        },
      });
    }
  }, []);

  const handleStreamClick = useCallback(
    (infoHash: string, fileIdx: number | null) => {
      const fields: Record<string, string> = { resource: infoHash };
      const metaId = stateRef.current.modal?.metaId;
      if (metaId) fields.hint_video_id = metaId;
      void startLoad(fields, fileIdx, infoHash);
    },
    [startLoad],
  );

  // The dead-magnet card's "wait longer": the same load, given more time.
  const handleRetryLong = useCallback(
    (card: MagnetError) => {
      const m = stateRef.current.modal;
      const fields: Record<string, string> = { resource: card.query, "magnet-wait": "long" };
      const hint = card.hintVideoId || m?.metaId;
      if (hint) fields.hint_video_id = hint;
      void startLoad(fields, m?.fileIdx ?? null, m?.infoHash || card.query);
    },
    [startLoad],
  );

  const closeModal = useCallback(() => {
    streamGenRef.current++;
    loadGenRef.current++;
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    dispatch({ type: "CLOSE_MODAL" });
    url.replace({ id: null, season: null, episode: null, tab: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Primary ⇄ reviews tab inside the stream modal. The tab lives in the
  // ?tab= URL param (pushed, so browser back/forward walks the tabs) and
  // mirrors into modal.tab for rendering.
  const handleModalTabChange = useCallback(
    (tab: "primary" | "reviews") => {
      const m = stateRef.current.modal;
      if (!m) return;
      const reviews = tab === "reviews";
      dispatch({ type: "SHOW_MODAL", modal: { ...m, tab: reviews ? "reviews" : undefined } });
      url.push({ tab: reviews ? "reviews" : null });
      if (reviews) track("discover-reviews-expand", { id: m.metaId || m.itemId });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const selectSearchType = useCallback(
    (searchType: string) => {
      url.push({ "search-type": searchType === "all" ? null : searchType });
      dispatch({ type: "SELECT_SEARCH_TYPE", searchType });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // --- Watchlist ---
  const loadWatchlistItems = useCallback(async () => {
    const data = await fetchWatchlist();
    dispatch({ type: "WATCHLIST_ITEMS_LOADED", items: data.items, ids: data.ids, limit: data.limit });
  }, []);

  // setMode flips between the catalog grid and the watchlist grid: the
  // Catalog | Watchlist switch and popstate both come through here.
  // skipUrl is set by the popstate handler so we don't push a redundant
  // history entry while consuming the URL state.
  const setMode = useCallback(
    (mode: "catalog" | "watchlist", { skipUrl = false }: { skipUrl?: boolean } = {}) => {
      const cur = stateRef.current;
      const wantWatchlist = mode === "watchlist";
      if (wantWatchlist === cur.watchlistFilterEnabled) return;
      track("watchlist-mode-changed", { mode });
      if (!skipUrl) {
        url.push(
          wantWatchlist
            ? {
                watchlist: "1",
                "catalog-base": null,
                "catalog-id": null,
                type: null,
                page: null,
                id: null,
                season: null,
                episode: null,
              }
            : { watchlist: null, id: null, season: null, episode: null },
        );
      }
      dispatch({ type: "WATCHLIST_FILTER_SET", enabled: wantWatchlist });
      if (wantWatchlist && !cur.watchlistItemsLoaded) void loadWatchlistItems();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadWatchlistItems],
  );

  // Keep refs in sync for the async handlers and popstate
  openModalByIdRef.current = (id) => void openModalById(id);
  performSearchRef.current = (q) => void performSearch(q);

  // --- Browser back/forward ---
  url.onPopstate((urlParams) => {
    const id = urlParams.get("id");
    const season = urlParams.get("season");
    const episode = urlParams.get("episode");
    const type = urlParams.get("type");
    const catalogBase = urlParams.get("catalog-base");
    const catalogId = urlParams.get("catalog-id");
    const search = urlParams.get("search");
    const searchType = urlParams.get("search-type");
    const watchlist = urlParams.get("watchlist") === "1";
    const watchlistType = urlParams.get("watchlist-type");

    const cur = stateRef.current;

    // Tab-only history steps (primary ⇄ reviews within the same open
    // modal view) must not re-open the modal — just sync the tab. The
    // view-shape check (episode param ↔ modal view) keeps this from
    // swallowing steps that also cross the episodes ⇄ streams boundary.
    const urlTab = reviewsTab(urlParams);
    const curModal = stateRef.current.modal;
    const sameModalView =
      curModal &&
      (curModal.view === "streams" ? !!episode || !curModal.backToEpisodes : curModal.view === "episodes" && !episode);
    if (
      id &&
      curModal &&
      sameModalView &&
      (curModal.metaId === id || curModal.itemId === id) &&
      (curModal.tab === "reviews" ? "reviews" : undefined) !== urlTab
    ) {
      dispatch({ type: "SHOW_MODAL", modal: { ...curModal, tab: urlTab } });
      return;
    }

    // Watchlist mode first, so back from a search-while-watchlist-open
    // lands correctly.
    if (watchlist !== cur.watchlistFilterEnabled) {
      url.withPopstate(() => setMode(watchlist ? "watchlist" : "catalog", { skipUrl: true }));
    }
    if (watchlist) {
      const targetWlType = watchlistType || "all";
      if (targetWlType !== (cur.watchlistType || "all")) {
        dispatch({ type: "SELECT_WATCHLIST_TYPE", watchlistType: targetWlType });
      }
      if (id && stateRef.current.modal?.itemId !== id) {
        url.withPopstate(() => openModalByIdRef.current(id));
      } else if (!id && stateRef.current.modal) {
        dispatch({ type: "CLOSE_MODAL" });
      }
      return;
    }

    // Search mode
    if (search) {
      if (!cur.isSearchMode || cur.searchQuery !== search) {
        url.withPopstate(() => performSearchRef.current(search));
      }
      const targetType = searchType || "all";
      if (targetType !== (cur.searchType || "all")) {
        dispatch({ type: "SELECT_SEARCH_TYPE", searchType: targetType });
      }
      if (id && season && episode) {
        modalEpisodeRef.current = { season, episode };
        url.withPopstate(() => openModalByIdRef.current(id));
      } else if (id) {
        url.withPopstate(() => openModalByIdRef.current(id));
      } else if (stateRef.current.modal) {
        dispatch({ type: "CLOSE_MODAL" });
      }
      return;
    }

    // No search param but in search mode — exit search
    if (cur.isSearchMode) {
      url.withPopstate(() => {
        abortCatalog();
        dispatch({ type: "EXIT_SEARCH" });
      });
    }

    // Type change, against the state as it is now: leaving search has
    // just put the first type back.
    if (type && type !== stateRef.current.selectedType) {
      if (getTypes(cur.catalogs).includes(type)) {
        savePrefs({ type });
        dispatch({ type: "SELECT_TYPE", selectedType: type });
      }
    }

    // Catalog change
    if (catalogBase && catalogId) {
      const curCat = stateRef.current.selectedCatalog;
      if (!curCat || curCat.baseUrl !== catalogBase || curCat.id !== catalogId) {
        const match = getCatalogsForType(cur.catalogs, type || stateRef.current.selectedType).find(
          (c) => c.baseUrl === catalogBase && c.id === catalogId,
        );
        if (match) {
          savePrefs({ catalogBase: match.baseUrl, catalogId: match.id });
          dispatch({ type: "SELECT_CATALOG", catalog: match });
        }
      }
    }

    // Modal state
    if (!id) {
      if (stateRef.current.modal) dispatch({ type: "CLOSE_MODAL" });
      return;
    }

    if (season && episode) {
      modalEpisodeRef.current = { season, episode };
      url.withPopstate(() => openModalByIdRef.current(id));
    } else {
      const currentModal = stateRef.current.modal;
      if (currentModal?.view === "episodes" && currentModal?.itemId === id) {
        // Same series, navigating between seasons — force remount via _seasonKey
        dispatch({
          type: "SHOW_MODAL",
          modal: {
            ...currentModal,
            defaultSeason: season != null ? Number(season) : undefined,
            _seasonKey: Date.now(),
          },
        });
      } else if (currentModal?.backToEpisodes) {
        dispatch({
          type: "SHOW_MODAL",
          modal: episodesModalFromBack(currentModal.backToEpisodes, {
            tab: urlTab,
            defaultSeason: season != null ? Number(season) : undefined,
          }),
        });
      } else {
        url.withPopstate(() => openModalByIdRef.current(id));
      }
    }
  });

  // --- Restore pages from URL: after each catalog load, if pages remain, load another ---
  useEffect(() => {
    if (state.phase !== "ready") return;
    if (state.catalogLoading) return;
    if (state.isSearchMode) return;
    if (state.items.length === 0) return;

    if (restoredPageRef.current > 0 && state.hasMore) {
      restoredPageRef.current--;
      restoreInProgressRef.current = true;
      void loadCatalog(state.selectedCatalog, state.items.length, state.items);
      return;
    }

    // Pages done (or were 0). Restore modal if needed.
    restoreInProgressRef.current = false;
    if (modalItemIdRef.current) {
      const id = modalItemIdRef.current;
      modalItemIdRef.current = null;
      restoreModalFromUrl(id, url, (x) => openModalByIdRef.current(x), modalEpisodeRef);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.catalogLoading, state.isSearchMode, state.items.length, loadCatalog]);

  // Restore modal from URL after search results load
  useEffect(() => {
    if (state.phase !== "ready") return;
    if (!state.isSearchMode) return;
    if (state.searchLoading) return;
    if (!modalItemIdRef.current) return;
    if (state.searchResults.length === 0) return;

    const id = modalItemIdRef.current;
    modalItemIdRef.current = null;
    restoreModalFromUrl(id, url, (x) => openModalByIdRef.current(x), modalEpisodeRef);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.isSearchMode, state.searchLoading, state.searchResults.length]);

  // A deep link to a title in the watchlist view, or one whose catalog
  // cannot load (an addon down, no items): nothing above will restore it,
  // so open it once the view has settled.
  useEffect(() => {
    if (state.phase !== "ready" || !modalItemIdRef.current) return;
    const settled =
      (state.watchlistFilterEnabled && state.watchlistItemsLoaded) ||
      (!state.isSearchMode &&
        !state.watchlistFilterEnabled &&
        !state.catalogLoading &&
        state.items.length === 0 &&
        (state.selectedCatalog?.disabled || !state.hasMore));
    if (!settled) return;
    const id = modalItemIdRef.current;
    modalItemIdRef.current = null;
    restoreModalFromUrl(id, url, (x) => openModalByIdRef.current(x), modalEpisodeRef);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.phase,
    state.watchlistFilterEnabled,
    state.watchlistItemsLoaded,
    state.isSearchMode,
    state.catalogLoading,
    state.items.length,
    state.hasMore,
    state.selectedCatalog,
  ]);

  // Sync state to URL
  useEffect(() => {
    if (state.phase !== "ready") return;
    // Don't overwrite URL during page/modal restore
    if (restoreInProgressRef.current) return;

    const params: Record<string, string | number> = {};
    if (state.isSearchMode) {
      if (state.searchQuery) params.search = state.searchQuery;
      if (state.searchType && state.searchType !== "all") params["search-type"] = state.searchType;
    } else if (state.watchlistFilterEnabled) {
      params.watchlist = "1";
      if (state.watchlistType && state.watchlistType !== "all") params["watchlist-type"] = state.watchlistType;
    } else {
      if (state.selectedType) params.type = state.selectedType;
      if (state.selectedCatalog) {
        params["catalog-base"] = state.selectedCatalog.baseUrl;
        params["catalog-id"] = state.selectedCatalog.id;
      }
      if (state.page > 0) params.page = state.page;
    }

    // Preserve modal params if present
    const cur = new URLSearchParams(window.location.search);
    for (const k of ["id", "season", "episode", "tab"]) {
      const v = cur.get(k);
      if (v != null) params[k] = v;
    }

    url.replaceAll(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.phase,
    state.selectedType,
    state.selectedCatalog,
    state.isSearchMode,
    state.searchQuery,
    state.searchType,
    state.watchlistFilterEnabled,
    state.watchlistType,
    state.page,
  ]);

  // Re-reads the manifests and lands on the first catalog (the error
  // state's retry, and after the first wizard).
  const reinit = useCallback(async () => {
    client.resetManifests();
    prevCatalogRef.current = null;
    dispatch({ type: "SET_PHASE", phase: "loading" });
    try {
      const { manifests, catalogs, types, addons } = await loadManifests(client);
      if (!types.length) {
        dispatch({ type: "ADDONS_UPDATED", addons });
        dispatch({ type: "SET_PHASE", phase: "no-catalogs" });
        return;
      }
      const selectedType = types[0];
      const selectedCatalog = getCatalogsForType(catalogs, selectedType)[0] || null;
      dispatch({
        type: "INIT_SUCCESS",
        manifests,
        catalogs,
        selectedType,
        selectedCatalog,
        addons,
        viewMode: getViewMode(),
      });
    } catch {
      dispatch({ type: "INIT_ERROR", message: t("discover.manifestLoadError") });
    }
  }, [client]);

  // Re-fetches streams for the currently-open modal (the modal's
  // "Retry" when one or more addons failed). Manifests are refreshed
  // first so newly-recovered addons are picked up.
  const retryStreams = useCallback(async () => {
    const m = stateRef.current.modal;
    if (!m) return;
    try {
      const { addons } = await loadManifests(client);
      dispatch({ type: "ADDONS_UPDATED", addons });
    } catch {
      /* retry can still hit live addons */
    }

    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    const season = params.get("season");
    const episode = params.get("episode");
    if (!id) return;
    const streamId = season != null && episode != null ? `${id}:${season}:${episode}` : id;
    const type = m.backToEpisodes?.itemType || m.itemType || stateRef.current.selectedType || "movie";
    await loadStreams(
      type,
      streamId,
      {
        id: streamId,
        name: m.title,
        poster: m.poster,
        year: m.year,
        releaseInfo: m.releaseInfo,
        imdbRating: m.imdbRating,
        description: m.description,
      },
      m.backToEpisodes ? { backToEpisodes: m.backToEpisodes } : {},
    );
  }, [client, loadStreams]);

  // Lightweight retry from the AddonHealthChip — does NOT drop the user
  // back into the loading view. Re-fetches manifests, updates addon
  // health + catalog disabled flags, and reloads a selected catalog that
  // came back online.
  const retryAddons = useCallback(async () => {
    try {
      client.resetManifests();
      const { manifests, catalogs, types, addons } = await loadManifests(client);
      const cur = stateRef.current;
      let selectedType = cur.selectedType;
      if (!selectedType || !types.includes(selectedType)) selectedType = types[0] || null;
      let selectedCatalog = cur.selectedCatalog;
      if (selectedCatalog) {
        const sel = selectedCatalog;
        const match = catalogs.find((c) => c.baseUrl === sel.baseUrl && c.id === sel.id && c.type === selectedType);
        selectedCatalog = match || (selectedType ? getCatalogsForType(catalogs, selectedType)[0] || null : null);
      } else if (selectedType) {
        selectedCatalog = getCatalogsForType(catalogs, selectedType)[0] || null;
      }
      if (!types.length) {
        dispatch({ type: "ADDONS_UPDATED", addons });
        dispatch({ type: "SET_PHASE", phase: "no-catalogs" });
        return;
      }
      prevCatalogRef.current = null;
      dispatch({
        type: "INIT_SUCCESS",
        manifests,
        catalogs,
        selectedType,
        selectedCatalog,
        addons,
        viewMode: stateRef.current.viewMode,
      });
    } catch {
      // Keep the page rendered as-is; the chip keeps its failure state.
    }
  }, [client]);

  // --- Wizard callbacks ---
  const onWizardComplete = useCallback(
    async (savedUrls: string[], result: BatchResult) => {
      setShowWizard(false);
      setAddonsInstalled(true);
      if (result) {
        toast(
          result.skipped > 0
            ? tf("discover.addonsAddedSkipped", result.added, result.skipped)
            : tf("discover.addonsAdded", result.added),
        );
      }
      // Add new URLs to the client (strip /manifest.json suffix)
      for (const u of savedUrls) {
        const baseUrl = u.replace(/\/manifest\.json$/, "");
        if (!client.addonUrls.includes(baseUrl)) client.addonUrls.push(baseUrl);
      }

      const pending = pendingStreamRef.current;
      pendingStreamRef.current = null;

      if (pending) {
        // Came from "Set up addons" in the stream modal — silently refresh
        // manifests, keep the current type/catalog, just reload streams.
        try {
          await client.fetchAllManifests();
        } catch {
          /* streams may still work */
        }

        // Same identity-carry as startLoad: pending.modal holds the full
        // pre-wizard modal, so the recreated modal keeps the watched/rate
        // buttons and reviews tab alive.
        const pendingIdentity = {
          ...modalIdentity(pending.modal),
          itemType: pending.modal?.itemType || pending.type,
        };
        dispatch({
          type: "SHOW_MODAL",
          modal: {
            view: "loading",
            title: pending.title,
            poster: pending.poster,
            ...pendingIdentity,
            subtitle: t("discover.loading"),
          },
        });
        let streams: Stream[] = [];
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            streams = await client.fetchStreams(pending.type, pending.streamId);
          } catch {
            streams = [];
          }
          if (streams.length > 0) break;
          if (attempt < 2) await new Promise((r) => setTimeout(r, 2000));
        }
        streams = await withCached(streams);
        dispatch({
          type: "SHOW_MODAL",
          modal: {
            view: "streams",
            title: pending.title,
            poster: pending.poster,
            ...pendingIdentity,
            streams,
            backToEpisodes: pending.backToEpisodes,
          },
        });
        // Restore URL params so browser back returns to this modal
        url.push({ id: pending.id, season: pending.season, episode: pending.episode });
      } else {
        await reinit();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, reinit],
  );

  const onWizardSkip = useCallback(() => {
    setShowWizard(false);
    const pending = pendingStreamRef.current;
    if (pending) {
      pendingStreamRef.current = null;
      if (pending.modal) dispatch({ type: "SHOW_MODAL", modal: pending.modal });
      url.push({ id: pending.id, season: pending.season, episode: pending.episode });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSetupAddons = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    const cur = stateRef.current;
    if (id) {
      const season = params.get("season");
      const episode = params.get("episode");
      // For episodes, the stream id is "tt123:season:episode"
      const streamId = season != null && episode != null ? `${id}:${season}:${episode}` : id;
      const type = cur.modal?.backToEpisodes?.itemType || cur.selectedType || "movie";
      pendingStreamRef.current = {
        streamId,
        type,
        title: cur.modal?.title,
        poster: cur.modal?.poster,
        backToEpisodes: cur.modal?.backToEpisodes,
        id,
        season,
        episode,
        modal: cur.modal,
      };
    }
    closeModal();
    setShowWizard(true);
  }, [closeModal]);

  // --- Watched / Rating ---
  const handleToggleWatched = useCallback(async (item: Item) => {
    const cur = stateRef.current;
    const type = item.type || cur.selectedType || "movie";
    const prev = cur.userStatuses[item.id];
    const currentlyWatched = prev?.watched || false;

    if (currentlyWatched) {
      // Unmark: clear watched + rating (server deletes the status row)
      dispatch({ type: "USER_STATUSES_MERGED", statuses: { [item.id]: { watched: false, rating: 0 } } });
      const result = await toggleWatched(item.id, type, true);
      if (!result) dispatch({ type: "USER_STATUSES_MERGED", statuses: { [item.id]: { ...prev } } });
    } else {
      // Mark watched, then prompt for rating
      dispatch({ type: "USER_STATUSES_MERGED", statuses: { [item.id]: { ...prev, watched: true } } });
      const result = await toggleWatched(item.id, type, false);
      if (result) {
        if (result.rateForm) setRatingTarget({ item, type, currentRating: 0 });
      } else {
        dispatch({ type: "USER_STATUSES_MERGED", statuses: { [item.id]: { ...prev } } });
      }
    }
  }, []);

  const handleOpenRating = useCallback((item: Item) => {
    const cur = stateRef.current;
    const type = item.type || cur.selectedType || "movie";
    const currentRating = cur.userStatuses[item.id]?.rating || 0;
    setRatingTarget({ item, type, currentRating });
  }, []);

  const handleAIToggleWatched = useCallback(
    (aiItem: AIItem) => {
      if (!aiItem?.video_id) return;
      void handleToggleWatched({ id: aiItem.video_id, type: aiItem.type || "movie" });
    },
    [handleToggleWatched],
  );

  const handleAIOpenRating = useCallback(
    (aiItem: AIItem) => {
      if (!aiItem?.video_id) return;
      handleOpenRating({ id: aiItem.video_id, type: aiItem.type || "movie" });
    },
    [handleOpenRating],
  );

  // Cheap prefetch on mount: ids only, for heart highlighting on every
  // IMDB card across catalog / search / AI grids. Full items load lazily
  // on toggle-on.
  useEffect(() => {
    let cancelled = false;
    void fetchWatchlistIds().then(({ ids, limit }) => {
      if (!cancelled) dispatch({ type: "WATCHLIST_IDS_LOADED", ids, limit });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Same cheap prefetch for subscriptions: which bells are already filled.
  useEffect(() => {
    let cancelled = false;
    void fetchSubscriptionIds().then(({ keys }) => {
      if (!cancelled) dispatch({ type: "SUBSCRIPTIONS_LOADED", keys });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // If the watchlist view is active (direct URL or popstate) and items
  // aren't loaded yet, fetch them.
  useEffect(() => {
    if (!state.watchlistFilterEnabled) return;
    if (state.watchlistItemsLoaded) return;
    void loadWatchlistItems();
  }, [state.watchlistFilterEnabled, state.watchlistItemsLoaded, loadWatchlistItems]);

  // handleToggleWatchlist accepts a Cinemeta-shape item ({id, type, name,
  // poster, ...}) OR an AI shape ({video_id, title, poster, type, ...}).
  const handleToggleWatchlist = useCallback(async (rawItem: Item | AIItem) => {
    if (!rawItem) return;
    const ai = "video_id" in rawItem ? rawItem : null;
    const plain = ai ? null : (rawItem as Item);
    const videoId = plain ? plain.id : ai!.video_id;
    if (!videoId || !videoId.startsWith("tt")) return;
    const cur = stateRef.current;
    const type = rawItem.type || cur.selectedType || "movie";
    if (type !== "movie" && type !== "series") return;

    const inList = cur.watchlistIds.has(videoId);
    // Source bucket for analytics: AI cards have video_id, catalog/search cards have id.
    const source = ai ? "ai" : cur.isSearchMode ? "search" : "catalog";

    // Toast text always comes from the server response so it stays in the
    // page's language; a generic message only when the server didn't answer.
    if (inList) {
      const snapshot = cur.watchlistItems.find((it) => it.id === videoId);
      dispatch({ type: "WATCHLIST_REMOVE", videoId });
      track("watchlist-removed", { id: videoId, source });
      const result = await removeFromWatchlist(videoId, type);
      if (!result.ok) {
        if (snapshot) dispatch({ type: "WATCHLIST_ADD", item: snapshot });
        toast(result.message || t("discover.networkError"), "error");
      } else if (result.message) {
        toast(result.message);
      }
    } else {
      const item: Item = {
        id: videoId,
        type,
        name: plain?.name || plain?.title || ai?.title || "",
        year: rawItem.year,
        poster: rawItem.poster || `/lib/${type}/poster/${videoId}/500.jpg`,
        imdbRating: plain ? plain.imdbRating : ai?.rating || undefined,
      };
      dispatch({ type: "WATCHLIST_ADD", item });
      track("watchlist-added", { id: videoId, source });
      const result = await addToWatchlist(videoId, type, source);
      if (!result.ok) {
        dispatch({ type: "WATCHLIST_REMOVE", videoId });
        toast(result.message || t("discover.networkError"), "error");
      } else if (result.message) {
        toast(result.message);
      }
    }
  }, []);

  // handleToggleSubscription drives every subscribe affordance in the
  // modal. subscriptionToggling holds the keys with a request in flight:
  // a double-click whose DELETE overtakes its own POST would leave the
  // server subscribed while the bell shows off, so the second click is
  // dropped until the first settles.
  const subscriptionToggling = useRef(new Set<string>());
  const handleToggleSubscription = useCallback(async (target: SubTarget) => {
    if (!target || !target.videoId || !target.videoId.startsWith("tt")) return;
    const key = subscriptionKey(target.kind, target.videoId, target.season);
    if (subscriptionToggling.current.has(key)) return;
    subscriptionToggling.current.add(key);
    try {
      const subscribed = stateRef.current.subscriptionKeys.has(key);

      if (subscribed) {
        dispatch({ type: "SUBSCRIPTION_REMOVE", key });
        track("release-sub-removed", { kind: target.kind, id: target.videoId, source: target.source });
        const result = await unsubscribe(target);
        if (!result.ok) {
          dispatch({ type: "SUBSCRIPTION_ADD", key });
          toast(result.message || t("discover.networkError"), "error");
        } else if (result.message) {
          toast(result.message);
        }
        return;
      }

      dispatch({ type: "SUBSCRIPTION_ADD", key });
      track("release-sub-created", { kind: target.kind, id: target.videoId, source: target.source });
      const result = await subscribe(target);
      if (!result.ok) {
        // Rolled back on every refusal — the cap, a season that turned
        // out to be over, a network failure. The message is the server's.
        dispatch({ type: "SUBSCRIPTION_REMOVE", key });
        if (result.code === "limit_exceeded") track("release-sub-limit-hit", { limit: result.limit });
        toast(result.message || t("discover.networkError"), "error");
      } else if (result.message) {
        toast(result.message);
      }
    } finally {
      subscriptionToggling.current.delete(key);
    }
  }, []);

  const handleRate = useCallback(
    async (rating: number) => {
      if (!ratingTarget) return;
      const { item, type } = ratingTarget;
      setRatingTarget(null);
      const prevStatus = stateRef.current.userStatuses[item.id];
      dispatch({ type: "USER_STATUSES_MERGED", statuses: { [item.id]: { ...prevStatus, watched: true, rating } } });
      const ok = await rateVideo(item.id, type, rating);
      if (!ok) dispatch({ type: "USER_STATUSES_MERGED", statuses: { [item.id]: { ...prevStatus } } });
    },
    [ratingTarget],
  );

  const handleUnrate = useCallback(async () => {
    if (!ratingTarget) return;
    const { item, type } = ratingTarget;
    setRatingTarget(null);
    const prev = stateRef.current.userStatuses[item.id];
    dispatch({ type: "USER_STATUSES_MERGED", statuses: { [item.id]: { ...prev, rating: 0 } } });
    const ok = await unrateVideo(item.id, type);
    if (!ok) dispatch({ type: "USER_STATUSES_MERGED", statuses: { [item.id]: { ...prev } } });
  }, [ratingTarget]);

  // --- Derived data ---
  const types = useMemo(() => getTypes(state.catalogs), [state.catalogs]);
  const catalogsForType = useMemo(
    () => getCatalogsForType(state.catalogs, state.selectedType),
    [state.catalogs, state.selectedType],
  );
  const searchTypes = useMemo(() => getSearchTypes(state.searchResults), [state.searchResults]);
  const watchlistTypes = useMemo(() => getSearchTypes(state.watchlistItems), [state.watchlistItems]);

  const displayItems = useMemo(() => {
    let items: Item[];
    if (state.isSearchMode) {
      items = state.searchType === "all" ? state.searchResults : getSearchResultsForType(state.searchResults, state.searchType);
    } else if (state.watchlistFilterEnabled) {
      items =
        state.watchlistType === "all"
          ? state.watchlistItems
          : getSearchResultsForType(state.watchlistItems, state.watchlistType);
    } else {
      items = state.items;
    }
    return overlayLocalized(items, state.localized);
  }, [
    state.isSearchMode,
    state.items,
    state.searchResults,
    state.searchType,
    state.watchlistFilterEnabled,
    state.watchlistItems,
    state.watchlistType,
    state.localized,
  ]);

  const showBadges = state.isSearchMode
    ? state.searchType === "all"
    : state.watchlistFilterEnabled
      ? state.watchlistType === "all"
      : false;

  const selectWatchlistType = useCallback((wt: string) => {
    dispatch({ type: "SELECT_WATCHLIST_TYPE", watchlistType: wt });
  }, []);

  // Calendar view: a per-user series-only mode, kept in prefs so the
  // choice follows the user to every series catalog.
  const selectViewMode = useCallback((mode: "grid" | "calendar") => {
    if (mode === stateRef.current.viewMode) return;
    savePrefs({ viewMode: mode });
    track(mode === "calendar" ? "discover-view-mode-calendar" : "discover-view-mode-grid");
    dispatch({ type: "SET_VIEW_MODE", viewMode: mode });
  }, []);

  // A CalendarView episode click goes straight to that episode's streams,
  // with the meta the calendar already fetched for "‹ Episodes".
  const openEpisodeFromCalendar = useCallback(
    async (item: Item, video: Video, meta: Meta) => {
      const type = item.type || "series";
      const id = item.id;
      const season = video.season;
      const episode = video.episode;
      const epId = video.id || `${id}:${season}:${episode}`;
      const seriesName = localizedTitle(id, meta?.name, item.name) || id;
      const epLabel = Number(season) === 0 ? t("discover.specials") : `S${season} E${episode}`;
      const epName = `${seriesName} - ${epLabel}`;

      // Mirror the cardClick → onEpisodeSelect history shape: entry 1 =
      // just `id` (the episodes view), entry 2 = + season/episode (the
      // streams), so "‹ Episodes" via back falls back to the episode list.
      url.push({ id, season: null, episode: null });
      url.push({ season, episode });

      const cardMeta = {
        year: item.year,
        releaseInfo: item.releaseInfo,
        imdbRating: item.imdbRating,
        description: item.description,
      };
      const backToEpisodes: BackToEpisodes | undefined = meta?.videos?.length
        ? { title: seriesName, poster: meta?.poster || item.poster, meta, itemId: id, itemType: type, season, ...cardMeta }
        : undefined;

      await loadStreams(
        type,
        epId,
        { id: epId, name: epName, poster: meta?.poster || item.poster, ...cardMeta },
        backToEpisodes ? { backToEpisodes } : {},
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadStreams],
  );

  // A collapsed "Season N · X episodes" row from the calendar opens the
  // episodes modal at that season.
  const openSeasonFromCalendar = useCallback(
    (item: Item, season: number | undefined, meta: Meta) => {
      const id = item.id;
      url.push({ id, season, episode: null });
      dispatch({
        type: "SHOW_MODAL",
        modal: {
          view: "episodes",
          title: localizedTitle(id, meta?.name, item.name),
          poster: meta?.poster || item.poster,
          meta,
          itemId: id,
          itemType: item.type || "series",
          defaultSeason: Number(season),
          year: item.year,
          releaseInfo: item.releaseInfo,
          imdbRating: item.imdbRating,
          description: item.description,
        },
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // The calendar switch shows in catalog/watchlist mode, disabled (not
  // hidden) where it does not apply, so a movie browser learns it exists.
  const showCalendarToggle = !state.isSearchMode;
  const calendarAvailable = state.isSearchMode
    ? false
    : state.watchlistFilterEnabled
      ? state.watchlistType === "series"
      : state.selectedType === "series";
  const isCalendarMode = calendarAvailable && state.viewMode === "calendar";

  // --- Render ---
  if (state.phase === "loading") return <LoadingSpinner />;
  if (state.phase === "no-addons") return <NoAddons />;
  if (state.phase === "no-catalogs") return <NoCatalogs />;
  if (state.phase === "error" && state.items.length === 0) {
    return <ErrorState message={state.errorMessage} onRetry={() => void reinit()} />;
  }

  const busy = state.catalogLoading || state.searchLoading;
  const calendarLabel = calendarAvailable ? t("discover.view.calendar") : t("discover.view.calendarSeriesOnly");

  return (
    <div className="d-app">
      {/* AI recommendations — hides itself where the instance has none. */}
      <AISection
        aiState={state.ai}
        dispatch={dispatch}
        onCardClick={handleAICardClick}
        userStatuses={state.userStatuses}
        watchlistIds={state.watchlistIds}
        onToggleWatched={handleAIToggleWatched}
        onRate={handleAIOpenRating}
        onToggleWatchlist={(item) => void handleToggleWatchlist(item)}
      />

      <SearchBar
        onSearch={(q) => void performSearch(q)}
        onExit={exitSearch}
        isSearchMode={state.isSearchMode}
        initialQuery={state.searchQuery}
      />

      {/* Sticky toolbar — stays under the nav on scroll */}
      <div className="d-toolbar glass">
        <AddonHealthChip addons={state.addons} onRetry={retryAddons} />
        {state.isSearchMode ? (
          <SearchTabs
            searchResults={state.searchResults}
            searchTypes={searchTypes}
            searchType={state.searchType}
            onSelect={selectSearchType}
          />
        ) : (
          <div className="d-toolbar-row">
            <div className="d-toolbar-left">
              {state.watchlistFilterEnabled ? (
                <SearchTabs
                  searchResults={state.watchlistItems}
                  searchTypes={watchlistTypes}
                  searchType={state.watchlistType}
                  onSelect={selectWatchlistType}
                />
              ) : (
                <TypeTabs types={types} selectedType={state.selectedType} onSelect={selectType} />
              )}
              {!state.watchlistFilterEnabled && catalogsForType.length > 1 && (
                <CatalogSelector catalogs={catalogsForType} selectedCatalog={state.selectedCatalog} onSelect={selectCatalog} />
              )}
            </div>
            <div className="d-toolbar-right">
              <div className="seg" role="group" aria-label={t("discover.modeCatalog")}>
                <button
                  type="button"
                  onClick={() => setMode("catalog")}
                  className={!state.watchlistFilterEnabled ? "seg-item on" : "seg-item"}
                  aria-pressed={!state.watchlistFilterEnabled}
                  title={t("discover.modeCatalog")}
                >
                  <DIcon name="grid" size={16} />
                  <span className="seg-label">{t("discover.modeCatalog")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode("watchlist")}
                  className={state.watchlistFilterEnabled ? "seg-item on" : "seg-item"}
                  aria-pressed={state.watchlistFilterEnabled}
                  title={t("discover.watchlist.label")}
                >
                  <Icon name="heart" size={16} fill={state.watchlistFilterEnabled ? "currentColor" : "none"} />
                  <span className="seg-label">{t("discover.watchlist.label")}</span>
                  {state.watchlistIds.size > 0 && <span className="seg-count">{state.watchlistIds.size}</span>}
                </button>
              </div>
              {showCalendarToggle && (
                <div className="seg" role="group" aria-label={t("discover.view.grid")}>
                  <button
                    type="button"
                    onClick={() => selectViewMode("grid")}
                    className={!isCalendarMode ? "seg-item on icon" : "seg-item icon"}
                    title={t("discover.view.grid")}
                    aria-label={t("discover.view.grid")}
                    aria-pressed={!isCalendarMode}
                  >
                    <DIcon name="columns" size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => calendarAvailable && selectViewMode("calendar")}
                    className={isCalendarMode ? "seg-item on icon" : "seg-item icon"}
                    title={calendarLabel}
                    aria-label={calendarLabel}
                    aria-pressed={isCalendarMode}
                    aria-disabled={!calendarAvailable}
                  >
                    <DIcon name="calendar" size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {busy && <LoadingSpinner />}

      {!busy && state.isSearchMode && state.searchResults.length === 0 && state.searchQuery && (
        <NoResults query={state.searchQuery} />
      )}

      {!busy &&
        !state.isSearchMode &&
        !state.watchlistFilterEnabled &&
        state.items.length === 0 &&
        state.phase === "ready" &&
        state.selectedCatalog?.disabled && <CatalogUnavailable catalog={state.selectedCatalog} onRetry={retryAddons} />}

      {!busy &&
        !state.isSearchMode &&
        !state.watchlistFilterEnabled &&
        state.items.length === 0 &&
        state.phase === "ready" &&
        !state.hasMore &&
        !state.selectedCatalog?.disabled && <Empty icon="film" title={t("discover.noItems")} />}

      {!state.isSearchMode &&
        state.watchlistFilterEnabled &&
        state.watchlistItemsLoaded &&
        state.watchlistItems.length === 0 && (
          <Empty icon="heart" tone="olive" title={t("discover.watchlist.emptyTitle")}>
            {t("discover.watchlist.emptyHint")}
          </Empty>
        )}

      {isCalendarMode ? (
        <CalendarView
          items={displayItems}
          client={client}
          watchlistIds={state.watchlistIds}
          onEpisodeClick={(item, video, meta) => void openEpisodeFromCalendar(item, video, meta)}
          onSeasonDropClick={openSeasonFromCalendar}
          onToggleWatchlist={(item) => void handleToggleWatchlist(item)}
        />
      ) : (
        <ItemGrid
          items={displayItems}
          showBadges={showBadges}
          userStatuses={state.userStatuses}
          watchlistIds={state.watchlistIds}
          onClick={(item) => void cardClick(item)}
          onToggleWatched={(item) => void handleToggleWatched(item)}
          onRate={handleOpenRating}
          onToggleWatchlist={(item) => void handleToggleWatchlist(item)}
        />
      )}

      {!state.isSearchMode &&
        !state.watchlistFilterEnabled &&
        !state.catalogLoading &&
        state.hasMore &&
        state.items.length > 0 && <LoadMore onLoadMore={loadMore} />}

      {state.modal && (
        <StreamModal
          modal={state.modal}
          onClose={closeModal}
          onEpisodeSelect={(episode, m) => void onEpisodeSelect(episode, m)}
          onStreamClick={handleStreamClick}
          onRetryLong={handleRetryLong}
          onBackToEpisodes={state.modal.backToEpisodes ? onBackToEpisodes : undefined}
          onSeasonChange={onSeasonChange}
          hasCustomAddons={hasCustomAddons || addonsInstalled}
          onSetupAddons={onSetupAddons}
          onRetryStreams={retryStreams}
          userStatuses={state.userStatuses}
          watchlistIds={state.watchlistIds}
          onToggleWatched={(item) => void handleToggleWatched(item)}
          onRate={handleOpenRating}
          onToggleWatchlist={(item) => void handleToggleWatchlist(item)}
          onTabChange={handleModalTabChange}
          subscriptionKeys={state.subscriptionKeys}
          onToggleSubscription={(target) => void handleToggleSubscription(target)}
          hasSources={hasCustomAddons || addonsInstalled || hasIndexers()}
          playback={playback}
        />
      )}

      {showWizard && state.phase === "ready" && <AddonWizard onComplete={(u, r) => void onWizardComplete(u, r)} onSkip={onWizardSkip} />}

      {ratingTarget && (
        <RatingDialog
          currentRating={ratingTarget.currentRating}
          onRate={(r) => void handleRate(r)}
          onUnrate={() => void handleUnrate()}
          onClose={() => setRatingTarget(null)}
        />
      )}
    </div>
  );
}
