// The viewer's Discover choices (type, catalog, view mode, stream filters,
// video switches), kept in this browser only.

const LS_KEY = "discover-prefs";

export interface Prefs {
  type?: string;
  catalogBase?: string;
  catalogId?: string;
  viewMode?: "grid" | "calendar";
  sources?: string[];
  labels?: string[];
  lang?: string | null;
  showHevc?: boolean;
  showHdr?: boolean;
  show4k?: boolean;
}

export function loadPrefs(): Prefs {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "null") || {};
  } catch {
    return {};
  }
}

export function savePrefs(patch: Partial<Prefs>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ ...loadPrefs(), ...patch }));
  } catch {
    /* storage off: the choice lasts this visit */
  }
}

export function getViewMode(): "grid" | "calendar" {
  return loadPrefs().viewMode === "calendar" ? "calendar" : "grid";
}
