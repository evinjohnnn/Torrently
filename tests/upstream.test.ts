import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { Webtor } from "../server/upstream.js";
import { configuration } from "../server/config.js";
const hash = "a".repeat(40);
const config = configuration({
  NODE_ENV: "test",
  ADMIN_PASSWORD: "test-password-only",
  SESSION_SECRET: "test-secret-".repeat(4),
  WEBTOR_API_KEY: "unit-contract-key",
});
test("media URLs require exact private engine origin and verified nginx prefix", () => {
  const engine = new Webtor(config),
    base = `http://127.0.0.1:8080/torrent-http-proxy/${hash}/clip.mp4~vod/hls/id/index.m3u8?token=private`;
  assert.equal(engine.mediaURL(base).href, base);
  assert.equal(
    engine.mediaURL("s-1.ts?token=private", base).pathname,
    `/torrent-http-proxy/${hash}/clip.mp4~vod/hls/id/s-1.ts`,
  );
  for (const bad of [
    `http://evil.test/torrent-http-proxy/${hash}/x`,
    `http://user@127.0.0.1:8080/torrent-http-proxy/${hash}/x`,
    `http://127.0.0.1:8080/profile`,
    `http://127.0.0.1:8080/${hash}/x`,
    `http://127.0.0.1:8080/torrent-http-proxy/${hash}/%252e%252e/x`,
    `http://127.0.0.1:8080/torrent-http-proxy/${hash}/%00`,
    `http://127.0.0.1:8080/torrent-http-proxy/${hash}/x#fragment`,
  ])
    assert.throws(() => engine.mediaURL(bad));
});
test("adapter contract pages flattened directory/file listings using item offsets", async () => {
  const paths = [
    "folder",
    ...Array.from({ length: 1000 }, (_, n) => `folder/clip-${n}.mp4`),
  ];
  const all = paths.map((path, n) => ({
    id: createHash("sha1")
      .update("/" + path)
      .digest("hex"),
    path: "/" + path,
    name: path.split("/").pop(),
    type: n ? "file" : "directory",
    size: n ? 1 : 1000,
    index: n - 1,
  }));
  const offsets: number[] = [];
  let authorization = "";
  const server = createServer((req, res) => {
    authorization = req.headers.authorization ?? "";
    const url = new URL(req.url!, "http://fixture");
    res.setHeader("Content-Type", "application/json");
    if (url.pathname === `/api/v1/resource/${hash}`) {
      res.end(
        JSON.stringify({
          id: hash,
          name: "Pack",
          size: 1000,
          files_count: 1000,
        }),
      );
      return;
    }
    if (url.pathname === `/api/v1/resource/${hash}/list`) {
      const offset = Number(url.searchParams.get("offset"));
      offsets.push(offset);
      res.end(
        JSON.stringify({
          items: all.slice(offset, offset + 1000),
          items_count: all.length,
        }),
      );
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const engine = new Webtor({
      ...config,
      WEBTOR_URL: `http://127.0.0.1:${address.port}`,
    });
    const resource = await engine.resource(hash);
    assert.equal(resource.files.length, 1000);
    assert.equal(resource.files[999].path, "folder/clip-999.mp4");
    assert.deepEqual(offsets, [0, 1000]);
    assert.equal(authorization, "Bearer unit-contract-key");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});
test("invalid IDs and unconfigured engine fail before network access", async () => {
  const engine = new Webtor({ ...config, WEBTOR_API_KEY: "" });
  await assert.rejects(engine.resource("../profile"));
  await assert.rejects(engine.resource(hash), { code: "ENGINE_UNCONFIGURED" });
});
