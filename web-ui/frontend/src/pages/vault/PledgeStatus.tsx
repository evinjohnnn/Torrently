import { useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import { Icon, type IconName } from "../../ui/Icon";
import type { Badge, StreamStatus } from "./types";

const ICONS: Record<string, IconName> = {
  idle: "minus",
  noseed: "wifi",
  pause: "pause",
  down: "download",
  up: "upload",
  check: "check",
  clock: "clock",
  warn: "alert",
  unknown: "info",
  vault: "vault",
};

const TONES: Record<string, string> = {
  ok: "olive",
  cyan: "olive",
  vault: "olive",
  warn: "honey",
  pink: "honey",
  err: "brick",
};

/** The transfer status's badge as a chip: its tone, icon and words. */
export function Pill({ badge }: { badge: Badge }) {
  return (
    <span
      className={`chip pill ${TONES[badge.tone] ?? ""}${badge.pulse ? " pulse" : ""}`}
      title={badge.extra ? `${badge.label} ${badge.extra}` : badge.label}
    >
      {badge.icon === "dots" ? <span className="spinner" aria-hidden="true" /> : <Icon name={ICONS[badge.icon] ?? "info"} size={14} />}
      <span className="pill-text">
        {badge.label}
        {badge.extra && <span className="pill-extra"> {badge.extra}</span>}
      </span>
    </span>
  );
}

/**
 * A pledge on its way into the Vault, followed live: the status stream
 * (GET /:id/status) sends the state, its percent and the badge until the
 * torrent is vaulted. A hidden tab lets the stream go; a refused one (its
 * token lives an hour) asks the page for fresh tokens through `renew`.
 */
export function useStatusStream(url: string | undefined, renew: () => void) {
  const [status, setStatus] = useState<StreamStatus | null>(null);
  useEffect(() => {
    if (!url) return;
    let source: EventSource | null = null;
    let finished = false;
    const close = () => {
      source?.close();
      source = null;
    };
    const open = () => {
      if (finished || source || document.hidden) return;
      const next = new EventSource(url, { withCredentials: true });
      next.addEventListener("message", (event) => {
        let message: StreamStatus;
        try {
          message = JSON.parse((event as MessageEvent).data);
        } catch {
          return;
        }
        setStatus(message);
        if (message.state === "vaulted") {
          finished = true;
          close();
        }
      });
      next.addEventListener("error", () => {
        // network blips reconnect by themselves; a refusal closes for good
        if (next.readyState !== EventSource.CLOSED) return;
        close();
        renew();
      });
      source = next;
    };
    const visibility = () => (document.hidden ? close() : open());
    document.addEventListener("visibilitychange", visibility);
    open();
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      finished = true;
      close();
    };
  }, [url, renew]);
  return status;
}

/** Seconds as the two largest units, in the page's language: "3 days, 4 hours". */
export function duration(seconds: number, lang: string) {
  const units: [string, number][] = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  const parts: string[] = [];
  let rest = Math.max(0, Math.floor(seconds));
  for (const [unit, size] of units) {
    const value = Math.floor(rest / size);
    if (value > 0 || (unit === "minute" && !parts.length)) {
      parts.push(new Intl.NumberFormat(lang, { style: "unit", unit, unitDisplay: "long" }).format(value));
      rest -= value * size;
    }
    if (parts.length === 2) break;
  }
  return new Intl.ListFormat(lang, { style: "narrow", type: "unit" }).format(parts);
}

export function useStatusLabels() {
  const { t } = useI18n();
  return {
    checking: { tone: "cyan", icon: "dots", label: t("resource.status.checking") } as Badge,
    expiring: { tone: "pink", icon: "clock", label: t("vault.pledges.expiring") } as Badge,
    saved: { tone: "vault", icon: "vault", label: t("vault.pledges.saved") } as Badge,
  };
}
