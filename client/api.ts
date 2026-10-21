import type {
  User,
  TorrentFile,
  Torrent,
  Progress,
  LibraryItem,
  Playback,
} from "../shared/contracts";
export type { User, TorrentFile, Progress, Playback };
export type Resource = Torrent;
export type LibraryEntry = LibraryItem;
export interface Session {
  user: User;
  csrfToken: string;
}
export interface Health {
  status: string;
  upstream: string | boolean;
  database: string | boolean;
}
export interface Storage {
  total: number;
  free: number;
  cacheBytes: number | null;
  limits: Record<string, string | number>;
  activeStreams: number;
  activeDownloads: number;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
let csrfToken = "";
export function setSession(session: Session) {
  csrfToken = session.csrfToken;
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  const timer = setTimeout(
    () => controller.abort(),
    path === "/api/torrents" || path.includes("/playback") ? 125000 : 45000,
  );
  try {
    const headers = new Headers(options.headers);
    if (
      options.body &&
      typeof options.body === "string" &&
      !headers.has("Content-Type")
    )
      headers.set("Content-Type", "application/json");
    if (options.method && !["GET", "HEAD"].includes(options.method))
      headers.set("X-CSRF-Token", csrfToken);
    const response = await fetch(path, {
      ...options,
      headers,
      credentials: "same-origin",
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok)
      throw new ApiError(
        response.status,
        body?.error?.code ?? "REQUEST_FAILED",
        body?.error?.message ?? `Request failed (${response.status}).`,
      );
    return body?.data as T;
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error(
        signal?.aborted
          ? "Request cancelled."
          : "The server took too long to respond. Please retry.",
      );
    if (error instanceof TypeError)
      throw new Error(
        "Cannot reach your server. Check the connection and retry.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
export const fileUrl = (
  resourceId: string,
  fileId: string,
  action = "download",
) =>
  `/api/torrents/${encodeURIComponent(resourceId)}/files/${encodeURIComponent(fileId)}/${action}`;
export function bytes(value: number | undefined | null) {
  if (value === undefined || value === null || !Number.isFinite(value))
    return "Unavailable";
  if (value < 1000) return `${value} B`;
  const unit = Math.min(Math.floor(Math.log(value) / Math.log(1000)), 4);
  return `${(value / 1000 ** unit).toFixed(unit === 1 ? 0 : 1)} ${["B", "KB", "MB", "GB", "TB"][unit]}`;
}
