import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Link, usePage } from "../../app/router";
import { GROUPS } from "../../chrome/Footer";
import { useI18n } from "../../i18n";
import { Icon, type IconName } from "../../ui/Icon";
import { PageHead, Sheet } from "../content/kit";
import "./tools.css";

export const namespaces = ["toolsPage"];

// Mirrors handlers/spa/tools.go.
interface ToolCard {
  url: string;
  title: string;
  benefit: string;
  group: string;
}

/** What each tool does, at a glance; a tool not listed gets the arrow. */
const ICONS: Record<string, IconName> = {
  "torrent-to-ddl": "download",
  "torrent-to-zip": "archive",
  "magnet-to-ddl": "link",
  "online-torrent-downloader": "globe",
  "cloud-torrent-client": "server",
  "torrent-to-stream": "wifi",
  "torrent-to-mp4": "film",
  "watch-torrents-online": "tv",
  "watch-torrents-ios": "eye",
  "stream-torrent-online": "bolt",
  "torrent-player": "play",
  "utorrent-web-alternative": "refresh",
  "web-torrent-client": "compass",
  "debrid-alternative": "shield",
  "torrent-rss-alternative": "rss",
  "magnet-to-torrent": "file",
  "torrent-to-magnet": "copy",
  "stremio-addons-online": "puzzle",
  "torrently-stremio-addon": "sparkle",
  "open-torrent-file": "folder",
  "how-to-download-torrent-files": "info",
  "open-torrents-on-pc": "settings",
};

const count = (n: number) => String(n).padStart(2, "0");

/**
 * /tools: a search-first landing, centered like a docs home — a big
 * question, one pill to answer it, a line of what it holds. "/" or
 * Ctrl/Cmd+K jumps to the search from anywhere on the page. Below, every
 * tool page grouped as in the footer: a bento of outlined cards, the first
 * tool leading in a group of four or more.
 */
export default function Tools() {
  const { t, path } = useI18n();
  const { data } = usePage<{ tools: ToolCard[] }>();
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const needle = query.trim().toLowerCase();
  const matches = (tool: ToolCard) =>
    !needle || `${t(tool.title)} ${t(tool.benefit)}`.toLowerCase().includes(needle);
  const groups = GROUPS.map((group) => ({
    group,
    tools: data.tools.filter((tool) => tool.group === group && matches(tool)),
  })).filter(({ tools }) => tools.length);

  // "/" or Ctrl/Cmd+K, from anywhere on the page, focuses the search
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      const combo = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (event.key !== "/" && !combo) return;
      event.preventDefault();
      input.current?.focus();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const onSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setQuery("");
      event.currentTarget.blur();
    }
  };
  const clear = () => {
    setQuery("");
    input.current?.focus();
  };

  const total = data.tools.length;
  const matched = groups.reduce((n, g) => n + g.tools.length, 0);
  const groupNames = groups.map((g) => t(`footer.${g.group}`)).join(", ");
  const tally = needle ? t("toolsPage.resultCount", { Count: matched, Total: total }) : t("toolsPage.count", { Count: total });

  return (
    <>
      <PageHead title={t("toolsPage.heading")} lede={t("toolsPage.lede")} wide center>
        <div className="tool-finder">
          <div className="tool-search">
            <Icon name="search" size={20} />
            <label className="visually-hidden" htmlFor="tool-search">
              {t("toolsPage.search")}
            </label>
            <input
              ref={input}
              id="tool-search"
              type="search"
              value={query}
              placeholder={t("toolsPage.search")}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onSearchKeyDown}
            />
            {query ? (
              <button type="button" className="tool-search-clear" aria-label={t("toolsPage.clear")} onClick={clear}>
                <Icon name="close" size={16} />
              </button>
            ) : (
              <kbd className="tool-kbd" aria-hidden="true">
                /
              </kbd>
            )}
          </div>
          {groups.length > 0 && <p className="tool-tally">{`${groupNames} · ${tally}`}</p>}
          {groups.length > 1 && (
            <nav className="tool-jumps" aria-label={t("footer.tools")}>
              {groups.map(({ group, tools }) => (
                <a key={group} href={`#group-${group}`}>
                  {t(`footer.${group}`)}
                  <span>{count(tools.length)}</span>
                </a>
              ))}
            </nav>
          )}
        </div>
      </PageHead>
      <Sheet wide className="tools-sheet">
        {groups.map(({ group, tools }) => {
          // A group of four or more leads with its first tool, as tall as
          // the cards beside it (two to a row; an odd one out takes both
          // cells of the last row). A smaller group is one even row.
          const featured = tools.length >= 4;
          const rest = tools.length - 1;
          const style = { "--rows": Math.ceil(rest / 2) } as CSSProperties;
          return (
            <section key={group} id={`group-${group}`} className="dl" aria-labelledby={`title-${group}`}>
              <h2 className="dl__title" id={`title-${group}`}>
                {t(`footer.${group}`)}
              </h2>
              <ul className={featured ? "dl__grid" : "dl__grid even"} style={featured ? style : undefined}>
                {tools.map((tool, index) => {
                  const lead = featured && index === 0;
                  const wide = featured && index === tools.length - 1 && rest % 2 === 1;
                  const className = lead ? "dl-card dl-card--featured" : wide ? "dl-card wide" : "dl-card";
                  return (
                    <li key={tool.url} className={className}>
                      <Link href={path(`/${tool.url}`)}>
                        <span className="dl-card__icon" aria-hidden="true">
                          <Icon name={ICONS[tool.url] ?? "arrow"} size={42} />
                        </span>
                        <span className="dl-card__text">
                          <span className="dl-card__name">{t(tool.title)}</span>
                          {lead && <span className="dl-card__sum">{t(tool.benefit)}</span>}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
        {!groups.length && (
          <p className="tool-empty" role="status">
            {t("toolsPage.empty", { Query: query.trim() })}
          </p>
        )}
      </Sheet>
    </>
  );
}
