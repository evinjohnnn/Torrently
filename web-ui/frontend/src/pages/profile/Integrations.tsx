import { useState, type FormEvent } from "react";
import { usePage } from "../../app/router";
import { useI18n } from "../../i18n";
import { Icon } from "../../ui/Icon";
import { Confirm, CopyField, Locked, Section, useSend } from "./kit";
import type { ProfileData } from "./types";

/** A paid feature before its credentials exist: the button, or why it is off. */
function Generate({ prefix, url }: { prefix: string; url: string }) {
  const { t, path } = useI18n();
  const { data } = usePage<ProfileData>();
  const { send, busy } = useSend();
  return (
    <>
      <div className="pf-actions">
        <button
          type="button"
          className={data.paid ? "button accent" : "button"}
          disabled={!data.paid || busy}
          onClick={() => void send(path(url))}
        >
          <Icon name="key" size={18} />
          {t(`${prefix}.generate`)}
        </button>
      </div>
      {!data.paid && <Locked text={t(`${prefix}.premiumOnly`)} upgrade={t(`${prefix}.upgrade`)} />}
    </>
  );
}

export function WebDAV() {
  const { t, path } = useI18n();
  const { data, session } = usePage<ProfileData>();
  const { send } = useSend();
  const url = data.webdav?.value;
  return (
    <Section id="webdav" icon="folder" title={t("profile.webdav.title")}>
      {data.paid && url ? (
        <>
          <CopyField
            id="pf-webdav"
            label={t("profile.webdav.title")}
            value={session.domain + url}
            copyLabel={t("profile.webdav.copyUrl")}
            copied={t("profile.webdav.copied")}
            rotate={{
              label: t("profile.webdav.regenerate"),
              warning: t("profile.webdav.regenerateWarning"),
              onConfirm: () => void send(path("/webdav/url/regenerate")),
            }}
          />
          <a className="pf-link" href={path("/instructions/webdav")} target="_blank" rel="noopener">
            {t("profile.webdav.howTo")}
          </a>
        </>
      ) : (
        <Generate prefix="profile.webdav" url="/webdav/url/generate" />
      )}
    </Section>
  );
}

export function S3() {
  const { t, path } = useI18n();
  const { data } = usePage<ProfileData>();
  const { send } = useSend();
  const s3 = data.s3!;
  return (
    <Section id="s3" icon="archive" title={t("profile.s3.title")} badge="Beta">
      {data.paid && s3.accessKey ? (
        <>
          <CopyField
            id="pf-s3-endpoint"
            label={t("profile.s3.endpoint")}
            value={s3.endpoint ?? ""}
            copyLabel={t("profile.s3.copy")}
            copied={t("profile.s3.copied")}
          />
          <CopyField
            id="pf-s3-access"
            label={t("profile.s3.accessKey")}
            value={s3.accessKey}
            copyLabel={t("profile.s3.copy")}
            copied={t("profile.s3.copied")}
          />
          {/* derived from the access key, so rotating the key rotates it too */}
          <CopyField
            id="pf-s3-secret"
            label={t("profile.s3.secretKey")}
            value={s3.secretKey ?? ""}
            secret
            revealLabel={t("profile.s3.reveal")}
            copyLabel={t("profile.s3.copy")}
            copied={t("profile.s3.copied")}
            rotate={{
              label: t("profile.s3.regenerate"),
              warning: t("profile.s3.regenerateWarning"),
              onConfirm: () => void send(path("/s3-credentials/regenerate")),
            }}
          />
          <p className="fine">{t("profile.s3.regionHint", { Region: s3.region ?? "" })}</p>
        </>
      ) : (
        <Generate prefix="profile.s3" url="/s3-credentials/generate" />
      )}
      {/* the guide answers "what would I do with this", before generating too */}
      <a className="pf-link" href={path("/instructions/s3")} target="_blank" rel="noopener">
        {t("profile.s3.howTo")}
      </a>
    </Section>
  );
}

export function API() {
  const { t, path } = useI18n();
  const { data } = usePage<ProfileData>();
  const { send } = useSend();
  const api = data.api!;
  return (
    <Section id="api" icon="code" title={t("profile.api.title")} badge="Beta">
      {data.paid && api.key ? (
        <>
          <CopyField
            id="pf-api-endpoint"
            label={t("profile.api.endpoint")}
            value={api.endpoint ?? ""}
            copyLabel={t("profile.api.copy")}
            copied={t("profile.api.copied")}
          />
          {/* stored, not derived: hidden until asked, and only ever rotated */}
          <CopyField
            id="pf-api-key"
            label={t("profile.api.key")}
            value={api.key}
            secret
            revealLabel={t("profile.api.reveal")}
            copyLabel={t("profile.api.copy")}
            copied={t("profile.api.copied")}
            rotate={{
              label: t("profile.api.regenerate"),
              warning: t("profile.api.regenerateWarning"),
              onConfirm: () => void send(path("/api-credentials/regenerate")),
            }}
          />
          <p className="fine">{t("profile.api.authHint")}</p>
        </>
      ) : (
        <Generate prefix="profile.api" url="/api-credentials/generate" />
      )}
      <a className="pf-link" href={api.docs} target="_blank" rel="noopener">
        {t("profile.api.docs")}
      </a>
    </Section>
  );
}

/** Keys issued through the device flow (/device), each revoked on its own. */
export function Devices() {
  const { t, path, lang } = useI18n();
  const { data } = usePage<ProfileData>();
  const { send, busy } = useSend();
  const devices = data.api?.devices ?? [];
  if (!devices.length) return null;
  const date = new Intl.DateTimeFormat(lang, { dateStyle: "medium" });
  return (
    <Section id="devices" icon="wifi" title={t("profile.devices.title")} badge="Beta" intro={t("profile.devices.hint")}>
      <ul className="pf-rows">
        {devices.map((device) => (
          <li key={device.fullName}>
            <div className="pf-row-main">
              <strong className="pf-truncate">{device.name}</strong>
              <span className="pf-row-meta">{date.format(new Date(device.createdAt))}</span>
            </div>
            <button
              type="button"
              className="button small quiet"
              disabled={busy}
              onClick={() => void send(path("/device/revoke"), { name: device.fullName })}
            >
              {t("profile.devices.revoke")}
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function EmbedDomains() {
  const { t, path } = useI18n();
  const { data } = usePage<ProfileData>();
  const { send, busy } = useSend();
  const [asking, setAsking] = useState<string | null>(null);
  const domains = data.embedDomains ?? [];
  const canAdd = domains.length < 3;
  const target = domains.find((d) => d.id === asking);

  const add = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void send(path("/embed-domain/add"), { domain: String(form.get("domain") ?? "") });
  };

  return (
    <Section id="embed-domains" icon="globe" title={t("profile.embedDomains.title")}>
      <form className="pf-add" onSubmit={add}>
        <input
          name="domain"
          className="input"
          required
          disabled={!canAdd}
          pattern="[a-zA-Z0-9\-]+(\.[a-zA-Z0-9\-]+)+"
          title={t("profile.embedDomains.validation")}
          placeholder={t("profile.embedDomains.placeholder")}
          aria-label={t("profile.embedDomains.placeholder")}
        />
        <button type="submit" className="button" disabled={!canAdd || busy}>
          <Icon name="plus" size={18} />
          {t("profile.embedDomains.add")}
        </button>
      </form>
      {!canAdd && <p className="fine">{t("profile.embedDomains.maxReached")}</p>}
      <ul className="pf-rows">
        {domains.map((d) => (
          <li key={d.id}>
            <div className="pf-row-main">
              <strong className="mono pf-break">{d.domain}</strong>
            </div>
            <button
              type="button"
              className="icon-button pf-delete"
              aria-label={`${t("bulk.remove")}: ${d.domain}`}
              title={t("bulk.remove")}
              onClick={() => setAsking(d.id)}
            >
              <Icon name="trash" size={18} />
            </button>
          </li>
        ))}
        {domains.length === 0 && (
          <li className="pf-empty">
            <p>{t("profile.embedDomains.noDomains")}</p>
            <p className="fine">{t("profile.embedDomains.noDomainsHint")}</p>
          </li>
        )}
      </ul>
      <Confirm
        open={!!target}
        onClose={() => setAsking(null)}
        title={t("profile.embedDomains.title")}
        text={`${t("profile.embedDomains.deleteConfirm")}\n\n${target?.domain ?? ""}`}
        action={t("bulk.remove")}
        onConfirm={() => target && void send(path(`/embed-domain/delete/${target.id}`))}
      />
    </Section>
  );
}
