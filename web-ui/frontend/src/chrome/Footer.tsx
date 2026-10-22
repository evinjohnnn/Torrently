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

export function Footer() {
  const { t, path } = useI18n();
  const { session } = usePage();
  const tools = session.tools.filter((tool) => !tool.guide);
  const guides = session.tools.filter((tool) => tool.guide);
  return (
    <footer className="footer">
      <div className="wrap footer-grid">
        <div className="footer-intro">
          <Link href={path("/")} aria-label="Torrently">
            <Wordmark />
          </Link>
          <p>{t("footer.description")}</p>
        </div>
        <Column title={t("footer.tools")}>
          {tools.map((tool) => (
            <In key={tool.url} href={path(`/${tool.url}`)}>
              {t(tool.title)}
            </In>
          ))}
        </Column>
        <Column title={t("footer.guides")}>
          {guides.map((tool) => (
            <In key={tool.url} href={path(`/${tool.url}`)}>
              {t(tool.title)}
            </In>
          ))}
        </Column>
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
      <div className="wrap footer-base">
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
    </footer>
  );
}
