import { useRef, useState, type FormEvent } from "react";
import { formData } from "../../app/api";
import { Link, useNavigation, usePage } from "../../app/router";
import { turnstileToken } from "../../jobs/turnstile";
import { useI18n } from "../../i18n";
import { Icon } from "../../ui/Icon";
import { ErrorNotice, PageHead, Sheet } from "../content/kit";
import "./support.css";

export const namespaces = ["support"];

interface Form {
  cause: number;
  subject: string;
  description: string;
  infohash: string;
  filename: string;
  email: string;
  work: string;
}

interface SupportData {
  causes: { id: number; key: string }[];
  form: Form;
  turnstile?: string;
}

// Which fields each cause asks for, as the classic form's data-select /
// data-required(-select) attributes said (assets/src/js/app/support.js).
// The infohash is asked for every cause but required only for complaints
// and errors — mirrored server-side by handlers/support needsInfohash.
const needsInfohash = (cause: number) => cause >= 0 && cause <= 2;
const asksWork = (cause: number) => cause === 0;

function Success() {
  const { t, path } = useI18n();
  return (
    <div className="support-done glass">
      <span className="support-done-mark" aria-hidden="true">
        <Icon name="check" size={26} />
      </span>
      <p>{t("support.successMessage")}</p>
      <Link className="button" href={path("/support")}>
        {t("support.sendAnother")}
      </Link>
    </div>
  );
}

function SupportForm() {
  const { t, path } = useI18n();
  const { data, error } = usePage<SupportData>();
  const { submit, busy } = useNavigation();
  const [form, setForm] = useState<Form>(data.form);
  const [sending, setSending] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const challenge = useRef<HTMLDivElement>(null);
  const chosen = form.cause >= 0;
  const set = (name: keyof Form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [name]: name === "cause" ? Number(event.target.value) : event.target.value }));

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setCheckFailed(false);
    try {
      const fields: Record<string, string> = Object.fromEntries(
        Object.entries(form).map(([name, value]) => [name, String(value)]),
      );
      if (data.turnstile && challenge.current) {
        try {
          fields["cf-turnstile-response"] = await turnstileToken(data.turnstile, challenge.current);
        } catch {
          setCheckFailed(true);
          return;
        }
      }
      await submit(path("/support"), formData(fields), { scroll: true });
    } finally {
      setSending(false);
    }
  };

  return (
    <form className="support-form" onSubmit={(event) => void send(event)}>
      {(error || checkFailed) && <ErrorNotice>{t(error?.key ?? "error.turnstile_failed")}</ErrorNotice>}
      <div className="field">
        <select
          className="select"
          aria-label={t("support.selectCause")}
          name="cause" value={form.cause} onChange={set("cause")} required>
          {data.causes.map((cause) => (
            <option key={cause.id} value={cause.id} disabled={cause.id === -1}>
              {t(cause.key)}
            </option>
          ))}
        </select>
      </div>
      {chosen && (
        <>
          <div className="field">
            <label htmlFor="support-subject">{t("support.subject")}</label>
            <input id="support-subject" className="input" name="subject" value={form.subject} onChange={set("subject")} required />
          </div>
          <div className="field">
            <label htmlFor="support-description">{t("support.description")}</label>
            <textarea
              id="support-description"
              className="textarea"
              name="description"
              rows={5}
              value={form.description}
              onChange={set("description")}
              required
            />
          </div>
          <div className="support-pair">
            <div className="field">
              <label htmlFor="support-infohash">{t("support.infohash")}</label>
              <input
                id="support-infohash"
                className="input mono-input"
                name="infohash"
                value={form.infohash}
                onChange={set("infohash")}
                pattern=".*[0-9a-fA-F]{40}.*"
                required={needsInfohash(form.cause)}
                spellCheck={false}
                autoCapitalize="off"
              />
            </div>
            <div className="field">
              <label htmlFor="support-filename">{t("support.filename")}</label>
              <input id="support-filename" className="input" name="filename" value={form.filename} onChange={set("filename")} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="support-email">{t("support.email")}</label>
            <input
              id="support-email"
              className="input"
              type="email"
              name="email"
              autoComplete="email"
              value={form.email}
              onChange={set("email")}
              required
            />
          </div>
          {asksWork(form.cause) && (
            <div className="field">
              <label htmlFor="support-work">{t("support.work")}</label>
              <input id="support-work" className="input" name="work" value={form.work} onChange={set("work")} />
            </div>
          )}
          <div className="support-actions">
            <div ref={challenge} className="support-challenge" />
            <button type="submit" className="button primary large" disabled={sending || busy}>
              {sending ? <span className="spinner" aria-hidden="true" /> : <Icon name="mail" size={18} />}
              {t("support.submit")}
            </button>
          </div>
        </>
      )}
    </form>
  );
}

export default function Support() {
  const { t } = useI18n();
  const { view } = usePage<SupportData>();
  return (
    <>
      <PageHead title={t("support.title")} lede={t("support.subtitle")} />
      <Sheet>{view === "support/success" ? <Success /> : <SupportForm />}</Sheet>
    </>
  );
}
