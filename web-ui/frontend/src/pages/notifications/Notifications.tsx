import { formData } from "../../app/api";
import { useNavigation, usePage } from "../../app/router";
import { useI18n } from "../../i18n";
import { timeAgo } from "../../ui/format";
import { Empty } from "../account/Empty";
import "../account/account.css";
import "./notifications.css";

export const namespaces = ["notifications"];

// Mirrors handlers/spa/notifications.go.
interface NotificationsData {
  items: { title: string; body: string; read: boolean; createdAt: string }[];
}

export default function Notifications() {
  const { t, path, lang } = useI18n();
  const { data } = usePage<NotificationsData>();
  const { submit, busy } = useNavigation();
  return (
    <div className="wrap account-page notifications-page">
      <header className="page-head">
        <div>
          <h1>{t("notifications.title")}</h1>
          <p className="lede">{t("notifications.subtitle")}</p>
        </div>
        {data.items.length > 0 && (
          // the page comes back with the nav's unread count cleared too
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() => void submit(path("/notifications/read"), formData({}), { scroll: false })}
          >
            {t("notifications.markAllRead")}
          </button>
        )}
      </header>
      {data.items.length ? (
        <ul className="rows glass feed">
          {data.items.map((item, index) => (
            <li key={`${item.createdAt}-${index}`} className={item.read ? "note" : "note unread"}>
              <div className="note-head">
                {!item.read && <span className="note-dot" aria-hidden="true" />}
                <h2 className="note-title">
                  {item.title}
                  {!item.read && <span className="visually-hidden"> ({t("notifications.unread")})</span>}
                </h2>
                <time className="note-time" dateTime={item.createdAt}>
                  {timeAgo(item.createdAt, lang)}
                </time>
              </div>
              {/* markup the server escaped when it stored the message
                  (handlers/notifications.Item), as the template prints it */}
              <div className="note-body" dangerouslySetInnerHTML={{ __html: item.body }} />
            </li>
          ))}
        </ul>
      ) : (
        <section className="glass">
          <Empty icon="bell" title={t("notifications.emptyTitle")}>
            <p>{t("notifications.emptyHint")}</p>
          </Empty>
        </section>
      )}
    </div>
  );
}
