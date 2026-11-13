import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { getConcept, type BackdropParams } from "./concepts";
import { ribCombGradient } from "./glsl";
import { LenticularRenderer } from "./renderer";

export interface LenticularBackdropProps {
  concept: string;
  /** overrides for the concept's defaults */
  params?: Partial<BackdropParams>;
  /**
   * What the scene follows behind the glass: the whole window, the backdrop's
   * own parent, a given element, or nothing.
   */
  pointer?: "window" | "parent" | "none" | RefObject<HTMLElement | null>;
  /** slow drift; ignored when the viewer prefers reduced motion */
  motion?: boolean;
  /**
   * Scroll parallax: the scene rises this fraction of the page's scroll,
   * over the first screen only. 0 turns it off; so does reduced motion.
   */
  scrollRate?: number;
  /** caps the backing-store resolution, in device pixels per CSS pixel */
  maxDpr?: number;
  /**
   * Scale ribs as if the element were this many CSS pixels wide; use for
   * thumbnails that should preview the full-screen look.
   */
  referenceWidth?: number;
  /** readability veil for UI laid over the backdrop */
  scrim?: "none" | "light" | "dark";
  className?: string;
  style?: CSSProperties;
}

function prefersReducedMotion() {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Fills its positioned parent with a scene seen through lenticular glass.
 * The scene and the glass are separate layers: the scene drifts behind the
 * ribs as the pointer moves, eased, and drawing stops once it settles.
 * Without WebGL the same two layers are approximated in CSS.
 */
export function LenticularBackdrop({
  concept,
  params,
  pointer = "window",
  motion = false,
  scrollRate = 0,
  maxDpr = 2,
  referenceWidth,
  scrim = "none",
  className,
  style,
}: LenticularBackdropProps) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const redraw = useRef<() => void>(() => {});
  const [failed, setFailed] = useState(() => !LenticularRenderer.supported());
  const definition = getConcept(concept);
  const resolved: BackdropParams = { ...definition.defaults, ...params };
  const key = JSON.stringify(resolved);
  const latest = useRef({ concept, params: resolved, referenceWidth });
  latest.current = { concept, params: resolved, referenceWidth };

  useEffect(() => {
    const element = canvas.current;
    if (!element || failed) return;
    let renderer: LenticularRenderer;
    try {
      renderer = new LenticularRenderer(element);
    } catch {
      setFailed(true);
      return;
    }
    const still = prefersReducedMotion();
    const eased: [number, number] = [0.5, 0.5];
    const target: [number, number] = [0.5, 0.5];
    let frame = 0;
    let disposed = false;
    let time = 0;
    const rate = still ? 0 : scrollRate;

    const draw = () => {
      if (disposed) return;
      const dpr = element.width / Math.max(element.clientWidth, 1);
      const { referenceWidth: ref } = latest.current;
      try {
        renderer.render(latest.current.concept, latest.current.params, {
          dpr: ref ? dpr * Math.min(1, element.clientWidth / ref) : dpr,
          time,
          pointer: eased,
          // past the first screen the sheet covers the backdrop
          scroll: rate * Math.min(scrollY, innerHeight),
        });
      } catch (error) {
        console.error(error);
        setFailed(true);
      }
    };
    const tick = () => {
      frame = 0;
      eased[0] += (target[0] - eased[0]) * 0.08;
      eased[1] += (target[1] - eased[1]) * 0.08;
      draw();
      const moving =
        Math.abs(target[0] - eased[0]) > 0.0005 ||
        Math.abs(target[1] - eased[1]) > 0.0005;
      if (moving) frame = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      const w = Math.max(1, Math.round(element.clientWidth * dpr));
      const h = Math.max(1, Math.round(element.clientHeight * dpr));
      if (element.width !== w || element.height !== h) {
        element.width = w;
        element.height = h;
      }
      draw();
    };
    const observer = new ResizeObserver(() => requestAnimationFrame(resize));
    observer.observe(element);

    // pointer parallax, eased; nothing runs once the scene has settled
    const area: HTMLElement | Window | null =
      still || pointer === "none"
        ? null
        : pointer === "window"
          ? window
          : pointer === "parent"
            ? (host.current?.parentElement ?? null)
            : pointer.current;
    const onMove = (event: PointerEvent) => {
      const r =
        area === window
          ? { left: 0, top: 0, width: innerWidth, height: innerHeight }
          : (area as HTMLElement).getBoundingClientRect();
      target[0] = Math.min(1, Math.max(0, (event.clientX - r.left) / r.width));
      target[1] = Math.min(1, Math.max(0, (event.clientY - r.top) / r.height));
      wake();
    };
    const onLeave = () => {
      target[0] = 0.5;
      target[1] = 0.5;
      wake();
    };
    area?.addEventListener("pointermove", onMove as EventListener);
    const leaveTarget = area === window ? document.documentElement : area;
    leaveTarget?.addEventListener("pointerleave", onLeave);
    if (rate) addEventListener("scroll", wake, { passive: true });

    // optional slow drift of the scene itself
    let drift = 0;
    if (motion && !still) {
      let last = 0;
      const step = (now: number) => {
        drift = requestAnimationFrame(step);
        if (now - last < 1000 / 30 || document.hidden) return;
        last = now;
        time = now / 1000;
        draw();
      };
      drift = requestAnimationFrame(step);
    }

    const lost = (event: Event) => {
      event.preventDefault();
      setFailed(true);
    };
    element.addEventListener("webglcontextlost", lost);
    redraw.current = draw;
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      cancelAnimationFrame(drift);
      observer.disconnect();
      area?.removeEventListener("pointermove", onMove as EventListener);
      leaveTarget?.removeEventListener("pointerleave", onLeave);
      removeEventListener("scroll", wake);
      element.removeEventListener("webglcontextlost", lost);
      redraw.current = () => {};
      renderer.dispose();
    };
  }, [failed, maxDpr, motion, pointer, scrollRate]);

  // Redraw on parameter changes without rebuilding the renderer.
  useEffect(() => redraw.current(), [concept, key, referenceWidth]);

  const fill: CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    display: "block",
  };
  const colors = (
    definition.palettes[resolved.palette] ?? definition.palettes[0]
  ).colors;
  const [gx, gy] = definition.glow;
  // the CSS stand-in keeps the same two layers: a rib comb over the light
  const fallback: CSSProperties = {
    ...fill,
    backgroundColor: colors[1],
    backgroundImage: [
      ribCombGradient(resolved.ribWidth),
      `radial-gradient(closest-side at ${gx}% ${gy}%, ${colors[3]}, transparent 35%)`,
      `radial-gradient(closest-side at ${gx}% ${gy}%, ${colors[2]}, transparent)`,
      `linear-gradient(to bottom, ${colors[0]}, ${colors[1]})`,
    ].join(", "),
  };
  return (
    <div
      ref={host}
      className={className}
      style={{ position: "absolute", inset: 0, overflow: "hidden", ...style }}
      aria-hidden="true"
    >
      {failed ? <div style={fallback} /> : <canvas ref={canvas} style={fill} />}
      {scrim !== "none" && (
        <div
          style={{
            ...fill,
            background:
              scrim === "light"
                ? "linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,255,255,0.15) 45%, rgba(255,255,255,0.5))"
                : "linear-gradient(180deg, rgba(8,8,10,0.6), rgba(8,8,10,0.2) 45%, rgba(8,8,10,0.55))",
          }}
        />
      )}
    </div>
  );
}
