import { useEffect, useRef, useState } from "react";
import { Link, usePage } from "../../app/router";
import { useI18n } from "../../i18n";
import { Icon } from "../../ui/Icon";
import { PageHead, Sheet, printf } from "../content/kit";
import "./speedtest.css";

export const namespaces = ["speedtest"];

interface ResultData {
  speed: string;
  premiumSpeed: string;
  hasPremium: boolean;
  speedBoost?: string;
  rateLimit: number;
  rateLimited: boolean;
  quality: { name: string; minSpeed: number; ok: boolean }[];
  plans: { name: string; label: string; isCurrent: boolean; supported: boolean }[];
  shareUrl?: string;
}

function Mark({ ok }: { ok: boolean }) {
  return (
    <span className={ok ? "speed-mark ok" : "speed-mark"} aria-hidden="true">
      <Icon name={ok ? "check" : "close"} size={15} />
    </span>
  );
}

function Share({ url }: { url: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = () =>
    void navigator.clipboard?.writeText(location.origin + url).then(() => {
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    });
  return (
    <button type="button" className="button" onClick={copy} data-umami-event="speedtest-share">
      <Icon name={copied ? "check" : "share"} size={17} />
      <span aria-live="polite">{t(copied ? "speedtest.copied" : "speedtest.shareResult")}</span>
    </button>
  );
}

export default function Result() {
  const { t, path } = useI18n();
  const { data } = usePage<ResultData>();
  return (
    <>
      <PageHead title={t("speedtest.title")} lede={t("speedtest.subtitle")} />
      <Sheet>
        <div className="speed-pane glass">
          {data.hasPremium ? (
            <>
              <dl className="speed-pair">
                <div>
                  <dt>{t("speedtest.standard")}</dt>
                  <dd className="speed-figure">
                    <span className="mono">{data.speed}</span>
                    <span className="speed-unit">Mbps</span>
                  </dd>
                </div>
                <div className="premium">
                  <dt>{t("speedtest.premium")}</dt>
                  <dd className="speed-figure">
                    <span className="mono">{data.premiumSpeed}</span>
                    <span className="speed-unit">Mbps</span>
                  </dd>
                </div>
              </dl>
              {data.speedBoost && (
                <p className="chip olive speed-boost">
                  <Icon name="bolt" size={15} />
                  {printf(t("speedtest.fasterWithPremium"), data.speedBoost)}
                </p>
              )}
              <p className="fine">{t("speedtest.premiumNote")}</p>
            </>
          ) : (
            <p className="speed-figure">
              <span className="mono">{data.speed}</span>
              <span className="speed-unit">Mbps</span>
            </p>
          )}
        </div>

        <section className="speed-section">
          <h2>{t("speedtest.videoQuality")}</h2>
          <ul className="speed-rows">
            {data.quality.map((q) => (
              <li key={q.name} className={q.ok ? "" : "off"}>
                <Mark ok={q.ok} />
                <span className="speed-row-name">{q.name}</span>
                <span className="speed-row-note">{printf(t("speedtest.needs"), q.minSpeed.toFixed(1))}</span>
              </li>
            ))}
          </ul>
        </section>

        {data.plans.length > 0 && (
          <section className="speed-section">
            <h2>{t("speedtest.planRecommendations")}</h2>
            <ul className="speed-rows">
              {data.plans.map((plan) => (
                <li key={plan.name} className={plan.isCurrent ? "current" : ""}>
                  <Mark ok={plan.supported} />
                  <span className="speed-row-name">{plan.name}</span>
                  <span className="speed-row-note mono">{plan.label}</span>
                  {plan.isCurrent ? (
                    <span className="chip olive">{t("speedtest.yourPlan")}</span>
                  ) : plan.supported ? (
                    <Link className="button small quiet" href={path("/donate")} data-umami-event="donate-speedtest">
                      {t("speedtest.upgrade")}
                    </Link>
                  ) : (
                    <span />
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {data.rateLimited && (
          <div className="notice warn speed-section">
            <Icon name="alert" />
            <p>{printf(t("speedtest.rateLimited"), data.rateLimit)}</p>
          </div>
        )}

        <div className="page-actions">
          <Link className="button primary" href={`${path("/speedtest")}?again`}>
            <Icon name="refresh" size={17} />
            {t("speedtest.runAgain")}
          </Link>
          {data.shareUrl && <Share url={data.shareUrl} />}
        </div>
      </Sheet>
    </>
  );
}
