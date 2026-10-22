import { useState, type FormEvent } from "react";
import { formData } from "../../app/api";
import { useNavigation, usePage } from "../../app/router";
import { useI18n } from "../../i18n";
import { Icon } from "../../ui/Icon";
import { Frame } from "./Frame";
import "./auth.css";

export const namespaces = ["auth"];

/** /login on a self-hosted instance with an administrator password. */
export default function Password() {
  const { t, path } = useI18n();
  const { data } = usePage<{ err?: string }>();
  const { submit, busy } = useNavigation();
  const [password, setPassword] = useState("");
  const send = (event: FormEvent) => {
    event.preventDefault();
    // the handler redirects to where the visitor was going, or answers
    // this page again with the reason
    void submit(path("/login") + location.search, formData({ password }));
  };
  return (
    <Frame title={t("auth.password.title")} subtitle={t("auth.password.subtitle")}>
      {data.err && (
        <p className="notice error" role="alert">
          <Icon name="alert" />
          <span>{t(data.err)}</span>
        </p>
      )}
      <form className="auth-email" onSubmit={send}>
        <div className="auth-row">
          <label className="visually-hidden" htmlFor="password">
            {t("auth.password.placeholder")}
          </label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t("auth.password.placeholder")}
          />
          <button type="submit" className="button primary large" disabled={busy}>
            {t("auth.password.submit")}
          </button>
        </div>
      </form>
    </Frame>
  );
}
