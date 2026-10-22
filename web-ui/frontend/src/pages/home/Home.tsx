import { usePage } from "../../app/router";
import type { PageState } from "../../app/state";
import { useI18n } from "../../i18n";
import { Icon } from "../../ui/Icon";
import { OpenTorrent } from "./OpenTorrent";
import {
  Faq,
  Features,
  FinalCall,
  HowItWorks,
  RelatedTools,
  ToolSections,
} from "./Sections";
import { ContinueWatching, Onboarding } from "./Signed";
import type { HomeData } from "./types";
import "./home.css";

export const namespaces = ["home", "about", "tool", "library", "onboarding", "load", "job"];
export const namespacesFor = (state: PageState) => {
  const tool = (state.data as HomeData).tool;
  return tool ? [tool.aboutKey] : [];
};

function Hero() {
  const { t } = useI18n();
  const { data } = usePage<HomeData>();
  const tool = data.tool;
  return (
    <section className="hero">
      <div className="wrap hero-grid">
        <div className="hero-copy">
          {tool ? (
            tool.guide ? (
              <>
                <h1>{t(tool.title)}</h1>
                <p className="hero-benefit">{t(tool.benefit)}</p>
              </>
            ) : (
              <h1>{t(tool.benefit)}</h1>
            )
          ) : (
            <h1>
              <span>{t("home.heading")}</span> <span>{t("home.headingAccent")}</span>
            </h1>
          )}
          <p className="lede">{t(tool ? tool.description : "home.subtitle")}</p>
        </div>
        <OpenTorrent />
        <Facts />
      </div>
    </section>
  );
}

/** What the service promises. */
function Facts() {
  const { t } = useI18n();
  return (
    <div className="facts">
      <ul className="promises">
        <li>
          <Icon name="check" size={16} />
          {t("about.trust.noInstall")}
        </li>
        <li>
          <Icon name="shield" size={16} />
          {t("about.trust.ipPrivate")}
        </li>
        <li>
          <Icon name="lock" size={16} />
          {t("about.trust.https")}
        </li>
      </ul>
    </div>
  );
}

export default function Home() {
  const { data, session } = usePage<HomeData>();
  return (
    <>
      <Hero />
      {/* past the hero the page is paper again, sliding up over the glass */}
      <div className="sheet">
        {session.user && !data.tool && (
          <div className="wrap signed-home">
            <Onboarding />
          </div>
        )}
        <ContinueWatching />
        {data.tool ? <ToolSections /> : <HowItWorks />}
        <Features />
        <RelatedTools />
        <Faq />
        <FinalCall />
      </div>
    </>
  );
}
