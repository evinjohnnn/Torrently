import { Link, usePage } from "../../app/router";
import { useI18n } from "../../i18n";
import { Icon } from "../../ui/Icon";
import type { EmailVerifiedData } from "./types";
import "./profile.css";

export const namespaces = ["profile"];

/**
 * Where a verification link lands: a page of its own, readable without a
 * session, saying only whether the link worked.
 */
export default function EmailVerified() {
  const { t, path } = useI18n();
  const { data } = usePage<EmailVerifiedData>();
  return (
    <div className="wrap narrow pf-page">
      <section className="pf-result glass" aria-labelledby="pf-result-title">
        <span className={data.ok ? "pf-result-mark" : "pf-result-mark error"} aria-hidden="true">
          <Icon name={data.ok ? "check" : "alert"} size={28} />
        </span>
        <h1 id="pf-result-title">{t("profile.email.resultTitle")}</h1>
        <p className="lede" role="status">
          {t(data.ok ? "profile.email.verified" : "profile.email.expired")}
        </p>
        <Link className="button accent" href={path("/profile")}>
          {t("profile.email.backToProfile")}
        </Link>
      </section>
    </div>
  );
}
