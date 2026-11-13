// Discover page state reducer

import type { Turn } from "../lib/aiClient.ts";
import type {
  AIChip,
  AIItem,
  Addon,
  AddonStatus,
  Catalog,
  Item,
  Localized,
  Manifest,
  Modal,
  UserStatus,
} from "../types.ts";

export const TYPE_PRIORITY = ["movie", "series"];

export function sortByPriority(types: string[], priority: string[]) {
  return [...types].sort((a, b) => {
    const ai = priority.indexOf(a);
    const bi = priority.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });
}

// Build the flat catalog list shown in the type-tab + selector. Accepts the
// per-addon status list (from StremioClient.fetchAllManifests). Catalogs
// from addons that are currently unreachable but have a cached manifest
// are kept in the list but marked `disabled: true` — the selector renders
// them so the user sees what's missing instead of catalogs vanishing.
export function buildCatalogs(addonStatuses: AddonStatus[]): Catalog[] {
  const catalogs: Catalog[] = [];
  for (const a of addonStatuses) {
    if (!a.manifest) continue;
    const disabled = a.status !== "ok";
    for (const cat of a.manifest.catalogs || []) {
      catalogs.push({
        id: cat.id,
        type: cat.type,
        name: cat.name || cat.id,
        addonName: a.manifest.name || "Unknown",
        baseUrl: a.baseUrl,
        disabled,
        addonStatus: a.status,
      });
    }
  }
  return catalogs;
}

// Compact addon descriptor used by the AddonHealthChip and elsewhere in
// the UI. Pulled from per-addon status (manifest may be cached or absent).
export function buildAddons(addonStatuses: AddonStatus[]): Addon[] {
  return addonStatuses.map((a) => {
    let host = a.baseUrl;
    try {
      host = new URL(a.baseUrl).hostname;
    } catch {
      /* keep raw */
    }
    const m = a.manifest;
    const resources = (m?.resources || [])
      .map((r) => (typeof r === "string" ? r : r?.name))
      .filter((r): r is string => !!r);
    return {
      baseUrl: a.baseUrl,
      host,
      name: m?.name || host,
      status: a.status,
      source: a.source,
      capabilities: resources,
      lastSuccessAt: a.lastSuccessAt || null,
      error: a.error || null,
    };
  });
}

export function getCatalogsForType(catalogs: Catalog[], type: string | null) {
  return catalogs.filter((c) => c.type === type);
}

export function getTypes(catalogs: Catalog[]) {
  const types = [...new Set(catalogs.map((c) => c.type))];
  return sortByPriority(types, TYPE_PRIORITY);
}

export function getSearchTypes(searchResults: Item[]) {
  const types = [...new Set(searchResults.map((r) => r.type).filter((t): t is string => !!t))];
  return sortByPriority(types, TYPE_PRIORITY);
}

export function getSearchResultsForType(searchResults: Item[], type: string) {
  return searchResults.filter((item) => item.type === type);
}

// Overlay localized title/plot (state.localized) onto grid items at render
// time. Items are NOT mutated in state — catalog/search/watchlist arrays
// get replaced wholesale on reload, so a render-time overlay survives that
// while keeping the English original as fallback.
export function overlayLocalized(items: Item[], localized: Record<string, Localized>) {
  if (!localized || Object.keys(localized).length === 0) return items;
  return items.map((item) => {
    const loc = localized[item.id];
    if (!loc) return item;
    return {
      ...item,
      name: loc.title || item.name,
      description: loc.plot || item.description,
    };
  });
}

// AI recommendations slice. Kept flat inside the main discover state so the
// existing reducer switch can handle it without restructuring the whole app.
// See components/ai/AISection.tsx for the UI that reads this slice.
//
// phase transitions:
//   disabled         — feature off on this instance
//   idle             — not yet loaded
//   loadingChips     — chips request in flight
//   chipsReady       — chips visible, awaiting user input
//   chipsError       — chips load failed
//   streamingClaude  — request submitted; waiting for the model (slow phase)
//   streamingResolve — model done; resolver pushing items live
//   recsReady        — stream finished, all items in
//   recsError        — stream failed
//   quotaExceeded    — last call bounced with 402; UI shows upgrade CTA
export type AIPhase =
  | "disabled"
  | "idle"
  | "loadingChips"
  | "chipsReady"
  | "chipsError"
  | "streamingClaude"
  | "streamingResolve"
  | "recsReady"
  | "recsError"
  | "quotaExceeded";

export interface AIState {
  phase: AIPhase;
  chips: AIChip[];
  chipsGeneratedAt: number;
  currentQuery: string;
  recommendations: AIItem[];
  // recsExpanded controls whether the grid shows the full set of
  // recommendations or only the first AI_RECS_INITIAL_VISIBLE entries
  // gated behind a "Show more" button. Reset on every new submit so each
  // query starts collapsed again.
  recsExpanded: boolean;
  // streamExpected is set when the resolver phase begins so the UI can
  // size its loading skeleton. May be larger than the final list because
  // some items get filtered (already-watched, non-IMDB).
  streamExpected: number;
  // Conversation history for /refine — list of {role, content} pairs,
  // mirroring the server's rec.Message shape.
  conversation: Turn[];
  remainingQuota: number | null; // -1 when unknown, null before first load, int otherwise
  dailyQuota: number | null; // per-day cap for the user's tier; null until first load
  upgradeQuota: number | null; // paid tier daily cap; populated only on quota_exceeded for free users
  quotaResetAt: number | null; // unix-seconds the quota rolls over; populated only on quota_exceeded
  tier: string | null; // 'free' | 'paid' — comes from the server
  error: { code: string; message: string } | null;
}

export const initialAIState: AIState = {
  phase: "idle",
  chips: [],
  chipsGeneratedAt: 0,
  currentQuery: "",
  recommendations: [],
  recsExpanded: false,
  streamExpected: 0,
  conversation: [],
  remainingQuota: null,
  dailyQuota: null,
  upgradeQuota: null,
  quotaResetAt: null,
  tier: null,
  error: null,
};

// AI_RECS_INITIAL_VISIBLE is how many cards the user sees before the
// "Show more" button.
export const AI_RECS_INITIAL_VISIBLE = 4;

export type Phase = "loading" | "ready" | "error" | "no-addons" | "no-catalogs";

export interface DiscoverState {
  phase: Phase;
  errorMessage: string;
  manifests: { baseUrl: string; manifest: Manifest }[];
  catalogs: Catalog[];
  // Per-addon health (centralised — see buildAddons / AddonHealthChip).
  // Same source of truth used by the chip on the page header, the
  // disabled groups in CatalogSelector, and the post-fetch failure
  // surface in StreamModal.
  addons: Addon[];
  selectedType: string | null;
  selectedCatalog: Catalog | null;
  items: Item[];
  skip: number;
  hasMore: boolean;
  page: number;
  catalogLoading: boolean;
  // Search
  isSearchMode: boolean;
  searchQuery: string;
  searchResults: Item[];
  searchType: string;
  searchLoading: boolean;
  // Modal
  modal: Modal | null;
  // User statuses — accumulated map of IMDB id → { watched, rating }.
  // Additive-only during a session.
  userStatuses: Record<string, UserStatus>;
  // Localized metadata — accumulated map of video id → { title, plot }
  // from /discover/localize (server enrichment pipeline). Additive-only,
  // overlaid onto grid items / modal at render time. Always empty for
  // English sessions.
  localized: Record<string, Localized>;
  // Release subscriptions: a Set of content keys (see
  // subscriptionsClient.subscriptionKey), not video ids — a subscription
  // is per season, so one series can be in the set several times over.
  subscriptionKeys: Set<string>;
  // Watchlist slice — ids in Set form for O(1) heart lookups in every
  // card, items in adapted Cinemeta shape for the filtered grid.
  // itemsLoaded gates the lazy fetch so we don't refetch the grid every
  // time the toggle is turned on. Limit comes from the server (free-tier
  // soft cap, -1 means unlimited for paid).
  watchlistIds: Set<string>;
  watchlistItems: Item[];
  watchlistItemsLoaded: boolean;
  watchlistFilterEnabled: boolean;
  watchlistLimit: number;
  // 'all' | 'movie' | 'series' — mirrors searchType so we can reuse the
  // SearchTabs component (counts + chip styling) for the watchlist view.
  watchlistType: string;
  // 'grid' | 'calendar'. The calendar view is a series-only mode that
  // re-renders the current displayItems as a timeline of upcoming/recent
  // episodes (see CalendarView). Hydrated from prefs in INIT_SUCCESS.
  viewMode: "grid" | "calendar";
  ai: AIState;
}

export const initialState: DiscoverState = {
  phase: "loading",
  errorMessage: "",
  manifests: [],
  catalogs: [],
  addons: [],
  selectedType: null,
  selectedCatalog: null,
  items: [],
  skip: 0,
  hasMore: true,
  page: 0,
  catalogLoading: false,
  isSearchMode: false,
  searchQuery: "",
  searchResults: [],
  searchType: "all",
  searchLoading: false,
  modal: null,
  userStatuses: {},
  localized: {},
  subscriptionKeys: new Set(),
  watchlistIds: new Set(),
  watchlistItems: [],
  watchlistItemsLoaded: false,
  watchlistFilterEnabled: false,
  watchlistLimit: -1,
  watchlistType: "all",
  viewMode: "grid",
  ai: initialAIState,
};

export type Action =
  | {
      type: "INIT_SUCCESS";
      manifests: DiscoverState["manifests"];
      catalogs: Catalog[];
      selectedType: string | null;
      selectedCatalog: Catalog | null;
      addons?: Addon[];
      viewMode?: "grid" | "calendar";
    }
  | { type: "SET_VIEW_MODE"; viewMode: "grid" | "calendar" }
  | { type: "ADDONS_UPDATED"; addons: Addon[] }
  | { type: "INIT_ERROR"; message: string }
  | { type: "SET_PHASE"; phase: Phase; message?: string }
  | { type: "SELECT_TYPE"; selectedType: string }
  | { type: "SELECT_CATALOG"; catalog: Catalog }
  | { type: "CATALOG_LOADING" }
  | { type: "CATALOG_LOADED"; items: Item[]; append: boolean; hasMore: boolean }
  | { type: "CATALOG_ERROR"; message: string }
  | { type: "SEARCH_START"; query: string }
  | { type: "SEARCH_RESULTS"; results: Item[] }
  | { type: "SELECT_SEARCH_TYPE"; searchType: string }
  | { type: "EXIT_SEARCH" }
  | { type: "SHOW_MODAL"; modal: Modal }
  | { type: "CLOSE_MODAL" }
  | { type: "USER_STATUSES_MERGED"; statuses: Record<string, UserStatus> }
  | { type: "LOCALIZED_MERGED"; localized: Record<string, Localized> }
  | { type: "WATCHLIST_IDS_LOADED"; ids: string[]; limit?: number }
  | { type: "WATCHLIST_ITEMS_LOADED"; items: Item[]; ids: string[]; limit?: number }
  | { type: "WATCHLIST_FILTER_TOGGLE" }
  | { type: "WATCHLIST_FILTER_SET"; enabled: boolean }
  | { type: "SELECT_WATCHLIST_TYPE"; watchlistType: string }
  | { type: "WATCHLIST_ADD"; item: Item }
  | { type: "WATCHLIST_REMOVE"; videoId: string }
  | { type: "SUBSCRIPTIONS_LOADED"; keys: string[] }
  | { type: "SUBSCRIPTION_ADD"; key: string }
  | { type: "SUBSCRIPTION_REMOVE"; key: string }
  | { type: "AI_DISABLED" }
  | { type: "AI_LOAD_CHIPS_START" }
  | { type: "AI_LOAD_CHIPS_CHIP"; chip: AIChip }
  | {
      type: "AI_LOAD_CHIPS_SUCCESS";
      chips?: AIChip[];
      generatedAt?: number;
      tier?: string;
      remainingQuota?: number;
      dailyQuota?: number;
    }
  | { type: "AI_LOAD_CHIPS_ERROR"; error: { code: string; message: string } }
  | { type: "AI_STREAM_START"; query: string; displayQuery?: string; isRefine?: boolean }
  | { type: "AI_STREAM_PHASE"; phase: string; expected?: number }
  | { type: "AI_STREAM_ITEM"; item: AIItem }
  | { type: "AI_STREAM_DONE"; query: string; remainingQuota?: number; dailyQuota?: number; tier?: string }
  | { type: "AI_STREAM_ERROR"; error: { code: string; message: string } }
  | { type: "AI_EXPAND_RECS" }
  | {
      type: "AI_QUOTA_EXCEEDED";
      tier?: string;
      dailyQuota?: number;
      upgradeQuota?: number;
      quotaResetAt?: number;
    }
  | { type: "AI_RESET" };

export function discoverReducer(state: DiscoverState, action: Action): DiscoverState {
  switch (action.type) {
    case "INIT_SUCCESS": {
      const { manifests, catalogs, selectedType, selectedCatalog, addons, viewMode } = action;
      return {
        ...state,
        phase: "ready",
        manifests,
        catalogs,
        addons: addons || state.addons,
        selectedType,
        selectedCatalog,
        viewMode: viewMode || state.viewMode,
      };
    }
    case "SET_VIEW_MODE":
      return { ...state, viewMode: action.viewMode };
    case "ADDONS_UPDATED":
      return { ...state, addons: action.addons };
    case "INIT_ERROR":
      return { ...state, phase: "error", errorMessage: action.message };
    case "SET_PHASE":
      return { ...state, phase: action.phase, errorMessage: action.message || "" };
    case "SELECT_TYPE": {
      const selectedCatalog = getCatalogsForType(state.catalogs, action.selectedType)[0] || null;
      return {
        ...state,
        selectedType: action.selectedType,
        selectedCatalog,
        items: [],
        skip: 0,
        hasMore: true,
        page: 0,
      };
    }
    case "SELECT_CATALOG":
      return { ...state, selectedCatalog: action.catalog, items: [], skip: 0, hasMore: true, page: 0 };
    case "CATALOG_LOADING":
      return { ...state, catalogLoading: true };
    case "CATALOG_LOADED": {
      const newItems = action.append ? [...state.items, ...action.items] : action.items;
      const newPage = action.append ? state.page + 1 : 0;
      return {
        ...state,
        catalogLoading: false,
        items: newItems,
        hasMore: action.hasMore,
        skip: newItems.length,
        page: newPage,
      };
    }
    case "CATALOG_ERROR":
      return state.items.length > 0
        ? { ...state, catalogLoading: false }
        : { ...state, catalogLoading: false, phase: "error", errorMessage: action.message };
    case "SEARCH_START":
      // Search always exits the watchlist filter — search runs against
      // Cinemeta + the user's catalogs, not the local saved list.
      return {
        ...state,
        isSearchMode: true,
        searchQuery: action.query,
        searchResults: [],
        searchLoading: true,
        searchType: "all",
        watchlistFilterEnabled: false,
      };
    case "SEARCH_RESULTS":
      return { ...state, searchLoading: false, searchResults: action.results };
    case "SELECT_SEARCH_TYPE":
      return { ...state, searchType: action.searchType };
    case "EXIT_SEARCH": {
      const types = getTypes(state.catalogs);
      const selectedType = types[0] || null;
      const selectedCatalog = selectedType ? getCatalogsForType(state.catalogs, selectedType)[0] : null;
      return {
        ...state,
        isSearchMode: false,
        searchQuery: "",
        searchResults: [],
        searchType: "all",
        searchLoading: false,
        selectedType,
        selectedCatalog: selectedCatalog || null,
        items: [],
        skip: 0,
        hasMore: true,
        page: 0,
      };
    }
    case "SHOW_MODAL":
      return { ...state, modal: action.modal };
    case "CLOSE_MODAL":
      return { ...state, modal: null };
    case "USER_STATUSES_MERGED": {
      if (!action.statuses || Object.keys(action.statuses).length === 0) return state;
      return { ...state, userStatuses: { ...state.userStatuses, ...action.statuses } };
    }
    case "LOCALIZED_MERGED": {
      if (!action.localized || Object.keys(action.localized).length === 0) return state;
      return { ...state, localized: { ...state.localized, ...action.localized } };
    }

    // --- Watchlist slice ---
    case "WATCHLIST_IDS_LOADED": {
      // Initial / cheap prefetch: just the ids, used for heart
      // highlighting on every IMDB card. Doesn't unblock the
      // filter view — that needs full items.
      const ids = new Set(action.ids || []);
      return { ...state, watchlistIds: ids, watchlistLimit: action.limit ?? state.watchlistLimit };
    }
    case "WATCHLIST_ITEMS_LOADED": {
      const ids = new Set(action.ids || []);
      return {
        ...state,
        watchlistIds: ids,
        watchlistItems: action.items || [],
        watchlistItemsLoaded: true,
        watchlistLimit: action.limit ?? state.watchlistLimit,
      };
    }
    case "WATCHLIST_FILTER_TOGGLE":
      // Reset the type filter when leaving the view so a fresh open
      // starts from "All" — mirrors how SearchTabs behaves on a new
      // search.
      return { ...state, watchlistFilterEnabled: !state.watchlistFilterEnabled, watchlistType: "all" };
    case "WATCHLIST_FILTER_SET":
      return { ...state, watchlistFilterEnabled: !!action.enabled, watchlistType: "all" };
    case "SELECT_WATCHLIST_TYPE":
      return { ...state, watchlistType: action.watchlistType };
    case "WATCHLIST_ADD": {
      // Optimistic insert on the user's heart click. The full item
      // (id + type) lands at the top of the grid so the watchlist
      // view feels instant, even before the server responds.
      const ids = new Set(state.watchlistIds);
      ids.add(action.item.id);
      const exists = state.watchlistItems.some((it) => it.id === action.item.id);
      const items = exists ? state.watchlistItems : [action.item, ...state.watchlistItems];
      return { ...state, watchlistIds: ids, watchlistItems: items };
    }
    case "WATCHLIST_REMOVE": {
      // Optimistic delete: drop from both the id set and the items
      // grid. If the server later fails, the parent dispatches
      // WATCHLIST_ADD to roll back.
      const ids = new Set(state.watchlistIds);
      ids.delete(action.videoId);
      const items = state.watchlistItems.filter((it) => it.id !== action.videoId);
      return { ...state, watchlistIds: ids, watchlistItems: items };
    }

    // --- Release subscriptions slice ---
    case "SUBSCRIPTIONS_LOADED":
      return { ...state, subscriptionKeys: new Set(action.keys || []) };
    case "SUBSCRIPTION_ADD": {
      // Optimistic: the bell fills on click. A server refusal (the
      // free-tier cap, a season that has finished airing) dispatches
      // SUBSCRIPTION_REMOVE to put it back.
      const keys = new Set(state.subscriptionKeys);
      keys.add(action.key);
      return { ...state, subscriptionKeys: keys };
    }
    case "SUBSCRIPTION_REMOVE": {
      const keys = new Set(state.subscriptionKeys);
      keys.delete(action.key);
      return { ...state, subscriptionKeys: keys };
    }

    // --- AI recommendations slice ---
    case "AI_DISABLED":
      return { ...state, ai: { ...state.ai, phase: "disabled" } };
    case "AI_LOAD_CHIPS_START":
      // Clear chips so the streaming append starts from a fresh list —
      // important for refresh, where stale chips from a previous load
      // would otherwise blend with the new stream until the first chip
      // event flips phase.
      return { ...state, ai: { ...state.ai, phase: "loadingChips", chips: [], error: null } };
    case "AI_LOAD_CHIPS_CHIP":
      // Per-chip event from the streaming endpoint. Flip phase to
      // 'chipsReady' on the first chip so the user sees pills appear
      // one by one instead of staring at the skeleton until done.
      return {
        ...state,
        ai: { ...state.ai, phase: "chipsReady", chips: [...state.ai.chips, action.chip], error: null },
      };
    case "AI_LOAD_CHIPS_SUCCESS":
      return {
        ...state,
        ai: {
          ...state.ai,
          phase: "chipsReady",
          chips: action.chips || state.ai.chips,
          chipsGeneratedAt: action.generatedAt || 0,
          tier: action.tier || state.ai.tier,
          remainingQuota: action.remainingQuota ?? state.ai.remainingQuota,
          dailyQuota: action.dailyQuota ?? state.ai.dailyQuota,
          error: null,
        },
      };
    case "AI_LOAD_CHIPS_ERROR":
      return { ...state, ai: { ...state.ai, phase: "chipsError", error: action.error } };

    // --- Streaming recommend / refine ---
    // AI_STREAM_START: user submitted a query, EventSource just opened.
    // We clear stale state immediately — both for initial recommend
    // and for refine. Keeping old cards visible during a refine feels
    // misleading: the user just clicked "Remix" and is staring at the
    // PREVIOUS list, which suggests nothing happened.
    case "AI_STREAM_START":
      return {
        ...state,
        ai: {
          ...state.ai,
          phase: "streamingClaude",
          currentQuery: action.displayQuery || action.query,
          streamExpected: 0,
          error: null,
          recommendations: [],
          recsExpanded: false,
        },
      };
    // AI_STREAM_PHASE: backend transitioned between pipeline stages.
    case "AI_STREAM_PHASE": {
      const next = action.phase === "resolving" ? "streamingResolve" : "streamingClaude";
      return {
        ...state,
        ai: {
          ...state.ai,
          phase: next,
          streamExpected: action.expected || state.ai.streamExpected,
          // First time we hit the resolver phase, drop any leftover
          // recommendations from a previous round.
          recommendations: action.phase === "resolving" ? [] : state.ai.recommendations,
        },
      };
    }
    // AI_STREAM_ITEM: a single resolved card arrived. Append in order.
    case "AI_STREAM_ITEM":
      return { ...state, ai: { ...state.ai, recommendations: [...state.ai.recommendations, action.item] } };
    // AI_STREAM_DONE: terminal success. Hydrate quota state and append
    // a synthetic conversation turn so the next refine can ground on
    // what we just showed.
    case "AI_STREAM_DONE":
      return {
        ...state,
        ai: {
          ...state.ai,
          phase: "recsReady",
          remainingQuota: action.remainingQuota ?? state.ai.remainingQuota,
          dailyQuota: action.dailyQuota ?? state.ai.dailyQuota,
          tier: action.tier || state.ai.tier,
          streamExpected: 0,
          conversation: [
            ...state.ai.conversation,
            { role: "user", content: action.query },
            { role: "assistant", content: state.ai.recommendations.map((i) => i.title).join(", ") },
          ],
        },
      };
    // AI_STREAM_ERROR: terminal failure. The 402 (quota exceeded) case
    // is handled by AI_QUOTA_EXCEEDED below; everything else lands here.
    case "AI_STREAM_ERROR":
      return { ...state, ai: { ...state.ai, phase: "recsError", error: action.error, streamExpected: 0 } };
    // AI_EXPAND_RECS: user clicked "Show more". One-way switch.
    case "AI_EXPAND_RECS":
      return { ...state, ai: { ...state.ai, recsExpanded: true } };
    case "AI_QUOTA_EXCEEDED":
      return {
        ...state,
        ai: {
          ...state.ai,
          phase: "quotaExceeded",
          remainingQuota: 0,
          dailyQuota: action.dailyQuota ?? state.ai.dailyQuota,
          upgradeQuota: action.upgradeQuota ?? state.ai.upgradeQuota,
          quotaResetAt: action.quotaResetAt ?? state.ai.quotaResetAt,
          tier: action.tier || state.ai.tier,
          error: null,
        },
      };
    case "AI_RESET":
      return {
        ...state,
        ai: {
          ...state.ai,
          phase: state.ai.chips.length > 0 ? "chipsReady" : "idle",
          currentQuery: "",
          recommendations: [],
          conversation: [],
          error: null,
        },
      };

    default:
      return state;
  }
}
