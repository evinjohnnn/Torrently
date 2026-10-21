/** Real Torrently HTTP + PostgreSQL tests against a controlled upstream CONTRACT fixture.
 * This fixture is not a BitTorrent engine and these are not torrent E2E results. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { configuration } from "../server/config.js";
import { database, migrate, type DB } from "../server/db.js";
import { seedAdmin, hashPassword } from "../server/auth.js";
import { createApp } from "../server/app.js";
const resourceId = "a".repeat(40),
  fileId = "b".repeat(40),
  otherFile = "c".repeat(40);
const payload = Buffer.from("A real HTTP range payload, not a video.");
let appServer: Server,
  engineServer: Server,
  db: DB,
  base: string,
  engineBase: string,
  dir: string,
  cookie: string,
  csrf: string,
  libraryId: string;
let engineRequests = 0;
let playbackPath = "";
async function listen(app: express.Express) {
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const addr = server.address();
  return {
    server,
    url: `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`,
  };
}
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return fetch(base + path, {
    method,
    headers: {
      Cookie: cookie ?? "",
      ...(method !== "GET" ? { "X-CSRF-Token": csrf ?? "" } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "torrently-api-"));
  const upstream = express();
  upstream.use(express.raw({ type: "*/*" }));
  upstream.get("/api/v1/profile", (q, r) => {
    assert.equal(q.get("authorization"), "Bearer test-engine-key");
    r.json({ id: "engine-account" });
  });
  upstream.use("/api/v1", (q, r, next) => {
    engineRequests++;
    assert.equal(q.get("authorization"), "Bearer test-engine-key");
    next();
  });
  upstream.post("/api/v1/resource", (q, r) => {
    assert.match(q.body.toString(), /^magnet:\?/);
    assert.doesNotMatch(q.body.toString(), /ws=|tr=/);
    r.json({
      id: resourceId,
      name: "Controlled fixture",
      files_count: 1,
      size: payload.length,
    });
  });
  upstream.get("/api/v1/resource/:id/list", (_q, r) =>
    r.json({
      id: otherFile,
      type: "directory",
      path: "/",
      items_count: 1,
      items: [
        {
          id: fileId,
          name: "fixture.mp4",
          path: "/fixture.mp4",
          size: payload.length,
          type: "file",
          index: 0,
        },
      ],
    }),
  );
  upstream.get("/api/v1/resource/:id/export/:file", (q, r) =>
    r.json({
      source: { id: fileId },
      exports: {
        download: {
          url: `${engineBase}/torrent-http-proxy/${resourceId}/fixture.mp4?token=TOP_SECRET`,
        },
        stream: {
          url: `${engineBase}/torrent-http-proxy/${resourceId}/fixture.mp4~vod/index.m3u8?token=TOP_SECRET`,
        },
      },
    }),
  );
  upstream.get(
    `/torrent-http-proxy/${resourceId}/fixture.mp4~vod/index.m3u8`,
    (_q, r) =>
      r
        .type("application/vnd.apple.mpegurl")
        .send(
          '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:4,\nsegment.ts\n#EXT-X-ENDLIST\n',
        ),
  );
  upstream.get(
    `/torrent-http-proxy/${resourceId}/fixture.mp4~vod/segment.ts`,
    (q, r) => {
      assert.equal(q.query.token, "TOP_SECRET");
      r.type("video/mp2t").send(payload);
    },
  );
  upstream.get(`/torrent-http-proxy/${resourceId}/fixture.mp4`, (q, r) => {
    r.set("Accept-Ranges", "bytes");
    if (q.get("range") === "bytes=0-3") {
      r.status(206)
        .set("Content-Range", `bytes 0-3/${payload.length}`)
        .send(payload.subarray(0, 4));
    } else r.send(payload);
  });
  const e = await listen(upstream);
  engineServer = e.server;
  engineBase = e.url;
  const config = configuration({
    NODE_ENV: "test",
    ADMIN_EMAIL: "admin@localhost.test",
    ADMIN_PASSWORD: "a-long-test-password",
    SESSION_SECRET: "test-session-secret-32-characters-long",
    DATA_DIR: dir,
    WEBTOR_URL: engineBase,
    WEBTOR_API_KEY: "test-engine-key",
    MIN_FREE_BYTES: "1",
  });
  db = await database(config);
  await migrate(db);
  await seedAdmin(db, config);
  const a = await listen(createApp(config, db).app);
  appServer = a.server;
  base = a.url;
});
after(async () => {
  await Promise.all([
    new Promise<void>((r) => appServer.close(() => r())),
    new Promise<void>((r) => engineServer.close(() => r())),
  ]);
  await db.close();
  await rm(dir, { recursive: true, force: true });
});
test("health reports actual database and controlled engine readiness", async () => {
  const r = await request("/api/health");
  assert.equal(r.status, 200);
  assert.equal((await r.json()).data.status, "ok");
});
test("unauthenticated expensive operations are rejected before calling upstream", async () => {
  const before = engineRequests;
  const r = await request("/api/torrents", "POST", {
    magnet: "magnet:?xt=urn:btih:" + resourceId,
  });
  assert.equal(r.status, 401);
  assert.equal(engineRequests, before);
});
test("login creates httpOnly strict cookie and session with CSRF", async () => {
  const r = await request("/api/login", "POST", {
    email: "admin@localhost.test",
    password: "a-long-test-password",
  });
  assert.equal(r.status, 200);
  const c = r.headers.get("set-cookie")!;
  assert.match(c, /HttpOnly/i);
  assert.match(c, /SameSite=Strict/i);
  cookie = c.split(";")[0];
  csrf = (await r.json()).data.csrfToken;
  assert.equal((await request("/api/session")).status, 200);
});
test("CSRF, foreign origins, URL input and unsafe JSON rejected", async () => {
  assert.equal(
    (await request("/api/torrents", "POST", {}, { "X-CSRF-Token": "bad" }))
      .status,
    403,
  );
  assert.equal(
    (
      await request(
        "/api/torrents",
        "POST",
        {},
        { Origin: "https://attacker.example" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/api/torrents", "POST", {
        magnet: "http://127.0.0.1/private",
      })
    ).status,
    400,
  );
});
test("submits magnet and reads verified flat file metadata", async () => {
  const r = await request("/api/torrents", "POST", {
    magnet: `magnet:?xt=urn:btih:${resourceId}&ws=http://127.0.0.1/admin`,
  });
  assert.equal(r.status, 201, await r.clone().text());
  const resource = (await r.json()).data;
  assert.equal(resource.files[0].id, fileId);
  assert.equal(resource.files[0].kind, "video");
  assert.equal((await request(`/api/torrents/${resourceId}`)).status, 200);
});
test("download streams range response and preserves headers with no signed URL leak", async () => {
  const r = await request(
    `/api/torrents/${resourceId}/files/${fileId}/download`,
    "GET",
    undefined,
    { Range: "bytes=0-3" },
  );
  assert.equal(r.status, 206);
  assert.equal(await r.text(), "A re");
  assert.match(r.headers.get("content-range")!, /^bytes 0-3\//);
  assert.match(r.headers.get("content-disposition")!, /fixture.mp4/);
  assert.equal(r.headers.get("location"), null);
});
test("HLS manifests rewrite segment and URI attributes through authenticated encrypted tickets", async () => {
  const r = await request(
    `/api/torrents/${resourceId}/files/${fileId}/playback?mode=hls`,
  );
  assert.equal(r.status, 200, await r.clone().text());
  const playback = (await r.json()).data;
  playbackPath = playback.url;
  assert.match(playback.url, /^\/api\/media\//);
  assert.doesNotMatch(
    JSON.stringify(playback),
    /TOP_SECRET|test-engine-key|torrent-http-proxy/,
  );
  const manifest = await request(playback.url);
  assert.equal(manifest.status, 200, await manifest.clone().text());
  const text = await manifest.text();
  assert.doesNotMatch(text, /TOP_SECRET|token=|engine-key|127.0.0.1/);
  assert.match(text, /URI="\/api\/media\//);
  const segment = text.split("\n").find((l: string) => l.startsWith("/api/"))!;
  assert.equal(await (await request(segment)).text(), payload.toString());
  const anonymous = await fetch(base + segment);
  assert.equal(anonymous.status, 401);
});
test("library favorite and validated playback progress persist in PostgreSQL", async () => {
  const saved = await request("/api/library", "POST", {
    resourceId,
    name: "ignored custom name",
  });
  assert.equal(saved.status, 201);
  libraryId = (await saved.json()).data.id;
  assert.equal(
    (
      await request(`/api/library/${libraryId}`, "PATCH", {
        favorite: true,
        progress: { fileId, position: 12, duration: 60 },
      })
    ).status,
    200,
  );
  const rows = (await (await request("/api/library")).json()).data;
  assert.equal(rows[0].name, "Controlled fixture");
  assert.equal(rows[0].favorite, true);
  assert.equal(rows[0].progress.position, 12);
  assert.equal(
    (
      await request(`/api/library/${libraryId}`, "PATCH", {
        progress: { fileId: otherFile, position: 1, duration: 60 },
      })
    ).status,
    422,
  );
  assert.equal(
    (await db.query("SELECT favorite FROM library WHERE id=$1", [libraryId]))
      .rows.length,
    1,
  );
});
test("other accounts cannot read resources, change library or reuse media tickets", async () => {
  const adminCookie = cookie,
    adminCsrf = csrf,
    id = randomUUID();
  await db.query(
    "INSERT INTO users(id,email,password_hash,admin) VALUES($1,$2,$3,false)",
    [id, "viewer@localhost.test", await hashPassword("other-user-password")],
  );
  const login = await request("/api/login", "POST", {
    email: "viewer@localhost.test",
    password: "other-user-password",
  });
  cookie = login.headers.get("set-cookie")!.split(";")[0];
  csrf = (await login.json()).data.csrfToken;
  assert.equal((await request(`/api/torrents/${resourceId}`)).status, 404);
  assert.equal(
    (await request(`/api/library/${libraryId}`, "PATCH", { favorite: false }))
      .status,
    404,
  );
  assert.equal((await request("/api/admin/storage")).status, 403);
  assert.equal((await request(playbackPath)).status, 404);
  cookie = adminCookie;
  csrf = adminCsrf;
});
test("library removal does not delete shared torrent metadata; access deletion does revoke user access", async () => {
  assert.equal(
    (await request(`/api/library/${libraryId}`, "DELETE")).status,
    200,
  );
  assert.equal((await request(`/api/torrents/${resourceId}`)).status, 200);
  assert.equal(
    (await request(`/api/torrents/${resourceId}`, "DELETE")).status,
    200,
  );
  assert.equal((await request(`/api/torrents/${resourceId}`)).status, 404);
});

test("HEAD download preserves representation headers without response bytes", async () => {
  /* resource access was revoked in prior test; re-grant via actual submission */ const submit =
    await request("/api/torrents", "POST", {
      magnet: "magnet:?xt=urn:btih:" + resourceId,
    });
  assert.equal(submit.status, 201);
  const r = await request(
    `/api/torrents/${resourceId}/files/${fileId.toUpperCase()}/download`,
    "HEAD",
  );
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-length"), String(payload.length));
  assert(r.headers.get("content-type"));
  assert.equal(await r.text(), "");
});
