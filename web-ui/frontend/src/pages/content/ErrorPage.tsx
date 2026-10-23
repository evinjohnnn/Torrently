import { Link, usePage } from "../../app/router";
import { useI18n } from "../../i18n";
import { Icon } from "../../ui/Icon";
import "./content.css";

export const namespaces: string[] = [];

/** What every failing route shows (web.ErrorHandler): the reason and a way home. */
export default function ErrorPage() {
  const { t, path } = useI18n();
  const { error, status } = usePage();
  return (
    <section className="error-page">
      <div className="wrap">
        <div className="error-pane glass">
          {status >= 400 && <p className="error-code mono">{status}</p>}
          <h1>{t(error?.key ?? "error.generic", error?.args ?? undefined)}</h1>
          <Link className="button primary large" href={path("/")}>
            <Icon name="arrowLeft" size={18} />
            {t("error.back_home")}
          </Link>
        </div>
      </div>
    </section>
  );
}
