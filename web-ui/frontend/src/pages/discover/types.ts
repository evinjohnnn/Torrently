/** Mirrors handlers/spa/discover.go: what the page boots from. */
export interface DiscoverData {
  addons: AddonSeed[];
  indexers: IndexerSeed[];
  streamPrefs: StreamPrefsSeed;
  aiEnabled: boolean;
  passthrough: { hevc: string };
}

/** One of the user's addons with the manifest snapshot taken when it was added. */
export interface AddonSeed {
  id: string;
  url: string;
  name?: string;
  logo?: string;
  manifestId?: string;
  version?: string;
  resources?: string[];
  types?: string[];
  fetchedAt?: string | null;
}

export interface IndexerSeed {
  id: string;
  name: string;
}

export interface StreamPrefsSeed {
  resolutions: string[];
  language: string;
}

// ───────── Stremio addon protocol ─────────

export type Resource = string | { name: string; types?: string[]; idPrefixes?: string[] };

export interface ManifestCatalog {
  id: string;
  type: string;
  name?: string;
  extra?: { name: string; isRequired?: boolean }[];
  extraSupported?: string[];
}

export interface Manifest {
  id: string;
  name?: string;
  version?: string;
  description?: string;
  logo?: string;
  resources?: Resource[];
  types?: string[];
  catalogs?: ManifestCatalog[];
  behaviorHints?: { adult?: boolean };
}

export type AddonHealth = "ok" | "unreachable" | "misconfigured";

/** One addon as StremioClient.fetchAllManifests reports it. */
export interface AddonStatus {
  baseUrl: string;
  manifest: Manifest | null;
  status: AddonHealth;
  source: "fresh" | "cache" | "seed" | null;
  error?: string;
  lastSuccessAt?: number | null;
}

/** A catalog in the type tabs and the selector (discoverReducer buildCatalogs). */
export interface Catalog {
  id: string;
  type: string;
  name: string;
  addonName: string;
  baseUrl: string;
  disabled?: boolean;
  addonStatus?: AddonHealth;
}

/** An addon as the health chip shows it (discoverReducer buildAddons). */
export interface Addon {
  baseUrl: string;
  host: string;
  name: string;
  status: AddonHealth;
  source: AddonStatus["source"];
  capabilities: string[];
  lastSuccessAt: number | null;
  error: string | null;
}

/** A catalog item (Stremio meta preview); the watchlist adapts its rows to it. */
export interface Item {
  id: string;
  type?: string;
  name?: string;
  title?: string;
  poster?: string;
  year?: string | number;
  releaseInfo?: string;
  imdbRating?: string | number;
  description?: string;
}

export interface Video {
  id?: string;
  season?: number;
  episode?: number;
  name?: string;
  title?: string;
  released?: string;
  overview?: string;
}

export interface Meta extends Item {
  videos?: Video[];
  status?: string;
}

export interface Stream {
  name?: string;
  title?: string;
  infoHash?: string;
  fileIdx?: number | string | null;
  url?: string;
  externalUrl?: string;
  behaviorHints?: { filename?: string; [key: string]: unknown };
  addonName?: string;
  alsoFrom?: string[];
  cached?: boolean;
}

// ───────── Page state ─────────

export interface UserStatus {
  watched?: boolean;
  rating?: number;
}

export interface Localized {
  title?: string;
  plot?: string;
}

/** What a subscription from the modal would be about (seasonStatus.subscriptionTargetFor). */
export interface SubTarget {
  kind: "movie" | "season";
  videoId: string;
  season?: number;
  source?: string;
}

/** One source's progress while streams are fetched. */
export interface SourceProgress {
  name: string;
  host: string;
  status: "fetching" | "done" | "error";
  count?: number;
  kind?: string;
}

/** What "‹ Episodes" goes back to from an episode's streams. */
export interface BackToEpisodes {
  title?: string;
  poster?: string;
  meta?: Meta;
  itemId: string;
  itemType?: string;
  season?: number | string;
  year?: string | number;
  releaseInfo?: string;
  imdbRating?: string | number;
  description?: string;
}

export interface Modal {
  view: "loading" | "fetching" | "streams" | "episodes" | "progress";
  title?: string;
  poster?: string;
  subtitle?: string;
  metaId?: string;
  itemId?: string;
  itemType?: string;
  year?: string | number;
  releaseInfo?: string;
  imdbRating?: string | number;
  description?: string;
  tab?: "reviews";
  subTarget?: SubTarget | null;
  streams?: Stream[];
  addons?: SourceProgress[];
  failedAddons?: SourceProgress[];
  error?: string;
  meta?: Meta;
  defaultSeason?: number;
  _seasonKey?: number;
  backToEpisodes?: BackToEpisodes;
  logUrl?: string | null;
  fileIdx?: number | null;
  /** the infohash the progress view is loading, for the long-wait retry */
  infoHash?: string;
}

/** An AI recommendation card (handlers/discover_ai). */
export interface AIItem {
  video_id: string;
  type?: string;
  title?: string;
  year?: number;
  poster?: string;
  plot?: string;
  reason?: string;
  rating?: number;
}

export interface AIChip {
  id: string;
  label: string;
  query: string;
  icon?: string;
}
