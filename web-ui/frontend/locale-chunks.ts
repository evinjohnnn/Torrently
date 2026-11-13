import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

const INDEX = "virtual:locales";
const PREFIX = "virtual:locale/";

type Messages = Record<string, unknown>;

/**
 * The chunk a key lives in: the part before the first dot, except a tool
 * page's long copy (tool.<page>.about.*), which gets one chunk per page so
 * the footer's tool names do not pull in every landing page's text.
 * Mirrored by nsOf in src/i18n.
 */
export function nsOf(key: string) {
  const parts = key.split(".");
  if (parts[0] === "tool" && parts[2] === "about") return parts.slice(0, 3).join(".");
  return parts[0];
}

/**
 * Splits locales/<lang>.json into one lazy chunk per key namespace (the part
 * before the first dot), so a page downloads the strings it shows in the
 * language it shows them, not 240 KB of every page in every language.
 * Translator notes (keys starting with "@") are left out.
 *
 *   import { loaders, languages } from "virtual:locales";
 *   await loaders["de"]["home"]();   // { "home.title": "…", … }
 */
export function localeChunks(dir: string): Plugin {
  const cache = new Map<string, Messages>();
  const read = (lang: string) => {
    let messages = cache.get(lang);
    if (!messages) {
      messages = JSON.parse(readFileSync(join(dir, `${lang}.json`), "utf8"));
      cache.set(lang, messages!);
    }
    return messages!;
  };
  // EN first, the others alphabetical: mirrors services/i18n discoverLocales()
  const languages = () => {
    const codes = readdirSync(dir)
      .filter((file) => /^[a-z]{2}\.json$/.test(file))
      .map((file) => file.slice(0, 2))
      .sort();
    return ["en", ...codes.filter((code) => code !== "en")];
  };
  const namespaces = (lang: string) =>
    [...new Set(Object.keys(read(lang)).filter((key) => !key.startsWith("@")).map(nsOf))].sort();

  return {
    name: "torrently-locale-chunks",
    resolveId(id) {
      if (id === INDEX || id.startsWith(PREFIX)) return "\0" + id;
    },
    load(id) {
      if (!id.startsWith("\0")) return;
      const real = id.slice(1);
      if (real === INDEX) {
        const langs = languages();
        for (const lang of langs) this.addWatchFile(join(dir, `${lang}.json`));
        const entries = langs.map((lang) => {
          const items = namespaces(lang).map(
            (ns) => `${JSON.stringify(ns)}: () => import(${JSON.stringify(`${PREFIX}${lang}/${ns}`)}).then((m) => m.default)`,
          );
          return `${JSON.stringify(lang)}: {${items.join(",")}}`;
        });
        return `export const languages = ${JSON.stringify(langs)};\nexport const loaders = {${entries.join(",\n")}};`;
      }
      if (real.startsWith(PREFIX)) {
        const [lang, ns] = real.slice(PREFIX.length).split("/");
        const out: Messages = {};
        for (const [key, value] of Object.entries(read(lang))) {
          if (nsOf(key) === ns) out[key] = value;
        }
        return `export default ${JSON.stringify(out)};`;
      }
    },
  };
}
