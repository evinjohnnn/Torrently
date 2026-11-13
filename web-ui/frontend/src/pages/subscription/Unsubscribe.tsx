import { formData } from "../../app/api";
import { useNavigation, usePage } from "../../app/router";
import { useI18n } from "../../i18n";
import { Icon } from "../../ui/Icon";
import "../account/account.css";

export const namespaces = ["subscription"];

// Mirrors handlers/spa/subscription.go.
interface UnsubscribeData {
  title?: string;
  token?: string;
  done: boolean;
  failed: boolean;
}

/**
 * An email's unsubscribe link: the question, then its answer. Only the
 * button's POST removes anything, so a mail scanner opening the link
 * changes nothing.
 */
export default function Unsubscribe() {
  const { t, path } = useI18n();
  const { data } = usePage<UnsubscribeData>();
  const { submit, busy } = useNavigation();
  let body;
  if (!data.done) {
    body = (
      <>
        <h1>{t("subscription.unsubscribe.confirmTitle")}</h1>
        <p>
          {data.title
            ? t("subscription.unsubscribe.confirmText", { Title: data.title })
            : t("subscription.unsubscribe.confirmTextPlain")}
        </p>
        <button
          type="button"
          className="button accent large"
          disabled={busy}
          onClick={() =>
            void submit(path(`/subscription/unsubscribe/${encodeURIComponent(data.token ?? "")}`), formData({}))
          }
        >
          {t("subscription.unsubscribe.confirmButton")}
        </button>
      </>
    );
  } else if (data.failed) {
    body = (
      <>
        <h1>{t("subscription.unsubscribed.failedTitle")}</h1>
        <p>{t("subscription.unsubscribed.failedText")}</p>
      </>
    );
  } else {
    body = (
      <>
        <span className="solo-mark" aria-hidden="true">
          <Icon name="check" size={20} />
        </span>
        <h1>{t("subscription.unsubscribed.title")}</h1>
        {/* a second visit to a used link has nothing to name, and says so */}
        <p>
          {data.title
            ? t("subscription.unsubscribed.text", { Title: data.title })
            : t("subscription.unsubscribed.textPlain")}
        </p>
      </>
    );
  }
  return (
    <div className="wrap account-page narrow">
      <section className="solo glass">
        {body}
        {data.done && (
          <a className="button large" href={path("/profile")}>
            {t("subscription.unsubscribed.manage")}
          </a>
        )}
      </section>
    </div>
  );
}
