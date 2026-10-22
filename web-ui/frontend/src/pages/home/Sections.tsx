import { Link, usePage } from "../../app/router";
import { useI18n } from "../../i18n";
import { Icon, type IconName } from "../../ui/Icon";
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
            {index + 1}
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
    <div className="next-step glass">
      <div>
        <h3>{t(`${key}.title`)}</h3>
        <p>{t(`${key}.text`)}</p>
      </div>
      {kind === "stremio" ? (
        <a className="button primary" href={href}>
          <Icon name="tv" size={18} />
          {t(`${key}.button`)}
        </a>
      ) : (
        <Link className="button primary" href={href}>
          <Icon name="compass" size={18} />
          {t(`${key}.button`)}
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
  icon: IconName;
  key: string;
  tags?: string[];
  href?: string;
}

export function Features() {
  const { t } = useI18n();
  const { data, session } = usePage<HomeData>();
  const features: Feature[] = [
    { icon: "play", key: "streaming", tags: ["MKV", "MP4", "WEBM", "AVI"] },
    { icon: "download", key: "ddl" },
    { icon: "archive", key: "zip" },
    { icon: "library", key: "library", tags: ["Vault", "AI", "WebDAV", "S3"] },
    { icon: "tv", key: "stremio" },
    data.ai
      ? { icon: "sparkle", key: "ai", tags: ["AI", "Beta"] }
      : { icon: "compass", key: "discover" },
    { icon: "server", key: "api", tags: ["REST", "Beta"], href: session.apiDocs },
  ];
  return (
    <section id="features" className="section">
      <div className="wrap">
        <SectionHead title="about.features.title" subtitle="about.features.subtitle" />
        <ul className="features glass">
          {features.map((feature) => {
            const body = (
              <>
                <span className="feature-icon">
                  <Icon name={feature.icon} size={22} />
                </span>
                <span className="feature-body">
                  <span className="feature-title">
                    {t(`about.features.${feature.key}.title`)}
                    {feature.href && <Icon name="external" size={15} />}
                  </span>
                  <span className="feature-text">{t(`about.features.${feature.key}.text`)}</span>
                  {feature.tags && (
                    <span className="feature-tags">
                      {feature.tags.map((tag) => (
                        <span key={tag} className="chip">
                          {tag}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </>
            );
            return (
              <li key={feature.key}>
                {feature.href ? (
                  <a className="feature" href={feature.href} target="_blank" rel="noopener">
                    {body}
                  </a>
                ) : (
                  <div className="feature">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export function Faq() {
  const i18n = useI18n();
  const { data } = usePage<HomeData>();
  const tool = data.tool?.url;
  return (
    <section id="faq" className="section">
      <div className="wrap narrow">
        <SectionHead title="about.faq.title" subtitle="about.faq.subtitle" />
        <div className="faq">
          {data.faq.map((item) => (
            <details key={item.q} className="faq-item">
              <summary>
                <span>{i18n.t(item.q)}</span>
                <Icon name="plus" size={18} />
              </summary>
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
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCall() {
  const { t } = useI18n();
  const top = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.getElementById("resource")?.focus({ preventScroll: true });
  };
  return (
    <section className="section final-call">
      <div className="wrap narrow">
        <h2>{t("about.cta.title")}</h2>
        <p className="lede">{t("about.cta.subtitle")}</p>
        <button type="button" className="button primary large" onClick={top}>
          {t("about.cta.button")}
        </button>
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
