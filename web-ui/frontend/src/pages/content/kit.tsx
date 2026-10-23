// The frame the content pages share (about, guides, legal, support, speed
// test, membership, errors): a title over the glass, then the long part on
// paper, read at a comfortable measure.
import type { MouseEvent, ReactNode } from "react";
import { useNavigation } from "../../app/router";
import { Icon } from "../../ui/Icon";
import "./content.css";

/** The page's title and lede, straight on the backdrop. */
export function PageHead({
  title,
  lede,
  wide,
  children,
}: {
  title: ReactNode;
  lede?: ReactNode;
  /** lines up with a wide sheet */
  wide?: boolean;
  children?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div className={wide ? "wrap" : "wrap narrow"}>
        <h1>{title}</h1>
        {lede && <p className="lede">{lede}</p>}
        {children}
      </div>
    </header>
  );
}

/** Paper over the glass for everything past the head. */
export function Sheet({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="page-sheet">
      <div className={wide ? "wrap" : "wrap narrow"}>{children}</div>
    </div>
  );
}

/**
 * Keeps clicks on the site's own links inside the app, for text that comes
 * as markup (translations with <a>, the legal pages' HTML).
 */
export function useInAppLinks() {
  const { navigate } = useNavigation();
  return (event: MouseEvent<HTMLElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
    const url = new URL(anchor.href, location.href);
    if (url.origin !== location.origin) return;
    event.preventDefault();
    void navigate(url.href);
  };
}

/** Running text, links staying in the app. */
export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  const onClick = useInAppLinks();
  return (
    <div className={className ? `prose-text ${className}` : "prose-text"} onClick={onClick}>
      {children}
    </div>
  );
}

/** "Note:" / "Important:" asides of the guides. */
export function Aside({ label, tone, children }: { label: string; tone?: "warn"; children: ReactNode }) {
  return (
    <div className={tone ? `notice ${tone}` : "notice"}>
      <Icon name={tone ? "alert" : "info"} />
      <p>
        <strong>{label}</strong> {children}
      </p>
    </div>
  );
}

export function ErrorNotice({ children }: { children: ReactNode }) {
  return (
    <div className="notice error" role="alert">
      <Icon name="alert" />
      <p>{children}</p>
    </div>
  );
}

/** Fills Go printf verbs (%v, %s, %d) in order: some keys are used with printf. */
export function printf(format: string, ...args: (string | number)[]) {
  let index = 0;
  return format.replace(/%[vsd]/g, (verb) => (index < args.length ? String(args[index++]) : verb));
}
