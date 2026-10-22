import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../../ui/Icon";
import { getEnv, t, tf, track } from "../lib/env.ts";
import type { Manifest } from "../types.ts";
import { DIcon } from "./icons.tsx";

type SourceKey = "official" | "community";

interface WizardAddon {
  transportUrl: string;
  manifest: Manifest;
  source: SourceKey;
  votes: number;
}

interface Issue {
  title: string;
  body?: string;
  reactions?: Record<string, number>;
  labels?: { name: string }[];
}

/** The answer of POST /stremio/addon-url/batch-add. */
export interface BatchResult {
  added: number;
  skipped: number;
  limitReached?: boolean;
}

const OFFICIAL_API = 'https://api.strem.io/addonscollection.json';
const COMMUNITY_API = 'https://stremio-addons.net/api/addon_catalog/all/stremio-addons.net.json';
const GITHUB_ISSUES_API = 'https://api.github.com/repos/Stremio-Community/stremio-addons-list/issues';

const SOURCES: Record<SourceKey, { label: string; descKey: string; api: string }> = {
  official: { label: 'Official Stremio', descKey: 'discover.officialDesc', api: OFFICIAL_API },
  community: { label: 'Community', descKey: 'discover.communityDesc', api: COMMUNITY_API },
};

function typeLabel(type: string) {
  const key = 'discover.type.' + type;
  const label = t(key);
  return label !== key ? label : type;
}

async function fetchAddonCatalog(sourceKey: SourceKey): Promise<WizardAddon[]> {
  const src = SOURCES[sourceKey];
  const res = await fetch(src.api);
  if (!res.ok) throw new Error(`Failed to fetch ${src.label}`);
  const data = await res.json();
  let addons: { transportUrl?: string; manifest?: Manifest }[];
  if (Array.isArray(data)) {
    addons = data;
  } else if (data.addons) {
    addons = data.addons;
  } else {
    throw new Error(`Unexpected format from ${src.label}`);
  }
  return addons
    .filter(a => a.transportUrl && a.manifest)
    .map(a => ({
      transportUrl: a.transportUrl!,
      manifest: a.manifest!,
      source: sourceKey,
      votes: 0,
    }));
}

// Fetch community votes from GitHub Issues (sorted by thumbs-up).
// Each issue body starts with "### Addon Manifest URL\n\n<url>".
// Returns { byName: Map<normalizedName, {votes, url}>, byUrl: Map<manifestUrl, votes> }
function normalizeName(name: string | undefined) {
  return (name || '').toLowerCase().replace(/\s*\|.*$/, '').trim();
}

async function fetchPopularityData() {
  const byName = new Map<string, { votes: number; url: string; title: string; labels: string[] }>();
  const byUrl = new Map<string, number>();
  try {
    const pages = await Promise.allSettled([1, 2, 3].map(page =>
      fetch(`${GITHUB_ISSUES_API}?sort=reactions-%2B1&direction=desc&per_page=100&page=${page}&state=open`)
        .then(r => r.ok ? r.json() : []) as Promise<Issue[]>
    ));
    for (const p of pages) {
      if (p.status !== 'fulfilled') continue;
      for (const issue of p.value) {
        const ups = issue.reactions?.['+1'] || 0;
        if (ups === 0) continue;
        const match = issue.body?.match(/### Addon Manifest URL\s+(\S+)/);
        if (!match) continue;
        const url = match[1].replace(/[?#].*$/, '').trim();
        const name = normalizeName(issue.title);
        byUrl.set(url, ups);
        // Keep highest vote count per normalized name
        if (!byName.has(name) || byName.get(name)!.votes < ups) {
          byName.set(name, { votes: ups, url, title: issue.title, labels: issue.labels?.map(l => l.name) || [] });
        }
      }
    }
  } catch {
    // Non-critical — fallback to catalog order
  }
  return { byName, byUrl };
}

function hasStreams(addon: { manifest: Manifest }) {
  const resources = addon.manifest.resources || [];
  return resources.some(r =>
    (typeof r === 'string' && r === 'stream') ||
    (r && typeof r === 'object' && r.name === 'stream')
  );
}

const TORRENT_KEYWORDS = /torrent|debrid|real.?debrid|premiumize|all.?debrid|easydebrid|offcloud|put\.io|magnet|p2p|jackettio|mediafusion|comet|stremio.?jackett|annatar|orion/i;

function isTorrentAddon(addon: WizardAddon) {
  const m = addon.manifest;
  const text = `${m.id || ''} ${m.name || ''} ${m.description || ''}`;
  return TORRENT_KEYWORDS.test(text);
}

function isAdult(addon: WizardAddon) {
  return addon.manifest.behaviorHints?.adult === true;
}

// Normalize manifest ID: strip random instance suffixes (e.g. "stremio.comet.fast.twaD" → "stremio.comet.fast")
function normalizeId(id: string | undefined) {
  // Strip trailing dot + 3-5 char random suffix (e.g. ".twaD", ".VUwl", ".aKyc", ".iofD")
  return (id || '').replace(/\.[A-Za-z0-9]{3,5}$/, '');
}

function dedup(addons: WizardAddon[]) {
  const seenById = new Map<string, WizardAddon>();
  const seenByName = new Map<string, WizardAddon>();
  const result: WizardAddon[] = [];
  for (const a of addons) {
    const id = a.manifest.id;
    if (!id) continue;
    const normId = normalizeId(id);
    const name = normalizeName(a.manifest.name);

    // Check both normalized ID and normalized name to catch duplicates
    const existingById = seenById.get(normId);
    const existingByName = name ? seenByName.get(name) : null;
    const existing = existingById || existingByName;

    if (!existing) {
      seenById.set(normId, a);
      if (name) seenByName.set(name, a);
      result.push(a);
    } else {
      // Replace if this one is from official source or has more votes
      const dominated = (a.source === 'official' && existing.source !== 'official')
        || ((a.votes || 0) > (existing.votes || 0));
      if (dominated) {
        const idx = result.indexOf(existing);
        if (idx !== -1) result[idx] = a;
        seenById.set(normId, a);
        if (name) seenByName.set(name, a);
      }
    }
  }
  return result;
}

/**
 * Picks stream addons from the Stremio catalogues and installs them in one
 * go: step 1 chooses where to look, step 2 the addons.
 */
export function AddonWizard({
  onComplete,
  onSkip,
}: {
  onComplete: (urls: string[], result: BatchResult) => void;
  onSkip: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(1);
  const [sources, setSources] = useState<Record<SourceKey, boolean>>({ official: false, community: false });
  const [addons, setAddons] = useState<WizardAddon[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showAdult, setShowAdult] = useState(false);
  const [torrentOnly, setTorrentOnly] = useState(true);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    track("discover-wizard-opened");
  }, []);

  const anySources = sources.official || sources.community;
  const allSources = sources.official && sources.community;

  // Step 2: fetch addons + popularity in parallel
  const goToStep2 = useCallback(async () => {
    setStep(2);
    setLoading(true);
    setError(null);
    setAddons([]);
    setSelected(new Set());
    setSearch("");

    const keys = (Object.keys(SOURCES) as SourceKey[]).filter((k) => sources[k]);
    const [catalogResults, popularity] = await Promise.all([
      Promise.allSettled(keys.map((k) => fetchAddonCatalog(k))),
      fetchPopularityData(),
    ]);

    const merged: WizardAddon[] = [];
    const errors: string[] = [];
    catalogResults.forEach((r, i) => {
      if (r.status === "fulfilled") merged.push(...r.value);
      else errors.push(`${SOURCES[keys[i]].label}: ${(r.reason as Error).message}`);
    });

    const unique = dedup(merged).filter(hasStreams);

    // Attach vote counts — match by URL first, then by normalized name
    const matchedNames = new Set<string>();
    for (const a of unique) {
      a.votes = popularity.byUrl.get(a.transportUrl) || 0;
      if (a.votes === 0) {
        const base = a.transportUrl.replace(/\/manifest\.json$/, "");
        for (const [url, v] of popularity.byUrl) {
          if (url.replace(/\/manifest\.json$/, "") === base) {
            a.votes = v;
            break;
          }
        }
      }
      if (a.votes === 0) {
        const name = normalizeName(a.manifest.name);
        const entry = popularity.byName.get(name);
        if (entry) {
          a.votes = entry.votes;
          matchedNames.add(name);
        }
      } else {
        matchedNames.add(normalizeName(a.manifest.name));
      }
    }

    // Inject popular addons missing from catalogs (e.g. Torrentio —
    // configurable, not in catalogs)
    const existingIds = new Set(unique.map((a) => a.manifest.id));
    for (const [name, entry] of popularity.byName) {
      if (matchedNames.has(name)) continue;
      if (entry.votes < 10) continue; // only inject actually popular ones
      const isTorrentLabel = entry.labels.some((l) => ["torrents", "debrid support"].includes(l));
      if (!isTorrentLabel && !TORRENT_KEYWORDS.test(entry.title + " " + entry.labels.join(" "))) continue;
      try {
        const manifestUrl = entry.url.endsWith("/manifest.json") ? entry.url : entry.url + "/manifest.json";
        const res = await fetch(manifestUrl);
        if (!res.ok) continue;
        const manifest = (await res.json()) as Manifest;
        if (!manifest.id || existingIds.has(manifest.id)) continue;
        if (!hasStreams({ manifest })) continue;
        existingIds.add(manifest.id);
        unique.push({ transportUrl: manifestUrl, manifest, source: "community", votes: entry.votes });
      } catch {
        // Skip unavailable addons
      }
    }

    // Sort: torrent first, then by votes desc
    unique.sort((a, b) => {
      const at = isTorrentAddon(a) ? 0 : 1;
      const bt = isTorrentAddon(b) ? 0 : 1;
      if (at !== bt) return at - bt;
      return b.votes - a.votes;
    });
    setAddons(unique);
    setLoading(false);
    if (errors.length > 0) setError(errors.join("; "));
  }, [sources]);

  const filteredAddons = useMemo(() => {
    let list = addons;
    if (torrentOnly) list = list.filter(isTorrentAddon);
    if (!showAdult) list = list.filter((a) => !isAdult(a));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (a) => (a.manifest.name || "").toLowerCase().includes(q) || (a.manifest.description || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [addons, torrentOnly, showAdult, search]);

  const toggleAddon = useCallback((url: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }, []);

  const handleAdultToggle = useCallback(() => {
    if (!showAdult) {
      if (window.confirm(t("discover.confirm18"))) setShowAdult(true);
    } else {
      setShowAdult(false);
      // Remove any selected adult addons
      setSelected((prev) => {
        const next = new Set(prev);
        for (const a of addons) if (isAdult(a)) next.delete(a.transportUrl);
        return next;
      });
    }
  }, [showAdult, addons]);

  const install = useCallback(async () => {
    const urls = [...selected];
    if (urls.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/stremio/addon-url/batch-add", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-TOKEN": getEnv().csrf },
        body: JSON.stringify({ urls }),
      });
      if (!res.ok) throw new Error(t("discover.failedToSaveAddons"));
      const data = (await res.json()) as BatchResult;
      track("discover-wizard-installed", { count: urls.length });
      onComplete(urls, data);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }, [selected, onComplete]);

  const adultCount = useMemo(() => addons.filter((a) => isAdult(a)).length, [addons]);

  return (
    <dialog
      ref={dialogRef}
      className="dialog glass d-wizard"
      aria-label={t("discover.setupAddons")}
      // Escape skips, like the close button; the backdrop does nothing,
      // so a stray click never loses a selection.
      onCancel={(event) => {
        event.preventDefault();
        onSkip();
      }}
    >
      <header className="dialog-head">
        {step === 1 ? (
          <div>
            <h2>{t("discover.setupAddons")}</h2>
            <p className="dialog-sub">{t("discover.chooseAddonSources")}</p>
          </div>
        ) : (
          <button type="button" className="button quiet small d-back" onClick={() => setStep(1)}>
            <DIcon name="chevronLeft" size={18} />
            {t("discover.sources")}
          </button>
        )}
        <button type="button" className="icon-button" aria-label={t("discover.cancel")} onClick={onSkip}>
          <Icon name="close" />
        </button>
      </header>
      <div className="dialog-body">
        {step === 1 ? (
          <>
            <label className="check">
              <input
                type="checkbox"
                checked={allSources}
                onChange={() => setSources({ official: !allSources, community: !allSources })}
              />
              {t("discover.selectAll")}
            </label>
            <div className="d-wizard-sources">
              {(Object.keys(SOURCES) as SourceKey[]).map((key) => (
                <label key={key} className={sources[key] ? "d-wizard-source on" : "d-wizard-source"}>
                  <input
                    type="checkbox"
                    checked={sources[key]}
                    onChange={() => setSources((prev) => ({ ...prev, [key]: !prev[key] }))}
                  />
                  <span>
                    <strong>{SOURCES[key].label}</strong>
                    <span className="fine">{t(SOURCES[key].descKey)}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="dialog-actions">
              <button type="button" className="button primary" disabled={!anySources} onClick={() => void goToStep2()}>
                {t("discover.next")}
                <Icon name="arrow" size={16} />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="d-wizard-search">
              <Icon name="search" size={18} />
              <input
                type="search"
                className="input"
                placeholder={t("discover.searchAddons")}
                aria-label={t("discover.searchAddons")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="d-wizard-controls">
              <label className="check">
                <input type="checkbox" checked={torrentOnly} onChange={() => setTorrentOnly((p) => !p)} />
                {t("discover.torrentOnly")}
              </label>
              {adultCount > 0 && (
                <label className="check">
                  <input type="checkbox" checked={showAdult} onChange={handleAdultToggle} />
                  {tf("discover.adult", adultCount)}
                </label>
              )}
              <span className="fine d-wizard-count">{tf("discover.selectedCount", selected.size, filteredAddons.length)}</span>
            </div>

            {error && (
              <div className="notice error" role="alert">
                <Icon name="alert" />
                <span>{error}</span>
              </div>
            )}

            {loading ? (
              <div className="d-loading" role="status">
                <span className="spinner" aria-hidden="true" />
                {t("discover.loadingAddonCatalogs")}
              </div>
            ) : (
              <ul className="d-wizard-list">
                {filteredAddons.length === 0 && <li className="fine d-center">{t("discover.noAddonsFound")}</li>}
                {filteredAddons.map((addon) => (
                  <AddonRow
                    key={addon.transportUrl}
                    addon={addon}
                    checked={selected.has(addon.transportUrl)}
                    onToggle={() => toggleAddon(addon.transportUrl)}
                  />
                ))}
              </ul>
            )}

            <div className="dialog-actions">
              <button
                type="button"
                className="button primary"
                disabled={selected.size === 0 || saving}
                onClick={() => void install()}
              >
                {saving && <span className="spinner" aria-hidden="true" />}
                {tf("discover.install", selected.size)}
              </button>
            </div>
          </>
        )}
        <p className="fine d-disclaimer">{t("discover.addonDisclaimer")}</p>
      </div>
    </dialog>
  );
}

function AddonRow({ addon, checked, onToggle }: { addon: WizardAddon; checked: boolean; onToggle: () => void }) {
  const [imgError, setImgError] = useState(false);
  const m = addon.manifest;
  const types = (m.types || []).slice(0, 4);
  const sourceLabel = addon.source === "official" ? t("discover.official") : t("discover.community");

  return (
    <li>
      <label className={checked ? "d-wizard-addon on" : "d-wizard-addon"}>
        <input type="checkbox" checked={checked} onChange={onToggle} />
        {m.logo && !imgError ? (
          <img src={m.logo} alt="" className="d-wizard-logo" onError={() => setImgError(true)} />
        ) : (
          <span className="d-wizard-logo">{(m.name || "?")[0]}</span>
        )}
        <span className="d-wizard-text">
          <span className="d-wizard-name">
            <strong>{m.name || t("discover.unknown")}</strong>
            <span className={addon.source === "official" ? "chip olive" : "chip"}>{sourceLabel}</span>
            {addon.votes > 0 && (
              <span className="fine" title={t("discover.communityVotes")}>
                <Icon name="heart" size={12} /> {addon.votes >= 1000 ? `${(addon.votes / 1000).toFixed(1)}k` : addon.votes}
              </span>
            )}
          </span>
          {m.description && <span className="d-wizard-desc">{m.description}</span>}
          {types.length > 0 && (
            <span className="d-wizard-types">
              {types.map((tp) => (
                <span key={tp}>{typeLabel(tp)}</span>
              ))}
            </span>
          )}
        </span>
      </label>
    </li>
  );
}
