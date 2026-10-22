import { useEffect, useState } from "react";
import { usePage } from "../../app/router";
import { useI18n } from "../../i18n";
import { Icon } from "../../ui/Icon";
import { ErrorNotice, PageHead, Sheet } from "../content/kit";
import "./donate.css";

export const namespaces = ["donate"];

interface Card {
  tierId: number;
  name: string;
  titleKey: string;
  taglineKey: string;
  benefits: { key: string; rate: number; vp: number; tb: number }[];
  recommended: boolean;
  trialDays: number;
  trialUrl?: string;
  hasMonthly: boolean;
  monthlyUsd: string;
  monthlyUnavailable: boolean;
  hasAnnual: boolean;
  annualPerMonthUsd: string;
  annualTotalUsd: string;
  monthUrl?: string;
  yearUrl?: string;
}

interface DonateData {
  cards: Card[];
  patreonEnabled: boolean;
  cryptoEnabled: boolean;
  hasUnavailable: boolean;
  annualSavePct: number;
  freeMonths: number;
  patreonGiftUrl: string;
  trialDays: number;
  trialTier: string;
}

declare global {
  interface Window {
    umami?: { track(event: string, data?: Record<string, unknown>): void };
  }
}

// one impression per full page load, like donate.js: in-app returns to the
// page must not inflate the denominator of the donate-* clicks
let shownReported = false;

const capitalize = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);

function PlanCard({ card, annual, crypto }: { card: Card; annual: boolean; crypto: boolean }) {
  const { t, tn } = useI18n();
  // the annual figures replace the monthly ones only where the plan has them
  const yearly = annual && card.hasAnnual;
  const cryptoButton = (
    <button
      type="submit"
      name="tier_id"
      value={card.tierId}
      className="tier-crypto"
      data-umami-event="donate-crypto-join"
      data-umami-event-tier={card.name}
    >
      {t("donate.crypto.orPayCrypto")}
    </button>
  );
  return (
    <li className={card.recommended ? "tier glass recommended" : "tier"}>
      <div className="tier-head">
        <h2>{card.titleKey ? t(card.titleKey) : capitalize(card.name)}</h2>
        {card.recommended && <span className="chip olive">{t("donate.crypto.recommended")}</span>}
      </div>
      <div className="tier-price">
        {yearly ? (
          <>
            <p>
              <strong>${card.annualPerMonthUsd}</strong> <span>{t("donate.crypto.perMonth")}</span>
            </p>
            <p className="fine">{t("donate.crypto.billedYearly", { Amount: card.annualTotalUsd })}</p>
          </>
        ) : card.hasMonthly ? (
          <p>
            <strong>${card.monthlyUsd}</strong> <span>{t("donate.crypto.perMonth")}</span>
          </p>
        ) : null}
      </div>
      <div className="tier-actions">
        {card.monthUrl ? (
          <>
            <a
              className={card.recommended ? "button accent" : "button primary"}
              href={yearly ? card.yearUrl : card.monthUrl}
              target="_blank"
              rel="noopener"
              data-umami-event="donate-patreon-join"
              data-umami-event-tier={card.name}
              data-umami-event-cadence={yearly ? "12" : "1"}
            >
              {t("donate.crypto.join")}
            </a>
            {crypto &&
              (yearly ? (
                cryptoButton
              ) : card.hasMonthly ? (
                card.monthlyUnavailable ? (
                  <span className="tier-crypto off" title={t("donate.crypto.minNote")}>
                    {t("donate.crypto.optionUnavailable")}
                  </span>
                ) : (
                  cryptoButton
                )
              ) : null)}
          </>
        ) : crypto ? (
          <button
            type="submit"
            name="tier_id"
            value={card.tierId}
            className={card.recommended ? "button accent" : "button primary"}
            data-umami-event="donate-crypto-join"
            data-umami-event-tier={card.name}
          >
            {t("donate.crypto.join")}
          </button>
        ) : null}
      </div>
      {card.taglineKey && <p className="tier-tagline">{t(card.taglineKey)}</p>}
      {card.benefits.length > 0 && (
        <div className="tier-benefits">
          <p>{t("donate.crypto.youGet")}</p>
          <ul>
            {card.benefits.map((b) => (
              <li key={b.key}>{t(b.key, { Rate: b.rate, VP: b.vp, TB: b.tb })}</li>
            ))}
          </ul>
        </div>
      )}
      {card.trialDays > 0 && card.trialUrl && (
        <div className="tier-trial">
          <a className="button" href={card.trialUrl} target="_blank" rel="noopener" data-umami-event="donate-trial-plaque">
            <Icon name="sparkle" size={17} />
            {tn("donate.patreon.trialBanner", card.trialDays)}
          </a>
          {/* the trial starts the monthly plan whatever the toggle shows */}
          {card.hasMonthly && <p className="fine">{t("donate.patreon.trialAfter", { Amount: card.monthlyUsd })}</p>}
        </div>
      )}
    </li>
  );
}

export default function Donate() {
  const { t, tn, path } = useI18n();
  const { data, error, session } = usePage<DonateData>();
  const [annual, setAnnual] = useState(true);

  useEffect(() => {
    if (shownReported || !window.umami) return;
    shownReported = true;
    window.umami.track("donate-shown", {
      cards: data.cards.length,
      patreon: data.patreonEnabled,
      crypto: data.cryptoEnabled,
    });
  }, [data]);

  return (
    <>
      <PageHead title={t("donate.crypto.chooseTitle")} wide />
      <Sheet wide>
        {error && <ErrorNotice>{t(error.key)}</ErrorNotice>}
        {data.cards.length > 0 ? (
          // a real form: the crypto checkout answers with a redirect to the
          // payment provider, which only a full navigation can follow
          <form className="tiers-form" action={path("/donate/crypto")} method="post">
            <input type="hidden" name="_csrf" value={session.csrf} />
            <div className="tiers-toggle">
              <label className="switch" data-umami-event="donate-annual-toggle">
                <input type="checkbox" name="annual" value="1" checked={annual} onChange={(e) => setAnnual(e.target.checked)} />
                <span className="switch-track" aria-hidden="true" />
                <span>{t("donate.crypto.payAnnually")}</span>
              </label>
              {data.annualSavePct > 0 && (
                <span className="chip honey">
                  {t("donate.crypto.save", { Pct: data.annualSavePct })}
                  {data.freeMonths > 0 && (
                    <span className="wide-only"> · {t("donate.crypto.freeMonths", { Months: data.freeMonths })}</span>
                  )}
                </span>
              )}
            </div>
            <ul className="tiers">
              {data.cards.map((card) => (
                <PlanCard key={card.tierId} card={card} annual={annual} crypto={data.cryptoEnabled} />
              ))}
            </ul>
            {data.patreonEnabled && (
              <div className="gift">
                <span>
                  <Icon name="heart" size={18} />
                  {t("donate.gift.text")}
                </span>
                <a className="button small" href={data.patreonGiftUrl} target="_blank" rel="noopener" data-umami-event="donate-gift">
                  {t("donate.gift.cta")}
                </a>
              </div>
            )}
            {data.hasUnavailable && <p className="fine tiers-note">{t("donate.crypto.minNote")}</p>}
          </form>
        ) : (
          <p className="lede">{t("donate.crypto.noPlans")}</p>
        )}

        {data.patreonEnabled && (
          <>
            <p className="or-rule">
              <span>{t("donate.or")}</span>
            </p>
            <section id="patreon" className="patreon glass">
              <div className="patreon-head">
                <h2>{t("donate.patreon.title")}</h2>
                {data.trialDays > 0 && (
                  <span className="chip olive">{tn("donate.patreon.trial", data.trialDays, { Tier: data.trialTier })}</span>
                )}
              </div>
              <p>{t("donate.patreon.description")}</p>
              <a className="button primary" href={path("/donate/patreon")} target="_blank" rel="noopener" data-umami-event="donate-patreon">
                {t("donate.patreon.cta")}
                <Icon name="external" size={16} />
              </a>
            </section>
          </>
        )}
      </Sheet>
    </>
  );
}
