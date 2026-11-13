import { useEffect, useState } from "react";
import { Link, usePage } from "../../app/router";
import { ActionRun } from "../../jobs/ActionRun";
import { useAction } from "../../jobs/useAction";
import { useI18n } from "../../i18n";
import { Dialog } from "../../ui/Dialog";
import { Icon, type IconName } from "../../ui/Icon";
import { fileSize } from "../../ui/format";
import type { Entry, TorrentData } from "./types";
import { WatchedToggle } from "./WatchedToggle";

const MEDIA_ICON: Record<string, IconName> = {
  video: "film",
  audio: "music",
  image: "image",
  subtitle: "subtitles",
};

function entryIcon(entry: Entry): IconName {
  if (entry.type === "directory") return "folder";
  return MEDIA_ICON[entry.mediaFormat ?? ""] ?? "file";
}

/** The torrent's files, folder by folder, with the folder as an archive. */
export function FileBrowser() {
  const { t, lang, path } = useI18n();
  const { data } = usePage<TorrentData>();
  const list = data.list!;
  const archive = useAction();
  const [format, setFormat] = useState<"tar" | "zip" | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelecting(false);
    setPicked(new Set());
  }, [list.path]);

  const base = path(`/${data.id}`);
  const url = (params: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    for (const [name, value] of Object.entries(params)) if (value !== undefined && value !== "") q.set(name, String(value));
    const query = q.toString();
    return query ? `${base}?${query}` : base;
  };
  const current = data.file?.path;
  const pickedSize = list.items.filter((entry) => picked.has(entry.path)).reduce((sum, entry) => sum + entry.size, 0);

  const download = (kind: "tar" | "zip") => {
    setFormat(kind);
    void archive.start(list.archive.endpoint, {
      "resource-id": data.id,
      "item-id": list.archive.itemId,
      "archive-format": kind,
      paths: selecting && picked.size ? [...picked] : undefined,
    });
  };
  const toggle = (entry: Entry) => {
    const next = new Set(picked);
    if (next.has(entry.path)) next.delete(entry.path);
    else next.add(entry.path);
    setPicked(next);
  };

  return (
    <section className="file-browser glass" aria-label={t("resource.content")}>
      <header className="browser-head">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link href={url({ file: current })} scroll={false} className="crumb">
            <Icon name="folder" size={17} />
            <span className="visually-hidden">/</span>
          </Link>
          {list.breadcrumbs.map((crumb, index) =>
            index === list.breadcrumbs.length - 1 ? (
              <span key={crumb.path} className="crumb current" aria-current="location">
                {crumb.name}
              </span>
            ) : (
              <Link key={crumb.path} href={url({ pwd: crumb.path, file: current })} scroll={false} className="crumb">
                {crumb.name}
              </Link>
            ),
          )}
        </nav>
        <div className="browser-tools">
          <button
            type="button"
            className={selecting ? "button small on" : "button small"}
            aria-pressed={selecting}
            onClick={() => {
              setSelecting(!selecting);
              setPicked(new Set());
            }}
          >
            {t(selecting ? "resource.selectCancel" : "resource.select")}
          </button>
          <div className="split" role="group" aria-label={t("resource.downloadDir")}>
            <button type="button" className="button small" onClick={() => download("tar")}>
              <Icon name="archive" size={16} />
              TAR <span className="muted mono">{fileSize(selecting && picked.size ? pickedSize : list.size, lang)}</span>
            </button>
            <button type="button" className="button small" onClick={() => download("zip")}>
              ZIP
            </button>
          </div>
        </div>
      </header>
      <ul className="entries">
        {list.items.map((entry) => {
          const isCurrent = entry.type === "file" && entry.path === current;
          const href =
            entry.type === "directory"
              ? url({ pwd: entry.path, file: current })
              : url({ pwd: list.path, file: entry.path, page: list.page > 1 ? list.page : undefined });
          return (
            <li key={entry.id} className={isCurrent ? "entry current" : "entry"}>
              {selecting && (
                <input
                  type="checkbox"
                  className="entry-pick"
                  aria-label={entry.name}
                  checked={picked.has(entry.path)}
                  onChange={() => toggle(entry)}
                />
              )}
              <Link href={href} scroll={false} className="entry-link" aria-current={isCurrent ? "true" : undefined}>
                <Icon name={entryIcon(entry)} size={19} />
                <span className="entry-name">{entry.name}</span>
              </Link>
              {entry.watched && <WatchedToggle watched={entry.watched} />}
              <span className="entry-size mono">{fileSize(entry.size, lang)}</span>
              {entry.type === "directory" && <Icon name="chevronRight" size={17} className="muted" />}
            </li>
          );
        })}
      </ul>
      {list.pages && list.pages.length > 1 && (
        <nav className="pages" aria-label="Pages">
          {list.pages.map((page, index) =>
            page.Gap ? (
              <span key={`gap-${index}`} className="page-gap">
                …
              </span>
            ) : (
              <Link
                key={`${page.Page}-${index}`}
                href={url({ pwd: list.path, file: current, page: page.Page > 1 ? page.Page : undefined })}
                scroll={false}
                className={page.Active ? "page active" : "page"}
                aria-current={page.Active ? "page" : undefined}
                aria-label={page.Prev ? "Previous" : page.Next ? "Next" : undefined}
              >
                {page.Prev ? <Icon name="arrowLeft" size={16} /> : page.Next ? <Icon name="arrow" size={16} /> : page.Page}
              </Link>
            ),
          )}
        </nav>
      )}
      <Dialog
        open={Boolean(format)}
        onClose={() => {
          setFormat(null);
          archive.clear();
        }}
        title={t("resource.preparingDownload")}
        subtitle={`${list.breadcrumbs.at(-1)?.name ?? data.name}.${format ?? ""}`}
      >
        <div ref={archive.challenge} className="challenge" />
        {archive.run?.error && (
          <div className="notice error" role="alert">
            <Icon name="alert" />
            <span>{archive.run.error}</span>
          </div>
        )}
        {archive.run?.logUrl && (
          <ActionRun
            key={archive.run.key}
            logUrl={archive.run.logUrl}
            onRetry={(endpoint, retry) => void archive.start(endpoint, retry)}
            onClose={() => {
              setFormat(null);
              archive.clear();
            }}
          />
        )}
        {!archive.run && <span className="spinner" />}
      </Dialog>
    </section>
  );
}
