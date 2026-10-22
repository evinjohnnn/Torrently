// Mirrors handlers/spa/resource.go.

export interface Action {
  action: "stream" | "preview" | "download" | "file-info" | "download-dir";
  endpoint: string;
  label: string;
  size?: string;
  itemId: string;
}

export interface Watched {
  watched: boolean;
  markUrl: string;
  unmarkUrl: string;
}

export interface FileData {
  id: string;
  name: string;
  path: string;
  size: number;
  mediaFormat?: string;
  actions: Action[];
  watched?: Watched;
}

export interface Entry {
  id: string;
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  mediaFormat?: string;
  watched?: Watched;
}

export interface PageItem {
  Page: number;
  Active: boolean;
  Prev: boolean;
  Next: boolean;
  Number: boolean;
  Gap: boolean;
}

export interface ListData {
  id: string;
  path: string;
  size: number;
  count: number;
  page: number;
  pages?: PageItem[];
  breadcrumbs: { name: string; path: string }[];
  items: Entry[];
  archive: Action;
}

/** services/statusview View, the parts the page draws. */
export interface StatusView {
  key: string;
  mode: "chain" | "badge";
  badge: { tone: string; icon: string; label: string; pulse?: boolean; extra?: string };
  hint?: string;
  vault?: boolean;
  nodes: { show: boolean; kind: string; name: string; caption: string; value?: string; tone?: string; dim?: boolean }[];
  segs: { show: boolean; tone: string; on?: boolean; speed?: string; note?: string }[];
}

export interface TorrentData {
  id: string;
  name: string;
  magnet: string;
  size: number;
  filesCount: number;
  inLibrary: boolean;
  torrentUrl: string;
  poster: string;
  adult: boolean;
  adultBadge: boolean;
  kind: "movie" | "series" | "torrent";
  enriched?: { title: string; year?: number; rating?: number; plot?: string };
  fromTool?: string;
  vault?: {
    funded: boolean;
    add?: {
      status?: string;
      errKey?: string;
      funded: boolean;
      vaulted: boolean;
      required: number;
      available: number | null;
      total: number | null;
      sizeGb: number;
    };
    remove?: { status?: string; errKey?: string; frozen: boolean };
  };
  status?: { view: StatusView; streamUrl: string };
  file?: FileData;
  list?: ListData;
}
