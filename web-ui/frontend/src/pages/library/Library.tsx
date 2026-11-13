import { useEffect, useMemo, useState } from "react";
import { formData } from "../../app/api";
import { Link, useNavigation, usePage } from "../../app/router";
import { useI18n } from "../../i18n";
import { Icon } from "../../ui/Icon";
import { fileSize, timeAgo } from "../../ui/format";
import { BulkBar, BulkBox, useBulk, type Bulk } from "../account/Bulk";
import { Empty, PageError } from "../account/Empty";
import "../account/account.css";
import { RateDialog } from "./RateDialog";
import type { LibraryData, LibraryTorrent, LibraryVideo, Rate, Section } from "./types";
import "./library.css";

export const namespaces = ["library", "bulk", "resource"];

const SECTIONS: { section: Section; url: string }[] = [
  { section: "torrents", url: "/lib/" },
  { section: "movies", url: "/lib/movies" },
  { section: "series", url: "/lib/series" },
];

// what ?rate-form= asked for; taken off the address once the dialog is up
const RATE_PARAMS = ["rate-form", "rate-video-id", "rate-type", "rate-current"];

function Toolbar({ bulk }: { bulk: Bulk }) {
  const { t, path } = useI18n();
  const { data } = usePage<LibraryData>();
  const { navigate } = useNavigation();
  const hasItems = data.torrents.length + data.videos.length > 0;
  const go = (sort: number, watched: string) => {
    const q = new URLSearchParams({ sort: String(sort) });
    if (watched) q.set("watched", watched);
    void navigate(`${location.pathname}?${q}`, { scroll: false });
  };
  return (
    <div className="toolbar glass">
      <nav className="tabs" aria-label={t("library.title")}>
        {SECTIONS.map(({ section, url }) => (
          <Link
            key={section}
            className="tab"
            href={path(url)}
            scroll={false}
            aria-current={section === data.section ? "page" : undefined}
          >
            <span className="tab-label">{t(`library.${section}`)}</span>
            <span className="tab-count">{data.counts[section]}</span>
          </Link>
        ))}
      </nav>
      <div className="toolbar-end">
        {/* the selection's buttons take the filter's and the sort's place */}
        {!bulk.on && (
          <>
            {data.section !== "torrents" && (
              <select
                className="select"
                aria-label={t("library.filterLabel")}
                value={data.watched}
                onChange={(event) => go(data.sort, event.target.value)}
              >
                <option value="">{t("library.filterAll")}</option>
                <option value="unwatched">{t("library.filterUnwatched")}</option>
                <option value="watched">{t("library.filterWatched")}</option>
              </select>
            )}
            <select
              className="select"
              aria-label={t("library.sortLabel")}
              value={data.sort}
              onChange={(event) => go(Number(event.target.value), data.watched)}
            >
              {data.sorts.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.title)}
                </option>
              ))}
            </select>
          </>
        )}
        {hasItems && <BulkBar bulk={bulk} endpoint="/lib/remove" confirm={t("library.bulkRemoveConfirm")} />}
      </div>
    </div>
  );
}

function TorrentRow({ item, bulk }: { item: LibraryTorrent; bulk: Bulk }) {
  const { t, path, lang } = useI18n();
  const text = (
    <span className="row-text">
      <span className="row-title">{item.name}</span>
      <span className="row-meta">
        <span className="mono">{fileSize(item.size, lang)}</span>
        {item.files > 0 && (
          <span>
            {item.files} {t("library.files")}
          </span>
        )}
        <span>{timeAgo(item.addedAt, lang)}</span>
      </span>
    </span>
  );
  if (bulk.on) {
    return (
      <label className="row">
        <BulkBox bulk={bulk} id={item.resourceId} label={item.name} />
        {text}
      </label>
    );
  }
  return (
    <div className="row">
      <Link className="row-link" href={path(`/${item.resourceId}`)}>
        <span className="row-icon" aria-hidden="true">
          <Icon name="folder" size={20} />
        </span>
        {text}
        <Icon name="chevronRight" size={18} className="muted" />
      </Link>
    </div>
  );
}

function VideoRow({ item, bulk, onRate }: { item: LibraryVideo; bulk: Bulk; onRate: (rate: Rate, title: string) => void }) {
  const { t, path } = useI18n();
  const { submit, busy } = useNavigation();
  const label = item.year ? `${item.title} (${item.year})` : item.title;
  const body = (
    <>
      <span className="thumb" aria-hidden="true">
        <Icon name="film" size={18} />
        {item.poster && (
          <img src={item.poster} alt="" loading="lazy" onError={(event) => event.currentTarget.remove()} />
        )}
      </span>
      <span className="row-text">
        <span className="row-title">{item.title}</span>
        <span className="row-meta">
          {item.year ? <span>{item.year}</span> : null}
          {item.rating ? (
            <span className="score">
              <Icon name="star" size={13} />
              {item.rating.toFixed(1)}
            </span>
          ) : null}
          {item.adultBadge && <span className="chip">18+</span>}
          {item.watched && (
            <span className="seen">
              <Icon name="check" size={13} />
              {t("library.watched")}
            </span>
          )}
        </span>
      </span>
    </>
  );
  if (bulk.on) {
    return (
      <label className="row">
        <BulkBox bulk={bulk} id={item.resourceId} label={label} />
        {body}
      </label>
    );
  }
  const status = item.videoId && `/library/${item.type}/${item.videoId}`;
  return (
    <div className="row">
      <Link className="row-link" href={path(`/${item.resourceId}`)} aria-label={label}>
        {body}
      </Link>
      {status && (
        <span className="row-end">
          {item.userRating ? (
            <button
              type="button"
              className="button small quiet my-rating"
              title={t("library.changeRating")}
              onClick={() => onRate({ videoId: item.videoId!, type: item.type, current: item.userRating! }, item.title)}
            >
              <Icon name="star" size={16} />
              <span className="mono">{item.userRating}</span>
            </button>
          ) : (
            <button
              type="button"
              className="icon-button"
              title={t("library.rate")}
              aria-label={t("library.rate")}
              onClick={() => onRate({ videoId: item.videoId!, type: item.type, current: 0 }, item.title)}
            >
              <Icon name="star" size={18} />
            </button>
          )}
          <button
            type="button"
            className={item.watched ? "icon-button watched on" : "icon-button watched"}
            aria-pressed={item.watched}
            title={t(item.watched ? "library.unmarkWatched" : "library.markWatched")}
            aria-label={t(item.watched ? "library.unmarkWatched" : "library.markWatched")}
            disabled={busy}
            onClick={() =>
              void submit(path(`${status}/${item.watched ? "unmark" : "mark"}`), formData({}), { scroll: false })
            }
          >
            <Icon name={item.watched ? "check" : "eye"} size={18} />
          </button>
        </span>
      )}
    </div>
  );
}

export default function Library() {
  const { t, path } = useI18n();
  const { data, error } = usePage<LibraryData>();
  const ids = useMemo(
    () => (data.section === "torrents" ? data.torrents : data.videos).map((item) => item.resourceId),
    [data],
  );
  const bulk = useBulk(ids);
  const [rating, setRating] = useState<{ rate: Rate; title?: string } | null>(null);

  // the page came back asking for a rating: after "watched", or ?rate-form=true
  useEffect(() => {
    if (!data.rate) return;
    const title = data.videos.find((video) => video.videoId === data.rate!.videoId)?.title;
    setRating({ rate: data.rate, title });
    const url = new URL(location.href);
    for (const name of RATE_PARAMS) url.searchParams.delete(name);
    history.replaceState(history.state, "", url);
  }, [data]);

  const empty = ids.length === 0;
  return (
    <div className="wrap account-page library-page">
      <header className="page-head">
        <div>
          <h1>{t("library.title")}</h1>
          <p className="lede">{t("library.subtitle")}</p>
        </div>
      </header>
      <Toolbar bulk={bulk} />
      {error && <PageError text={t(error.key)} />}
      {empty ? (
        <section className="glass">
          <Empty icon="library" title={t("library.noTorrents")}>
            <p>{t("library.noTorrentsHint")}</p>
            <div className="empty-actions">
              <Link className="button accent" href={path("/")}>
                {t("library.browseTorrents")}
              </Link>
              <a
                className="button"
                href={`${path("/profile")}#stremio`}
                data-umami-event="library-empty-connect-stremio"
              >
                <Icon name="tv" size={18} />
                {t("library.watchOnTv")}
              </a>
            </div>
            <p className="fine">{t("library.watchOnTvHint")}</p>
          </Empty>
        </section>
      ) : (
        <ul className={bulk.on ? "rows glass selecting" : "rows glass"}>
          {data.section === "torrents"
            ? data.torrents.map((item) => (
                <li key={item.resourceId}>
                  <TorrentRow item={item} bulk={bulk} />
                </li>
              ))
            : data.videos.map((item) => (
                <li key={`${item.resourceId}/${item.videoId ?? ""}`}>
                  <VideoRow item={item} bulk={bulk} onRate={(rate, title) => setRating({ rate, title })} />
                </li>
              ))}
        </ul>
      )}
      <RateDialog rate={rating?.rate ?? null} title={rating?.title} onClose={() => setRating(null)} />
    </div>
  );
}
