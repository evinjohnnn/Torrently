import { useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { t } from "../lib/env.ts";
import { CLAMP_LINE_HEIGHT, findTextCut, trimTextCut } from "../lib/textClamp.ts";

// ExpandableText — text block clamped to `lines` line-heights with a
// clickable "…" rendered INLINE at the cut point, like a link. Clicking
// expands the full text; an inline "↑" at the end collapses it back.
//
// Inline placement needs a real text cut, not CSS clamping: the cut
// index comes from findTextCut, measured on an invisible clone of the
// paragraph so React-managed DOM is never mutated directly. The em math
// assumes the .expandable line-height (CLAMP_LINE_HEIGHT).
export function ExpandableText({
  text,
  lines = 3,
  className = "",
}: {
  text?: string;
  lines?: number;
  className?: string;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [cut, setCut] = useState<number | null>(null);

  useLayoutEffect(() => {
    setExpanded(false);
    const el = ref.current;
    if (!el || !el.parentNode || !text) {
      setCut(null);
      return;
    }
    let raf = 0;
    let tries = 0;
    const measure = () => {
      if (!el.parentNode) return;
      // Zero width means we're inside a not-yet-open <dialog>
      // (display:none until showModal runs) — every measurement would be
      // meaningless. Retry on subsequent frames; give up after ~1s and
      // stay clamped without a toggle.
      if (el.clientWidth === 0) {
        if (++tries <= 60) raf = requestAnimationFrame(measure);
        return;
      }
      const meas = el.cloneNode(false) as HTMLElement;
      meas.style.position = "absolute";
      meas.style.visibility = "hidden";
      meas.style.width = el.clientWidth + "px";
      meas.style.maxHeight = `calc(${lines} * ${CLAMP_LINE_HEIGHT}em)`;
      meas.style.overflow = "hidden";
      el.parentNode.insertBefore(meas, el);
      setCut(findTextCut(meas, text));
      meas.remove();
    };
    measure();
    return () => cancelAnimationFrame(raf);
  }, [text, lines]);

  if (!text) return null;

  const truncated = !expanded && cut != null;
  const visible = truncated ? trimTextCut(text, cut) : text;
  const toggle = (event: MouseEvent) => {
    event.stopPropagation();
    setExpanded((v) => !v);
  };

  return (
    <p
      ref={ref}
      className={`expandable ${className}`}
      style={expanded ? undefined : { maxHeight: `calc(${lines} * ${CLAMP_LINE_HEIGHT}em)`, overflow: "hidden" }}
    >
      {visible}
      {cut != null && (
        <>
          {" "}
          <button
            type="button"
            className="expand-toggle"
            onClick={toggle}
            aria-expanded={expanded}
            aria-label={expanded ? t("discover.collapse") : t("discover.expand")}
          >
            {expanded ? "↑" : "…"}
          </button>
        </>
      )}
    </p>
  );
}
