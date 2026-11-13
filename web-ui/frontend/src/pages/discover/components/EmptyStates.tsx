import { useState, type MouseEvent, type ReactNode } from "react";
import { Link } from "../../../app/router";
import { Icon, type IconName } from "../../../ui/Icon";
import { langPath, t, tf } from "../lib/env.ts";
import type { Catalog } from "../types.ts";

/** A quiet message in the middle of the page, with what to do about it. */
export function Empty({
  icon,
  tone,
  title,
  children,
  action,
}: {
  icon?: IconName;
  tone?: "honey" | "olive";
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="d-empty">
      {icon && (
        <span className={tone ? `d-empty-mark ${tone}` : "d-empty-mark"}>
          <Icon name={icon} size={26} />
        </span>
      )}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function LoadMore({ onLoadMore }: { onLoadMore: () => void }) {
  return (
    <div className="d-more">
      <button type="button" className="button" onClick={onLoadMore}>
        {t("discover.loadMore")}
      </button>
    </div>
  );
}

export function LoadingSpinner({ label = t("discover.loadingCatalogs") }: { label?: string }) {
  return (
    <div className="d-loading" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function NoAddons() {
  return (
    <Empty
      icon="puzzle"
      title={t("discover.noAddonsTitle")}
      action={
        <Link className="button primary" href={langPath("/profile")}>
          {t("discover.goToProfile")}
        </Link>
      }
    >
      {t("discover.noAddonsDesc")}
    </Empty>
  );
}

export function NoCatalogs() {
  return (
    <Empty
      icon="puzzle"
      title={t("discover.noCatalogsTitle")}
      action={
        <Link className="button primary" href={langPath("/profile")}>
          {t("discover.goToProfile")}
        </Link>
      }
    >
      {t("discover.noCatalogsDesc")}
    </Empty>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Empty
      icon="alert"
      tone="honey"
      title={t("discover.errorTitle")}
      action={
        <button type="button" className="button primary" onClick={onRetry}>
          {t("discover.retry")}
        </button>
      }
    >
      {message || t("discover.errorDefault")}
    </Empty>
  );
}

/** A retry button that shows it is working while `onRetry` runs. */
export function RetryButton({ onRetry, className = "button" }: { onRetry?: () => Promise<void> | void; className?: string }) {
  const [retrying, setRetrying] = useState(false);
  const retry = async (event: MouseEvent) => {
    event.stopPropagation();
    if (retrying || !onRetry) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };
  return (
    <button type="button" className={className} onClick={retry} disabled={retrying}>
      {retrying ? <span className="spinner" aria-hidden="true" /> : <Icon name="refresh" size={16} />}
      {t("discover.retry")}
    </button>
  );
}

// Shown in the catalog grid area when the selected catalog belongs to an
// addon that is currently unreachable. Distinct from generic "No items
// found" so users see why nothing loads instead of suspecting the site.
export function CatalogUnavailable({ catalog, onRetry }: { catalog: Catalog | null; onRetry: () => Promise<void> }) {
  return (
    <Empty
      icon="alert"
      tone="honey"
      title={t("discover.catalogTemporarilyUnavailable")}
      action={<RetryButton onRetry={onRetry} className="button primary" />}
    >
      {catalog?.addonName
        ? tf("discover.catalogUnavailableBody", catalog.addonName)
        : t("discover.catalogUnavailableBodyGeneric")}
    </Empty>
  );
}

export function NoResults({ query }: { query: string }) {
  return (
    <Empty icon="search" title={t("discover.noResultsTitle")}>
      {tf("discover.noResultsDesc", query)}
    </Empty>
  );
}
