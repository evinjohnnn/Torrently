import { createHash } from "node:crypto";
import { AppError } from "./errors.js";

export function magnet(value: string): string {
  if (value.length > 16384)
    throw new AppError(400, "INVALID_MAGNET", "Magnet link is too long.");
  let uri: URL;
  try {
    uri = new URL(value.trim());
  } catch {
    throw new AppError(400, "INVALID_MAGNET", "Enter a valid magnet link.");
  }
  const hashes = uri.searchParams.getAll("xt");
  if (
    uri.protocol !== "magnet:" ||
    uri.host ||
    uri.pathname ||
    uri.hash ||
    hashes.length !== 1 ||
    !/^urn:btih:([a-f\d]{40}|[a-z2-7]{32})$/i.test(hashes[0])
  )
    throw new AppError(
      400,
      "INVALID_MAGNET",
      "Use a BitTorrent v1 magnet link with a valid infohash.",
    );
  let hash = hashes[0].slice(9).toLowerCase();
  if (hash.length === 32) {
    const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
    let bits = 0,
      acc = 0;
    const bytes: number[] = [];
    for (const c of hash) {
      acc = (acc << 5) | alphabet.indexOf(c);
      bits += 5;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((acc >>> bits) & 255);
      }
    }
    hash = Buffer.from(bytes).toString("hex");
  }
  if (/^0{40}$/.test(hash))
    throw new AppError(
      400,
      "INVALID_MAGNET",
      "The all-zero infohash does not identify a torrent.",
    );
  // Trackers and web seeds are server-side fetch destinations. Use only operator-configured trackers and DHT.
  const clean = new URL("magnet:?");
  clean.searchParams.set("xt", `urn:btih:${hash}`);
  const name = uri.searchParams.get("dn");
  if (name) clean.searchParams.set("dn", name.slice(0, 512));
  return clean.toString();
}
export function safePath(value: string): string {
  if (
    !value ||
    value.length > 4096 ||
    value.includes("~") ||
    /[\x00-\x1f\x7f\\]/.test(value) ||
    value.startsWith("/") ||
    /^[a-z]:/i.test(value) ||
    value.split("/").some((s) => s === ".." || s === "." || !s)
  )
    throw new AppError(
      422,
      "UNSAFE_PATH",
      "Torrent contains an unsafe filename.",
    );
  return value;
}
export function safeFilename(value: string) {
  const clean = Buffer.from(value, "utf8")
    .toString("utf8")
    .replace(/[\x00-\x1f\x7f"\\/]/g, "_");
  return Array.from(clean).slice(0, 180).join("") || "download";
}
export function attachment(value: string) {
  const name = safeFilename(value),
    ascii = name.replace(/[^\x20-\x7e]/g, "_");
  const utf8 = encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}
export function kind(name: string): "video" | "audio" | "subtitle" | "file" {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return ["mp4", "m4v", "mkv", "webm", "mov", "avi", "ts", "vob"].includes(ext)
    ? "video"
    : ["mp3", "m4a", "aac", "flac", "wav", "ogg", "opus"].includes(ext)
      ? "audio"
      : ["srt", "vtt", "ass", "ssa"].includes(ext)
        ? "subtitle"
        : "file";
}
function dictionary(value: unknown): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !Buffer.isBuffer(value)
  );
}
const decoder = new TextDecoder("utf-8", { fatal: true });
function segment(value: unknown): string {
  if (!Buffer.isBuffer(value)) throw new Error("Invalid filename");
  const text = decoder.decode(value);
  safePath(text);
  if (text.includes("/")) throw new Error("Invalid path segment");
  return text;
}
// Bounded bencode parsing retains the original info bytes; re-encoding that dictionary could change its hash.
export function torrentUpload(data: Buffer) {
  let p = 0,
    nodes = 0,
    infoStart = -1,
    infoEnd = -1;
  function parse(depth: number, root = false): unknown {
    if (depth > 32 || ++nodes > 100000 || p >= data.length)
      throw new Error("Invalid torrent structure");
    const c = String.fromCharCode(data[p]);
    if (c === "i") {
      p++;
      const end = data.indexOf(101, p);
      if (end < 0) throw new Error("Invalid integer");
      const v = data.subarray(p, end).toString();
      if (!/^(0|-?[1-9]\d*)$/.test(v) || v.length > 16)
        throw new Error("Invalid integer");
      const n = Number(v);
      if (!Number.isSafeInteger(n))
        throw new Error("Integer exceeds safe range");
      p = end + 1;
      return n;
    }
    if (c === "l" || c === "d") {
      p++;
      const list: unknown[] = [];
      const dict: Record<string, unknown> = Object.create(null);
      let last: Buffer | undefined;
      while (data[p] !== 101) {
        if (p >= data.length) throw new Error("Unterminated value");
        if (c === "l") {
          list.push(parse(depth + 1));
          continue;
        }
        const key = parse(depth + 1);
        if (!Buffer.isBuffer(key)) throw new Error("Invalid dictionary key");
        if (last && Buffer.compare(last, key) >= 0)
          throw new Error("Unsorted or duplicate dictionary keys");
        last = key;
        const k = decoder.decode(key);
        if (Object.hasOwn(dict, k)) throw new Error("Duplicate dictionary key");
        if (root && k === "info") infoStart = p;
        dict[k] = parse(depth + 1);
        if (root && k === "info") infoEnd = p;
      }
      p++;
      return c === "l" ? list : dict;
    }
    const colon = data.indexOf(58, p);
    if (colon < 0 || colon - p > 8) throw new Error("Invalid string");
    const raw = data.subarray(p, colon).toString();
    if (!/^(0|[1-9]\d*)$/.test(raw)) throw new Error("Invalid length");
    const len = Number(raw);
    p = colon + 1;
    if (p + len > data.length) throw new Error("Truncated string");
    const b = data.subarray(p, p + len);
    p += len;
    return b;
  }
  try {
    if (data.length > 8 * 1024 * 1024)
      throw new Error("Torrent metadata is too large");
    const root = parse(0, true);
    if (
      p !== data.length ||
      !dictionary(root) ||
      !dictionary(root.info) ||
      infoStart < 0 ||
      infoEnd <= infoStart
    )
      throw new Error("Missing info dictionary");
    const info = root.info;
    segment(info.name);
    if (info["name.utf-8"] !== undefined) segment(info["name.utf-8"]);
    if (info["meta version"] !== undefined)
      throw new Error("Only v1 torrents are supported");
    if (info.private !== undefined && info.private !== 0)
      throw new AppError(
        422,
        "PRIVATE_TORRENT",
        "Private tracker torrents are not supported. Use a public DHT-enabled torrent.",
      );
    const files = info.files;
    if (
      files !== undefined &&
      (!Array.isArray(files) ||
        files.length === 0 ||
        files.length > 10000 ||
        info.length !== undefined)
    )
      throw new Error("Invalid multi-file torrent");
    const lengths: unknown[] = [];
    const seenPaths = new Set<string>();
    if (Array.isArray(files))
      for (const f of files) {
        if (!dictionary(f) || !Array.isArray(f.path) || f.path.length === 0)
          throw new Error("Invalid file path");
        const path = safePath(f.path.map(segment).join("/"));
        if (seenPaths.has(path)) throw new Error("Duplicate file path");
        seenPaths.add(path);
        if (f["path.utf-8"] !== undefined) {
          if (!Array.isArray(f["path.utf-8"]) || !f["path.utf-8"].length)
            throw new Error("Invalid UTF-8 path");
          safePath((f["path.utf-8"] as unknown[]).map(segment).join("/"));
        }
        if (
          f["symlink path"] !== undefined ||
          (Buffer.isBuffer(f.attr) && f.attr.includes(108))
        )
          throw new Error("Symbolic links are not supported");
        lengths.push(f.length);
      }
    else lengths.push(info.length);
    if (lengths.some((n) => !Number.isSafeInteger(n) || Number(n) < 0))
      throw new Error("Invalid file size");
    const size = lengths.reduce<number>((a, n) => a + Number(n), 0);
    if (!Number.isSafeInteger(size) || size <= 0)
      throw new Error("Invalid torrent size");
    const pieceLength = info["piece length"];
    if (
      !Buffer.isBuffer(info.pieces) ||
      !Number.isSafeInteger(pieceLength) ||
      Number(pieceLength) <= 0 ||
      info.pieces.length !== Math.ceil(size / Number(pieceLength)) * 20
    )
      throw new Error("Invalid v1 piece hashes");
    const rawInfo = data.subarray(infoStart, infoEnd);
    // Outer announce/url-list/httpseeds/nodes/source fields are deliberately omitted. Only info contributes to the infohash.
    return {
      hash: createHash("sha1").update(rawInfo).digest("hex"),
      size,
      data: Buffer.concat([Buffer.from("d4:info"), rawInfo, Buffer.from("e")]),
    };
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(
      422,
      "INVALID_TORRENT",
      e instanceof Error ? e.message : "Invalid torrent file",
    );
  }
}
