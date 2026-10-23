import { Link, usePage } from "../../app/router";
import { useI18n } from "../../i18n";
import { Icon } from "../../ui/Icon";
import type { PaymentsData } from "./types";
import "./profile.css";

export const namespaces = ["profile"];

const TONE: Record<string, string> = { paid: "olive", partial: "honey", failed: "brick" };

/** The crypto payment history; Patreon keeps its own on patreon.com. */
export default function Payments() {
  const { t, path, lang } = useI18n();
  const { data, error } = usePage<PaymentsData>();
  const when = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" });
  return (
    <div className="wrap pf-page pf-narrow">
      <header className="pf-head">
        <Link className="pf-link pf-back" href={path("/profile")}>
          <Icon name="arrowLeft" size={16} />
          {t("profile.payments.backToProfile")}
        </Link>
        <h1>{t("profile.payments.title")}</h1>
        <p className="lede">{t("profile.payments.subtitle")}</p>
      </header>
      {error && (
        <div className="notice error" role="alert">
          <Icon name="alert" />
          <span>{t(error.key)}</span>
        </div>
      )}
      <section className="pf-section glass" aria-label={t("profile.payments.title")}>
        {data.rows.length ? (
          <table className="pf-table">
            <thead>
              <tr>
                <th scope="col">{t("profile.payments.date")}</th>
                <th scope="col">{t("profile.payments.tier")}</th>
                <th scope="col">{t("profile.payments.method")}</th>
                <th scope="col">{t("profile.payments.period")}</th>
                <th scope="col" className="pf-num">
                  {t("profile.payments.amount")}
                </th>
                <th scope="col">{t("profile.payments.status")}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.paymentId || row.date}>
                  <td data-label={t("profile.payments.date")}>
                    <time dateTime={row.date}>{when.format(new Date(row.date))}</time>
                  </td>
                  <td data-label={t("profile.payments.tier")} className="pf-tier">
                    {row.tier}
                  </td>
                  <td data-label={t("profile.payments.method")}>{row.method}</td>
                  <td data-label={t("profile.payments.period")}>
                    {t("profile.payments.days", { Days: row.periodDays })}
                  </td>
                  <td data-label={t("profile.payments.amount")} className="pf-num mono">
                    ${row.amountUsd}
                  </td>
                  <td data-label={t("profile.payments.status")}>
                    {row.status === "pending" ? (
                      <Link
                        className="chip pf-chip-link"
                        href={`${path("/donate/crypto/success")}?payment_id=${encodeURIComponent(row.paymentId)}`}
                        title={t("profile.payments.track")}
                      >
                        <Icon name="eye" size={14} />
                        {t("profile.payments.st.pending")}
                      </Link>
                    ) : (
                      <span className={`chip ${TONE[row.status] ?? ""}`}>{t(`profile.payments.st.${row.status}`)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          !error && <p className="pf-intro">{t("profile.payments.empty")}</p>
        )}
      </section>
      <div className="pf-actions">
        <Link className="button accent" href={path("/donate")}>
          {t("profile.payments.buyMore")}
        </Link>
      </div>
    </div>
  );
}
