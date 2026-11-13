import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { Link, useNavigation, usePage } from "../../app/router";
import { LiquidGlass } from "../../glass/LiquidGlass";
import { JobSteps } from "../../jobs/JobSteps";
import { useJobLog } from "../../jobs/useJobLog";
import { useI18n } from "../../i18n";
import { Icon } from "../../ui/Icon";
import type { HomeData } from "./types";

interface MagnetError {
  kind: "dead" | "invalid";
  waitedSec: number;
  long: boolean;
  query: string;
  hintVideoId?: string;
}

/** Follows the load job POST / started, then opens the torrent's page. */
function Loading({ url, tool, onRetry }: { url: string; tool?: string; onRetry: (fd: FormData) => void }) {
  const { t } = useI18n();
  const { navigate } = useNavigation();
  const job = useJobLog(url);

  useEffect(() => {
    const result = job.result;
    if (result?.level !== "redirect" || !result.location) return;
    const target = new URL(result.location, location.href);
    // the tool the visit started on travels with it (docs/tool_pages.md)
    if (tool) target.searchParams.set("tool", tool);
    void navigate(target.pathname + target.search, { replace: true });
  }, [job.result, navigate, tool]);

  const card =
    job.result?.level === "custom" && job.result.template === "load/errors/magnet"
      ? (job.result.data as MagnetError | undefined)
      : undefined;

  if (card) {
    const dead = card.kind === "dead";
    const retry = () => {
      const fd = new FormData();
      fd.set("resource", card.query);
      fd.set("magnet-wait", "long");
      if (card.hintVideoId) fd.set("hint_video_id", card.hintVideoId);
      onRetry(fd);
    };
    return (
      <div className="load-card">
        <div className="notice error">
          <Icon name="alert" />
          <div>
            <strong>{t(dead ? "load.magnet.deadTitle" : "load.magnet.invalidTitle")}</strong>
            <p>
              {t(
                !dead
                  ? "load.magnet.invalidBody"
                  : card.long
                    ? "load.magnet.deadBodyLong"
                    : "load.magnet.deadBody",
              )}
            </p>
            {dead && card.waitedSec > 0 && (
              <p className="fine">{t("load.magnet.waited", { Seconds: card.waitedSec })}</p>
            )}
          </div>
        </div>
        <div className="load-actions">
          <Link className="button quiet" href={location.pathname}>
            {t("home.gotIt")}
          </Link>
          {dead && !card.long && (
            <button type="button" className="button primary" onClick={retry}>
              {t("load.magnet.retryLong")}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="load-card">
      <JobSteps job={job} />
      {job.error && (
        <div className="load-actions">
          <Link className="button" href={location.pathname}>
            {t("home.gotIt")}
          </Link>
        </div>
      )}
    </div>
  );
}

/**
 * The page's one job: take a magnet link, an infohash or a .torrent file and
 * open it. A pane of liquid glass over the backdrop.
 */
export function OpenTorrent() {
  const { t, tn, path } = useI18n();
  const { data, error } = usePage<HomeData>();
  const { submit, busy } = useNavigation();
  const [query, setQuery] = useState(data.query ?? "");
  const [dragging, setDragging] = useState(false);
  // a closed error stays closed until the next submit brings a new one
  const [dismissed, setDismissed] = useState<typeof error>();
  const file = useRef<HTMLInputElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // clipboard reads need a secure context; without one the button only opens
  const canPaste = typeof navigator.clipboard?.readText === "function";
  const paste = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) setQuery(text);
    } catch {
      /* refused: the field is focused for Ctrl+V instead */
    }
    input.current?.focus();
  };
  const instruction = data.instruction;

  const send = (fd: FormData) => {
    fd.set("instruction", instruction);
    void submit(path("/"), fd);
  };
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fd = new FormData();
    fd.set("resource", query.trim());
    send(fd);
  };
  const sendFile = (picked: File | undefined | null) => {
    if (!picked) return;
    const fd = new FormData();
    fd.set("resource", picked);
    send(fd);
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    sendFile(event.dataTransfer.files?.[0]);
  };

  // a .torrent dropped anywhere on the page opens too
  useEffect(() => {
    const over = (event: globalThis.DragEvent) => {
      if (event.dataTransfer?.types.includes("Files")) {
        event.preventDefault();
        setDragging(true);
      }
    };
    const leave = (event: globalThis.DragEvent) => {
      if (!event.relatedTarget) setDragging(false);
    };
    const drop = (event: globalThis.DragEvent) => {
      if (!event.dataTransfer?.files?.length) return;
      event.preventDefault();
      setDragging(false);
      sendFile(event.dataTransfer.files[0]);
    };
    addEventListener("dragover", over);
    addEventListener("dragleave", leave);
    addEventListener("drop", drop);
    return () => {
      removeEventListener("dragover", over);
      removeEventListener("dragleave", leave);
      removeEventListener("drop", drop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instruction]);

  const loading = Boolean(data.jobLogUrl);
  const tool = data.tool;

  return (
    <div className={dragging ? "open-slab dragging" : "open-slab"} onDrop={onDrop}>
      <LiquidGlass bezel={22} refraction={20} />
      {loading ? (
        <Loading url={data.jobLogUrl!} tool={tool?.url} onRetry={send} />
      ) : (
        <>
          <form className="magnet-form" onSubmit={onSubmit}>
            <label className="visually-hidden" htmlFor="resource">
              {t("home.placeholder")}
            </label>
            <Icon name={tool ? "arrow" : "link"} className="magnet-icon" />
            <input
              ref={input}
              id="resource"
              name="resource"
              className="magnet-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("home.placeholder")}
              autoComplete="off"
              spellCheck={false}
              required
            />
            {canPaste && !query.trim() ? (
              <button type="button" className="button large paste" onClick={paste}>
                {t("home.paste")}
              </button>
            ) : (
              <button type="submit" className="button accent large" disabled={busy}>
                {busy ? <span className="spinner" /> : null}
                {t("home.open")}
              </button>
            )}
          </form>
          {error && error !== dismissed && (
            <div className="form-error" role="alert">
              <Icon name="alert" size={16} />
              <span>
                {error.args
                  ? tn(error.key, error.args.Count, { Full: error.args.Full })
                  : t(error.key)}
              </span>
              <button
                type="button"
                className="form-error-close"
                aria-label={t("onboarding.close")}
                onClick={() => setDismissed(error)}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          )}
          <div className="slab-foot">
            <button type="button" className="drop-target" onClick={() => file.current?.click()}>
              <Icon name="upload" size={18} />
              <span>
                <strong>{t("home.dropzone")}</strong> {t("home.dropzoneHint")}
              </span>
            </button>
            <input
              ref={file}
              type="file"
              accept=".torrent,application/x-bittorrent"
              hidden
              onChange={(event) => sendFile(event.target.files?.[0])}
            />
            <span className="slab-links">
              {data.demoMagnet && (
                <button
                  type="button"
                  className="text-link"
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("resource", data.demoMagnet!);
                    send(fd);
                  }}
                >
                  <Icon name="play" size={15} />
                  {t("home.tryDemo")}
                </button>
              )}
              <Link className="text-link" href={path("/speedtest")}>
                <Icon name="bolt" size={15} />
                {t("home.speedTest")}
              </Link>
            </span>
          </div>
        </>
      )}
    </div>
  );
}
