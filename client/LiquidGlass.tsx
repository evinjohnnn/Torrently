import { Fragment, useId, useLayoutEffect, useRef, useState } from "react";

export interface LiquidGlassProps {
  /** width of the curved rim, in CSS pixels */
  bezel?: number;
  /** how far the rim pulls the content beneath it, in CSS pixels */
  refraction?: number;
  /** softening of what is seen through the glass, in CSS pixels */
  blur?: number;
  /** spread between red, green and blue at the rim, 0..0.2 */
  aberration?: number;
  className?: string;
}

interface Maps {
  width: number;
  height: number;
  displacement: string;
  specular: string;
}

// keeps one colour channel (0 red, 1 green, 2 blue) and the alpha
function channelMatrix(channel: number) {
  const row = (r: number) =>
    [0, 1, 2, 3, 4].map((k) => (r === channel && k === r ? 1 : 0)).join(" ");
  return `${row(0)} ${row(1)} ${row(2)} 0 0 0 1 0`;
}

// Chromium can run an SVG filter as a backdrop-filter, which lets the glass
// bend the page beneath it; elsewhere the glass falls back to frosting.
function supportsRefraction() {
  try {
    return CSS.supports("backdrop-filter", "url(#a)");
  } catch {
    return false;
  }
}

/**
 * Builds the refraction and highlight maps for a rounded rectangle. The rim
 * is a convex bevel: flat glass in the middle, curving away over `bezel`
 * pixels, so content is pulled inward more strongly the nearer it is to the
 * edge. Red and green encode the sideways and vertical pull.
 */
function buildMaps(
  width: number,
  height: number,
  radius: number,
  bezel: number,
  shift: number,
): Maps {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const dispImage = ctx.createImageData(width, height);
  const specImage = ctx.createImageData(width, height);
  const disp = dispImage.data;
  const spec = specImage.data;
  const r = Math.min(radius, width / 2, height / 2);
  const hw = width / 2,
    hh = height / 2;
  // key light from the upper left, in screen space (y down)
  const lx = -0.6,
    ly = -0.8;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = x + 0.5 - hw,
        py = y + 0.5 - hh;
      const qx = Math.abs(px) - (hw - r),
        qy = Math.abs(py) - (hh - r);
      const outside =
        Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
        Math.min(Math.max(qx, qy), 0) -
        r;
      const depth = -outside;
      const i = (y * width + x) * 4;
      disp[i] = disp[i + 1] = disp[i + 2] = 128;
      disp[i + 3] = 255;
      if (depth < 0) continue;
      // outward surface normal of the rounded rectangle
      let nx: number, ny: number;
      if (qx > 0 && qy > 0) {
        const l = Math.hypot(qx, qy) || 1;
        nx = (qx / l) * Math.sign(px);
        ny = (qy / l) * Math.sign(py);
      } else if (qx > qy) {
        nx = Math.sign(px);
        ny = 0;
      } else {
        nx = 0;
        ny = Math.sign(py);
      }
      const t = Math.min(depth / bezel, 1);
      const pull = shift * Math.pow(1 - t, 2.4);
      // sample from further inside: the bevel bends light inward
      disp[i] = Math.round(128 + ((-nx * pull) / (2 * shift)) * 255);
      disp[i + 1] = Math.round(128 + ((-ny * pull) / (2 * shift)) * 255);
      // a bright rim where the edge faces the light, a fainter one opposite
      const facing = nx * lx + ny * ly;
      const rim = Math.exp(-depth / 1.4);
      const sheen = Math.exp(-Math.max(depth - 1, 0) / (bezel * 0.45));
      const light =
        rim *
          (0.85 * Math.pow(Math.max(facing, 0), 1.4) +
            0.35 * Math.pow(Math.max(-facing, 0), 1.4)) +
        sheen * 0.1 * Math.max(facing, 0);
      spec[i] = spec[i + 1] = spec[i + 2] = 255;
      spec[i + 3] = Math.round(Math.min(light, 1) * 255);
    }
  }
  ctx.putImageData(dispImage, 0, 0);
  const displacement = canvas.toDataURL("image/png");
  ctx.putImageData(specImage, 0, 0);
  const specular = canvas.toDataURL("image/png");
  return { width, height, displacement, specular };
}

/**
 * A layer of liquid glass that fills its positioned parent and takes its
 * border radius. It bends whatever passes beneath it, page content included.
 */
export function LiquidGlass({
  bezel = 16,
  refraction = 22,
  blur = 3,
  aberration = 0.05,
  className = "",
}: LiquidGlassProps) {
  const layer = useRef<HTMLDivElement>(null);
  const id = `liquid-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [refracts] = useState(supportsRefraction);
  const [maps, setMaps] = useState<Maps | null>(null);

  useLayoutEffect(() => {
    const element = layer.current;
    if (!element) return;
    let key = "";
    const update = () => {
      const width = Math.round(element.clientWidth);
      const height = Math.round(element.clientHeight);
      if (width < 4 || height < 4) return;
      const radius =
        parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0;
      const next = `${width}x${height}x${radius}`;
      if (next === key) return;
      key = next;
      setMaps(buildMaps(width, height, radius, bezel, refraction));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [bezel, refraction]);

  const scale = 2 * refraction;
  const live = refracts && maps;
  return (
    <div
      ref={layer}
      className={`liquid-glass ${live ? "is-refracting" : ""} ${className}`}
      style={{
        backdropFilter: live ? `url(#${id})` : undefined,
        WebkitBackdropFilter: live ? `url(#${id})` : undefined,
        backgroundImage: maps ? `url(${maps.specular})` : undefined,
      }}
      aria-hidden="true"
    >
      {live && (
        <svg width="0" height="0" style={{ position: "absolute" }}>
          <filter
            id={id}
            x="0"
            y="0"
            width={maps.width}
            height={maps.height}
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feImage
              href={maps.displacement}
              x="0"
              y="0"
              width={maps.width}
              height={maps.height}
              preserveAspectRatio="none"
              result="map"
            />
            <feGaussianBlur
              in="SourceGraphic"
              stdDeviation={blur}
              result="soft"
            />
            {/* each channel bends a little differently, as light does in glass */}
            {[0, 1, 2].map((channel) => (
              <Fragment key={channel}>
                <feDisplacementMap
                  in="soft"
                  in2="map"
                  scale={scale * (1 - aberration * channel)}
                  xChannelSelector="R"
                  yChannelSelector="G"
                  result={`shifted${channel}`}
                />
                <feColorMatrix
                  in={`shifted${channel}`}
                  type="matrix"
                  values={channelMatrix(channel)}
                  result={`channel${channel}`}
                />
              </Fragment>
            ))}
            <feBlend in="channel0" in2="channel1" mode="screen" result="rg" />
            <feBlend in="rg" in2="channel2" mode="screen" result="rgb" />
            <feColorMatrix in="rgb" type="saturate" values="1.4" />
          </filter>
        </svg>
      )}
    </div>
  );
}
