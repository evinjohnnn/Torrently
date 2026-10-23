import { useEffect, useRef, useState } from "react";
import { useNavigation, usePage } from "../../app/router";
import { ActionRun } from "../../jobs/ActionRun";
import { useAction } from "../../jobs/useAction";
import { useI18n } from "../../i18n";
import { Dialog } from "../../ui/Dialog";
import { Icon, type IconName } from "../../ui/Icon";
import { fileSize } from "../../ui/format";
import type { Action, TorrentData } from "./types";
import { WatchedToggle } from "./WatchedToggle";

const ICON: Record<string, IconName> = {
  stream: "play",
  preview: "image",
  download: "download",
  "file-info": "info",
  "download-dir": "archive",
};

/** The file picked: its actions and, under them, what the last one produced. */
export function FileCard() {
  const { t, lang, rich, path } = useI18n();
  const { data, session } = usePage<TorrentData>();
  const file = data.file!;
  const inline = useAction();
  const modal = useAction();
  const [modalAction, setModalAction] = useState<Action | null>(null);
  const { state } = useNavigation();
  const area = useRef<HTMLDivElement>(null);

  // another file, another card: whatever ran for the last one stops
  useEffect(() => {
    inline.clear();
    modal.clear();
    setModalAction(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id]);

  // #action=stream (continue watching, deep links) starts the player
  useEffect(() => {
    if (location.hash !== "#action=stream") return;
    const stream = file.actions.find((action) => action.action === "stream");
    if (stream) run(stream);
    history.replaceState(history.state, "", location.pathname + location.search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const fields = (action: Action) => ({ "resource-id": data.id, "item-id": action.itemId });
  function run(action: Action) {
    if (action.action === "download" || action.action === "file-info") {
      setModalAction(action);
      void modal.start(action.endpoint, fields(action));
    } else {
      void inline.start(action.endpoint, fields(action));
      area.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  return (
    <article className="file-card glass">
      <header>
        <h2 title={file.name}>{file.name}</h2>
        <span className="muted mono">{fileSize(file.size, lang)}</span>
      </header>
      <div className="file-actions">
        {file.actions.map((action) => {
          const primary = action.action === "stream" || action.action === "preview";
          const busy =
            (primary && inline.starting) ||
            (!primary && modal.starting && modalAction?.action === action.action);
          return (
            <button
              key={action.action}
              type="button"
              className={
                primary ? "button accent large" : action.action === "file-info" ? "button large quiet-outline" : "button large"
              }
              onClick={() => run(action)}
              disabled={busy}
              title={action.action === "file-info" ? t(action.label) : undefined}
            >
              {busy ? <span className="spinner" /> : <Icon name={ICON[action.action] ?? "file"} size={18} />}
              <span>{t(action.label)}</span>
            </button>
          );
        })}
        {file.watched && <WatchedToggle watched={file.watched} large />}
      </div>
      <div ref={inline.challenge} className="challenge" />
      <div ref={area} className="file-run">
        {inline.run?.error && (
          <div className="notice error" role="alert">
            <Icon name="alert" />
            <span>{inline.run.error}</span>
          </div>
        )}
        {inline.run?.logUrl && (
          <ActionRun
            key={inline.run.key}
            logUrl={inline.run.logUrl}
            onRetry={(endpoint, retry) => void inline.start(endpoint, retry)}
            onClose={inline.clear}
          />
        )}
      </div>
      {(data.adult || !session.user) && (
        <p className="fine age-note">
          {data.adult
            ? session.user
              ? t("ageGate.adultFootnote")
              : rich("ageGate.adultFootnoteAnon", { TosURL: path("/legal/tos"), PrivacyURL: path("/legal/privacy") })
            : rich("ageGate.footnote", { TosURL: path("/legal/tos"), PrivacyURL: path("/legal/privacy") })}
        </p>
      )}
      <Dialog
        open={Boolean(modalAction)}
        onClose={() => {
          setModalAction(null);
          modal.clear();
        }}
        title={modalAction?.action === "file-info" ? t("resource.fileInfo") : t("resource.preparingDownload")}
        subtitle={file.name}
      >
        <div ref={modal.challenge} className="challenge" />
        {modal.run?.error && (
          <div className="notice error" role="alert">
            <Icon name="alert" />
            <span>{modal.run.error}</span>
          </div>
        )}
        {modal.run?.logUrl && (
          <ActionRun
            key={modal.run.key}
            logUrl={modal.run.logUrl}
            onRetry={(endpoint, retry) => void modal.start(endpoint, retry)}
            onClose={() => {
              setModalAction(null);
              modal.clear();
            }}
          />
        )}
        {!modal.run && <span className="spinner" />}
      </Dialog>
    </article>
  );
}
