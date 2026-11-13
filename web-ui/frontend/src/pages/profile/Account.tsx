import { useState, type FormEvent } from "react";
import { Link, usePage } from "../../app/router";
import { useI18n } from "../../i18n";
import { Icon } from "../../ui/Icon";
import { Confirm, Section, Switch, useSend } from "./kit";
import type { ProfileData } from "./types";

/** The plan: its name, what it includes, and where it is billed. */
export function Plan() {
  const { t, path } = useI18n();
  const { data } = usePage<ProfileData>();
  const { tier, billing } = data;
  return (
    <section id="tier" className="pf-plan glass" aria-labelledby="tier-title" tabIndex={-1}>
      <div className="pf-plan-head">
        <span className="pf-plan-mark" aria-hidden="true">
          <Icon name="heart" size={20} />
        </span>
        <h2 id="tier-title" className="pf-plan-name">
          {tier.name}
        </h2>
        <span className="pf-tags">
          <span className="chip olive">
            <Icon name="bolt" size={14} />
            {tier.rate == null ? (
              t("profile.tier.unlimited")
            ) : (
              <span className="mono">
                {tier.rate}
                {t("profile.tier.mbps")}
              </span>
            )}
          </span>
          <span className={tier.ads ? "chip" : "chip olive"}>
            <Icon name={tier.ads ? "tv" : "check"} size={14} />
            {t(tier.ads ? "profile.tier.adsEnabled" : "profile.tier.adFree")}
          </span>
        </span>
        {data.hasPayments && (
          <Link className="pf-link pf-plan-payments" href={path("/profile/payments")}>
            <Icon name="file" size={16} />
            {t("profile.payments.link")}
          </Link>
        )}
      </div>
      {/* the charge shows up under the provider's name, not ours: say so next to the plan */}
      {billing && (
        <div className="pf-billing">
          <p>{t("profile.billing.text", { Provider: billing.provider })}</p>
          <div className="pf-actions">
            <a className="button" href={billing.manageUrl} target="_blank" rel="noopener">
              {t("profile.billing.manage", { Provider: billing.provider })}
              <Icon name="external" size={16} />
            </a>
            {billing.cancelGuideUrl && (
              <a className="pf-link" href={billing.cancelGuideUrl} target="_blank" rel="noopener">
                {t("profile.billing.cancelGuide")}
              </a>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export function Vault() {
  const { t, path } = useI18n();
  const { data } = usePage<ProfileData>();
  const vault = data.vault!;
  return (
    <Section id="vault" icon="vault" title={t("vault.dashboard.title")}>
      <dl className="pf-facts">
        <div>
          <dt>{t("profile.vault.availableVP")}</dt>
          <dd className="mono">{vault.available == null ? "∞" : vault.available.toFixed(2)}</dd>
        </div>
        <div>
          <dt>{t("profile.vault.vaultedTorrents")}</dt>
          <dd className="mono">{vault.vaulted}</dd>
        </div>
      </dl>
      <div className="pf-foot">
        <a className="pf-link" href={path("/instructions/vault")} target="_blank" rel="noopener">
          {t("profile.vault.whatIs")}
        </a>
        <Link className="button" href={path("/vault")}>
          {t("profile.vault.openVault")}
        </Link>
      </div>
    </Section>
  );
}

/** The administrator password of a self-hosted instance. */
export function Password() {
  const { t, path } = useI18n();
  const { data } = usePage<ProfileData>();
  const { send, busy } = useSend();
  const password = data.password!;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    void send(path("/profile/password"), {
      current: String(fields.get("current") ?? ""),
      new: String(fields.get("new") ?? ""),
    }).then(() => form.reset());
  };
  return (
    <Section id="password" icon="lock" title={t("profile.password.title")}>
      {password.managedByEnv ? (
        <p className="pf-intro">{t("profile.password.managedByEnv")}</p>
      ) : (
        <>
          <p className="pf-intro">{t(password.set ? "profile.password.setHint" : "profile.password.unsetHint")}</p>
          <form className="pf-form" onSubmit={submit}>
            {password.set && (
              <div className="field">
                <label htmlFor="pf-current">{t("profile.password.current")}</label>
                <input id="pf-current" name="current" type="password" autoComplete="current-password" required className="input" />
              </div>
            )}
            <div className="field">
              <label htmlFor="pf-new">{t("profile.password.new")}</label>
              <input id="pf-new" name="new" type="password" autoComplete="new-password" minLength={8} required className="input" />
            </div>
            <button type="submit" className="button accent" disabled={busy}>
              {t("profile.password.submit")}
            </button>
          </form>
        </>
      )}
    </Section>
  );
}

/** Where notification mail goes; a new address is used only once verified. */
export function Email() {
  const { t, path } = useI18n();
  const { data } = usePage<ProfileData>();
  const { send, busy } = useSend();
  const email = data.email!;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    void send(path("/profile/email"), { email: String(fields.get("email") ?? "") });
  };
  return (
    <Section id="email" icon="mail" title={t("profile.email.title")} intro={t("profile.email.hint")}>
      {email.current && <p className="fine">{t("profile.email.currentHint", { Email: email.current })}</p>}
      {email.pending && (
        <div className="notice">
          <Icon name="mail" />
          <span>{t("profile.email.pendingHint", { Email: email.pending })}</span>
        </div>
      )}
      <form className="pf-form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="pf-email" className="visually-hidden">
            {t("profile.email.title")}
          </label>
          <input
            id="pf-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="input"
            placeholder={t("profile.email.placeholder")}
          />
        </div>
        <button type="submit" className="button accent" disabled={busy}>
          {t("profile.email.submit")}
        </button>
      </form>
    </Section>
  );
}

export function AdultContent() {
  const { t, path } = useI18n();
  const { data } = usePage<ProfileData>();
  const { send, busy } = useSend();
  return (
    <Section id="adult-content-section" icon="eye" title={t("profile.adultContent.title")}>
      <div className="pf-setting">
        <div>
          <p className="pf-setting-title">{t("profile.adultContent.unblur")}</p>
          <p className="fine">{t("profile.adultContent.unblurDesc")}</p>
        </div>
        <Switch
          label={t("profile.adultContent.unblur")}
          hideLabel
          checked={data.showAdult}
          disabled={busy}
          onChange={(on) => void send(path("/profile/settings"), { show_adult: on ? "true" : "false" })}
        />
      </div>
    </Section>
  );
}

/** Export, sign out, delete: the account itself, last on the page. */
export function AccountActions() {
  const { t, path } = useI18n();
  const { send } = useSend();
  const [asking, setAsking] = useState(false);
  return (
    <div className="pf-account">
      <a className="button" href={path("/profile/export")} download>
        <Icon name="download" size={18} />
        {t("profile.exportData")}
      </a>
      <a className="button quiet" href={path("/logout")}>
        <Icon name="logout" size={18} />
        {t("profile.logout")}
      </a>
      <button type="button" className="button quiet danger" onClick={() => setAsking(true)}>
        <Icon name="trash" size={18} />
        {t("profile.deleteAccount")}
      </button>
      <Confirm
        open={asking}
        onClose={() => setAsking(false)}
        title={t("profile.deleteAccount")}
        text={t("profile.deleteConfirm")}
        action={t("profile.deleteAccount")}
        onConfirm={() => void send(path("/profile/delete"))}
      />
    </div>
  );
}
