import { useEffect, useRef, useState } from "react";
import { useSession } from "../app/router";
import { toast } from "../chrome/Toasts";
import { useI18n } from "../i18n";
import { Island } from "../legacy/Island";
import { Icon } from "../ui/Icon";
import { fileSize } from "../ui/format";
import { JobSteps } from "./JobSteps";
import { useJobLog } from "./useJobLog";

// Some of these labels are lower case in the locales (the classic card
// capitalised them in CSS); the design is sentence case.
const sentence = (text: string, lang: string) => text.charAt(0).toLocaleUpperCase(lang) + text.slice(1);

/** What a retry re-sends: the start form the job came from. */
interface Resubmit {
  Action: string;
  Endpoint: string;
  ResourceID: string;
  ItemID: string;
  ArchiveFormat?: string;
  SelectedPaths?: string[] | null;
}

interface DownloadCard {
  URL: string;
  TierName: string;
  RateMbps: number;
  SizeBytes: number;
  Cached: boolean;
  ZipWarning: boolean;
  IsArchive: boolean;
}

interface NoPeers extends Resubmit {
  TierName: string;
  Reason: string;
  Peers: number;
  Bytes: string;
  BytesRaw: number;
  ElapsedSec: number;
}

interface Slow extends Resubmit {
  MeasuredSpeedMbps: number;
  RequiredSpeedMbps: number;
  IsRateLimited: boolean;
  RateLimitMbps: number;
}

const PLAYER_BACKSTOP_MS = 15000;

function retryFields(data: Resubmit, extra: Record<string, string> = {}) {
  return {
    "resource-id": data.ResourceID,
    "item-id": data.ItemID,
    "archive-format": data.ArchiveFormat || undefined,
    paths: data.SelectedPaths ?? undefined,
    ...extra,
  };
}

function Copy({ text, label }: { text: string; label: string }) {
  const { t, lang } = useI18n();
  return (
    <button
      type="button"
      className="button small quiet"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => toast(t("action.download.copied")));
      }}
    >
      <Icon name="copy" size={16} />
      {sentence(label, lang)}
    </button>
  );
}

function Download({ card }: { card: DownloadCard }) {
  const { t, lang } = useI18n();
  const start = useRef<HTMLAnchorElement>(null);
  useEffect(() => start.current?.focus({ preventScroll: true }), []);
  return (
    <div className="result-card">
      <div className="result-head">
        <span className="result-mark">
          <Icon name="check" size={18} />
        </span>
        <strong>{t("job.downloadReady")}</strong>
        {card.SizeBytes > 0 && <span className="muted">{fileSize(card.SizeBytes, lang)}</span>}
      </div>
      <div className="result-actions">
        <a ref={start} className="button accent" href={card.URL} data-transfer-download="">
          <Icon name="download" size={18} />
          {sentence(t("action.download.startDownload"), lang)}
        </a>
        <Copy text={card.URL} label={t("action.download.copyUrl")} />
        <Copy text={`wget -c "${card.URL}"`} label={t("action.download.copyWget")} />
        <Copy text={`curl -C - -L -O "${card.URL}"`} label={t("action.download.copyCurl")} />
      </div>
      {card.IsArchive && <p className="fine">{t("action.download.archiveNote")}</p>}
      {card.ZipWarning && <p className="fine">{t("action.download.zipCrcWarning")}</p>}
      {card.RateMbps > 0 && card.TierName === "free" && (
        <p className="fine">{t("action.download.limitedTitle", { Rate: card.RateMbps })}</p>
      )}
    </div>
  );
}

function Trouble({
  title,
  body,
  extra,
  retry,
  retryLabel,
  onClose,
}: {
  title: string;
  body?: string;
  extra?: string;
  retry?: () => void;
  retryLabel?: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="result-card trouble">
      <div className="notice warn">
        <Icon name="alert" />
        <div>
          <strong>{title}</strong>
          {body && <p>{body}</p>}
          {extra && <p className="fine">{extra}</p>}
        </div>
      </div>
      <div className="result-actions">
        <button type="button" className="button quiet" onClick={onClose}>
          {t("action.noPeers.gotIt")}
        </button>
        {retry && (
          <button type="button" className="button primary" onClick={retry}>
            {retryLabel}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * One file action's job, from its first step to its outcome: a download
 * card, a card that says what went wrong, or the player.
 */
export function ActionRun({
  logUrl,
  onRetry,
  onClose,
  onReady,
}: {
  logUrl: string;
  onRetry: (endpoint: string, fields: Record<string, string | string[] | undefined>) => void;
  onClose: () => void;
  /** the outcome is on screen (a player that can play, a card) */
  onReady?: () => void;
}) {
  const { t, tn } = useI18n();
  const session = useSession();
  const job = useJobLog(logUrl);
  const result = job.result;
  const [playerShown, setPlayerShown] = useState(false);

  // a file download starts on its own
  useEffect(() => {
    if (result?.level === "download" && result.location) location.assign(result.location);
  }, [result]);

  // a player stays hidden until it can play (or shows a card of its own)
  useEffect(() => {
    if (result?.level !== "rendertemplate") return;
    const reveal = () => setPlayerShown(true);
    const hasMedia = /<(video|audio)\b/i.test(result.body ?? "");
    if (!hasMedia) reveal();
    addEventListener("player_ready", reveal);
    addEventListener("player_show", reveal);
    // a player that never gets ready still has its own words for why
    // (a codec, the network): shown rather than an empty card
    const backstop = setTimeout(reveal, PLAYER_BACKSTOP_MS);
    return () => {
      clearTimeout(backstop);
      removeEventListener("player_ready", reveal);
      removeEventListener("player_show", reveal);
    };
  }, [result]);

  const ended = Boolean(result) || Boolean(job.error);
  useEffect(() => {
    if (playerShown || (result && result.level === "custom") || job.error) onReady?.();
  }, [playerShown, result, job.error, onReady]);

  const custom = result?.level === "custom" ? result : null;
  let card = null;
  if (custom?.template === "action/download_file" && custom.data) {
    card = <Download card={custom.data as DownloadCard} />;
  } else if (custom?.template === "action/errors/no_peers" && custom.data) {
    const data = custom.data as NoPeers;
    const title =
      data.Reason === "slow"
        ? "action.noPeers.slowTitle"
        : data.Reason === "timeout"
          ? "action.noPeers.timeoutTitle"
          : "action.noPeers.title";
    const body =
      data.Reason === "slow"
        ? "action.noPeers.slowBody"
        : data.Reason === "timeout"
          ? "action.noPeers.timeoutBody"
          : session.vault
            ? "action.noPeers.vaultUse"
            : undefined;
    card = (
      <Trouble
        title={t(title)}
        body={body && t(body)}
        extra={
          data.Peers > 0 || data.BytesRaw > 0
            ? tn("action.noPeers.stats", data.Peers, { Bytes: data.Bytes, Peers: data.Peers, Sec: data.ElapsedSec })
            : data.Reason !== "timeout"
              ? t("action.noPeers.altSearchAlone")
              : undefined
        }
        retry={data.Endpoint ? () => onRetry(data.Endpoint, retryFields(data)) : undefined}
        retryLabel={t("action.noPeers.retry")}
        onClose={onClose}
      />
    );
  } else if (custom?.template === "action/errors/slow_download" && custom.data) {
    const data = custom.data as Slow;
    card = (
      <Trouble
        title={t(data.IsRateLimited ? "action.slow.title.rateLimited" : "action.slow.title.bandwidth")}
        body={`${t("action.slow.fileNeeds")} ${data.RequiredSpeedMbps.toFixed(1)} ${t("action.slow.unit")} · ${t("action.slow.youHave")} ${data.MeasuredSpeedMbps.toFixed(1)} ${t("action.slow.unit")}`}
        retry={data.Endpoint ? () => onRetry(data.Endpoint, retryFields(data, { "force-slow": "true" })) : undefined}
        retryLabel={t("action.slow.continueSlow")}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="action-run">
      {!playerShown && !card && (
        <div className="action-progress">
          <JobSteps job={job} />
          {job.closed && !result && !job.error && (
            <div className="notice error" role="alert">
              <Icon name="alert" />
              <span>{t("error.generic")}</span>
            </div>
          )}
          {(job.error || job.closed) && !result && (
            <div className="result-actions">
              <button type="button" className="button quiet" onClick={onClose}>
                {t("action.noPeers.gotIt")}
              </button>
            </div>
          )}
        </div>
      )}
      {card}
      {result?.level === "rendertemplate" && result.body && (
        <Island
          html={result.body}
          session={session}
          className="legacy-island"
          hidden={!playerShown}
        />
      )}
      {ended && job.warning && !card && <p className="fine">{job.warning}</p>}
    </div>
  );
}
