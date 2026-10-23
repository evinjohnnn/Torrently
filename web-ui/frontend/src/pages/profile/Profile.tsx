import { useEffect, useState, type MouseEvent } from "react";
import { usePage } from "../../app/router";
import { useI18n } from "../../i18n";
import { Icon } from "../../ui/Icon";
import { AccountActions, AdultContent, Email, Password, Plan, Vault } from "./Account";
import { API, Devices, EmbedDomains, S3, WebDAV } from "./Integrations";
import { errorHome } from "./kit";
import { Addons, Indexers, StreamingBackends, StreamSettings, StremioAddon, Subscriptions } from "./Stremio";
import type { ProfileData } from "./types";
import "./profile.css";

export const namespaces = ["profile", "vault", "auth", "bulk"];

interface Entry {
  id: string;
  label: string;
}

interface Group {
  id: string;
  title?: string;
  entries: Entry[];
}

/** The page's sections in order, grouped as the index lists them. */
function useGroups(): Group[] {
  const { t } = useI18n();
  const { data } = usePage<ProfileData>();
  const groups: Group[] = [
    {
      id: "account",
      entries: [
        { id: "tier", label: data.tier.name },
        ...(data.vault ? [{ id: "vault", label: t("vault.dashboard.title") }] : []),
      ],
    },
    {
      id: "group-stremio",
      title: t("profile.stremio"),
      entries: [
        { id: "stremio", label: t("profile.stremio.title") },
        { id: "streaming-backends", label: t("profile.backends.title") },
        { id: "addon-urls", label: t("profile.addons.title") },
        { id: "torznab-indexers", label: t("profile.indexers.title") },
        { id: "stremio-settings", label: t("profile.settings.title") },
        { id: "subscriptions", label: t("profile.subscriptions.title") },
      ],
    },
  ];
  const integrations: Entry[] = [];
  if (data.webdav) integrations.push({ id: "webdav", label: t("profile.webdav.title") });
  if (data.s3) integrations.push({ id: "s3", label: t("profile.s3.title") });
  if (data.api) integrations.push({ id: "api", label: t("profile.api.title") });
  if (data.api?.devices.length) integrations.push({ id: "devices", label: t("profile.devices.title") });
  if (data.embed) integrations.push({ id: "embed-domains", label: t("profile.embedDomains.title") });
  if (integrations.length) groups.push({ id: "group-integrations", title: t("profile.integrations"), entries: integrations });
  if (data.password)
    groups.push({
      id: "group-administration",
      title: t("profile.administration"),
      entries: [{ id: "password", label: t("profile.password.title") }],
    });
  groups.push({
    id: "group-preferences",
    title: t("profile.preferences"),
    entries: [
      ...(data.email ? [{ id: "email", label: t("profile.email.title") }] : []),
      { id: "adult-content-section", label: t("profile.adultContent.title") },
    ],
  });
  return groups;
}

/**
 * Brings a section into view without going through the router: a fragment
 * link would fire popstate, and the router would load the page again.
 * Old links carry the fragment with its own "#" (/profile##stremio).
 */
function reveal(id: string, smooth: boolean) {
  const target = document.getElementById(id.replace(/^#+/, ""));
  if (!target) return false;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: smooth && !still ? "smooth" : "auto", block: "start" });
  return true;
}

/** The section index on wide screens, marking the section being read. */
function Index({ groups }: { groups: Group[] }) {
  const { t } = useI18n();
  const [current, setCurrent] = useState(groups[0].entries[0].id);
  const ids = groups.flatMap((g) => g.entries.map((e) => e.id)).join(",");

  // the section whose top has passed under the nav is the one being read
  useEffect(() => {
    const list = ids.split(",");
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) + 24 || 120;
      let reading = list[0];
      for (const id of list) {
        const node = document.getElementById(id);
        if (node && node.getBoundingClientRect().top <= line) reading = id;
      }
      // at the very bottom the last sections never reach the line
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) {
        const last = list.filter((id) => {
          const node = document.getElementById(id);
          return node && node.getBoundingClientRect().top < innerHeight;
        });
        const asked = location.hash.slice(1);
        if (last.length) reading = last.includes(asked) ? asked : last[last.length - 1];
      }
      setCurrent(reading);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
    };
  }, [ids]);

  const jump = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    if (reveal(id, true)) {
      history.replaceState(history.state, "", `#${id}`);
      document.getElementById(id)?.focus({ preventScroll: true });
    }
  };

  return (
    <nav className="pf-index" aria-label={t("profile.title")}>
      {groups.map((group) => (
        <div key={group.id} className="pf-index-group">
          {group.title && <p className="pf-index-title">{group.title}</p>}
          <ul>
            {group.entries.map((entry) => (
              <li key={entry.id}>
                <a
                  href={`#${entry.id}`}
                  className={entry.id === current ? "active" : undefined}
                  aria-current={entry.id === current ? "location" : undefined}
                  onClick={(event) => jump(event, entry.id)}
                >
                  {entry.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function GroupTitle({ id, title }: { id: string; title: string }) {
  return (
    <h2 id={id} className="pf-group-title">
      {title}
    </h2>
  );
}

export default function Profile() {
  const { t } = useI18n();
  const { data } = usePage<ProfileData>();
  const groups = useGroups();

  // a link from elsewhere (/profile#stremio) lands on its section once drawn
  useEffect(() => {
    if (location.hash) reveal(decodeURIComponent(location.hash.slice(1)), false);
  }, []);

  // an error no section claims (deleting the account, say) shows up top
  const stray = data.errKey && !errorHome(data.errFrom);

  return (
    <div className="wrap pf-page">
      <header className="pf-head">
        <h1>{t("profile.title")}</h1>
        <p className="lede">{t("profile.subtitle")}</p>
      </header>
      <div className="pf-layout">
        <Index groups={groups} />
        <div className="pf-body">
          {stray && (
            <div className="notice error" role="alert">
              <Icon name="alert" />
              <span>{t(data.errKey!)}</span>
            </div>
          )}
          <Plan />
          {data.vault && <Vault />}

          {/* Stremio first: connecting the addon is what keeps people (docs/onboarding_empty_states.md) */}
          <GroupTitle id="group-stremio" title={t("profile.stremio")} />
          <StremioAddon />
          <StreamingBackends />
          <Addons />
          <Indexers />
          <StreamSettings />
          <Subscriptions />

          {(data.webdav || data.s3 || data.api || data.embed) && (
            <GroupTitle id="group-integrations" title={t("profile.integrations")} />
          )}
          {data.webdav && <WebDAV />}
          {data.s3 && <S3 />}
          {data.api && <API />}
          {data.api && <Devices />}
          {data.embed && <EmbedDomains />}

          {data.password && (
            <>
              <GroupTitle id="group-administration" title={t("profile.administration")} />
              <Password />
            </>
          )}

          <GroupTitle id="group-preferences" title={t("profile.preferences")} />
          {data.email && <Email />}
          <AdultContent />

          <AccountActions />
        </div>
      </div>
    </div>
  );
}
