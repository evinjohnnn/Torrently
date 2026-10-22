import { useEffect, useRef, useState, type CSSProperties } from "react";
import { getConcept, type BackdropParams } from "./concepts";
import { fallbackFor } from "./fallbacks";
import { LenticularRenderer } from "./renderer";

export interface LenticularBackdropProps {
  concept: string;
  /** overrides for the concept's defaults */
  params?: Partial<BackdropParams>;
  /** slow drift; ignored when the viewer prefers reduced motion */
  motion?: boolean;
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

// device pixels per CSS pixel, shrunk when previewing a wider screen
function ribScale(element: HTMLCanvasElement, referenceWidth?: number) {
  const dpr = element.width / Math.max(element.clientWidth, 1);
  return referenceWidth
    ? dpr * Math.min(1, element.clientWidth / referenceWidth)
    : dpr;
}

function prefersReducedMotion() {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Fills its positioned parent with a lenticular glass backdrop. Renders once
 * per size or parameter change; with WebGL2 unavailable or the context lost,
 * it shows the concept's pre-rendered image instead.
 */
export function LenticularBackdrop({
  concept,
  params,
  motion = false,
  maxDpr = 2,
  referenceWidth,
  scrim = "none",
  className,
  style,
}: LenticularBackdropProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<LenticularRenderer | null>(null);
  const redraw = useRef<() => void>(() => {});
  const [failed, setFailed] = useState(() => !LenticularRenderer.supported());
  const resolved: BackdropParams = {
    ...getConcept(concept).defaults,
    ...params,
  };
  const key = JSON.stringify(resolved);
  const latest = useRef({ concept, params: resolved, referenceWidth });
  latest.current = { concept, params: resolved, referenceWidth };

  useEffect(() => {
    const element = canvas.current;
    if (!element || failed) return;
    let frame = 0;
    let disposed = false;
    try {
      renderer.current = new LenticularRenderer(element);
    } catch {
      setFailed(true);
      return;
    }
    const draw = (time = 0) => {
      if (disposed || !renderer.current) return;
      try {
        renderer.current.render(latest.current.concept, latest.current.params, {
          time,
          ribScale: ribScale(element, latest.current.referenceWidth),
        });
      } catch (error) {
        console.error(error);
        setFailed(true);
      }
    };
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      const w = Math.max(1, Math.round(element.clientWidth * dpr));
      const h = Math.max(1, Math.round(element.clientHeight * dpr));
      if (element.width !== w || element.height !== h) {
        element.width = w;
        element.height = h;
      }
      draw(performance.now() / 1000);
    };
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(resize);
    });
    observer.observe(element);
    const lost = (event: Event) => {
      event.preventDefault();
      setFailed(true);
    };
    element.addEventListener("webglcontextlost", lost);
    redraw.current = () => draw(performance.now() / 1000);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      element.removeEventListener("webglcontextlost", lost);
      redraw.current = () => {};
      renderer.current?.dispose();
      renderer.current = null;
    };
  }, [failed, maxDpr]);

  // Redraw on parameter changes without rebuilding the renderer.
  useEffect(() => redraw.current(), [concept, key, referenceWidth]);

  // Optional drift at a modest frame rate.
  useEffect(() => {
    if (!motion || failed || prefersReducedMotion()) return;
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (now - last < 1000 / 30 || document.hidden) return;
      last = now;
      try {
        const element = canvas.current;
        renderer.current?.render(
          latest.current.concept,
          latest.current.params,
          {
            time: now / 1000,
            ribScale: element
              ? ribScale(element, latest.current.referenceWidth)
              : undefined,
          },
        );
      } catch {
        cancelAnimationFrame(frame);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [motion, failed]);

  const fill: CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    display: "block",
  };
  return (
    <div
      className={className}
      style={{ position: "absolute", inset: 0, overflow: "hidden", ...style }}
      aria-hidden="true"
    >
      {failed ? (
        <img
          src={fallbackFor(concept)}
          alt=""
          style={{ ...fill, objectFit: "cover" }}
        />
      ) : (
        <canvas ref={canvas} style={fill} />
      )}
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
