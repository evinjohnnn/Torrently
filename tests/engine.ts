/** Opt-in, real Webtor integration. Never substitutes a contract fixture. */
import "dotenv/config";
import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const uri = new URL(base);
assert(
  ["localhost", "127.0.0.1"].includes(uri.hostname) ||
    process.env.TEST_OWNED_HOST === "true",
  "Use a local deployment or explicitly confirm TEST_OWNED_HOST=true for your own server.",
);
assert(
  process.env.TEST_MAGNET,
  "Set TEST_MAGNET to lawful media seeded for your deployment. No implicit third-party torrent is downloaded.",
);
assert(
  process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD,
  "Configure local administrator credentials through the environment.",
);
const health = await (await fetch(base + "/api/health")).json();
assert.equal(
  health.data.upstream,
  "ok",
  "Real engine must be healthy and configured.",
);
const login = await fetch(base + "/api/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  }),
});
assert.equal(login.status, 200, "Authentication");
const session = await login.json(),
  cookie = login.headers.get("set-cookie")!.split(";")[0];
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return fetch(base + path, {
    method,
    headers: {
      Cookie: cookie,
      "X-CSRF-Token": session.data.csrfToken,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(180000),
  });
}
const submitted = await call("/api/torrents", "POST", {
  magnet: process.env.TEST_MAGNET,
});
assert.equal(submitted.status, 201, "Real magnet must resolve");
const resource = (await submitted.json()).data;
assert(resource.files.length > 0, "Real file list");
const file = resource.files.find(
  (f: { kind: string; name: string }) =>
    f.kind === "video" &&
    (!process.env.TEST_VIDEO_NAME || f.name === process.env.TEST_VIDEO_NAME),
);
assert(file, "Provide a torrent with browser-compatible video.");
const prefix = `/api/torrents/${resource.id}/files/${file.id}`;
const range = await call(prefix + "/download", "GET", undefined, {
  Range: "bytes=0-1023",
});
assert.equal(range.status, 206, "HTTP Range");
assert.match(range.headers.get("content-range")!, /^bytes 0-1023\//);
assert.equal((await range.arrayBuffer()).byteLength, 1024);
const playback = (await (await call(prefix + "/playback?mode=hls")).json())
  .data;
assert(playback?.url, "Real HLS export");
async function playlist(path: string, depth = 0): Promise<void> {
  assert(depth < 4, "Bounded playlist traversal");
  const response = await call(path);
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.match(text, /^#EXTM3U/);
  assert(!/token=|api-key=/.test(text), "No upstream signing material exposed");
  const child = text
    .split(/\r?\n/)
    .find((line: string) => line.startsWith("/api/media/"));
  assert(child, "Playlist has a segment or child playlist");
  const r = await call(child);
  assert.equal(r.status, 200);
  if (/mpegurl/i.test(r.headers.get("content-type") ?? "")) {
    await r.body?.cancel();
    await playlist(child, depth + 1);
  } else
    assert((await r.arrayBuffer()).byteLength > 0, "Real media segment bytes");
}
await playlist(playback.url);
await call("/api/playback/" + playback.url.split("/").pop(), "DELETE");
const saved = await call("/api/library", "POST", {
  resourceId: resource.id,
  name: resource.name,
});
assert.equal(saved.status, 201);
const item = (await saved.json()).data;
assert.equal(
  (
    await call("/api/library/" + item.id, "PATCH", {
      favorite: true,
      progress: { fileId: file.id, position: 1, duration: 10 },
    })
  ).status,
  200,
);
const stored = (await (await call("/api/library")).json()).data;
assert(
  stored.some(
    (v: { id: string; favorite: boolean }) => v.id === item.id && v.favorite,
  ),
  "Saved library state",
);
if (process.env.TEST_ARCHIVE === "true") {
  const archive = await call(`/api/torrents/${resource.id}/archive`);
  assert.equal(archive.status, 200);
  const reader = archive.body!.getReader();
  const first = await reader.read();
  assert(
    first.value && first.value[0] === 0x50 && first.value[1] === 0x4b,
    "ZIP signature",
  );
  await reader.cancel();
}
console.log(
  "PASS: real magnet, metadata, files, Range bytes, HLS playlist/segment and persistent library writes. Browser decoding/seeking is a separate test. Resource retained for browser verification.",
);
