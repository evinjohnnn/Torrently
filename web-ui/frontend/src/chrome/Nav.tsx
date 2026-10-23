import { useEffect, useRef, useState } from "react";
import { Link, useNavigation, usePage } from "../app/router";
import { LiquidGlass } from "../glass/LiquidGlass";
import { LANGUAGE_NAMES, LANGUAGES, langPath, useI18n } from "../i18n";
import { Icon, type IconName } from "../ui/Icon";
import { Wordmark } from "./Wordmark";

interface Item {
  href: string;
  label: string;
  icon: IconName;
  badge?: number;
  external?: boolean;
}

function useItems(): Item[] {
  const { t, path, lang } = useI18n();
  const { view, session } = usePage();
  if (session.user) {
    const items: Item[] = [
      { href: path("/discover"), label: t("nav.discover"), icon: "compass" },
      { href: path("/lib/"), label: t("nav.library"), icon: "library" },
    ];
    if (session.vault) items.push({ href: path("/vault"), label: t("nav.vault"), icon: "vault" });
    items.push({
      href: path("/notifications"),
      label: t("nav.notifications"),
      icon: "bell",
      badge: session.unreadNotifications,
    });
    return items;
  }
  // visitors on the home page get its sections; elsewhere, the same
  // sections on the home page
  const base = view === "index" ? "" : path("/");
  return [
    { href: `${base}#how`, label: t("nav.howItWorks"), icon: "info" },
    { href: `${base}#features`, label: t("nav.features"), icon: "sparkle" },
    { href: `${base}#faq`, label: t("nav.faq"), icon: "info" },
  ];
}

function NavLink({ item, onNavigate }: { item: Item; onNavigate?: () => void }) {
  const current =
    !item.external && !item.href.includes("#") && location.pathname.startsWith(item.href);
  const content = (
    <>
      <span>{item.label}</span>
      {item.badge ? (
        <span className="nav-badge" aria-label={String(item.badge)}>
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      ) : null}
    </>
  );
  if (item.external)
    return (
      <a className="nav-link" href={item.href} target="_blank" rel="noopener">
        {content}
      </a>
    );
  if (item.href.startsWith("#"))
    return (
      <a className="nav-link" href={item.href} onClick={onNavigate}>
        {content}
      </a>
    );
  return (
    <Link
      className="nav-link"
      href={item.href}
      aria-current={current ? "page" : undefined}
      onClick={onNavigate}
    >
      {content}
    </Link>
  );
}

function LanguageMenu() {
  const { lang } = useI18n();
  const { session } = usePage();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    addEventListener("pointerdown", close);
    addEventListener("keydown", key);
    return () => {
      removeEventListener("pointerdown", close);
      removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <div className="lang-menu" ref={root}>
      <button
        type="button"
        className="nav-pill"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen(!open)}
      >
        <Icon name="globe" size={17} />
        <span>{lang.toUpperCase()}</span>
        <Icon name="chevron" size={15} />
      </button>
      {open && (
        <ul className="lang-list glass" role="menu">
          {LANGUAGES.map((code) => (
            <li key={code} role="none">
              {/* ?lang= also sets the cookie the server reads next time */}
              <a
                role="menuitem"
                lang={code}
                href={`${langPath(code, session.path)}?lang=${code}`}
                aria-current={code === lang ? "true" : undefined}
              >
                {LANGUAGE_NAMES[code] ?? code}
                {code === lang && <Icon name="check" size={16} />}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Account() {
  const { t, path } = useI18n();
  const { session } = usePage();
  const plan =
    session.tier === "free" || !session.tier ? t("nav.donate") : session.tier;
  return (
    <div className="nav-account">
      <Link className="nav-pill plan" href={path("/donate")}>
        <Icon name="heart" size={16} />
        <span>{plan}</span>
      </Link>
      {session.user ? (
        <Link
          className="avatar"
          href={path("/profile")}
          aria-label={t("nav.profile")}
          title={session.user.email}
        >
          {(session.user.email[0] ?? "?").toUpperCase()}
        </Link>
      ) : (
        <Link className="button primary small" href={path("/login")}>
          {t("nav.login")}
        </Link>
      )}
    </div>
  );
}

export function Nav() {
  const items = useItems();
  const { t, path } = useI18n();
  const { state } = useNavigation();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // over scrolled content the glass thickens, so the links stay readable
  useEffect(() => {
    const update = () => setScrolled(scrollY > 24);
    update();
    addEventListener("scroll", update, { passive: true });
    return () => removeEventListener("scroll", update);
  }, []);

  // the sheet closes when the page changes
  useEffect(() => setOpen(false), [state]);
  useEffect(() => {
    document.documentElement.classList.toggle("menu-open", open);
  }, [open]);

  return (
    <header className="nav-shell">
      <nav className={scrolled ? "nav scrolled" : "nav"} aria-label={t("nav.main")}>
        <LiquidGlass />
        <Link className="nav-home" href={path("/")} aria-label="Torrently">
          <Wordmark />
        </Link>
        <div className="nav-links">
          {items.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </div>
        <div className="nav-end">
          <LanguageMenu />
          <Account />
          <button
            type="button"
            className="icon-button nav-toggle"
            aria-expanded={open}
            aria-controls="nav-sheet"
            aria-label={t("nav.menu")}
            onClick={() => setOpen(!open)}
          >
            <Icon name={open ? "close" : "menu"} />
          </button>
        </div>
      </nav>
      {open && (
        <div id="nav-sheet" className="nav-sheet glass">
          {items.map((item) => (
            <NavLink key={item.href} item={item} onNavigate={() => setOpen(false)} />
          ))}
        </div>
      )}
    </header>
  );
}
