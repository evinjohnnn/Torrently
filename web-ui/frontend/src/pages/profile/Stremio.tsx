import { useState, type FormEvent } from "react";
import { sessionHeaders, usePage } from "../../app/router";
import { toast } from "../../chrome/Toasts";
import { useI18n } from "../../i18n";
import { Dialog } from "../../ui/Dialog";
import { Icon } from "../../ui/Icon";
import { timeAgo } from "../../ui/format";
import { Confirm, CopyField, fillV, Grip, ListFoot, Locked, Section, Switch, useDraft, useSend, useSortable } from "./kit";
import type { Addon, Indexer, ProfileData, Subscription } from "./types";

/** The addon's address, and the deep link that installs it in the Stremio app. */
function addonLinks(domain: string, url: string) {
  return { url: domain + url, install: "stremio://" + domain.replace(/^https?:\/\//, "") + url };
}

export function StremioAddon() {
  const { t, path } = useI18n();
  const { data, session } = usePage<ProfileData>();
  const { send, busy } = useSend();
  const url = data.stremio.addonUrl;
  const links = url ? addonLinks(session.domain, url) : null;

  // "Install" mints the token and opens the app with it in one go; "just the
  // link" stops at the token, for setting up another device.
  const generate = async (install: boolean) => {
    const next = await send(path("/stremio/url/generate"));
    const minted = (next?.data as ProfileData | undefined)?.stremio?.addonUrl;
    if (install && minted) location.href = addonLinks(session.domain, minted).install;
  };

  const hint = (
    <p className="fine">
      {t("profile.stremio.installHint")}{" "}
      <a href="https://www.stremio.com/downloads" target="_blank" rel="noopener">
        {t("profile.stremio.noStremio")}
      </a>
    </p>
  );

  return (
    <Section id="stremio" icon="tv" title={t("profile.stremio.title")} intro={t("profile.stremio.intro")}>
      {links ? (
        <>
          <div className="pf-actions">
            <a className="button accent" href={links.install}>
              <Icon name="download" size={18} />
              {t("profile.stremio.install")}
            </a>
            <a className="pf-link" href={path("/instructions/stremio")} target="_blank" rel="noopener">
              {t("profile.stremio.howTo")}
            </a>
          </div>
          <CopyField
            id="pf-stremio-url"
            label={t("profile.stremio.addonUrl")}
            value={links.url}
            copyLabel={t("profile.stremio.copyUrl")}
            copied={t("profile.stremio.copied")}
            rotate={{
              label: t("profile.stremio.regenerate"),
              warning: t("profile.stremio.regenerateWarning"),
              onConfirm: () => void send(path("/stremio/url/regenerate")),
            }}
          />
        </>
      ) : (
        <div className="pf-actions">
          <button type="button" className="button accent" disabled={busy} onClick={() => void generate(true)}>
            <Icon name="download" size={18} />
            {t("profile.stremio.install")}
          </button>
          <button type="button" className="button quiet" disabled={busy} onClick={() => void generate(false)}>
            {t("profile.stremio.getLink")}
          </button>
        </div>
      )}
      {hint}
    </Section>
  );
}

const STATUS_TONE: Record<string, string> = { ok: "olive", invalid_credentials: "brick", rate_limited: "honey" };

export function StreamingBackends() {
  const { t, path, lang } = useI18n();
  const { data } = usePage<ProfileData>();
  const { send, busy } = useSend();
  const [rows, setRows, dirty] = useDraft(data.backends);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [asking, setAsking] = useState<string | null>(null);
  const sort = useSortable(rows, (row) => row.id, setRows);
  const dateTime = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" });

  const add = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void send(path("/streaming/backends/create"), {
      type: String(form.get("type") ?? ""),
      access_token: String(form.get("access_token") ?? ""),
    });
  };
  const save = () => {
    const fields: Record<string, string> = {
      backend_order: rows.map((row) => row.id).join(","),
      deleted_backends: deleted.join(","),
    };
    for (const row of rows) if (row.enabled) fields[`backend_${row.id}_enabled`] = "on";
    void send(path("/streaming/backends/update"), fields).then(() => setDeleted([]));
  };
  const target = rows.find((row) => row.id === asking);

  return (
    <Section id="streaming-backends" icon="server" title={t("profile.backends.title")}>
      <form className="pf-add" onSubmit={add}>
        <select name="type" className="select" required aria-label={t("profile.backends.selectType")} defaultValue="">
          <option value="">{t("profile.backends.selectType")}</option>
          {data.backendTypes.map((type) => (
            <option key={type.type} value={type.type}>
              {type.name}
            </option>
          ))}
        </select>
        <input
          name="access_token"
          type="password"
          required
          autoComplete="off"
          className="input"
          placeholder={t("profile.backends.enterToken")}
          aria-label={t("profile.backends.enterToken")}
        />
        <button type="submit" className="button" disabled={busy}>
          <Icon name="plus" size={18} />
          {t("profile.backends.add")}
        </button>
      </form>

      <div className="pf-list-head">
        <h4>{t("profile.backends.yourBackends")}</h4>
        {rows.length > 1 && <p className="fine">{t("profile.backends.dragHint")}</p>}
      </div>
      <ul className="pf-rows" ref={sort.list}>
        {rows.map((row) => (
          <li key={row.id} data-sort-row className={sort.dragging === row.id ? "dragging" : undefined}>
            <Grip label={t("profile.backends.dragHint")} props={sort.handle(row.id)} />
            <div className="pf-row-main">
              <strong>{row.name}</strong>
              <span className="pf-row-meta">
                {row.status && (
                  <span className={`chip ${STATUS_TONE[row.status] ?? ""}`}>
                    {t("profile.backends.status")} {row.status}
                  </span>
                )}
                {row.checkedAt && (
                  <span>
                    {t("profile.backends.lastChecked")} {dateTime.format(new Date(row.checkedAt))}
                  </span>
                )}
              </span>
            </div>
            <Switch
              label={t("profile.backends.enabled")}
              checked={row.enabled}
              onChange={(on) => setRows((list) => list.map((r) => (r.id === row.id ? { ...r, enabled: on } : r)))}
            />
            <button
              type="button"
              className="icon-button pf-delete"
              aria-label={`${t("bulk.remove")}: ${row.name}`}
              title={t("bulk.remove")}
              onClick={() => setAsking(row.id)}
            >
              <Icon name="trash" size={18} />
            </button>
          </li>
        ))}
        {/* the built-in backend: always last, on with a paid plan */}
        <li className="pf-fixed">
          <span className="pf-grip" aria-hidden="true" />
          <div className="pf-row-main">
            <strong>{t("profile.backends.webtor")}</strong>
            <span className="pf-row-meta">{t("profile.backends.webtorBuiltin")}</span>
          </div>
          <Switch label={t("profile.backends.enabled")} checked={data.paid} disabled />
          <span className="pf-delete" aria-hidden="true" />
        </li>
        {rows.length === 0 && (
          <li className="pf-empty">
            <p>{t("profile.backends.noBackends")}</p>
            <p className="fine">{t("profile.backends.noBackendsHint")}</p>
          </li>
        )}
      </ul>
      {!data.paid && <Locked text={t("profile.backends.premiumNote")} upgrade={t("profile.backends.upgrade")} />}
      <ListFoot save={t("profile.backends.save")} dirty={dirty || deleted.length > 0} onSave={save} />
      <Confirm
        open={!!target}
        onClose={() => setAsking(null)}
        title={t("profile.backends.title")}
        text={fillV(t("profile.backends.deleteConfirm"), target?.name ?? "")}
        action={t("bulk.remove")}
        onConfirm={() => {
          if (!target) return;
          setDeleted((ids) => [...ids, target.id]);
          setRows((list) => list.filter((r) => r.id !== target.id));
          toast(t("profile.backends.deleted"));
        }}
      />
    </Section>
  );
}

/** Addons and indexers share their shape: a capped add form over a sortable, probe-able list. */
type ListKind = "addons" | "indexers";

const LISTS = {
  addons: {
    id: "addon-urls",
    icon: "puzzle",
    prefix: "profile.addons",
    add: "/stremio/addon-url/add",
    update: "/stremio/addon-url/update",
    order: "addon_order",
    deleted: "deleted_addons",
    enabled: (id: string) => `addon_${id}_enabled`,
    refresh: (id: string) => `/stremio/addon-url/${id}/refresh-snapshot`,
    guide: "/instructions/stremio_addon",
  },
  indexers: {
    id: "torznab-indexers",
    icon: "search",
    prefix: "profile.indexers",
    add: "/torznab/indexer/add",
    update: "/torznab/indexer/update",
    order: "indexer_order",
    deleted: "deleted_indexers",
    enabled: (id: string) => `indexer_${id}_enabled`,
    refresh: (id: string) => `/torznab/indexer/${id}/refresh-caps`,
    guide: "/instructions/torznab",
  },
} as const;

type Row = Addon | Indexer;
const labelOf = (row: Row) => row.name || row.url;

function SourceList({ kind }: { kind: ListKind }) {
  const spec = LISTS[kind];
  const { t, path } = useI18n();
  const { data, session } = usePage<ProfileData>();
  const { send, busy } = useSend();
  const server: Row[] = kind === "addons" ? data.addons : data.indexers;
  const [rows, setRows, dirty] = useDraft(server);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [asking, setAsking] = useState<string | null>(null);
  const [probing, setProbing] = useState<string | null>(null);
  const sort = useSortable(rows, (row) => row.id, setRows);
  const k = (key: string) => t(`${spec.prefix}.${key}`);
  const canAdd = !data.listLimit || server.length < data.listLimit;

  const add = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fields: Record<string, string> = { url: String(form.get("url") ?? "").trim() };
    if (kind === "indexers") fields.api_key = String(form.get("api_key") ?? "").trim();
    void send(path(spec.add), fields);
  };
  const save = () => {
    const fields: Record<string, string> = {
      [spec.order]: rows.map((row) => row.id).join(","),
      [spec.deleted]: deleted.join(","),
    };
    for (const row of rows) if (row.enabled) fields[spec.enabled(row.id)] = "on";
    void send(path(spec.update), fields).then(() => setDeleted([]));
  };
  // re-reads the manifest (or the indexer's caps) on the server and shows the
  // new snapshot in place, leaving unsaved edits of the list alone
  const probe = async (row: Row) => {
    setProbing(row.id);
    try {
      const response = await fetch(spec.refresh(row.id), {
        method: "POST",
        credentials: "same-origin",
        headers: { ...sessionHeaders(session), Accept: "application/json" },
      });
      const answer = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast(answer.error || k("refreshFailed"), "error");
        return;
      }
      setRows((list) =>
        list.map((r) => {
          if (r.id !== row.id) return r;
          if (kind === "addons")
            return { ...r, name: answer.name || r.name, logo: answer.logo || undefined, resources: answer.resources ?? [] };
          return { ...r, name: answer.name || r.name };
        }),
      );
      toast(k("refreshed"));
    } catch {
      toast(k("refreshFailed"), "error");
    } finally {
      setProbing(null);
    }
  };
  const target = rows.find((row) => row.id === asking);

  return (
    <Section
      id={spec.id}
      icon={spec.icon}
      title={k("title")}
      intro={kind === "indexers" ? k("intro") : undefined}
    >
      <form className={kind === "indexers" ? "pf-add pf-add-wide" : "pf-add"} onSubmit={add}>
        <input
          name="url"
          type="url"
          className="input"
          required
          disabled={!canAdd}
          pattern={kind === "addons" ? "https?://.*manifest\\.json$" : "https?://.*"}
          title={k("validation")}
          placeholder={k("placeholder")}
          aria-label={k("placeholder")}
        />
        {kind === "indexers" && (
          <input
            name="api_key"
            type="text"
            className="input"
            autoComplete="off"
            disabled={!canAdd}
            placeholder={k("apiKeyPlaceholder")}
            aria-label={k("apiKeyPlaceholder")}
          />
        )}
        <button type="submit" className="button" disabled={!canAdd || busy}>
          <Icon name="plus" size={18} />
          {k("add")}
        </button>
      </form>
      {kind === "indexers" && <p className="fine">{k("reachableHint")}</p>}
      {!canAdd && <p className="fine">{k("maxReached")}</p>}

      <div className="pf-list-head">
        <h4>{k(kind === "addons" ? "yourAddons" : "yourIndexers")}</h4>
        {rows.length > 1 && <p className="fine">{k("dragHint")}</p>}
      </div>
      <ul className="pf-rows" ref={sort.list}>
        {rows.map((row) => (
          <li key={row.id} data-sort-row className={sort.dragging === row.id ? "dragging" : undefined}>
            <Grip label={k("dragHint")} props={sort.handle(row.id)} />
            {kind === "addons" && <AddonLogo addon={row as Addon} />}
            <div className="pf-row-main">
              {row.name ? (
                <>
                  <strong className="pf-truncate">{row.name}</strong>
                  <span className="pf-row-meta mono pf-truncate">{row.url}</span>
                </>
              ) : (
                <strong className="mono pf-break">{row.url}</strong>
              )}
              <Tags row={row} kind={kind} />
            </div>
            <button
              type="button"
              className={probing === row.id ? "icon-button pf-spin" : "icon-button"}
              aria-label={k("refresh")}
              title={k("refresh")}
              disabled={probing === row.id}
              onClick={() => void probe(row)}
            >
              <Icon name="refresh" size={18} />
            </button>
            <Switch
              label={k("enabled")}
              hideLabel
              checked={row.enabled}
              onChange={(on) => setRows((list) => list.map((r) => (r.id === row.id ? { ...r, enabled: on } : r)))}
            />
            <button
              type="button"
              className="icon-button pf-delete"
              aria-label={`${t("bulk.remove")}: ${labelOf(row)}`}
              title={t("bulk.remove")}
              onClick={() => setAsking(row.id)}
            >
              <Icon name="trash" size={18} />
            </button>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="pf-empty">
            <p>{k(kind === "addons" ? "noAddons" : "noIndexers")}</p>
            <p className="fine">{k(kind === "addons" ? "noAddonsHint" : "noIndexersHint")}</p>
          </li>
        )}
      </ul>
      <ListFoot
        guide={{ href: path(spec.guide), label: k("howTo") }}
        save={k("save")}
        dirty={dirty || deleted.length > 0}
        onSave={save}
      />
      <Confirm
        open={!!target}
        onClose={() => setAsking(null)}
        title={k("title")}
        text={fillV(k("deleteConfirm"), target ? labelOf(target) : "")}
        action={t("bulk.remove")}
        onConfirm={() => {
          if (!target) return;
          setDeleted((ids) => [...ids, target.id]);
          setRows((list) => list.filter((r) => r.id !== target.id));
          toast(k("deleted"));
        }}
      />
    </Section>
  );
}

function AddonLogo({ addon }: { addon: Addon }) {
  return (
    <span className="pf-logo" aria-hidden="true">
      <span>{(addon.name || "?").slice(0, 1).toUpperCase()}</span>
      {addon.logo && (
        <img
          key={addon.logo}
          src={addon.logo}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(event) => event.currentTarget.remove()}
        />
      )}
    </span>
  );
}

function Tags({ row, kind }: { row: Row; kind: ListKind }) {
  const { t } = useI18n();
  const tags: string[] = [];
  if (kind === "addons") tags.push(...(row as Addon).resources);
  else {
    const ix = row as Indexer;
    if (ix.movie) tags.push("movie");
    if (ix.series) tags.push("series");
  }
  const keyStored = kind === "indexers" && (row as Indexer).apiKey;
  if (!tags.length && !keyStored) return null;
  return (
    <span className="pf-tags">
      {keyStored && <span className="chip olive">{t("profile.indexers.apiKeyStored")}</span>}
      {tags.map((tag) => (
        <span key={tag} className="chip mono">
          {tag}
        </span>
      ))}
    </span>
  );
}

export const Addons = () => <SourceList kind="addons" />;
export const Indexers = () => <SourceList kind="indexers" />;

export function StreamSettings() {
  const { t, path } = useI18n();
  const { data } = usePage<ProfileData>();
  const { send } = useSend();
  const [settings, setSettings, dirty] = useDraft(data.settings);
  const sort = useSortable(
    settings.resolutions,
    (r) => r.resolution,
    (resolutions) => setSettings((s) => ({ ...s, resolutions })),
  );

  const save = () => {
    const fields: Record<string, string> = {
      resolution_order: settings.resolutions.map((r) => r.resolution).join(","),
      preferred_language: settings.preferredLanguage,
    };
    for (const r of settings.resolutions) if (r.enabled) fields[`resolution_${r.resolution}`] = "on";
    if (settings.discoverOnly) fields.discover_only = "on";
    void send(path("/stremio/settings/update"), fields);
  };

  return (
    <Section id="stremio-settings" icon="settings" title={t("profile.settings.title")}>
      <div className="pf-list-head">
        <h4>{t("profile.settings.resolutions")}</h4>
        <p className="fine">{t("profile.settings.dragHint")}</p>
      </div>
      <ul className="pf-rows" ref={sort.list}>
        {settings.resolutions.map((r) => (
          <li key={r.resolution} data-sort-row className={sort.dragging === r.resolution ? "dragging" : undefined}>
            <Grip label={t("profile.settings.dragHint")} props={sort.handle(r.resolution)} />
            <div className="pf-row-main">
              <strong className="pf-resolution">{r.resolution}</strong>
            </div>
            <Switch
              label={r.resolution}
              hideLabel
              checked={r.enabled}
              onChange={(on) =>
                setSettings((s) => ({
                  ...s,
                  resolutions: s.resolutions.map((x) => (x.resolution === r.resolution ? { ...x, enabled: on } : x)),
                }))
              }
            />
          </li>
        ))}
      </ul>
      <div className="pf-setting">
        <div>
          <label className="pf-setting-title" htmlFor="pf-language">
            {t("profile.settings.preferredLanguage")}
          </label>
          <p className="fine">{t("profile.settings.preferredLanguageDesc")}</p>
        </div>
        <select
          id="pf-language"
          className="select"
          value={settings.preferredLanguage}
          onChange={(event) => setSettings((s) => ({ ...s, preferredLanguage: event.target.value }))}
        >
          <option value="">{t("profile.settings.preferredLanguageAny")}</option>
          {data.languages.map((l) => (
            <option key={l.code} value={l.code}>
              {l.flag} {l.name}
            </option>
          ))}
        </select>
      </div>
      <div className="pf-setting">
        <div>
          <p className="pf-setting-title">{t("profile.settings.discoverOnly")}</p>
          <p className="fine">{t("profile.settings.discoverOnlyDesc")}</p>
          <p className="fine">{t("profile.settings.discoverOnlyHint")}</p>
        </div>
        <Switch
          label={t("profile.settings.discoverOnly")}
          hideLabel
          checked={settings.discoverOnly}
          onChange={(on) => setSettings((s) => ({ ...s, discoverOnly: on }))}
        />
      </div>
      <ListFoot save={t("profile.settings.save")} dirty={dirty} onSave={save} />
    </Section>
  );
}

export function Subscriptions() {
  const { t, path, lang } = useI18n();
  const { data } = usePage<ProfileData>();
  const { send } = useSend();
  const [rows, setRows, dirty] = useDraft(data.subscriptions);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [asking, setAsking] = useState<string | null>(null);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const languageName = (code?: string) => data.languages.find((l) => l.code === code)?.name ?? "";
  const subtitle = (sub: Subscription) =>
    sub.season ? t("profile.subscriptions.season", { Season: sub.season }) : t("profile.subscriptions.movie");

  const save = () => {
    const fields: Record<string, string> = { deleted_subscriptions: deleted.join(",") };
    for (const row of rows) if (row.enabled) fields[`subscription_${row.id}_enabled`] = "on";
    void send(path("/subscription/update"), fields).then(() => setDeleted([]));
  };
  const target = rows.find((row) => row.id === asking);

  return (
    <Section id="subscriptions" icon="bell" title={t("profile.subscriptions.title")} intro={t("profile.subscriptions.intro")}>
      {!data.paid && (
        <p className="fine">
          {t("profile.subscriptions.usage", { Count: data.subscriptions.length, Limit: data.subscriptionLimit })}
        </p>
      )}
      <ul className="pf-rows">
        {rows.map((sub) => {
          const prefs = [...sub.resolutions, languageName(sub.language)].filter(Boolean).join(" · ");
          return (
            <li key={sub.id}>
              <span className="pf-poster" aria-hidden="true">
                <img src={sub.poster} alt="" loading="lazy" onError={(event) => event.currentTarget.remove()} />
              </span>
              <div className="pf-row-main">
                <strong className="pf-truncate">{sub.title}</strong>
                <span className="pf-tags">
                  <span className="chip">{subtitle(sub)}</span>
                  <span className={sub.state === "active" ? "chip olive" : "chip"}>
                    {t(
                      sub.state === "completed"
                        ? "profile.subscriptions.stateCompleted"
                        : sub.state === "pending"
                          ? "profile.subscriptions.statePending"
                          : "profile.subscriptions.stateActive",
                    )}
                  </span>
                </span>
                {sub.checkedAt && (
                  <span className="pf-row-meta">
                    {t("profile.subscriptions.lastChecked", { Ago: timeAgo(sub.checkedAt, lang) })}
                  </span>
                )}
                <span className="pf-row-meta pf-truncate">{prefs || t("profile.subscriptions.prefsAny")}</span>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label={t("profile.subscriptions.prefs")}
                title={t("profile.subscriptions.prefs")}
                onClick={() => setEditing(sub)}
              >
                <Icon name="settings" size={18} />
              </button>
              <Switch
                label={t("profile.subscriptions.enabled")}
                hideLabel
                checked={sub.enabled}
                onChange={(on) => setRows((list) => list.map((r) => (r.id === sub.id ? { ...r, enabled: on } : r)))}
              />
              <button
                type="button"
                className="icon-button pf-delete"
                aria-label={`${t("bulk.remove")}: ${sub.title}`}
                title={t("bulk.remove")}
                onClick={() => setAsking(sub.id)}
              >
                <Icon name="trash" size={18} />
              </button>
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="pf-empty">
            <p>{t("profile.subscriptions.none")}</p>
            <p className="fine">{t("profile.subscriptions.noneHint")}</p>
          </li>
        )}
      </ul>
      {rows.length + deleted.length > 0 && (
        <ListFoot save={t("profile.subscriptions.save")} dirty={dirty || deleted.length > 0} onSave={save} />
      )}
      <Confirm
        open={!!target}
        onClose={() => setAsking(null)}
        title={t("profile.subscriptions.title")}
        text={fillV(t("profile.subscriptions.deleteConfirm"), target?.title ?? "")}
        action={t("bulk.remove")}
        onConfirm={() => {
          if (!target) return;
          setDeleted((ids) => [...ids, target.id]);
          setRows((list) => list.filter((r) => r.id !== target.id));
          toast(t("profile.subscriptions.deleted"));
        }}
      />
      <SubscriptionPrefs sub={editing} subtitle={editing ? subtitle(editing) : ""} onClose={() => setEditing(null)} />
    </Section>
  );
}

/** What one subscription reports: its own resolutions and language, posted on their own. */
function SubscriptionPrefs({ sub, subtitle, onClose }: { sub: Subscription | null; subtitle: string; onClose: () => void }) {
  const { t, path } = useI18n();
  const { data } = usePage<ProfileData>();
  const { send, busy } = useSend();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!sub) return;
    const form = new FormData(event.currentTarget);
    void send(path(`/subscription/preferences/${sub.id}`), {
      res: form.getAll("res").map(String),
      lang: String(form.get("lang") ?? ""),
    }).then(onClose);
  };
  return (
    <Dialog
      open={!!sub}
      onClose={onClose}
      title={t("profile.subscriptions.prefs")}
      subtitle={sub ? `${sub.title} · ${subtitle}` : undefined}
    >
      {sub && (
        <form className="pf-dialog-form" onSubmit={submit}>
          <fieldset className="pf-fieldset">
            <legend>{t("profile.settings.resolutions")}</legend>
            <div className="pf-checks">
              {data.resolutions.map((res) => (
                <label key={res} className="check">
                  <input type="checkbox" name="res" value={res} defaultChecked={sub.wants.includes(res)} />
                  {res}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="field">
            <label htmlFor="pf-sub-lang">{t("profile.settings.preferredLanguage")}</label>
            <select id="pf-sub-lang" name="lang" className="select" defaultValue={sub.language ?? ""}>
              <option value="">{t("profile.settings.preferredLanguageAny")}</option>
              {data.languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.flag} {l.name}
                </option>
              ))}
            </select>
          </div>
          <p className="fine">{t("profile.subscriptions.prefsHint")}</p>
          <div className="dialog-actions">
            <button type="button" className="button quiet" onClick={onClose}>
              {t("profile.subscriptions.prefsCancel")}
            </button>
            <button type="submit" className="button accent" disabled={busy}>
              {t("profile.subscriptions.save")}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
