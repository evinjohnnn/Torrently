import { useState, type FormEvent } from "react";
import { usePage } from "../../app/router";
import { useI18n } from "../../i18n";
import { Icon } from "../../ui/Icon";
import { describeAuthError } from "./errors";
import { fill, Frame, Progress, type Line } from "./Frame";
import { sendMagicLink, signInWith } from "./supertokens";
import "./auth.css";

export const namespaces = ["auth"];

interface LoginData {
  instruction: string;
  card?: { note: string; intro: string; features: string[] };
}

const EMAIL_KEY = "auth.loginEmail";
const PROVIDERS: Record<string, string> = { google: "Google", patreon: "Patreon" };

function restoredEmail() {
  try {
    const email = sessionStorage.getItem(EMAIL_KEY) ?? "";
    sessionStorage.removeItem(EMAIL_KEY);
    return email;
  } catch {
    return "";
  }
}

/** /login with SuperTokens: Google, Patreon, or a link by email. */
export default function Login() {
  const { t, rich, path } = useI18n();
  const { data, session } = usePage<LoginData>();
  const [email, setEmail] = useState(restoredEmail);
  const [line, setLine] = useState<Line | null>(null);
  const tokens = { csrf: session.csrf, domain: session.domain };
  const tf = (key: string, value?: string | number) => fill(t(key), value);

  const provider = async (id: string) => {
    setLine({ level: "inprogress", message: tf("auth.progress.redirectingTo", PROVIDERS[id]) });
    try {
      await signInWith(id, tokens);
    } catch (err) {
      const e = err as { statusText?: string; message?: string };
      setLine({ level: "error", message: e.statusText || e.message || tf("auth.progress.redirectFailed", PROVIDERS[id]) });
    }
  };
  const send = async (event: FormEvent) => {
    event.preventDefault();
    setLine({ level: "inprogress", message: tf("auth.progress.sendingMagicLink", email) });
    try {
      await sendMagicLink(email, tokens);
      setLine({ level: "done", message: tf("auth.progress.magicLinkSent", email) });
    } catch (err) {
      const { message, reloading } = await describeAuthError(err, tf);
      if (reloading) {
        try {
          sessionStorage.setItem(EMAIL_KEY, email);
        } catch {
          /* the reloaded page starts empty */
        }
      }
      setLine({ level: "error", message });
    }
  };

  return (
    <Frame title={t("auth.login.title")} subtitle={t("auth.login.subtitle")}>
      {data.instruction === "stremio-configure" && (
        <p className="notice">
          <Icon name="info" />
          <span>
            <strong>{t("auth.login.note")}</strong> {t("auth.login.stremioNote")}
          </span>
        </p>
      )}
      {data.card && (
        <div className="notice">
          <Icon name="info" />
          <div>
            <p>
              <strong>{t("auth.login.note")}</strong> {t(data.card.note)}
            </p>
            <p>{t(data.card.intro)}</p>
            <ul>
              {data.card.features.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <div className="auth-providers">
        <button type="button" className="button large" onClick={() => void provider("google")}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h6a5.1 5.1 0 0 1-2.2 3.4v2.8h3.6c2.1-2 3.2-4.8 3.2-8.2Z" />
            <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.6H2.1v2.9A11 11 0 0 0 12 23Z" />
            <path fill="#FBBC05" d="M5.8 14c-.2-.7-.4-1.3-.4-2s.1-1.4.4-2V7.1H2.1A11 11 0 0 0 1 12c0 1.8.4 3.4 1.1 4.9L5.8 14Z" />
            <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1L5.8 10c.9-2.7 3.3-4.6 6.2-4.6Z" />
          </svg>
          {t("auth.login.google")}
        </button>
        <button type="button" className="button large" onClick={() => void provider("patreon")}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="14.5" cy="9" r="6" fill="currentColor" />
            <rect x="3" y="3" width="4" height="18" fill="currentColor" />
          </svg>
          {t("auth.login.patreon")}
        </button>
      </div>
      <p className="auth-divider">
        <span>{t("auth.login.orEmail")}</span>
      </p>
      <form className="auth-email" onSubmit={(event) => void send(event)}>
        <div className="field">
          <label htmlFor="email">{t("auth.login.emailPrompt")}</label>
          <div className="auth-row">
            <input
              id="email"
              className="input"
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t("auth.login.emailPlaceholder")}
            />
            <button type="submit" className="button primary large" disabled={line?.level === "inprogress"}>
              {t("auth.login.send")}
            </button>
          </div>
          <p className="fine">{t("auth.login.emailHint")}</p>
        </div>
      </form>
      <Progress line={line} />
      <p className="fine auth-legal">
        {rich("auth.login.legalNotice", { TosURL: path("/legal/tos"), PrivacyURL: path("/legal/privacy") })}
      </p>
    </Frame>
  );
}
