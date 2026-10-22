import { useCallback, useMemo, useRef } from "react";
import { Link, useNavigation, usePage } from "../../app/router";
import { useI18n } from "../../i18n";
import { Icon } from "../../ui/Icon";
import { BulkBar, BulkBox, useBulk, type Bulk } from "../account/Bulk";
import { Empty, PageError } from "../account/Empty";
import "../account/account.css";
import { duration, Pill, useStatusLabels, useStatusStream } from "./PledgeStatus";
import type { Pledge, VaultData } from "./types";
import "./vault.css";

export const namespaces = ["vault", "profile", "resource", "bulk"];

const points = (value: number | null) => (value === null ? "∞" : value.toFixed(2));

function Summary() {
  const { t } = useI18n();
  const { data } = usePage<VaultData>();
  const stats = data.stats!;
  return (
    <section className="vault-summary glass">
      <div>
        <h2>{t("vault.dashboard.contentSection")}</h2>
        <dl className="figures">
          <div className={stats.vaulted > 0 ? "lit" : undefined}>
            <dt>{t("vault.dashboard.vaulted")}</dt>
            <dd className="mono">{stats.vaulted}</dd>
          </div>
          {stats.loading > 0 && (
            <div className="lit">
              <dt>{t("vault.dashboard.loading")}</dt>
              <dd className="mono">{stats.loading}</dd>
            </div>
          )}
          <div className={stats.expiring > 0 ? "warn" : undefined}>
            <dt>{t("vault.dashboard.expiring")}</dt>
            <dd className="mono">{stats.expiring}</dd>
          </div>
        </dl>
      </div>
      <div>
        <h2>{t("vault.dashboard.pointsSection")}</h2>
        <dl className="figures">
          <div>
            <dt>{t("profile.vault.total")}</dt>
            <dd className="mono">{points(stats.total)}</dd>
          </div>
          <div>
            <dt>{t("profile.vault.available")}</dt>
            <dd className="mono">{points(stats.available)}</dd>
          </div>
          <div>
            <dt>{t("profile.vault.funded")}</dt>
            <dd className="mono">{stats.funded.toFixed(2)}</dd>
          </div>
          <div>
            <dt>{t("profile.vault.frozen")}</dt>
            <dd className="mono">{stats.frozen.toFixed(2)}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function PledgeRow({ pledge, bulk, renew }: { pledge: Pledge; bulk: Bulk; renew: () => void }) {
  const { t, path, lang } = useI18n();
  const labels = useStatusLabels();
  const live = useStatusStream(pledge.streamUrl, renew);
  const vaulted = pledge.vaulted || live?.state === "vaulted";
  // a vaulted torrent is this page's "Saved", as the finished rows say
  const badge = !pledge.funded
    ? labels.expiring
    : vaulted
      ? labels.saved
      : pledge.streamUrl
        ? (live?.badge ?? labels.checking)
        : labels.saved;
  const moving = !vaulted && (live?.state === "caching" || live?.state === "vaulting");
  const percent = Math.round(live?.progress ?? 0);

  const text = (
    <span className="row-text">
      <span className="row-title">{pledge.name}</span>
      <span className="row-meta">
        <span className={pledge.frozen ? "vp frozen" : "vp"} title={pledge.frozen ? t("vault.pledges.frozenDesc") : undefined}>
          {pledge.frozen && <Icon name="lock" size={13} />}
          <span className="mono">{pledge.amount.toFixed(2)}</span> {t("vault.pledges.vp")}
          {pledge.frozen && <span className="visually-hidden"> ({t("vault.pledges.frozen")})</span>}
        </span>
        {!pledge.funded && pledge.expiresIn ? <span>{duration(pledge.expiresIn, lang)}</span> : null}
      </span>
      {moving && (
        <span className="pledge-progress">
          {/* the badge says the percent; this is its picture */}
          <span className="progress" aria-hidden="true">
            <span style={{ width: `${Math.max(2, percent)}%` }} />
          </span>
        </span>
      )}
    </span>
  );
  const mark = (
    <span className={vaulted ? "row-icon" : pledge.streamUrl ? "row-icon live" : "row-icon quiet"} aria-hidden="true">
      <Icon name={pledge.funded ? "vault" : "clock"} size={20} />
    </span>
  );
  if (bulk.on) {
    return (
      <label className="row">
        <BulkBox
          bulk={bulk}
          id={pledge.resourceId}
          label={pledge.name}
          disabled={pledge.frozen}
          title={pledge.frozen ? t("vault.pledges.frozenDesc") : undefined}
        />
        {text}
        <Pill badge={badge} />
      </label>
    );
  }
  return (
    <div className="row">
      <Link className="row-link" href={path(`/${pledge.resourceId}`)}>
        {mark}
        {text}
      </Link>
      <span className="row-end">
        <Pill badge={badge} />
      </span>
    </div>
  );
}

function Upsell() {
  const { t } = useI18n();
  return (
    <div className="upsell">
      <span className="row-icon" aria-hidden="true">
        <Icon name="vault" size={20} />
      </span>
      <div className="row-text">
        <strong>{t("vault.dashboard.upsellTitle")}</strong>
        <span className="muted">{t("vault.dashboard.upsellSub")}</span>
      </div>
      <a
        className="button accent"
        href="/donate"
        target="_blank"
        rel="noopener"
        data-umami-event="donate-vault"
        data-umami-event-tier="free"
      >
        <Icon name="bolt" size={17} />
        {t("vault.dashboard.upsellCTA")}
      </a>
    </div>
  );
}

function Guide() {
  const { t } = useI18n();
  const labels = useStatusLabels();
  return (
    <details className="guide glass">
      <summary>
        {t("vault.pledges.statusGuide")}
        <Icon name="chevron" size={18} />
      </summary>
      <dl>
        <div>
          <dt>
            <span className="vp frozen">
              <Icon name="lock" size={13} />
              {t("vault.pledges.vp")}
            </span>
          </dt>
          <dd>{t("vault.pledges.frozenDesc")}</dd>
        </div>
        <div>
          <dt>
            <Pill badge={labels.expiring} />
          </dt>
          <dd>{t("vault.pledges.expiringDesc")}</dd>
        </div>
        <div>
          <dt>
            <Pill badge={labels.saved} />
          </dt>
          <dd>{t("vault.pledges.claimableDesc")}</dd>
        </div>
      </dl>
    </details>
  );
}

export default function Vault() {
  const { t, path } = useI18n();
  const { data, error } = usePage<VaultData>();
  const { refresh } = useNavigation();
  const removable = useMemo(() => data.pledges.filter((p) => !p.frozen).map((p) => p.resourceId), [data]);
  const bulk = useBulk(removable);

  // Fresh status tokens come with the page. Every row whose stream was
  // refused asks at once, so one re-read a minute is plenty.
  const renewedAt = useRef(0);
  const renew = useCallback(() => {
    if (Date.now() - renewedAt.current < 60_000) return;
    renewedAt.current = Date.now();
    void refresh();
  }, [refresh]);

  return (
    <div className="wrap account-page vault-page">
      <header className="page-head">
        <div>
          <h1>{t("vault.dashboard.title")}</h1>
          <p className="lede">{t("vault.dashboard.subtitle")}</p>
        </div>
      </header>
      {data.stats && <Summary />}
      <div className={bulk.on ? "pledges-head toolbar glass" : "pledges-head"}>
        <h2>{t("vault.dashboard.pledgesTitle")}</h2>
        {removable.length > 0 && (
          <div className="toolbar-end">
            <BulkBar bulk={bulk} endpoint="/vault/remove" confirm={t("vault.bulkRemoveConfirm")} />
          </div>
        )}
      </div>
      {error && <PageError text={t(error.key)} />}
      {data.pledges.length ? (
        <ul className={bulk.on ? "rows glass selecting" : "rows glass"}>
          {data.pledges.map((pledge) => (
            <li key={pledge.resourceId}>
              <PledgeRow pledge={pledge} bulk={bulk} renew={renew} />
            </li>
          ))}
        </ul>
      ) : data.isFree ? (
        <section className="glass">
          <Upsell />
        </section>
      ) : (
        <section className="glass">
          <Empty icon="vault" title={t("vault.dashboard.emptyTitle")}>
            <p>{t("vault.dashboard.emptyHint", { Action: t("vault.keepAvailable") })}</p>
            <div className="empty-actions">
              <Link className="button accent" href={path("/")} data-umami-event="vault-empty-open-torrent">
                {t("vault.dashboard.emptyCTA")}
              </Link>
            </div>
          </Empty>
        </section>
      )}
      {data.pledges.length > 0 && <Guide />}
      <footer className="vault-foot">
        <a href={path("/instructions/vault")} target="_blank" rel="noopener" data-umami-event="instruction-vault">
          {t("vault.whatIs")}
        </a>
        <a className="button" href={path("/profile")}>
          <Icon name="arrowLeft" size={17} />
          {t("vault.pledges.backToProfile")}
        </a>
      </footer>
    </div>
  );
}
