import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { z, ZodError } from "zod";
import { randomUUID } from "node:crypto";
import { statfs } from "node:fs/promises";
import { storageSnapshot } from "./storage.js";
import { resolve } from "node:path";
import type { Config } from "./config.js";
import type { DB } from "./db.js";
import {
  auth,
  admin,
  csrf,
  createSession,
  checkPassword,
  type AuthRequest,
} from "./auth.js";
import { AppError } from "./errors.js";
import { Webtor } from "./upstream.js";
import { boundedJson } from "./http.js";
import { Media } from "./media.js";
import { magnet, attachment, torrentUpload } from "./validation.js";
import type { Torrent, LibraryItem, User } from "../shared/contracts.js";
const hash = z.string().regex(/^[a-f\d]{40}$/i);
const progress = z
  .object({
    fileId: hash,
    position: z.number().finite().nonnegative(),
    duration: z.number().finite().positive(),
  })
  .refine((v) => v.position <= v.duration + 1);
export function createApp(config: Config, db: DB) {
  const app = express(),
    engine = new Webtor(config),
    media = new Media(db, engine, config);
  app.disable("x-powered-by");
  if (config.TRUST_PROXY === "true") app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "blob:", "data:"],
          mediaSrc: ["'self'", "blob:"],
          connectSrc: ["'self'"],
          workerSrc: ["'self'", "blob:"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: config.COOKIE_SECURE === "true" ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(cookieParser());
  app.use((req, res, next) => {
    const started = performance.now(),
      id = randomUUID();
    res.set("X-Request-Id", id);
    res.on("finish", () => {
      console.log(
        JSON.stringify({
          time: new Date().toISOString(),
          requestId: id,
          method: req.method,
          route: req.route?.path ?? "unmatched",
          status: res.statusCode,
          durationMs: Math.round(performance.now() - started),
        }),
      );
    });
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.get("Origin") &&
      req.get("Origin") !== new URL(config.PUBLIC_ORIGIN).origin
    )
      throw new AppError(
        403,
        "ORIGIN",
        "Requests must come from this application.",
      );
    next();
  });
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 600,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: {
        error: {
          code: "RATE_LIMIT",
          message: "Too many requests. Retry in a minute.",
        },
      },
    }),
  );
  app.use(express.json({ limit: "32kb" }));
  const ok = (res: express.Response, data: unknown, status = 200) =>
    res.status(status).json({ data });
  app.get("/api/health", async (_req, res) => {
    let upstream = "unconfigured";
    if (config.WEBTOR_API_KEY) {
      try {
        const r = await fetch(new URL("/api/v1/profile", config.WEBTOR_URL), {
          headers: { Authorization: `Bearer ${config.WEBTOR_API_KEY}` },
          signal: AbortSignal.timeout(3000),
          redirect: "error",
        });
        upstream = r.ok ? "ok" : "unavailable";
        await r.body?.cancel();
      } catch {
        upstream = "unavailable";
      }
    }
    await db.query("SELECT 1");
    ok(res, {
      status: upstream === "ok" ? "ok" : "degraded",
      upstream,
      database: "ok",
    });
  });
  app.post(
    "/api/login",
    rateLimit({
      windowMs: 15 * 60000,
      limit: 10,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: {
        error: {
          code: "RATE_LIMIT",
          message: "Too many sign-in attempts. Retry in fifteen minutes.",
        },
      },
    }),
    async (req, res) => {
      const body = z
        .object({
          email: z.string().email().max(254),
          password: z.string().min(1).max(1024),
        })
        .parse(req.body);
      const result = await db.query<User & { password_hash: string }>(
        "SELECT * FROM users WHERE email=$1",
        [body.email.toLowerCase()],
      );
      const user = result.rows[0];
      const valid = await checkPassword(
        body.password,
        user?.password_hash ??
          "00000000000000000000000000000000:" + "00".repeat(64),
      );
      if (!user || !valid)
        throw new AppError(
          401,
          "LOGIN_FAILED",
          "Email or password is incorrect.",
        );
      const csrfToken = await createSession(db, res, user.id, config);
      ok(res, {
        user: { id: user.id, email: user.email, admin: user.admin },
        csrfToken,
      });
    },
  );
  app.use("/api", auth(db), csrf);
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  });
  const userLimit = rateLimit({
    windowMs: 60000,
    limit: 120,
    keyGenerator: (req) => (req as unknown as AuthRequest).user.id,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: {
        code: "RATE_LIMIT",
        message: "Too many requests. Retry in a minute.",
      },
    },
  });
  app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/media/")) return next();
    userLimit(req, res, next);
  });
  app.get("/api/session", (req, res) => {
    const r = req as AuthRequest;
    ok(res, { user: r.user, csrfToken: r.csrfToken });
  });
  app.post("/api/logout", async (req, res) => {
    await db.query("DELETE FROM sessions WHERE id=$1", [
      (req as unknown as AuthRequest).sessionId,
    ]);
    res.clearCookie("torrently_session", { path: "/" });
    ok(res, { success: true });
  });
  async function resourceAccess(
    req: express.Request,
    resourceId: unknown = req.params.id,
  ) {
    const id = hash.parse(resourceId).toLowerCase();
    const result = await db.query<{ metadata: Torrent }>(
      "SELECT r.metadata FROM resources r JOIN resource_access a ON a.resource_id=r.id WHERE r.id=$1 AND a.user_id=$2",
      [id, (req as unknown as AuthRequest).user.id],
    );
    if (!result.rows.length)
      throw new AppError(
        404,
        "NOT_FOUND",
        "Torrent not found in your account.",
      );
    return result.rows[0].metadata;
  }
  async function fileAccess(req: express.Request) {
    const r = await resourceAccess(req);
    const file = r.files.find(
      (f) => f.id === hash.parse(req.params.fileId).toLowerCase(),
    );
    if (!file) throw new AppError(404, "NOT_FOUND", "File not found.");
    return { resource: r, file };
  }
  const submitLimit = rateLimit({
    windowMs: 60000,
    limit: 5,
    keyGenerator: (req) => (req as unknown as AuthRequest).user.id,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: {
        code: "RATE_LIMIT",
        message: "Too many torrent submissions. Retry in a minute.",
      },
    },
  });
  const resolving = new Set<string>();
  const oneSubmission: express.RequestHandler = (req, res, next) => {
    const id = (req as unknown as AuthRequest).user.id;
    if (resolving.has(id))
      throw new AppError(
        409,
        "ALREADY_RESOLVING",
        "A torrent is already resolving in your account. Wait for it to finish.",
      );
    resolving.add(id);
    const release = () => resolving.delete(id);
    res.once("finish", release);
    res.once("close", release);
    next();
  };
  app.post(
    "/api/torrents",
    submitLimit,
    oneSubmission,
    express.raw({
      type: ["application/x-bittorrent", "application/octet-stream"],
      limit: config.MAX_TORRENT_BYTES,
    }),
    async (req, res) => {
      const user = (req as unknown as AuthRequest).user;
      let body = Buffer.isBuffer(req.body)
        ? req.body
        : magnet(z.object({ magnet: z.string() }).parse(req.body).magnet);
      if (Buffer.isBuffer(body)) {
        const checked = torrentUpload(body);
        body = checked.data;
        if (checked.size > config.MAX_RESOURCE_BYTES)
          throw new AppError(
            422,
            "RESOURCE_LIMIT",
            "Torrent is too large for this server.",
          );
      }
      if (!config.WEBTOR_API_KEY)
        throw new AppError(
          503,
          "ENGINE_UNCONFIGURED",
          "The torrent engine is not configured. An administrator must connect Webtor.",
        );
      const count = await db.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM resource_access WHERE user_id=$1",
        [user.id],
      );
      if (Number(count.rows[0].count) >= config.MAX_TORRENTS)
        throw new AppError(
          409,
          "QUOTA",
          "Your torrent limit is reached. Remove a resource before adding another.",
        );
      const disk = await storageSnapshot(config);
      if (config.CACHE_DIR && disk.cacheBytes === null)
        throw new AppError(
          503,
          "CACHE_UNKNOWN",
          "Cache usage could not be measured. An administrator must check storage.",
        );
      if (disk.cacheBytes !== null && disk.cacheBytes >= config.MAX_CACHE_BYTES)
        throw new AppError(
          507,
          "CACHE_FULL",
          "The torrent cache has reached its admission limit. Wait for cleanup.",
        );
      if (disk.free < config.MIN_FREE_BYTES)
        throw new AppError(
          507,
          "STORAGE_LOW",
          "Server free space is below its reserve.",
        );
      const lease = randomUUID();
      media.capacity.acquire(lease, "metadata");
      const controller = new AbortController();
      const close = () => {
        if (!res.writableEnded) controller.abort();
      };
      res.on("close", close);
      try {
        const resource = await engine.submit(body, controller.signal);
        if (controller.signal.aborted)
          throw new AppError(499, "CANCELLED", "Request cancelled.");
        await db.query(
          "INSERT INTO resources(id,name,metadata) VALUES($1,$2,$3::jsonb) ON CONFLICT(id) DO UPDATE SET name=excluded.name,metadata=excluded.metadata,updated_at=now()",
          [resource.id, resource.name, JSON.stringify(resource)],
        );
        await db.query(
          "INSERT INTO resource_access(user_id,resource_id) VALUES($1,$2) ON CONFLICT(user_id,resource_id) DO UPDATE SET opened_at=now()",
          [user.id, resource.id],
        );
        ok(res, resource, 201);
      } finally {
        media.capacity.release(lease);
        res.off("close", close);
      }
    },
  );
  app.get("/api/torrents/:id", async (req, res) =>
    ok(res, await resourceAccess(req)),
  );
  app.get("/api/torrents/:id/files", async (req, res) => {
    const resource = await resourceAccess(req);
    const page = z.coerce
        .number()
        .int()
        .min(0)
        .default(0)
        .parse(req.query.offset),
      limit = z.coerce
        .number()
        .int()
        .min(1)
        .max(1000)
        .default(200)
        .parse(req.query.limit);
    ok(res, {
      items: resource.files.slice(page, page + limit),
      total: resource.files.length,
      offset: page,
      limit,
    });
  });
  app.get("/api/torrents/:id/status", async (req, res) => {
    await resourceAccess(req);
    ok(res, {
      state: "metadata_ready",
      message:
        "Metadata is available. Peer and piece availability is checked when a file is opened.",
    });
  });
  app.get("/api/torrents/:id/files/:fileId/playback", async (req, res) => {
    const { resource, file } = await fileAccess(req);
    if (!["video", "audio"].includes(file.kind))
      throw new AppError(
        422,
        "UNSUPPORTED_MEDIA",
        "Only video and audio files can be played.",
      );
    const mode = z
        .enum(["direct", "hls", "transcode"])
        .default("direct")
        .parse(req.query.mode),
      user = (req as unknown as AuthRequest).user;
    const controller = new AbortController();
    const close = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on("close", close);
    let reserved: string | undefined,
      duration: number | undefined,
      createdTicket: string | undefined,
      conversionURL: URL | undefined,
      delivered = false;
    try {
      const exp = await engine.exports(
        resource.id,
        file.id,
        "download,stream",
        controller.signal,
      );
      let url =
        mode === "direct" ? exp.exports.download?.url : exp.exports.stream?.url;
      if (!url)
        throw new AppError(
          422,
          "UNSUPPORTED_MEDIA",
          "No compatible stream is available for this file. Try direct download.",
        );
      if (mode === "transcode") {
        reserved = `pending:${randomUUID()}`;
        media.capacity.acquire(reserved, "transcode", 130000);
        const session = engine.mediaURL(url),
          index = session.pathname.indexOf("~vod/"),
          legacy = session.pathname.indexOf("~hls/");
        if (index < 0 && legacy < 0)
          throw new AppError(
            422,
            "UNSUPPORTED_MEDIA",
            "This file has no conversion path.",
          );
        session.pathname =
          session.pathname.slice(0, index >= 0 ? index : legacy) +
          "~hls/session";
        const response = await fetch(session, {
          method: "POST",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(120000),
          ]),
          redirect: "error",
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw new AppError(
            response.status === 415 ? 422 : 502,
            "TRANSCODE_FAILED",
            response.status === 415
              ? "This server cannot convert this source. Try the original file."
              : "The conversion session could not start.",
          );
        }
        const json = await boundedJson<{ id: string; duration: number }>(
          response,
          65536,
        );
        if (
          !/^[\w-]{1,128}$/.test(json.id) ||
          !Number.isFinite(json.duration) ||
          json.duration <= 0
        )
          throw new AppError(
            502,
            "INVALID_SESSION",
            "The engine returned an invalid conversion session.",
          );
        duration = json.duration;
        session.pathname += `/${json.id}/index.m3u8`;
        conversionURL = session;
        url = session.href;
      } else if (mode === "hls" && url.includes("~hls/"))
        throw new AppError(
          422,
          "CONVERSION_REQUIRED",
          "This format needs conversion. Choose Convert for browser.",
        );
      if (controller.signal.aborted)
        throw new AppError(499, "CANCELLED", "Request cancelled.");
      const local = await media.ticket(
        user.id,
        resource.id,
        url,
        mode === "transcode" ? "transcode" : "stream",
      );
      createdTicket = local.split("/").pop();
      if (reserved) {
        media.capacity.release(reserved);
        media.capacity.acquire(`transcode:${createdTicket}`, "transcode");
        reserved = undefined;
      }
      const subtitleResults = await Promise.allSettled(
        resource.files
          .filter((f) => f.kind === "subtitle")
          .slice(0, 8)
          .map(async (f) => {
            const e = await engine.exports(
              resource.id,
              f.id,
              "stream",
              controller.signal,
            );
            if (!e.exports.stream?.url) return null;
            return {
              url: await media.ticket(
                user.id,
                resource.id,
                e.exports.stream.url,
                "subtitle",
              ),
              label: f.name,
              language: "und",
            };
          }),
      );
      const subtitles = subtitleResults.flatMap((r) =>
        r.status === "fulfilled" && r.value ? [r.value] : [],
      );
      if (controller.signal.aborted)
        throw new AppError(499, "CANCELLED", "Request cancelled.");
      ok(res, {
        url: local,
        type: mode === "direct" ? "direct" : "hls",
        subtitles,
        audioTracks: [],
        session: mode === "transcode",
        duration,
      });
      delivered = true;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        controller.signal.aborted ? 499 : 502,
        "PLAYBACK_FAILED",
        controller.signal.aborted
          ? "Request cancelled."
          : "The engine could not prepare playback.",
      );
    } finally {
      res.off("close", close);
      if (reserved) media.capacity.release(reserved);
      if (!delivered && createdTicket)
        await media.release(createdTicket, user.id);
      else if (!delivered && conversionURL) {
        conversionURL.pathname = conversionURL.pathname.replace(
          /\/index\.m3u8$/,
          "",
        );
        try {
          const r = await fetch(conversionURL, {
            method: "DELETE",
            signal: AbortSignal.timeout(5000),
            redirect: "error",
          });
          await r.body?.cancel();
        } catch {
          /* Engine inactivity expiry is the final fallback. */
        }
      }
    }
  });
  app.get("/api/torrents/:id/files/:fileId/subtitles", async (req, res) => {
    const { resource, file } = await fileAccess(req),
      exp = await engine.exports(resource.id, file.id, "subtitles");
    const exported = exp.exports.subtitles?.url;
    if (!exported) {
      ok(res, { configured: false, pending: false, tracks: [] });
      return;
    }
    const url = engine.mediaURL(exported),
      response = await fetch(url, {
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      });
    if (!response.ok) {
      await response.body?.cancel();
      throw new AppError(
        502,
        "SUBTITLES_UNAVAILABLE",
        "Subtitle search is temporarily unavailable.",
      );
    }
    const parsed = z
      .array(
        z
          .object({
            src: z.string().max(2048),
            label: z.string().max(512),
            srclang: z.string().max(32),
          })
          .passthrough(),
      )
      .max(100)
      .safeParse(await boundedJson(response));
    if (!parsed.success)
      throw new AppError(
        502,
        "INVALID_SUBTITLES",
        "The engine returned invalid subtitle metadata.",
      );
    const data = parsed.data;
    const tracks = [];
    for (const item of data.slice(0, 50)) {
      if (!/^\/opensubtitles\/[a-zA-Z0-9_-]+\.vtt$/.test(item.src)) continue;
      const track = new URL(url);
      track.pathname =
        track.pathname.replace(/\/subtitles\.json$/, "") + item.src;
      tracks.push({
        url: await media.ticket(
          (req as unknown as AuthRequest).user.id,
          resource.id,
          track.href,
          "subtitle",
        ),
        label: item.label,
        language: item.srclang,
      });
    }
    ok(res, {
      configured: true,
      pending: response.headers.has("retry-after"),
      tracks,
    });
  });
  app.get("/api/torrents/:id/files/:fileId/download", async (req, res) => {
    const { resource, file } = await fileAccess(req);
    const e = await engine.exports(resource.id, file.id, "download");
    if (!e.exports.download?.url)
      throw new AppError(422, "UNAVAILABLE", "Download unavailable.");
    const ticket = await media.ticket(
      (req as unknown as AuthRequest).user.id,
      resource.id,
      e.exports.download.url,
      "download",
    );
    res.set("Content-Disposition", attachment(file.name));
    await media.forward(req, res, ticket.split("/").pop()!);
  });
  app.get("/api/torrents/:id/archive", async (req, res) => {
    const resource = await resourceAccess(req),
      e = await engine.archive(resource.id);
    if (!e.exports.download?.url)
      throw new AppError(422, "UNAVAILABLE", "Archive unavailable.");
    const ticket = await media.ticket(
      (req as unknown as AuthRequest).user.id,
      resource.id,
      e.exports.download.url,
      "download",
    );
    res.set("Content-Disposition", attachment(resource.name + ".zip"));
    await media.forward(req, res, ticket.split("/").pop()!);
  });
  app.post("/api/playback/:ticket/seek", async (req, res) => {
    const { position } = z
      .object({
        position: z
          .number()
          .finite()
          .nonnegative()
          .max(7 * 86400),
      })
      .parse(req.body);
    const row = await db.query<{ url: string }>(
      "SELECT url FROM media_tickets WHERE id=$1 AND user_id=$2 AND type='transcode' AND expires_at>now()",
      [req.params.ticket, (req as unknown as AuthRequest).user.id],
    );
    if (!row.rows.length)
      throw new AppError(404, "NOT_FOUND", "Playback session not found.");
    const url = engine.mediaURL(row.rows[0].url);
    url.pathname = url.pathname.replace(/\/index\.m3u8$/, "/seek");
    url.searchParams.set("t", String(position));
    media.capacity.acquire(`transcode:${req.params.ticket}`, "transcode");
    const response = await fetch(url, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(90000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new AppError(
        502,
        "SEEK_FAILED",
        "The conversion could not seek to this position.",
      );
    }
    const result = (await response.json()) as { offset?: number };
    ok(res, {
      offset: Number.isFinite(result.offset)
        ? result.offset
        : Math.floor(position / 30) * 30,
    });
  });
  app.delete("/api/playback/:ticket", async (req, res) => {
    await media.release(
      String(req.params.ticket),
      (req as unknown as AuthRequest).user.id,
    );
    ok(res, { success: true });
  });
  app.get("/api/media/:ticket", async (req, res) =>
    media.forward(req, res, String(req.params.ticket)),
  );
  app.get("/api/media/:ticket/:asset", async (req, res) =>
    media.forward(
      req,
      res,
      String(req.params.ticket),
      String(req.params.asset),
    ),
  );
  const librarySQL = `SELECT id,resource_id AS "resourceId",name,favorite,updated_at AS "updatedAt",progress FROM library WHERE user_id=$1`;
  app.get("/api/library", async (req, res) => {
    const rows = await db.query<LibraryItem>(
      librarySQL + " ORDER BY updated_at DESC LIMIT 500",
      [(req as unknown as AuthRequest).user.id],
    );
    ok(res, rows.rows);
  });
  app.post("/api/library", async (req, res) => {
    const body = z
      .object({
        resourceId: hash,
        name: z.string().min(1).max(512),
        favorite: z.boolean().optional(),
      })
      .parse(req.body);
    const resource = await resourceAccess(req, body.resourceId);
    const user = (req as unknown as AuthRequest).user;
    const result = await db.query(
      `INSERT INTO library(id,user_id,resource_id,name,favorite) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,resource_id) DO UPDATE SET updated_at=now() RETURNING id,resource_id AS "resourceId",name,favorite,updated_at AS "updatedAt",progress`,
      [
        randomUUID(),
        user.id,
        resource.id,
        resource.name,
        body.favorite ?? false,
      ],
    );
    ok(res, result.rows[0], 201);
  });
  app.patch("/api/library/:itemId", async (req, res) => {
    const body = z
        .object({
          favorite: z.boolean().optional(),
          progress: progress.optional(),
        })
        .strict()
        .parse(req.body),
      user = (req as unknown as AuthRequest).user;
    const row = await db.query<{ resource_id: string }>(
      "SELECT resource_id FROM library WHERE id=$1 AND user_id=$2",
      [req.params.itemId, user.id],
    );
    if (!row.rows.length)
      throw new AppError(404, "NOT_FOUND", "Library entry not found.");
    const resource = await resourceAccess(req, row.rows[0].resource_id);
    if (
      body.progress &&
      !resource.files.some((f) => f.id === body.progress!.fileId)
    )
      throw new AppError(
        422,
        "INVALID_FILE",
        "Playback file does not belong to this torrent.",
      );
    const result = await db.query(
      'UPDATE library SET favorite=COALESCE($1,favorite),progress=COALESCE($2::jsonb,progress),updated_at=now() WHERE id=$3 AND user_id=$4 RETURNING id,resource_id AS "resourceId",name,favorite,updated_at AS "updatedAt",progress',
      [
        body.favorite ?? null,
        body.progress ? JSON.stringify(body.progress) : null,
        req.params.itemId,
        user.id,
      ],
    );
    ok(res, result.rows[0]);
  });
  app.delete("/api/library/:itemId", async (req, res) => {
    const result = await db.query(
      "DELETE FROM library WHERE id=$1 AND user_id=$2 RETURNING id",
      [req.params.itemId, (req as unknown as AuthRequest).user.id],
    );
    if (!result.rows.length)
      throw new AppError(404, "NOT_FOUND", "Library entry not found.");
    ok(res, { success: true });
  });
  app.get("/api/recent", async (req, res) => {
    const result = await db.query(
      'SELECT r.id,r.name,r.metadata,a.opened_at AS "openedAt" FROM resource_access a JOIN resources r ON r.id=a.resource_id WHERE a.user_id=$1 ORDER BY a.opened_at DESC LIMIT 50',
      [(req as unknown as AuthRequest).user.id],
    );
    ok(res, result.rows);
  });
  app.delete("/api/torrents/:id", async (req, res) => {
    const resource = await resourceAccess(req),
      user = (req as unknown as AuthRequest).user;
    await db.query("DELETE FROM library WHERE user_id=$1 AND resource_id=$2", [
      user.id,
      resource.id,
    ]);
    const tickets = await db.query<{ id: string }>(
      "SELECT id FROM media_tickets WHERE user_id=$1 AND resource_id=$2",
      [user.id, resource.id],
    );
    for (const ticket of tickets.rows) await media.release(ticket.id, user.id);
    await db.query(
      "DELETE FROM resource_access WHERE user_id=$1 AND resource_id=$2",
      [user.id, resource.id],
    );
    ok(res, { success: true });
  });
  app.post("/api/abuse", async (req, res) => {
    const body = z
      .object({
        resourceId: hash.optional(),
        reason: z.string().min(10).max(4000),
      })
      .parse(req.body);
    await db.query(
      "INSERT INTO abuse_reports(id,user_id,resource_id,reason) VALUES($1,$2,$3,$4)",
      [
        randomUUID(),
        (req as unknown as AuthRequest).user.id,
        body.resourceId ?? null,
        body.reason,
      ],
    );
    ok(res, { success: true }, 201);
  });
  app.get("/api/admin/storage", admin, async (_req, res) => {
    const s = await storageSnapshot(config);
    ok(res, {
      ...s,
      limits: {
        streams: config.MAX_STREAMS,
        downloads: config.MAX_DOWNLOADS,
        transcodes: config.MAX_TRANSCODES,
        torrents: config.MAX_TORRENTS,
        cacheBytes: config.MAX_CACHE_BYTES,
        minFreeBytes: config.MIN_FREE_BYTES,
      },
      activeStreams: media.capacity.count("stream"),
      activeDownloads: media.capacity.count("download"),
      activeTranscodes: media.capacity.count("transcode"),
      egressBytes: media.egressBytes,
      memoryBytes: process.memoryUsage().rss,
      uptimeSeconds: process.uptime(),
    });
  });
  app.get("/api/admin/reports", admin, async (_req, res) =>
    ok(
      res,
      (
        await db.query(
          'SELECT id,resource_id AS "resourceId",reason,created_at AS "createdAt" FROM abuse_reports ORDER BY created_at DESC LIMIT 100',
        )
      ).rows,
    ),
  );
  app.delete("/api/admin/resources/:id", admin, async (req, res) => {
    const id = hash.parse(req.params.id).toLowerCase();
    const tickets = await db.query<{ id: string; user_id: string }>(
      "SELECT id,user_id FROM media_tickets WHERE resource_id=$1",
      [id],
    );
    for (const ticket of tickets.rows)
      await media.release(ticket.id, ticket.user_id);
    await db.query("DELETE FROM resources WHERE id=$1", [id]);
    ok(res, {
      success: true,
      message: "Metadata and access removed. Engine cache expires separately.",
    });
  });
  app.use("/api", (_req, _res) => {
    throw new AppError(404, "NOT_FOUND", "API endpoint not found.");
  });
  app.use(express.static(resolve("dist/client")));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(resolve("dist/client/index.html")),
  );
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (error instanceof ZodError) {
        res.status(400).json({
          error: {
            code: "VALIDATION",
            message: error.issues
              .map((x) => x.message)
              .slice(0, 2)
              .join(". "),
          },
        });
        return;
      }
      const e =
        error instanceof AppError
          ? error
          : new AppError(
              (error as { status?: number })?.status === 413 ? 413 : 500,
              "INTERNAL",
              (error as { status?: number })?.status === 413
                ? "Upload is too large."
                : "The server could not complete this request.",
            );
      res
        .status(e.status)
        .json({ error: { code: e.code, message: e.message } });
    },
  );
  return { app, media, engine };
}
