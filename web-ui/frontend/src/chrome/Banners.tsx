import { useEffect, useState } from "react";
import { usePage } from "../app/router";
import { langPath, loadNamespaces, makeTranslator, useI18n } from "../i18n";
import { Icon } from "../ui/Icon";

const HIDE_OPEN = "open-instance-banner-hidden";

/**
 * Instance-wide notices above the page: a self-hosted instance that anyone
 * can use (no administrator password), and the offer to switch to the
 * visitor's browser language — written in that language.
 */
export function Banners() {
  const { t, path } = useI18n();
  const { session } = usePage();
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem(HIDE_OPEN) === "1";
    } catch {
      return false;
    }
  });
  const suggest = session.suggestLang;
  const [suggestReady, setSuggestReady] = useState(false);
  useEffect(() => {
    if (!suggest) return;
    let live = true;
    void loadNamespaces(suggest, ["langSuggest"]).then(() => live && setSuggestReady(true));
    return () => {
      live = false;
    };
  }, [suggest]);

  const open = session.openInstance && !hidden;
  if (!open && !(suggest && suggestReady)) return null;
  const s = suggest ? makeTranslator(suggest) : null;
  return (
    <div className="wrap banners">
      {open && (
        <div className="notice warn banner" role="note">
          <Icon name="lock" />
          <span>{t("banner.openInstance")}</span>
          <a className="button small primary" href={`${path("/profile")}#password`}>
            {t("banner.openInstanceAction")}
          </a>
          <button
            type="button"
            className="button small quiet"
            onClick={() => {
              setHidden(true);
              try {
                sessionStorage.setItem(HIDE_OPEN, "1");
              } catch {
                /* shown again on the next page */
              }
            }}
          >
            {t("banner.hideForNow")}
          </button>
        </div>
      )}
      {s && suggestReady && (
        <div className="notice banner" lang={suggest} role="note">
          <Icon name="globe" />
          <span>{s.t("langSuggest.text")}</span>
          <a className="button small primary" rel="nofollow" href={`${langPath(suggest!, session.path)}?lang=${suggest}`}>
            {s.t("langSuggest.switch")}
          </a>
          <a className="button small quiet" rel="nofollow" href={`${session.path}?lang=en`}>
            {s.t("langSuggest.stay")}
          </a>
        </div>
      )}
    </div>
  );
}
