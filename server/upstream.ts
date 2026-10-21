import type { Config } from "./config.js";
import { AppError } from "./errors.js";
import { kind, safePath } from "./validation.js";
const hashPattern = /^[a-f\d]{40}$/i;
function validHash(id: string) {
  if (!hashPattern.test(id) || /^0{40}$/.test(id))
    throw new AppError(
      400,
      "INVALID_ID",
      "Invalid torrent or file identifier.",
    );
  return id.toLowerCase();
}
import type { Torrent } from "../shared/contracts.js";
export interface ListItem {
  id: string;
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  mime_type?: string;
  index: number;
}
interface Listing extends ListItem {
  items: ListItem[];
  items_count: number;
}
interface Resource {
  id: string;
  name: string;
  size: number;
  files_count: number;
}
interface ExportItem {
  url?: string;
  html_tag?: {
    src?: string;
    sources?: { src: string; type: string }[];
    tracks?: { src: string; label?: string; srclang?: string }[];
  };
  meta?: { transcode?: boolean };
}
export interface Exports {
  source: ListItem;
  exports: Record<string, ExportItem>;
}
export class Webtor {
  constructor(public config: Config) {}
  async request<T>(
    path: string,
    options: RequestInit = {},
    signal?: AbortSignal,
  ): Promise<T> {
    if (!this.config.WEBTOR_API_KEY)
      throw new AppError(
        503,
        "ENGINE_UNCONFIGURED",
        "The torrent engine is not configured. An administrator must connect Webtor.",
      );
    const timeout = AbortSignal.timeout(this.config.METADATA_TIMEOUT_MS);
    try {
      const res = await fetch(
        new URL(`/api/v1${path}`, this.config.WEBTOR_URL),
        {
          ...options,
          headers: {
            Authorization: `Bearer ${this.config.WEBTOR_API_KEY}`,
            ...options.headers,
          },
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
          redirect: "error",
        },
      );
      if (!res.ok) {
        await res.body?.cancel();
        const status =
          res.status === 401 || res.status === 403
            ? 503
            : res.status === 404
              ? 404
              : res.status === 429
                ? 429
                : [408, 504].includes(res.status)
                  ? 504
                  : 502;
        throw new AppError(
          status,
          "ENGINE_ERROR",
          status === 404
            ? "This torrent could not be found."
            : status === 504
              ? "Torrent metadata retrieval timed out. Peers may be unavailable."
              : "The torrent engine could not complete this request.",
        );
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("Empty engine response");
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 8_000_000) {
          await reader.cancel();
          throw new Error("Engine response too large");
        }
        chunks.push(value);
      }
      return JSON.parse(Buffer.concat(chunks).toString()) as T;
    } catch (e) {
      if (e instanceof AppError) throw e;
      if (signal?.aborted)
        throw new AppError(499, "CANCELLED", "Request cancelled.");
      throw new AppError(
        timeout.aborted ? 504 : 502,
        "ENGINE_UNAVAILABLE",
        timeout.aborted
          ? "Torrent metadata retrieval timed out. Peers may be unavailable."
          : "Cannot reach the torrent engine.",
      );
    }
  }
  async submit(body: string | Buffer, signal?: AbortSignal) {
    const result = await this.request<Resource>(
      "/resource",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-bittorrent" },
        body: body as BodyInit,
      },
      signal,
    );
    return this.resource(result.id, signal, result);
  }
  async resource(
    id: string,
    signal?: AbortSignal,
    metadata?: Resource,
  ): Promise<Torrent> {
    id = validHash(id);
    const root =
      metadata ?? (await this.request<Resource>(`/resource/${id}`, {}, signal));
    if (
      !root ||
      typeof root.id !== "string" ||
      !hashPattern.test(root.id) ||
      root.id.toLowerCase() !== id ||
      typeof root.name !== "string" ||
      !Number.isSafeInteger(root.files_count) ||
      root.files_count < 1 ||
      !Number.isSafeInteger(root.size) ||
      root.size < 1
    )
      throw new AppError(
        502,
        "INVALID_METADATA",
        "The engine returned invalid torrent metadata.",
      );
    if (root.files_count > 10000 || root.size > this.config.MAX_RESOURCE_BYTES)
      throw new AppError(
        422,
        "RESOURCE_LIMIT",
        "Torrent exceeds the file count or resource size limit.",
      );
    const items: ListItem[] = [];
    let offset = 0,
      total = Infinity;
    const seen = new Set<string>();
    // List mode includes directory entries as well as files; offsets count both.
    while (offset < total) {
      const page = await this.request<Listing>(
        `/resource/${id}/list?output=list&limit=1000&offset=${offset}`,
        {},
        signal,
      );
      if (
        !page ||
        !Number.isSafeInteger(page.items_count) ||
        page.items_count < 0 ||
        page.items_count > 30000 ||
        !Array.isArray(page.items) ||
        page.items.length > 1000 ||
        page.items.length + offset > page.items_count ||
        (Number.isFinite(total) && page.items_count !== total)
      )
        throw new AppError(
          502,
          "INVALID_METADATA",
          "The engine returned invalid metadata.",
        );
      total = page.items_count;
      if (!page.items.length && offset < total)
        throw new AppError(502, "INVALID_METADATA", "Incomplete file listing.");
      for (const item of page.items) {
        if (
          !item ||
          typeof item.id !== "string" ||
          !hashPattern.test(item.id) ||
          seen.has(item.id.toLowerCase()) ||
          !["file", "directory"].includes(item.type) ||
          typeof item.path !== "string" ||
          typeof item.name !== "string" ||
          !Number.isSafeInteger(item.size) ||
          item.size < 0
        )
          throw new AppError(
            502,
            "INVALID_METADATA",
            "Invalid torrent file metadata.",
          );
        // Upstream ListItem.path has exactly one leading slash; its content id is SHA1 of that path.
        if (!item.path.startsWith("/") || item.path.startsWith("//"))
          throw new AppError(502, "INVALID_METADATA", "Invalid torrent path.");
        safePath(item.path.slice(1));
        safePath(item.name);
        if (item.name.includes("/"))
          throw new AppError(
            502,
            "INVALID_METADATA",
            "Invalid torrent filename.",
          );
        seen.add(item.id.toLowerCase());
        items.push(item);
      }
      offset += page.items.length;
    }
    const files = items.filter((f) => f.type === "file");
    if (
      files.length === 0 ||
      files.length > root.files_count ||
      files.reduce((n, f) => n + f.size, 0) > root.size
    )
      throw new AppError(502, "INVALID_METADATA", "Incomplete file metadata.");
    return {
      id,
      name: root.name,
      size: root.size,
      files: files.map((f) => ({
        id: f.id.toLowerCase(),
        name: f.name,
        path: f.path.slice(1),
        size: f.size,
        kind: kind(f.name),
        mimeType: typeof f.mime_type === "string" ? f.mime_type : undefined,
      })),
    };
  }
  exports(
    id: string,
    fileId: string,
    types = "download,stream",
    signal?: AbortSignal,
  ) {
    return this.request<Exports>(
      `/resource/${validHash(id)}/export/${validHash(fileId)}?types=${encodeURIComponent(types)}`,
      {},
      signal,
    );
  }
  async archive(id: string) {
    const root = await this.request<Listing>(
      `/resource/${validHash(id)}/list?limit=1`,
    );
    if (root.type !== "directory")
      throw new AppError(
        422,
        "ARCHIVE_UNAVAILABLE",
        "This resource has no directory archive. Download the original file.",
      );
    return this.exports(id, root.id, "download");
  }
  // Ignore upstream Host headers and do not allow an export to turn the adapter into an arbitrary URL fetcher.
  mediaURL(value: string, base?: string): URL {
    try {
      const configured = new URL(this.config.WEBTOR_URL),
        url = new URL(value, base ?? configured);
      if (
        url.origin !== configured.origin ||
        url.username ||
        url.password ||
        !["http:", "https:"].includes(url.protocol) ||
        url.hash
      )
        throw new Error("Origin mismatch");
      const decoded = decodeURIComponent(url.pathname);
      if (
        !/^\/torrent-http-proxy\/[a-f\d]{40}\//i.test(decoded) ||
        decoded.split("/").some((s) => s === ".." || s === ".") ||
        /[\\\x00-\x1f\x7f]/.test(decoded) ||
        /%(?:2e|2f|5c|00)/i.test(decoded)
      )
        throw new Error("Unsafe path");
      return url;
    } catch {
      throw new AppError(
        502,
        "UNSAFE_EXPORT",
        "The engine returned an unsafe media URL.",
      );
    }
  }
}
