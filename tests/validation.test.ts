import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  magnet,
  safePath,
  safeFilename,
  torrentUpload,
} from "../server/validation.js";
function encode(value: unknown): Buffer {
  if (Buffer.isBuffer(value))
    return Buffer.concat([Buffer.from(`${value.length}:`), value]);
  if (typeof value === "string") return encode(Buffer.from(value));
  if (typeof value === "number") return Buffer.from(`i${value}e`);
  if (Array.isArray(value))
    return Buffer.concat([
      Buffer.from("l"),
      ...value.map(encode),
      Buffer.from("e"),
    ]);
  if (value && typeof value === "object")
    return Buffer.concat([
      Buffer.from("d"),
      ...Object.entries(value)
        .sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
        .flatMap(([k, v]) => [encode(k), encode(v)]),
      Buffer.from("e"),
    ]);
  throw new Error("unsupported fixture");
}
const info = () => ({
  name: "clip.mp4",
  length: 10,
  "piece length": 16,
  pieces: Buffer.alloc(20, 1),
});
test("magnet accepts v1 hex and base32, normalizes and removes SSRF destinations", () => {
  const hash = "abcdef0123456789abcdef0123456789abcdef01";
  const value = new URL(
    magnet(
      `magnet:?xt=urn:btih:${hash.toUpperCase()}&dn=Clip&tr=http://127.0.0.1:80&ws=http://169.254.169.254/`,
    ),
  );
  assert.equal(value.searchParams.get("xt"), `urn:btih:${hash}`);
  assert.equal(value.searchParams.has("tr"), false);
  assert.equal(value.searchParams.has("ws"), false);
  assert.equal(value.searchParams.get("dn"), "Clip");
  assert.equal(
    new URL(
      magnet("magnet:?xt=urn:btih:77777777777777777777777777777777"),
    ).searchParams.get("xt"),
    "urn:btih:" + "f".repeat(40),
  );
});
test("magnet rejects empty, v2-only, duplicate hashes, zero hashes and authority", () => {
  for (const input of [
    "",
    "https://example.com",
    "magnet:?xt=urn:btmh:1220abc",
    "magnet:?xt=urn:btih:" + "0".repeat(40),
    "magnet:?xt=urn:btih:" + "A".repeat(32),
    "magnet://evil/?xt=urn:btih:" + "1".repeat(40),
    "magnet:?xt=urn:btih:" + "1".repeat(40) + "&xt=urn:btih:" + "2".repeat(40),
  ])
    assert.throws(() => magnet(input));
});
test("paths reject traversal, absolute paths, empty segments and control characters", () => {
  assert.equal(safePath("folder/clip.mp4"), "folder/clip.mp4");
  for (const path of [
    "../clip",
    "a/../b",
    "a/./b",
    "a//b",
    "/etc/passwd",
    "C:/data",
    "a\\b",
    "a\0b",
    "folder~hls/session/clip.mp4",
    "",
  ])
    assert.throws(() => safePath(path));
  assert.equal(safeFilename('a/"b\r\n'), "a__b__");
});
test("torrent sanitation preserves exact infohash and strips all outer fetch metadata", () => {
  const rawInfo = encode(info()),
    original = encode({
      announce: "http://127.0.0.1/announce",
      "url-list": ["http://169.254.169.254/"],
      nodes: [["127.0.0.1", 80]],
      comment: "text",
      info: info(),
    });
  const checked = torrentUpload(original);
  assert.equal(checked.hash, createHash("sha1").update(rawInfo).digest("hex"));
  assert.equal(checked.size, 10);
  assert.deepEqual(
    checked.data,
    Buffer.concat([Buffer.from("d4:info"), rawInfo, Buffer.from("e")]),
  );
  assert.equal(torrentUpload(checked.data).hash, checked.hash);
});
test("torrent validates recursive paths, piece counts, sizes and private trackers", () => {
  const multi = {
    name: "Pack",
    files: [
      { length: 10, path: ["Season", "clip.mp4"] },
      { length: 2, path: ["readme.txt"] },
    ],
    "piece length": 16,
    pieces: Buffer.alloc(20, 2),
  };
  assert.equal(torrentUpload(encode({ info: multi })).size, 12);
  for (const invalid of [
    { ...info(), pieces: Buffer.alloc(0) },
    { ...info(), length: -1 },
    { ...info(), private: 1 },
    { ...info(), "meta version": 2 },
    { ...multi, files: [] },
    { ...multi, length: 10 },
    { ...multi, files: [{ length: 10, path: ["..", "clip.mp4"] }] },
    { ...multi, files: [{ length: 10, path: ["a/b"] }] },
    {
      ...multi,
      files: [
        { length: 10, path: ["clip.mp4"], "path.utf-8": ["..", "secret"] },
      ],
    },
    {
      ...multi,
      files: [
        {
          length: 10,
          path: ["link"],
          attr: "l",
          "symlink path": ["etc", "passwd"],
        },
      ],
    },
    {
      ...multi,
      files: [
        { length: 10, path: ["x"] },
        { length: 2, path: ["x"] },
      ],
    },
  ])
    assert.throws(() => torrentUpload(encode({ info: invalid })));
});
test("torrent rejects duplicate bencode keys, truncation, trailing input and unsafe integer", () => {
  for (const bytes of ["d4:infode4:infodee", "d4:info", "i9007199254740992e"])
    assert.throws(() => torrentUpload(Buffer.from(bytes)));
  assert.throws(() =>
    torrentUpload(
      Buffer.concat([encode({ info: info() }), Buffer.from("junk")]),
    ),
  );
});
test("attachment headers use safe ASCII fallback and preserve international names", async () => {
  const { attachment } = await import("../server/validation.js");
  const value = attachment("字幕 🎬.mp4");
  assert.match(value, /filename="[_ ]+\.mp4"/);
  assert.match(value, /filename\*=UTF-8''%/);
  assert(!/[\r\n]/.test(attachment("bad\r\nname.mp4")));
});
