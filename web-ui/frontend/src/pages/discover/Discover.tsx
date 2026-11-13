import { useMemo } from "react";
import { usePage } from "../../app/router";
import { useI18n } from "../../i18n";
import { CINEMETA_BASE } from "./lib/client.ts";
import { setEnv } from "./lib/env.ts";
import { DiscoverApp } from "./components/DiscoverApp.tsx";
import type { AddonSeed, DiscoverData } from "./types";
import "./discover.css";

export const namespaces = ["discover", "load", "job"];

// Cinemeta has no row of its own; it is browsed for everyone unless the
// user added it as an addon, and this seed tells the health chip and the
// catalog selector what it serves before its manifest arrives.
const CINEMETA_SEED: AddonSeed = {
  id: "",
  url: CINEMETA_BASE,
  name: "Cinemeta",
  resources: ["catalog", "meta"],
  types: ["movie", "series"],
  fetchedAt: null,
};

/** /discover: browse Cinemeta and the user's Stremio addons, open a title, stream it. */
export default function Discover() {
  const { data, session } = usePage<DiscoverData>();
  const { t, lang } = useI18n();

  // What the plain modules read (lib/env.ts), set before anything below
  // renders or fetches. The indexer names are refreshed by searches, so
  // they are taken from the page only once per page state.
  useMemo(
    () => setEnv({ indexers: data.indexers ?? [], streamPrefs: data.streamPrefs, aiEnabled: data.aiEnabled, passthrough: data.passthrough }),
    [data],
  );
  setEnv({ csrf: session.csrf, sessionId: session.sessionId, lang, t });

  const { seeds, urls } = useMemo(() => {
    const list = [...(data.addons ?? [])];
    const base = (u: string) => (u || "").replace(/\/manifest\.json$/, "");
    if (!list.some((a) => base(a.url) === CINEMETA_BASE)) list.unshift(CINEMETA_SEED);
    return { seeds: list, urls: list.map((a) => base(a.url)).filter(Boolean) };
  }, [data.addons]);

  // Indexers count as a configured source: an indexer-only user has
  // somewhere for streams to come from, and must not be shown the
  // "install addons first" prompt.
  const hasCustomAddons = (data.addons ?? []).length > 0 || (data.indexers ?? []).length > 0;

  return (
    <div className="discover">
      <header className="wrap discover-head">
        <h1>{t("discover.title")}</h1>
        <p className="lede">{t("discover.subtitle")}</p>
      </header>
      {/* the catalogue is a long page: it sits on paper, over the glass */}
      <div className="d-sheet">
        <div className="wrap">
          <DiscoverApp addonUrls={urls} addonSeeds={seeds} hasCustomAddons={hasCustomAddons} />
        </div>
      </div>
    </div>
  );
}
