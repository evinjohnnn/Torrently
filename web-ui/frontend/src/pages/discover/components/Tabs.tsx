import { useMemo, type ChangeEvent, type ReactNode } from "react";
import { t, tf } from "../lib/env.ts";
import type { Catalog, Item } from "../types.ts";
import { getSearchResultsForType } from "./discoverReducer.ts";

export function typeLabel(type: string) {
  const key = `discover.type.${type.toLowerCase()}`;
  const translated = t(key);
  if (translated !== key) return translated;
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/** A row of choices of which one is on (type, search type, season). */
export function Segmented<K extends string | number>({
  options,
  value,
  onSelect,
  label,
  small,
}: {
  options: { key: K; label: ReactNode; disabled?: boolean }[];
  value: K | null;
  onSelect: (key: K) => void;
  label?: string;
  small?: boolean;
}) {
  return (
    <div className={small ? "seg small" : "seg"} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.key)}
          type="button"
          className={o.key === value ? "seg-item on" : "seg-item"}
          aria-pressed={o.key === value}
          disabled={o.disabled}
          onClick={() => onSelect(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TypeTabs({
  types,
  selectedType,
  onSelect,
}: {
  types: string[];
  selectedType: string | null;
  onSelect: (type: string) => void;
}) {
  if (!types.length) return null;
  return (
    <Segmented
      options={types.map((type) => ({ key: type, label: typeLabel(type) }))}
      value={selectedType}
      onSelect={onSelect}
    />
  );
}

export function SearchTabs({
  searchResults,
  searchTypes,
  searchType,
  onSelect,
}: {
  searchResults: Item[];
  searchTypes: string[];
  searchType: string;
  onSelect: (type: string) => void;
}) {
  const tabs = useMemo(
    () => [
      { key: "all", label: t("discover.allTab"), count: searchResults.length },
      ...searchTypes.map((st) => ({
        key: st,
        label: typeLabel(st),
        count: getSearchResultsForType(searchResults, st).length,
      })),
    ],
    [searchResults, searchTypes],
  );

  return (
    <Segmented
      options={tabs.map((tab) => ({
        key: tab.key,
        label: (
          <>
            {tab.label} <span className="seg-count">{tab.count}</span>
          </>
        ),
      }))}
      value={searchType}
      onSelect={onSelect}
    />
  );
}

export function CatalogSelector({
  catalogs,
  selectedCatalog,
  onSelect,
}: {
  catalogs: Catalog[];
  selectedCatalog: Catalog | null;
  onSelect: (catalog: Catalog) => void;
}) {
  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const parts = event.target.value.split("::");
    const match = catalogs.find((c) => c.baseUrl === parts[0] && c.id === parts[1] && !c.disabled);
    if (match) onSelect(match);
  };

  // Group by addon so disabled (unreachable) addons can be visually
  // separated from live ones. One <optgroup> per addon when there's more
  // than one addon represented; a single addon keeps the flat list.
  const groups = useMemo(() => {
    const m = new Map<string, { addonName: string; baseUrl: string; disabled: boolean; items: Catalog[] }>();
    for (const cat of catalogs) {
      const k = cat.baseUrl;
      if (!m.has(k)) m.set(k, { addonName: cat.addonName, baseUrl: cat.baseUrl, disabled: !!cat.disabled, items: [] });
      m.get(k)!.items.push(cat);
    }
    return [...m.values()];
  }, [catalogs]);

  // Nothing to choose when there's a single catalog. The guard counts even
  // disabled options so the selector still renders when an addon is down —
  // the user needs to see why their catalogs are greyed out.
  if (catalogs.length <= 1) return null;

  const useGroups = groups.length > 1;
  const value = selectedCatalog ? `${selectedCatalog.baseUrl}::${selectedCatalog.id}` : "";

  return (
    <select className="select d-select" onChange={handleChange} value={value} aria-label={t("discover.modeCatalog")}>
      {useGroups
        ? groups.map((g) => (
            <optgroup key={g.baseUrl} label={g.disabled ? tf("discover.addonGroupUnavailable", g.addonName) : g.addonName}>
              {g.items.map((cat) => (
                <option key={`${cat.baseUrl}::${cat.id}`} value={`${cat.baseUrl}::${cat.id}`} disabled={cat.disabled}>
                  {cat.disabled ? `⚠ ${cat.name}` : cat.name}
                </option>
              ))}
            </optgroup>
          ))
        : catalogs.map((cat) => (
            <option key={`${cat.baseUrl}::${cat.id}`} value={`${cat.baseUrl}::${cat.id}`} disabled={cat.disabled}>
              {cat.disabled ? `⚠ ${cat.name} (${cat.addonName})` : `${cat.name} (${cat.addonName})`}
            </option>
          ))}
    </select>
  );
}
