import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Request, Response } from "express";
import type { DB } from "./db.js";
import type { Config } from "./config.js";
import type { AuthRequest } from "./auth.js";
import { AppError } from "./errors.js";
import type { Webtor } from "./upstream.js";
export class Capacity {
  private leases = new Map<string, { kind: string; until: number }>();
  constructor(private limits: Record<string, number>) {}
  private prune() {
    for (const [key, lease] of this.leases)
      if (lease.until < Date.now()) this.leases.delete(key);
  }
  count(kind: string) {
    this.prune();
    return [...this.leases.values()].filter((l) => l.kind === kind).length;
  }
  acquire(key: string, kind: string, ttl = 120000) {
    this.prune();
    if (!this.leases.has(key) && this.count(kind) >= (this.limits[kind] ?? 1))
      throw new AppError(
        503,
        "CAPACITY",
        "The server is at capacity. Try again shortly.",
      );
    this.leases.set(key, { kind, until: Date.now() + ttl });
  }
  release(key: string) {
    this.leases.delete(key);
  }
}
export class Media {
  private key: Buffer;
  readonly capacity: Capacity;
  private bytes = 0;
  private controllers = new Map<string, Set<AbortController>>();
  constructor(
    private db: DB,
    private engine: Webtor,
    private config: Config,
  ) {
    this.key = createHash("sha256").update(config.SESSION_SECRET).digest();
    this.capacity = new Capacity({
      stream: config.MAX_STREAMS,
      download: config.MAX_DOWNLOADS,
      transcode: config.MAX_TRANSCODES,
      metadata: 2,
    });
  }
  get egressBytes() {
    return this.bytes;
  }
  private seal(url: string) {
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.key, iv);
    return Buffer.concat([
      iv,
      cipher.update(url),
      cipher.final(),
      cipher.getAuthTag(),
    ]).toString("base64url");
  }
  private open(value: string) {
    try {
      const b = Buffer.from(value, "base64url");
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.key,
        b.subarray(0, 12),
      );
      decipher.setAuthTag(b.subarray(-16));
      return Buffer.concat([
        decipher.update(b.subarray(12, -16)),
        decipher.final(),
      ]).toString();
    } catch {
      throw new AppError(
        403,
        "INVALID_MEDIA",
        "Media access is invalid. Open the file again.",
      );
    }
  }
  async ticket(
    userId: string,
    resourceId: string,
    url: string,
    type = "stream",
  ) {
    this.engine.mediaURL(url);
    const id = randomUUID();
    await this.db.query(
      "INSERT INTO media_tickets(id,user_id,resource_id,url,type,expires_at) VALUES($1,$2,$3,$4,$5,$6)",
      [id, userId, resourceId, url, type, new Date(Date.now() + 6 * 3600000)],
    );
    return `/api/media/${id}`;
  }
  async release(ticketId: string, userId: string) {
    const row = await this.db.query<{ url: string; type: string }>(
      "DELETE FROM media_tickets WHERE id=$1 AND user_id=$2 RETURNING url,type",
      [ticketId, userId],
    );
    if (!row.rows.length) return;
    for (const controller of this.controllers.get(ticketId) ?? [])
      controller.abort();
    this.capacity.release(ticketId);
    this.capacity.release(`transcode:${ticketId}`);
    if (row.rows[0].type === "transcode") {
      const url = this.engine.mediaURL(row.rows[0].url);
      url.pathname = url.pathname.replace(/\/index\.m3u8$/, "");
      try {
        const response = await fetch(url, {
          method: "DELETE",
          redirect: "error",
          signal: AbortSignal.timeout(5000),
        });
        await response.body?.cancel();
      } catch {
        /* The engine also expires abandoned sessions. */
      }
    }
  }
  async forward(req: Request, res: Response, ticketId: string, asset?: string) {
    const { user } = req as AuthRequest;
    const record = await this.db.query<{
      url: string;
      type: string;
      resource_id: string;
    }>(
      `SELECT t.url,t.type,t.resource_id FROM media_tickets t JOIN resource_access a ON a.resource_id=t.resource_id AND a.user_id=t.user_id WHERE t.id=$1 AND t.user_id=$2 AND t.expires_at>now()`,
      [ticketId, user.id],
    );
    const ticket = record.rows[0];
    if (!ticket)
      throw new AppError(
        404,
        "MEDIA_EXPIRED",
        "This media link expired. Open the file again.",
      );
    const url = this.engine.mediaURL(asset ? this.open(asset) : ticket.url);
    if (!url.pathname.startsWith(`/torrent-http-proxy/${ticket.resource_id}/`))
      throw new AppError(
        403,
        "INVALID_MEDIA",
        "Media access is outside the resource.",
      );
    const kind = ticket.type === "download" ? "download" : "stream",
      lease = kind === "download" ? randomUUID() : ticketId;
    if (ticket.type !== "subtitle") this.capacity.acquire(lease, kind);
    if (ticket.type === "transcode")
      this.capacity.acquire(`transcode:${ticketId}`, "transcode");
    const controller = new AbortController();
    const active = this.controllers.get(ticketId) ?? new Set<AbortController>();
    active.add(controller);
    this.controllers.set(ticketId, active);
    let idle: NodeJS.Timeout | undefined;
    const deadline = setTimeout(() => controller.abort(), 120000);
    deadline.unref();
    const onClose = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on("close", onClose);
    try {
      const headers: Record<string, string> = {};
      for (const h of [
        "range",
        "if-range",
        "if-none-match",
        "if-modified-since",
      ]) {
        const v = req.get(h);
        if (v) headers[h] = v;
      }
      const upstream = await fetch(url, {
        method: req.method === "HEAD" ? "HEAD" : "GET",
        headers,
        redirect: "manual",
        signal: controller.signal,
      });
      if (
        upstream.status >= 300 &&
        upstream.status < 400 &&
        upstream.status !== 304
      ) {
        await upstream.body?.cancel();
        throw new AppError(
          502,
          "ENGINE_REDIRECT",
          "Unexpected media redirect refused.",
        );
      }
      if (!upstream.ok && ![304, 416].includes(upstream.status)) {
        await upstream.body?.cancel();
        throw new AppError(
          502,
          "MEDIA_UNAVAILABLE",
          "Media is not ready. Check peers or retry playback.",
        );
      }
      clearTimeout(deadline);
      idle = setTimeout(() => controller.abort(), 120000);
      idle.unref();
      const resetIdle = () => {
        idle?.refresh();
        if (ticket.type !== "subtitle") this.capacity.acquire(lease, kind);
        if (ticket.type === "transcode")
          this.capacity.acquire(`transcode:${ticketId}`, "transcode");
      };
      const contentType =
        upstream.headers.get("content-type") ?? "application/octet-stream";
      const playlist =
        /\.m3u8(?:$|\?)/.test(url.href) || /mpegurl/i.test(contentType);
      res.status(upstream.status);
      res.set("Cache-Control", "private, no-store");
      res.set("X-Content-Type-Options", "nosniff");
      res.set("Content-Security-Policy", "sandbox; default-src 'none'");
      res.set(
        "Content-Type",
        playlist ? "application/vnd.apple.mpegurl" : contentType,
      );
      if (!playlist) {
        const length = upstream.headers.get("content-length");
        if (length) res.set("Content-Length", length);
      }
      for (const h of [
        "accept-ranges",
        "content-range",
        "last-modified",
        "etag",
      ]) {
        const v = upstream.headers.get(h);
        if (v) res.set(h, v);
      }
      if (req.method === "HEAD" || [304, 416].includes(upstream.status)) {
        await upstream.body?.cancel();
        res.end();
        clearTimeout(idle);
        return;
      }
      if (playlist) {
        const reader = upstream.body?.getReader();
        if (!reader)
          throw new AppError(502, "INVALID_MANIFEST", "Empty playlist.");
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          resetIdle();
          bytes += value.length;
          if (bytes > 2_000_000) {
            await reader.cancel();
            throw new AppError(
              502,
              "INVALID_MANIFEST",
              "Playlist exceeds safe size.",
            );
          }
          chunks.push(value);
        }
        const text = Buffer.concat(chunks).toString();
        if (!text.startsWith("#EXTM3U"))
          throw new AppError(
            502,
            "INVALID_MANIFEST",
            "The engine returned an invalid playlist.",
          );
        const rewrite = (reference: string) => {
          const child = this.engine.mediaURL(reference, url.href);
          // nginx-vod emits relative segment URIs without the parent's signed query.
          for (const [key, value] of url.searchParams)
            if (!child.searchParams.has(key))
              child.searchParams.append(key, value);
          if (
            !child.pathname.startsWith(
              `/torrent-http-proxy/${ticket.resource_id}/`,
            )
          )
            throw new AppError(
              502,
              "UNSAFE_MANIFEST",
              "Playlist references a different resource.",
            );
          return `/api/media/${ticketId}/${this.seal(child.href)}`;
        };
        const rewritten = text
          .split(/\r?\n/)
          .map((line) =>
            line.startsWith("#")
              ? line.replace(
                  /URI="([^"]+)"/g,
                  (_m, uri: string) => `URI="${rewrite(uri)}"`,
                )
              : line.trim()
                ? rewrite(line.trim())
                : line,
          )
          .join("\n");
        res.type("application/vnd.apple.mpegurl").send(rewritten);
        clearTimeout(idle);
      } else {
        res.set("Content-Type", contentType);
        const length = upstream.headers.get("content-length");
        if (length) res.set("Content-Length", length);
        if (!upstream.body) {
          res.end();
          clearTimeout(idle);
          return;
        }
        const meter = new Transform({
          transform: (chunk, _encoding, callback) => {
            try {
              resetIdle();
              this.bytes += chunk.length;
              callback(null, chunk);
            } catch (error) {
              callback(error as Error);
            }
          },
        });
        try {
          await pipeline(Readable.fromWeb(upstream.body as never), meter, res);
        } finally {
          clearTimeout(idle);
        }
      }
    } catch (e) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      if (e instanceof AppError) throw e;
      throw new AppError(
        controller.signal.aborted ? 504 : 502,
        "MEDIA_UNAVAILABLE",
        "The media connection was interrupted. Retry playback.",
      );
    } finally {
      clearTimeout(deadline);
      clearTimeout(idle);
      active.delete(controller);
      if (!active.size) this.controllers.delete(ticketId);
      res.off("close", onClose);
      if (kind === "download") this.capacity.release(lease);
    }
  }
}
