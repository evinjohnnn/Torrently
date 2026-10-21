export interface TorrentFile {
  id: string;
  path: string;
  name: string;
  size: number;
  kind: "video" | "audio" | "subtitle" | "file";
  mimeType?: string;
}
export interface Torrent {
  id: string;
  name: string;
  size: number;
  files: TorrentFile[];
}
export interface Progress {
  fileId: string;
  position: number;
  duration: number;
}
export interface LibraryItem {
  id: string;
  resourceId: string;
  name: string;
  favorite: boolean;
  updatedAt: string;
  progress: Progress | null;
}
export interface User {
  id: string;
  email: string;
  admin: boolean;
}
export interface Playback {
  session?: boolean;
  duration?: number;
  url: string;
  type: "hls" | "direct";
  subtitles: { url: string; label: string; language: string }[];
  audioTracks: { id: string; name: string }[];
}
export type Response<T> =
  { data: T } | { error: { code: string; message: string } };
