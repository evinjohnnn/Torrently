import { formData } from "../../app/api";
import { Link, useNavigation, usePage } from "../../app/router";
import { toast } from "../../chrome/Toasts";
import { useI18n } from "../../i18n";
import { Icon } from "../../ui/Icon";
import { fileSize } from "../../ui/format";
import { FileBrowser } from "./FileBrowser";
import { FileCard } from "./FileCard";
import { TransferStatus } from "./TransferStatus";
import type { TorrentData } from "./types";
import { VaultButton } from "./VaultButton";
import "./torrent.css";

export const namespaces = ["resource", "action", "vault", "library", "ageGate", "job", "offer", "onboarding"];

function LibraryButton() {
  const { t, path } = useI18n();
  const { data, session } = usePage<TorrentData>();
  const { submit, busy } = useNavigation();
  if (!session.user) {
    return (
      <Link className="button" href={`${path("/login")}?from=library&return-url=${encodeURIComponent(location.pathname)}`}>
        <Icon name="plus" size={18} />
        {t("library.addToLibrary")}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={data.inLibrary ? "button on" : "button"}
      disabled={busy}
      onClick={() =>
        void submit(path(data.inLibrary ? "/lib/remove" : "/lib/add"), formData({ resource_id: data.id }), {
          scroll: false,
        })
      }
    >
      <Icon name={data.inLibrary ? "check" : "plus"} size={18} />
      {t(data.inLibrary ? "library.removeFromLibrary" : "library.addToLibrary")}
    </button>
  );
}

function Header() {
  const { t, path, lang } = useI18n();
  const { data } = usePage<TorrentData>();
  const title = data.enriched?.title ?? data.name;
  const copyMagnet = () =>
    void navigator.clipboard?.writeText(data.magnet).then(() => toast(t("resource.magnetCopied")));
  const share = async () => {
    const url = location.origin + path(`/${data.id}`);
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        /* dismissed: fall back to copying */
      }
    }
    await navigator.clipboard?.writeText(url);
    toast(t("resource.linkCopied"));
  };
  return (
    <header className="torrent-head glass">
      <div className="torrent-poster">
        <span className="poster-fallback">{title}</span>
        {data.poster && (
          <img src={data.poster} alt="" loading="lazy" onError={(event) => event.currentTarget.remove()} />
        )}
        {data.adultBadge && <span className="adult-mark">18+</span>}
      </div>
      <div className="torrent-main">
        <p className="torrent-kind">
          <span className="chip">{t(`resource.${data.kind}`)}</span>
          {data.enriched?.year ? <span>{data.enriched.year}</span> : null}
          {data.enriched?.rating ? (
            <span className="rating">
              <Icon name="star" size={15} />
              {data.enriched.rating.toFixed(1)}
            </span>
          ) : null}
          <span className="mono">
            {fileSize(data.size, lang)} · {data.filesCount} {t("library.files")}
          </span>
        </p>
        <h1 title={data.name}>{title}</h1>
        {data.enriched && data.enriched.title !== data.name && <p className="torrent-original mono">{data.name}</p>}
        {data.enriched?.plot && <p className="torrent-plot">{data.enriched.plot}</p>}
        {data.status && <TransferStatus view={data.status.view} streamUrl={data.status.streamUrl} />}
        <div className="torrent-actions">
          <LibraryButton />
          {data.vault && <VaultButton />}
          <span className="torrent-tools">
            <a className="button quiet" href={data.torrentUrl} download>
              <Icon name="download" size={17} />
              .torrent
            </a>
            <button
              type="button"
              className={data.fromTool === "torrent-to-magnet" ? "button" : "icon-button"}
              onClick={copyMagnet}
              title={t("resource.copyMagnet")}
              aria-label={t("resource.copyMagnet")}
            >
              <Icon name="link" size={18} />
              {data.fromTool === "torrent-to-magnet" && t("resource.copyMagnet")}
            </button>
            <button type="button" className="icon-button" onClick={() => void share()} aria-label={t("resource.share")} title={t("resource.share")}>
              <Icon name="share" size={18} />
            </button>
            <Link
              className="icon-button"
              href={`${path("/support")}?cause=2&infohash=${data.id}&filename=${encodeURIComponent(data.name)}`}
              title={t("resource.reportProblem")}
              aria-label={t("resource.reportProblem")}
            >
              <Icon name="alert" size={18} />
            </Link>
          </span>
        </div>
        {data.fromTool === "magnet-to-torrent" && <p className="fine">{t("resource.toolIntent.magnetToTorrent")}</p>}
      </div>
    </header>
  );
}

export default function Torrent() {
  const { data, error } = usePage<TorrentData>();
  const { t } = useI18n();
  return (
    <div className="wrap torrent-page">
      <Header />
      {error && (
        <div className="notice error" role="alert">
          <Icon name="alert" />
          <span>{t(error.key)}</span>
        </div>
      )}
      <h2 className="content-title">{t("resource.content")}</h2>
      <div className="torrent-content">
        {data.file && <FileCard />}
        {data.list && <FileBrowser />}
      </div>
    </div>
  );
}
