// Mirrors handlers/spa/library.go.

export type Section = "torrents" | "movies" | "series";

export interface LibraryTorrent {
  resourceId: string;
  name: string;
  size: number;
  files: number;
  addedAt: string;
}

export interface LibraryVideo {
  resourceId: string;
  videoId?: string;
  type: "movie" | "series";
  title: string;
  year?: number;
  rating?: number;
  poster: string;
  adultBadge: boolean;
  watched: boolean;
  userRating?: number;
}

export interface Rate {
  videoId: string;
  type: string;
  current: number;
}

export interface LibraryData {
  section: Section;
  sort: number;
  sorts: { value: number; title: string }[];
  watched: "" | "unwatched" | "watched";
  counts: Record<Section, number>;
  torrents: LibraryTorrent[];
  videos: LibraryVideo[];
  rate?: Rate;
}
