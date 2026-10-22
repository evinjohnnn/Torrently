import { Link } from "../../app/router";
import { useI18n } from "../../i18n";
import { Icon } from "../../ui/Icon";
import { PageHead, Prose, Sheet } from "./kit";

export const namespaces = ["aboutPage"];

export default function About() {
  const { t, rich, path } = useI18n();
  return (
    <>
      <PageHead title={t("aboutPage.heading")} lede={t("aboutPage.intro")} />
      <Sheet>
        <Prose>
          <h2>{t("aboutPage.missionTitle")}</h2>
          <p>{t("aboutPage.missionP1")}</p>
          <p>{rich("aboutPage.missionP2")}</p>
          <p>{t("aboutPage.missionP3")}</p>
          <h2>{t("aboutPage.osTitle")}</h2>
          <p>{rich("aboutPage.osP1")}</p>
          <p>{t("aboutPage.osP2")}</p>
        </Prose>
        <section className="page-call">
          <h2>{t("aboutPage.ctaText")}</h2>
          <Link className="button primary large" href={path("/")}>
            {t("aboutPage.ctaButton")}
            <Icon name="arrow" size={18} />
          </Link>
        </section>
      </Sheet>
    </>
  );
}
