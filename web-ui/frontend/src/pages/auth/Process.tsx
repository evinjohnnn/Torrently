import { useEffect, useRef, useState } from "react";
import { Link, useNavigation, usePage } from "../../app/router";
import { useI18n } from "../../i18n";
import { describeAuthError, nextLocation } from "./errors";
import { fill, Frame, Progress, type Line } from "./Frame";
import * as st from "./supertokens";
import "./auth.css";

export const namespaces = ["auth"];

/** /auth/verify (a magic link) and /auth/callback/* (Google, Patreon). */
export function Verify() {
  const { t } = useI18n();
  const { data, session, view } = usePage<{ returnUrl: string }>();
  const [line, setLine] = useState<Line | null>(null);
  const started = useRef(false);
  const callback = view === "auth/callback";
  const name = callback ? "callback" : "verify";

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const tf = (key: string, value?: string | number) => fill(t(key), value);
    setLine({
      level: "inprogress",
      message: t(callback ? "auth.progress.checkingAuthCode" : "auth.progress.checkingMagicLink"),
    });
    const tokens = { csrf: session.csrf, domain: session.domain };
    (callback ? st.handleCallback(tokens) : st.handleMagicLinkClicked(tokens)).then(
      (res: { status?: string } | undefined) => {
        if (!res || res.status === "OK") {
          setLine({ level: "done", message: t(`auth.progress.${name}Successful`) });
          // a new session: the next page loads in full, tokens and all
          location.assign(data.returnUrl);
        } else if (res.status === "RESTART_FLOW_ERROR") {
          setLine({ level: "error", message: t("auth.progress.magicLinkExpired") });
        } else {
          setLine({ level: "error", message: t(`auth.progress.${name}Failed`) });
        }
      },
      async (err) => setLine({ level: "error", message: (await describeAuthError(err, tf)).message }),
    );
  }, [callback, data.returnUrl, name, session, t]);

  return (
    <Frame title={t("auth.verify.title")} subtitle={t("auth.verify.subtitle")}>
      <Progress line={line} />
      {line?.level === "done" && (
        <a className="button primary" href={data.returnUrl}>
          {t("auth.verify.next")}
        </a>
      )}
    </Frame>
  );
}

/** /logout: SuperTokens signs out here; without it the handler already did. */
export function Logout() {
  const { t, path } = useI18n();
  const { session } = usePage();
  const { refresh } = useNavigation();
  const [line, setLine] = useState<Line | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const tf = (key: string, value?: string | number) => fill(t(key), value);
    setLine({ level: "inprogress", message: t("auth.progress.loggingOut") });
    if (!session.superTokens) {
      setLine({ level: "done", message: t("auth.progress.logoutSuccessful") });
      return;
    }
    st.logout({ csrf: session.csrf, domain: session.domain }).then(
      () => {
        setLine({ level: "done", message: t("auth.progress.logoutSuccessful") });
        // the navbar still shows the account until the page is read again
        void refresh();
      },
      async (err) => setLine({ level: "error", message: (await describeAuthError(err, tf)).message }),
    );
  }, [refresh, session, t]);

  return (
    <Frame title={t("auth.logout.title")} subtitle={t("auth.logout.subtitle")}>
      <Progress line={line} />
      {line?.level === "done" && (
        <div className="auth-links">
          <Link className="button primary" href={path("/login")}>
            {t("auth.logout.loginAgain")}
          </Link>
          <Link className="button quiet" href={path("/")}>
            {t("auth.logout.goHome")}
          </Link>
        </div>
      )}
    </Frame>
  );
}

/**
 * The interstitial the server shows in place of any page whose access token
 * expired: refresh, then reload; a refresh that finds no session goes to the
 * login form; one that fails is an outage (lib/auth/nextLocation.js).
 */
export function Refresh() {
  const { t, path } = useI18n();
  const { session } = usePage();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    st.refresh({ csrf: session.csrf, domain: session.domain }).then(
      (refreshed) => {
        const next = nextLocation(Boolean(refreshed), location);
        if (next === null) location.reload();
        else location.replace(next);
      },
      (error) => {
        console.error(error);
        setFailed(true);
      },
    );
  }, [session]);
  if (!failed) {
    return (
      <div className="wrap auth-page">
        <span className="spinner" aria-label={t("auth.refresh.title")} />
      </div>
    );
  }
  return (
    <Frame title={t("error.service_unavailable")}>
      <Link className="button primary" href={path("/")}>
        {t("error.back_home")}
      </Link>
    </Frame>
  );
}

export default Verify;
