import { opendir, lstat, statfs } from "node:fs/promises";
import { join } from "node:path";
import type { Config } from "./config.js";
import { AppError } from "./errors.js";
const cached = new Map<string, { at: number; bytes: number | null }>();
export async function storageSnapshot(
  config: Pick<Config, "DATA_DIR" | "CACHE_DIR">,
) {
  const path = config.CACHE_DIR || config.DATA_DIR;
  let disk;
  try {
    disk = await statfs(path);
  } catch {
    throw new AppError(
      503,
      "STORAGE_UNAVAILABLE",
      "The configured storage path is not accessible.",
    );
  }
  let cacheBytes: number | null = null;
  if (config.CACHE_DIR) {
    const old = cached.get(path);
    if (old && Date.now() - old.at < 60000) cacheBytes = old.bytes;
    else {
      let bytes = 0,
        entries = 0;
      const pending = [path];
      try {
        while (pending.length) {
          const dir = await opendir(pending.pop()!);
          for await (const entry of dir) {
            if (++entries > 100000) throw new Error("Cache scan limit");
            const p = join(dir.path, entry.name);
            if (entry.isSymbolicLink()) continue;
            if (entry.isDirectory()) pending.push(p);
            else if (entry.isFile()) {
              const st = await lstat(p);
              bytes += st.blocks * 512;
            }
          }
        }
        cacheBytes = bytes;
      } catch {
        cacheBytes = null;
      }
      cached.set(path, { at: Date.now(), bytes: cacheBytes });
    }
  }
  return {
    total: disk.blocks * disk.bsize,
    free: disk.bavail * disk.bsize,
    cacheBytes,
  };
}
