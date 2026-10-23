import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { formData, type Fields } from "../../app/api";
import { Link, useNavigation, usePage } from "../../app/router";
import { toast } from "../../chrome/Toasts";
import { useI18n } from "../../i18n";
import { Dialog } from "../../ui/Dialog";
import { Icon, type IconName } from "../../ui/Icon";
import type { ProfileData } from "./types";

// Pieces every profile section is built from: the pane, the save round
// trip, the error a form came back with, switches, copy fields, sortable rows.

/** Query the server adds to the address after a form; never sent back with the next one. */
const ANSWER_PARAMS = ["status", "err", "from", "message", "err_count", "err_full"];

/**
 * Posts a section's form. The handler redirects back to this page, which
 * comes back whole: ?message= becomes a toast, ?err= an error under the
 * section that sent it. The previous answer is taken off the address first,
 * or a success would land on a URL still carrying the old error.
 */
export function useSend() {
  const { submit, busy } = useNavigation();
  const send = useCallback(
    (url: string, fields: Fields = {}) => {
      const address = new URL(location.href);
      for (const name of ANSWER_PARAMS) address.searchParams.delete(name);
      history.replaceState(history.state, "", address);
      return submit(url, formData(fields), { scroll: false });
    },
    [submit],
  );
  return { send, busy };
}

/** Which section a failed form belongs to, by the path it posted to (?from=). */
const ERROR_HOMES: [string, string][] = [
  ["/stremio/addon-url", "addon-urls"],
  ["/stremio/settings", "stremio-settings"],
  ["/stremio/url", "stremio"],
  ["/streaming/backends", "streaming-backends"],
  ["/torznab/indexer", "torznab-indexers"],
  ["/subscription", "subscriptions"],
  ["/webdav", "webdav"],
  ["/s3-credentials", "s3"],
  ["/api-credentials", "api"],
  ["/device", "devices"],
  ["/embed-domain", "embed-domains"],
  ["/profile/password", "password"],
  ["/profile/email", "email"],
  ["/profile/settings", "adult-content-section"],
];

export function errorHome(from?: string) {
  if (!from) return null;
  return ERROR_HOMES.find(([prefix]) => from.includes(prefix))?.[1] ?? null;
}

/** The error this section's last form came back with. */
export function SectionError({ id }: { id: string }) {
  const { data } = usePage<ProfileData>();
  const { t } = useI18n();
  if (!data.errKey || errorHome(data.errFrom) !== id) return null;
  return (
    <div className="notice error" role="alert">
      <Icon name="alert" />
      <span>{t(data.errKey)}</span>
    </div>
  );
}

/** One section of the page: a pane with an anchor the rest of the site links to. */
export function Section({
  id,
  icon,
  title,
  badge,
  intro,
  children,
}: {
  id: string;
  icon: IconName;
  title: string;
  badge?: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="pf-section glass" aria-labelledby={`${id}-title`} tabIndex={-1}>
      <header className="pf-section-head">
        <span className="pf-section-icon" aria-hidden="true">
          <Icon name={icon} size={18} />
        </span>
        <h3 id={`${id}-title`}>{title}</h3>
        {badge && <span className="chip">{badge}</span>}
      </header>
      {intro && <p className="pf-intro">{intro}</p>}
      <SectionError id={id} />
      {children}
    </section>
  );
}

/** An on/off switch over a real checkbox. */
export function Switch({
  checked,
  onChange,
  label,
  hideLabel,
  disabled,
}: {
  checked: boolean;
  onChange?: (on: boolean) => void;
  label: string;
  hideLabel?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className={disabled ? "pf-switch disabled" : "pf-switch"}>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.checked)}
      />
      <span className="pf-switch-track" aria-hidden="true" />
      <span className={hideLabel ? "visually-hidden" : "pf-switch-label"}>{label}</span>
    </label>
  );
}

/** "Upgrade your tier" under a feature the plan does not include. */
export function Locked({ text, upgrade }: { text: string; upgrade: string }) {
  const { path } = useI18n();
  return (
    <div className="notice warn pf-locked">
      <Icon name="lock" />
      <div>
        <p>{text}</p>
        <Link href={path("/donate")}>{upgrade}</Link>
      </div>
    </div>
  );
}

export function copy(value: string, message: string) {
  void navigator.clipboard?.writeText(value).then(() => toast(message));
}

/**
 * A read-only credential with its copy button; a secret stays masked until
 * revealed, and a rotation goes through a confirm first.
 */
export function CopyField({
  id,
  label,
  value,
  copyLabel,
  copied,
  secret,
  revealLabel,
  rotate,
}: {
  id: string;
  label: string;
  value: string;
  copyLabel: string;
  copied: string;
  secret?: boolean;
  revealLabel?: string;
  rotate?: { label: string; warning: string; onConfirm: () => void };
}) {
  const [shown, setShown] = useState(false);
  const [asking, setAsking] = useState(false);
  // a rotated secret starts out hidden again
  useEffect(() => setShown(false), [value]);
  return (
    <div className="field pf-copy-field">
      <label htmlFor={id}>{label}</label>
      <div className="pf-copy">
        <input
          id={id}
          className="input mono"
          type={secret && !shown ? "password" : "text"}
          readOnly
          value={value}
          onFocus={(event) => event.currentTarget.select()}
        />
        {secret && (
          <button
            type="button"
            className="icon-button"
            aria-pressed={shown}
            aria-label={revealLabel}
            title={revealLabel}
            onClick={() => setShown(!shown)}
          >
            <Icon name={shown ? "eyeOff" : "eye"} size={18} />
          </button>
        )}
        <button type="button" className="icon-button" aria-label={copyLabel} title={copyLabel} onClick={() => copy(value, copied)}>
          <Icon name="copy" size={18} />
        </button>
        {rotate && (
          <button
            type="button"
            className="icon-button"
            aria-label={rotate.label}
            title={rotate.label}
            onClick={() => setAsking(true)}
          >
            <Icon name="refresh" size={18} />
          </button>
        )}
      </div>
      {rotate && (
        <Confirm
          open={asking}
          onClose={() => setAsking(false)}
          title={rotate.label}
          text={rotate.warning}
          action={rotate.label}
          onConfirm={rotate.onConfirm}
        />
      )}
    </div>
  );
}

/** A yes/no question in a dialog, for anything that cannot be taken back. */
export function Confirm({
  open,
  onClose,
  title,
  text,
  action,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  text: string;
  action: string;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <p className="pf-confirm-text">{text}</p>
      <div className="dialog-actions">
        <button type="button" className="button quiet" onClick={onClose}>
          {t("profile.subscriptions.prefsCancel")}
        </button>
        <button
          type="button"
          className="button danger"
          onClick={() => {
            onClose();
            onConfirm();
          }}
        >
          {action}
        </button>
      </div>
    </Dialog>
  );
}

/**
 * Local state for a list the server owns: edits stay on screen until saved,
 * and are replaced only when the server's own copy changes (a save, or this
 * list's own refresh) — saving another section leaves them alone.
 */
export function useDraft<T>(server: T) {
  const stamp = JSON.stringify(server);
  const [draft, setDraft] = useState(server);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setDraft(server);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp]);
  const edit = useCallback((next: T | ((value: T) => T)) => {
    setDraft(next);
    setDirty(true);
  }, []);
  return [draft, edit, dirty] as const;
}

/**
 * Rows reordered by their handle: dragged with a mouse or a finger, or
 * moved one step with the arrow keys while the handle has focus. The drag
 * listens on the window, not through pointer capture: a row that moves in
 * the DOM would drop the capture mid-drag.
 */
export function useSortable<T>(items: T[], keyOf: (item: T) => string, onMove: (items: T[]) => void) {
  const list = useRef<HTMLUListElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const latest = useRef({ items, onMove });
  latest.current = { items, onMove };

  const move = useCallback(
    (key: string, to: number) => {
      const { items, onMove } = latest.current;
      const from = items.findIndex((item) => keyOf(item) === key);
      if (from < 0 || to < 0 || to >= items.length || to === from) return false;
      const next = items.slice();
      next.splice(to, 0, ...next.splice(from, 1));
      onMove(next);
      return true;
    },
    // keyOf is a plain accessor, the same on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // listeners go on at the press itself: an effect would miss the first moves
  const start = (key: string) => {
    setDragging(key);
    const over = (event: globalThis.PointerEvent) => {
      if (!list.current) return;
      event.preventDefault();
      const rows = Array.from(list.current.querySelectorAll<HTMLElement>("[data-sort-row]"));
      const at = rows.findIndex((row) => {
        const box = row.getBoundingClientRect();
        return event.clientY >= box.top && event.clientY < box.bottom;
      });
      if (at >= 0) move(key, at);
    };
    const drop = () => {
      setDragging(null);
      removeEventListener("pointermove", over);
      removeEventListener("pointerup", drop);
      removeEventListener("pointercancel", drop);
    };
    addEventListener("pointermove", over);
    addEventListener("pointerup", drop);
    addEventListener("pointercancel", drop);
  };

  const handle = (key: string) => ({
    "data-sort-handle": key,
    onPointerDown(event: PointerEvent<HTMLButtonElement>) {
      if (event.button !== 0) return;
      event.preventDefault();
      start(key);
    },
    onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
      const step = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
      if (!step) return;
      event.preventDefault();
      const at = latest.current.items.findIndex((item) => keyOf(item) === key);
      if (move(key, at + step)) {
        // the row moved in the DOM; keep the keyboard on its handle
        requestAnimationFrame(() =>
          list.current?.querySelector<HTMLElement>(`[data-sort-handle="${CSS.escape(key)}"]`)?.focus(),
        );
      }
    },
  });

  return { list, dragging, handle };
}

/** The grip that drags a row. */
export function Grip({ label, props }: { label: string; props: ReturnType<ReturnType<typeof useSortable>["handle"]> }) {
  return (
    <button type="button" className="pf-grip" aria-label={label} title={label} {...props}>
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
        <circle cx="9" cy="6" r="1.6" />
        <circle cx="15" cy="6" r="1.6" />
        <circle cx="9" cy="12" r="1.6" />
        <circle cx="15" cy="12" r="1.6" />
        <circle cx="9" cy="18" r="1.6" />
        <circle cx="15" cy="18" r="1.6" />
      </svg>
    </button>
  );
}

/** The foot of an editable list: a guide link and Save, which wakes up once something changed. */
export function ListFoot({
  guide,
  save,
  dirty,
  onSave,
}: {
  guide?: { href: string; label: string };
  save: string;
  dirty: boolean;
  onSave: () => void;
}) {
  const { busy } = useNavigation();
  return (
    <div className="pf-foot">
      {guide && (
        <a className="pf-link" href={guide.href} target="_blank" rel="noopener">
          {guide.label}
        </a>
      )}
      <button type="button" className={dirty ? "button accent" : "button"} disabled={busy} onClick={onSave}>
        {save}
      </button>
    </div>
  );
}

/** Go's %v placeholder, which the list confirmations still use. */
export const fillV = (text: string, value: string) => text.replace("%v", value);
