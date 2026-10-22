import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";
import { LenticularBackdrop } from "../backdrops/LenticularBackdrop";

const SAMPLE_DOC = {
  title: "Northwind pricing call",
  meta: "Today · 10:30 am · 32 min · Alex Park, Priya",
  lines: [
    { type: "label", text: "Decisions" },
    { type: "item", text: "Annual plan agreed at $64k with EU data residency" },
    {
      type: "item",
      text: "Pilot expands to 50 active seats starting November",
    },
    { type: "label", text: "Action items" },
    { type: "item", text: "Send the security questionnaire by Thursday" },
    { type: "item", text: "Coordinate procurement kickoff meeting next week" },
    { type: "label", text: "Open questions" },
    { type: "item", text: "Confirm lead signatory on Northwind legal team" },
  ],
};

function Icon({
  size = 13,
  stroke = 1.8,
  children,
}: {
  size?: number;
  stroke?: number;
  children: ReactNode;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
const Search = () => (
  <Icon>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </Icon>
);
const Check = () => (
  <Icon stroke={2.5}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
);
const Copy = () => (
  <Icon>
    <rect x="8" y="8" width="14" height="14" rx="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </Icon>
);
const Share = () => (
  <Icon>
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
    <path d="M16 6l-4-4-4 4" />
    <path d="M12 2v13" />
  </Icon>
);

function prefersReducedMotion() {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The liquid-glass call to action, with a lens highlight that follows the cursor. */
function GlassButton({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const [lens, setLens] = useState<CSSProperties>({});
  const move = (event: PointerEvent<HTMLAnchorElement>) => {
    const r = event.currentTarget.getBoundingClientRect();
    setLens({
      "--lx": `${event.clientX - r.left}px`,
      "--ly": `${event.clientY - r.top}px`,
    } as CSSProperties);
  };
  return (
    <a className="np-cta" href={href} style={lens} onPointerMove={move}>
      <span>{children}</span>
    </a>
  );
}

export function NotepadHero() {
  const section = useRef<HTMLElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const total = SAMPLE_DOC.lines.length;
  const [count, setCount] = useState(() =>
    prefersReducedMotion() ? total : 0,
  );

  // Keep the window at 1080px and scale it down to fit, rather than reflowing it.
  useLayoutEffect(() => {
    const box = holder.current;
    const win = frame.current;
    if (!box || !win) return;
    const update = () =>
      box.style.setProperty(
        "--np-s",
        Math.min(1, box.clientWidth / win.offsetWidth).toFixed(4),
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // Notes arrive line by line, pause, then start again.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const timer = setTimeout(
      () => setCount((c) => (c < total ? c + 1 : 0)),
      count === 0 ? 600 : count >= total ? 3500 : 420,
    );
    return () => clearTimeout(timer);
  }, [count, total]);

  return (
    <section ref={section} className="np-hero">
      <div className="np-backdrop" aria-hidden="true">
        <LenticularBackdrop
          concept="monolith"
          params={{ palette: 1 }}
          pointer={section}
        />
        <div className="np-fade" />
      </div>

      <div className="np-copy">
        <h1>
          The notes that wrote themselves
          <br className="np-md" /> while you were talking
        </h1>
        <p>
          Summary, action items, and the full transcript are ready the moment
          the call ends.
        </p>
        <div className="np-cta-row">
          <GlassButton href="#download">Download Natively</GlassButton>
        </div>
      </div>

      <div className="np-window-area">
        <div ref={holder} className="np-holder">
          <div ref={frame} className="np-window np-glass-surface">
            <aside className="np-sidebar">
              <div className="np-titlebar">
                <div className="np-lights" aria-hidden="true">
                  <span style={{ background: "#f08ba3" }} />
                  <span style={{ background: "#f2c661" }} />
                  <span style={{ background: "#b9a1f6" }} />
                </div>
                <span className="np-app-name">Natively</span>
              </div>
              <div className="np-search">
                <Search />
                Search or ask anything...
              </div>
              <div className="np-list">
                <p className="np-list-label">Today</p>
                <div className="np-list-item">
                  <span>Northwind pricing call</span>
                  <span className="np-duration">32:14</span>
                </div>
              </div>
            </aside>

            <div className="np-note">
              <div className="np-note-head">
                <h2>{SAMPLE_DOC.title}</h2>
                <div className="np-ready">
                  <span className="np-check">
                    <Check />
                  </span>
                  Notes ready
                </div>
              </div>

              <div className="np-toolbar">
                <div className="np-tabs">
                  <span className="np-tab-active">Summary</span>
                  <span>Transcript</span>
                  <span>Ask</span>
                </div>
                <div className="np-actions">
                  <span>
                    <Copy /> Copy
                  </span>
                  <span>
                    <Share /> Share
                  </span>
                </div>
              </div>

              <div className="np-lines" aria-live="polite">
                <p className="np-meta">{SAMPLE_DOC.meta}</p>
                {SAMPLE_DOC.lines.slice(0, count).map((line, i) => (
                  <div key={i} className="np-line">
                    {line.type === "label" ? (
                      <p className="np-label">{line.text}</p>
                    ) : (
                      <p className="np-item">
                        <span className="np-bullet" aria-hidden="true" />
                        {line.text}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <div className="np-ask-row">
                <div className="np-ask">
                  Ask about this meeting...
                  <div className="np-ask-send" aria-hidden="true">
                    ↑
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
