import { useState } from "react";
import { Link, usePage } from "../../app/router";
import { useI18n } from "../../i18n";
import { Icon } from "../../ui/Icon";
import { timeAgo } from "../../ui/format";
import type { HomeData } from "./types";

export function ContinueWatching() {
  const { t, path, lang } = useI18n();
  const { data } = usePage<HomeData>();
  if (!data.continueWatching.length) return null;
  return (
    <section className="ribbon-section" aria-labelledby="continue-title">
      <div className="wrap">
        <h2 id="continue-title" className="ribbon-title">
          {t("library.continueWatching")}
        </h2>
        <ul className="ribbon">
          {data.continueWatching.map((item) => (
            <li key={`${item.resourceId}/${item.path}`}>
              <Link
                className="poster-card"
                href={`${path(`/${item.resourceId}`)}?file=${encodeURIComponent(item.path)}#action=stream`}
              >
                <span className="poster">
                  <span className="poster-fallback">{item.title}</span>
                  <img
                    src={item.poster}
                    alt=""
                    loading="lazy"
                    onError={(event) => event.currentTarget.remove()}
                  />
                  {item.adult && <span className="adult-mark">18+</span>}
                  <span className="poster-progress" aria-hidden="true">
                    <span style={{ width: `${item.progress}%` }} />
                  </span>
                </span>
                <span className="poster-title">{item.title}</span>
                <span className="poster-meta">{timeAgo(item.updatedAt, lang)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const COLLAPSED = "onboarding-checklist-collapsed";

export function Onboarding() {
  const { t, tn, path } = useI18n();
  const { data } = usePage<HomeData>();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED) === "1";
    } catch {
      return false;
    }
  });
  const checklist = data.onboarding;
  if (!checklist) return null;
  const toggle = () => {
    setCollapsed(!collapsed);
    try {
      localStorage.setItem(COLLAPSED, collapsed ? "0" : "1");
    } catch {
      /* private mode: the choice lasts until reload */
    }
  };
  return (
    <section className="onboarding glass" aria-labelledby="onboarding-title">
      <header>
        <h2 id="onboarding-title">{t("onboarding.title")}</h2>
        <span className="muted">{t("onboarding.progress", { Done: checklist.done, Total: checklist.total })}</span>
        <div className="progress" aria-hidden="true">
          <span style={{ width: `${(checklist.done / Math.max(checklist.total, 1)) * 100}%` }} />
        </div>
        <button
          type="button"
          className="icon-button"
          aria-expanded={!collapsed}
          aria-controls="onboarding-steps"
          aria-label={t("onboarding.toggle")}
          onClick={toggle}
        >
          <Icon name="chevron" style={{ transform: collapsed ? "rotate(-90deg)" : undefined }} />
        </button>
      </header>
      {!collapsed && (
        <ul id="onboarding-steps">
          {checklist.steps.map((step) => {
            const href = step.locked
              ? path("/donate")
              : step.path
                ? path(step.path) + (step.fragment ? `#${step.fragment.replace(/^#/, "")}` : "")
                : null;
            const status = step.done
              ? "onboarding.status.done"
              : step.locked
                ? "onboarding.status.locked"
                : "onboarding.status.todo";
            return (
              <li key={step.key} className={step.done ? "done" : step.locked ? "locked" : ""}>
                <span className="onboarding-mark" aria-hidden="true">
                  <Icon name={step.done ? "check" : step.locked ? "lock" : "plus"} size={16} />
                </span>
                <div>
                  <span className="visually-hidden">{t(status)} </span>
                  <strong>{t(step.title)}</strong>
                  {step.locked && <span className="chip honey">{t("onboarding.proBadge")}</span>}
                  <p>{t(step.desc)}</p>
                </div>
                {!step.done && href && (
                  <Link className="button small" href={href}>
                    {step.locked
                      ? t("onboarding.proCta")
                      : step.ctaCount
                        ? tn(step.cta, step.ctaCount)
                        : t(step.cta)}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
