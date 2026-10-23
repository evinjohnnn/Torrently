import type { ReactNode } from "react";
import { Link, usePage } from "../app/router";
import { useI18n } from "../i18n";
import { Wordmark } from "./Wordmark";

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="footer-column">
      <h2>{title}</h2>
      <ul>{children}</ul>
    </div>
  );
}

function Out({ href, children }: { href: string; children: ReactNode }) {
  return (
    <li>
      <a href={href} target="_blank" rel="noopener">
        {children}
      </a>
    </li>
  );
}

function In({ href, children }: { href: string; children: ReactNode }) {
  return (
    <li>
      <Link href={href}>{children}</Link>
    </li>
  );
}

/** Tool columns in reading order, three to a row (common.ToolGroups + guides). */
const GROUPS = ["download", "stream", "alternatives", "convert", "stremio", "guides"];

/**
 * Brand, resources and legal on the left; every tool page on the right,
 * grouped by what it is for. All of them stay linked from every page: the
 * footer is the one place that does. A pane of frosted glass with the
 * wordmark behind it, half sunk below the page's end; under the home page's
 * sheet it rises from beneath the sheet's rounded edge as it scrolls in.
 */
export function Footer() {
  const { t, path } = useI18n();
  const { session } = usePage();
  const groupOf = (tool: (typeof session.tools)[number]) => (tool.guide ? "guides" : tool.group);
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-mark" aria-hidden="true">
          <Wordmark />
        </div>
        <div className="footer-glass">
          <div className="wrap footer-grid">
            <div className="footer-side">
              <p className="footer-intro">{t("footer.description")}</p>
              <div className="footer-pair">
                <Column title={t("footer.resources")}>
                  <In href={path("/about")}>{t("footer.about")}</In>
                  <In href={path("/speedtest")}>{t("footer.speedTest")}</In>
                  <Out href={session.apiDocs}>API</Out>
                  {session.support && (
                    <In href={path("/support")}>{t("footer.helpCenter")}</In>
                  )}
                </Column>
                {session.support && (
                  <Column title={t("footer.legal")}>
                    <In href={path("/legal/tos")}>{t("footer.termsOfService")}</In>
                    <In href={path("/legal/privacy")}>{t("footer.privacyPolicy")}</In>
                    <In href={path("/legal/dmca")}>{t("footer.dmca")}</In>
                    <In href={path("/legal/refund")}>{t("footer.refundPolicy")}</In>
                  </Column>
                )}
              </div>
              <div className="footer-base">
                <span>{t("footer.copyright", { Year: new Date().getFullYear() })}</span>
                <span>
                  {t("footer.filmData")}{" "}
                  <a href="https://www.themoviedb.org/" target="_blank" rel="noopener">
                    TMDB
                  </a>
                </span>
                <span className="age-mark" title={t("footer.ageMark")}>
                  {t("footer.ageMark")}
                </span>
              </div>
            </div>
            <div className="footer-groups">
              {GROUPS.map((group) => {
                const tools = session.tools.filter((tool) => groupOf(tool) === group);
                return tools.length ? (
                  <Column key={group} title={t(`footer.${group}`)}>
                    {tools.map((tool) => (
                      <In key={tool.url} href={path(`/${tool.url}`)}>
                        {t(tool.title)}
                      </In>
                    ))}
                  </Column>
                ) : null;
              })}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
