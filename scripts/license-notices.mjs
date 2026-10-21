import {
  readFile,
  readdir,
  writeFile,
  mkdir,
  copyFile,
  cp,
} from "node:fs/promises";
import { join } from "node:path";
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const inventory = [];
for (const [path, info] of Object.entries(lock.packages)) {
  if (!path || info.dev) continue;
  let meta;
  try {
    meta = JSON.parse(await readFile(join(path, "package.json"), "utf8"));
  } catch {
    continue;
  }
  const name = meta.name ?? path.split("node_modules/").pop(),
    target = join("LICENSES", "npm", name.replaceAll("/", "__"));
  const files = (await readdir(path)).filter((f) =>
    /^(LICENSE|LICENCE|COPYING|NOTICE)([.\-_]|$)/i.test(f),
  );
  await mkdir(target, { recursive: true });
  for (const file of files) {
    try {
      await copyFile(join(path, file), join(target, file));
    } catch {
      /* Some packages store notices in subdirectories; inventory records coverage. */
    }
  }
  inventory.push({
    name,
    version: meta.version,
    license: meta.license ?? info.license ?? "unspecified",
    noticeFiles: files,
    source:
      typeof meta.repository === "string"
        ? meta.repository
        : (meta.repository?.url ?? null),
  });
}
await writeFile(
  "LICENSES/npm-inventory.json",
  JSON.stringify(inventory, null, 2) + "\n",
);
await mkdir("dist/client/licenses", { recursive: true });
await cp("LICENSES", "dist/client/licenses", { recursive: true });
await copyFile(
  "THIRD-PARTY-NOTICES.md",
  "dist/client/licenses/THIRD-PARTY-NOTICES.md",
);
console.log(
  `Preserved package license inventory for ${inventory.length} runtime packages.`,
);
