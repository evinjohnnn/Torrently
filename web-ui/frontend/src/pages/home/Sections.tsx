import { useState } from "react";
import { Link, usePage } from "../../app/router";
import { useI18n } from "../../i18n";
import { Icon } from "../../ui/Icon";
import type { HomeData, Section, Step } from "./types";

// ───────── shared ─────────

function SectionHead({ title, subtitle, rich }: { title: string; subtitle?: string; rich?: boolean }) {
  const i18n = useI18n();
  return (
    <div className="section-head">
      <h2>{i18n.t(title)}</h2>
      {subtitle && <p>{rich ? i18n.rich(subtitle) : i18n.t(subtitle)}</p>}
    </div>
  );
}

function Steps({ steps, rich }: { steps: Step[]; rich?: boolean }) {
  const i18n = useI18n();
  return (
    <ol className="steps">
      {steps.map((step, index) => (
        <li key={step.title} className="step">
          <span className="step-number" aria-hidden="true">
            {String(index + 1).padStart(2, "0")}
          </span>
          <h3>{i18n.t(step.title)}</h3>
          <p>{rich ? i18n.rich(step.text) : i18n.t(step.text)}</p>
        </li>
      ))}
    </ol>
  );
}

/** "Not sure what to watch?" → Discover, or on Stremio pages, the addon. */
function NextStep({ kind }: { kind: "discover" | "stremio" }) {
  const { t, path } = useI18n();
  const key = kind === "stremio" ? "tool.stremioCta" : "tool.discoverCta";
  const href = kind === "stremio" ? path("/stremio/configure") : path("/discover");
  return (
    <div className="next-step">
      <h3>{t(`${key}.title`)}</h3>
      <p>{t(`${key}.text`)}</p>
      {kind === "stremio" ? (
        <a className="button primary large" href={href}>
          {t(`${key}.button`)}
          <Icon name="arrow" size={18} />
        </a>
      ) : (
        <Link className="button primary large" href={href}>
          {t(`${key}.button`)}
          <Icon name="arrow" size={18} />
        </Link>
      )}
    </div>
  );
}

// ───────── home ─────────

export function HowItWorks() {
  return (
    <section id="how" className="section">
      <div className="wrap">
        <SectionHead title="about.how.title" subtitle="about.how.subtitle" />
        <Steps
          steps={[1, 2, 3].map((n) => ({
            title: `about.how.step${n}.title`,
            text: `about.how.step${n}.text`,
          }))}
        />
        <NextStep kind="discover" />
      </div>
    </section>
  );
}

interface Feature {
  key: string;
  /** its number: the reading order, which the grid's flow does not follow */
  n: number;
  wide?: boolean;
  tags?: string;
  href?: string;
}

/** A bento of white cards; the heading takes the first two cells. */
export function Features() {
  const { t } = useI18n();
  const { data, session } = usePage<HomeData>();
  // grid flow: heading + streaming | library, ddl, zip | stremio, discover, api
  const features: Feature[] = [
    { key: "streaming", n: 1, wide: true, tags: "MKV · MP4 · WEBM · AVI" },
    { key: "library", n: 4, wide: true, tags: "Vault · AI · WebDAV · S3" },
    { key: "ddl", n: 2 },
    { key: "zip", n: 3 },
    { key: "stremio", n: 5 },
    data.ai ? { key: "ai", n: 6, tags: "AI · Beta" } : { key: "discover", n: 6 },
    { key: "api", n: 7, wide: true, tags: "REST · Beta", href: session.apiDocs },
  ];
  return (
    <section id="features" className="section">
      <div className="wrap bento">
        <header className="bento-head">
          <h2>{t("about.features.title")}</h2>
          <p>{t("about.features.subtitle")}</p>
        </header>
        {features.map((feature) => {
          const body = (
            <>
              <div className="bento-top">
                <h3>{t(`about.features.${feature.key}.title`)}</h3>
                <span className="bento-n" aria-hidden="true">
                  {String(feature.n).padStart(2, "0")}
                </span>
              </div>
              <p>{t(`about.features.${feature.key}.text`)}</p>
              {feature.tags && <p className="bento-tags">{feature.tags}</p>}
            </>
          );
          const className = feature.wide ? "bento-card wide" : "bento-card";
          return feature.href ? (
            <a key={feature.key} className={className} href={feature.href} target="_blank" rel="noopener">
              {body}
            </a>
          ) : (
            <article key={feature.key} className={className}>
              {body}
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** Questions the home page shows before "Show all". */
const FAQ_SHOWN = 6;

/**
 * Heading on the left, questions on the right. An answer shows on hover or
 * keyboard focus; a click pins it open, which is how touch screens get it.
 * Every answer stays in the page, only folded away. The home page shows the
 * first few questions until "Show all"; the rest stay in the DOM, hidden, so
 * they still match the FAQPage JSON-LD. Tool pages list everything: their
 * own questions come last and matter most there.
 */
export function Faq() {
  const i18n = useI18n();
  const { data } = usePage<HomeData>();
  const [pinned, setPinned] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  const tool = data.tool?.url;
  const folded = !tool && !all && data.faq.length > FAQ_SHOWN;
  const showAll = () => {
    setAll(true);
    // the button goes away: keyboard focus lands on the first revealed question
    requestAnimationFrame(() => document.getElementById(`faq-q-${FAQ_SHOWN}`)?.focus());
  };
  return (
    <section id="faq" className="section">
      <div className="wrap faq-split">
        <header className="faq-head">
          <h2>{i18n.t("about.faq.title")}</h2>
          <p>{i18n.t("about.faq.subtitle")}</p>
        </header>
        <div>
          <div className={folded ? "faq folded" : "faq"}>
            {data.faq.map((item, index) => (
              <div key={item.q} className={pinned === index ? "faq-item open" : "faq-item"}>
                <h3>
                  <button
                    type="button"
                    id={`faq-q-${index}`}
                    className="faq-q"
                    aria-expanded={pinned === index}
                    aria-controls={`faq-${index}`}
                    onClick={() => setPinned(pinned === index ? null : index)}
                  >
                    <span className="faq-n" aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span>{i18n.t(item.q)}</span>
                    <Icon name="chevron" size={20} />
                  </button>
                </h3>
                <div className="faq-fold" id={`faq-${index}`}>
                  <div className="faq-answer">
                    {item.a.map((key) => (
                      <p key={key}>{i18n.rich(key, item.params)}</p>
                    ))}
                    {item.guide && item.guide !== tool && (
                      <p>
                        <Link href={i18n.path(`/${item.guide}`)}>{i18n.t("about.faq.guideLink")}</Link>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {folded && (
            <button type="button" className="button faq-more" onClick={showAll}>
              {i18n.t("about.faq.showAll")}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/** The last word on the sheet; the footer, with the wordmark, rises from under it. */
export function FinalCall() {
  const { t } = useI18n();
  const top = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.getElementById("resource")?.focus({ preventScroll: true });
  };
  return (
    <section className="section final-call">
      <div className="wrap">
        <div className="final-row">
          <div>
            <h2>{t("about.cta.title")}</h2>
            <p>{t("about.cta.subtitle")}</p>
          </div>
          <button type="button" className="button primary large" onClick={top}>
            {t("about.cta.button")}
            <Icon name="arrow" size={18} />
          </button>
        </div>
      </div>
    </section>
  );
}

// ───────── tool pages ─────────

function ToolSection({ section }: { section: Section }) {
  const i18n = useI18n();
  switch (section.kind) {
    case "steps":
      return (
        <section id="how" className="section">
          <div className="wrap">
            <SectionHead title={section.title} subtitle={section.subtitle} rich />
            <Steps steps={section.steps ?? []} rich />
            {section.cta && <NextStep kind={section.cta === "stremio" ? "stremio" : "discover"} />}
          </div>
        </section>
      );
    case "prose":
      return (
        <section className="section">
          <div className="wrap narrow prose">
            <h2>{i18n.t(section.title)}</h2>
            {section.paras?.map((key) => <p key={key}>{i18n.rich(key)}</p>)}
            {section.link && (
              <p>
                <Link href={i18n.path(section.link.url)}>{i18n.t(section.link.title)}</Link>
              </p>
            )}
            {section.footer && <p>{i18n.rich(section.footer)}</p>}
          </div>
        </section>
      );
    case "checklist":
      return (
        <section className="section">
          <div className="wrap">
            <SectionHead title={section.title} subtitle={section.subtitle} rich />
            <ul className="checklist">
              {section.items?.map((key) => (
                <li key={key}>
                  <Icon name="check" size={18} />
                  <span>{i18n.t(key)}</span>
                </li>
              ))}
            </ul>
            {section.footer && <p className="section-foot">{i18n.rich(section.footer)}</p>}
            {section.extra && (
              <div className="notice">
                <Icon name="info" />
                <div>
                  <strong>{i18n.t(section.extra.title)}</strong>
                  <p>{i18n.t(section.extra.text)}</p>
                </div>
              </div>
            )}
          </div>
        </section>
      );
    case "compare":
      return (
        <section className="section">
          <div className="wrap">
            <SectionHead title={section.title} subtitle={section.subtitle} />
            <div className="compare">
              {section.cols?.map((col, index) => (
                <div key={col.label} className={index === 0 ? "compare-col ours glass" : "compare-col"}>
                  <h3>{i18n.t(col.label)}</h3>
                  <ul>
                    {col.items.map((key) => (
                      <li key={key}>{i18n.t(key)}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            {section.cap && section.rate ? (
              <p className="section-foot">{i18n.t(section.cap, { Rate: section.rate })}</p>
            ) : null}
            {section.footer && <p className="section-foot">{i18n.rich(section.footer)}</p>}
            {section.note && <p className="fine">{i18n.t(section.note)}</p>}
          </div>
        </section>
      );
  }
}

export function ToolSections() {
  const { data } = usePage<HomeData>();
  return <>{data.tool?.sections.map((section) => <ToolSection key={section.title} section={section} />)}</>;
}

export function RelatedTools() {
  const { t, path } = useI18n();
  const { data } = usePage<HomeData>();
  if (!data.related?.length) return null;
  return (
    <section className="section">
      <div className="wrap">
        <SectionHead title="tool.related.title" subtitle="tool.related.subtitle" />
        <ul className="related">
          {data.related.map((tool) => (
            <li key={tool.url}>
              <Link href={path(`/${tool.url}`)}>
                <strong>{t(tool.benefit)}</strong>
                <span>{t(tool.description)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
