import { useState } from "react";
import { Link } from "../../../app/router";
import { Icon } from "../../../ui/Icon";
import { langPath, t, tf } from "../lib/env.ts";
import type { Addon } from "../types.ts";
import { RetryButton } from "./EmptyStates.tsx";

// Page-level health surface for the user's addons. Hidden when every
// addon is reachable; otherwise renders a single warning row that
// expands into a per-addon list with retry. Lives inside the sticky
// toolbar so it stays visible when scrolling through results.
export function AddonHealthChip({ addons, onRetry }: { addons: Addon[]; onRetry: () => Promise<void> }) {
  const [expanded, setExpanded] = useState(false);

  if (!addons || addons.length === 0) return null;
  const failed = addons.filter((a) => a.status !== "ok");
  if (failed.length === 0) return null;

  const allDown = failed.length === addons.length;
  const headline = allDown ? t("discover.allAddonsDown") : tf("discover.addonsPartialDown", failed.length, addons.length);

  return (
    <div className="notice warn d-health">
      <Icon name="alert" />
      <div className="d-health-body">
        <div className="d-health-head">
          <button
            type="button"
            className="d-health-toggle"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            <span>{headline}</span>
            <Icon name="chevron" size={16} className={expanded ? "flip" : undefined} />
            <span className="visually-hidden">{expanded ? t("discover.collapse") : t("discover.expand")}</span>
          </button>
          <RetryButton onRetry={onRetry} className="button small quiet" />
        </div>
        {expanded && (
          <ul className="d-health-list">
            {addons.map((a) => (
              <AddonRow key={a.baseUrl} addon={a} />
            ))}
            <li>
              <Link href={langPath("/profile")}>{t("discover.manageAddons")}</Link>
            </li>
          </ul>
        )}
      </div>
    </div>
  );
}

function AddonRow({ addon }: { addon: Addon }) {
  const { name, host, status, source, capabilities } = addon;
  let statusText: string;
  let tone: string;
  if (status === "ok") {
    statusText = capabilities?.length ? capabilities.join(", ") : t("discover.addonReady");
    tone = "ok";
  } else if (status === "misconfigured") {
    statusText = t("discover.addonMisconfigured");
    tone = "bad";
  } else {
    statusText = source === "cache" ? t("discover.addonUnreachableCached") : t("discover.addonUnreachable");
    tone = "warn";
  }
  return (
    <li className={`d-health-row ${tone}`}>
      <Icon name={status === "ok" ? "check" : "close"} size={14} />
      <strong>{name}</strong>
      <span className="mono">{host}</span>
      <span className="d-health-status">{statusText}</span>
    </li>
  );
}
