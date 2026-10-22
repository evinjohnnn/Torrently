import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/space-grotesk/latin-400.css";
import "@fontsource/space-grotesk/latin-500.css";
import "@fontsource/space-grotesk/latin-600.css";
import {
  LenticularBackdrop,
  concepts,
  exportBackdrop,
  getConcept,
  type BackdropParams,
  type Concept,
  type ExportType,
} from "../backdrops";
import "./gallery.css";

type Surface = "none" | "light" | "dark";

const sizes = [
  { label: "1920 × 1080", w: 1920, h: 1080 },
  { label: "2560 × 1440", w: 2560, h: 1440 },
  { label: "3840 × 2160", w: 3840, h: 2160 },
  { label: "1290 × 2796 · phone", w: 1290, h: 2796 },
];

function useHash() {
  const [hash, setHash] = useState(() => location.hash.slice(1));
  useEffect(() => {
    const update = () => setHash(location.hash.slice(1));
    addEventListener("hashchange", update);
    return () => removeEventListener("hashchange", update);
  }, []);
  return hash;
}

function Gallery() {
  return (
    <div className="page">
      <header className="masthead">
        <h1>Light through reeded glass</h1>
        <p>
          Six backdrops for Torrently, each a single light source seen out of
          focus through vertical fluted glass. They render live in your browser;
          open one to adjust the glass, check text over it and export a still.
        </p>
      </header>
      <ul className="grid">
        {concepts.map((concept) => (
          <li key={concept.id}>
            <a className="card" href={`#${concept.id}`}>
              <div className="card-stage">
                <LenticularBackdrop
                  concept={concept.id}
                  maxDpr={1.5}
                  referenceWidth={1440}
                  pointer="parent"
                />
              </div>
              <div className="card-meta">
                <h2>{concept.name}</h2>
                <p>{concept.note}</p>
              </div>
            </a>
          </li>
        ))}
      </ul>
      <footer>
        A preview only: the Torrently app still uses its current background.
      </footer>
    </div>
  );
}

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const id = `slider-${props.label.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <div className="control">
      <label htmlFor={id}>
        <span>{props.label}</span>
        <output htmlFor={id}>
          {props.format ? props.format(props.value) : props.value.toFixed(2)}
        </output>
      </label>
      <input
        id={id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
    </div>
  );
}

function Study({ concept }: { concept: Concept }) {
  const [params, setParams] = useState<BackdropParams>(concept.defaults);
  const [surface, setSurface] = useState<Surface>("none");
  const [motion, setMotion] = useState(false);
  const [size, setSize] = useState(0);
  const [format, setFormat] = useState<ExportType>("image/png");
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState("");
  const position = concepts.indexOf(concept);
  const previous = concepts[(position + concepts.length - 1) % concepts.length];
  const next = concepts[(position + 1) % concepts.length];
  const tone = concept.palettes[params.palette]?.tone ?? "light";
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const set = <K extends keyof BackdropParams>(
    key: K,
    value: BackdropParams[K],
  ) => setParams((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    setParams(concept.defaults);
    setStatus("");
    scrollTo(0, 0);
  }, [concept]);

  async function save() {
    const { w, h } = sizes[size];
    setExporting(true);
    setStatus(`Rendering ${w} × ${h}…`);
    try {
      const blob = await exportBackdrop(concept.id, params, w, h, format);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${concept.id}-${w}x${h}.${format === "image/png" ? "png" : "webp"}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setStatus(`Saved ${link.download} · ${(blob.size / 1e6).toFixed(1)} MB`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div
      className="study"
      data-tone={
        surface === "none" ? tone : surface === "dark" ? "dark" : "light"
      }
    >
      <div className="stage">
        <LenticularBackdrop
          concept={concept.id}
          params={params}
          motion={motion}
          scrim={surface === "none" ? "none" : surface}
        />
        <nav className="stage-nav">
          <a className="pill" href="#">
            All backdrops
          </a>
        </nav>
        {surface !== "none" && (
          <div className={`sample sample-${surface}`}>
            <span className="label">Now playing</span>
            <h3>Interstellar (2014)</h3>
            <p>
              2160p, 4 files, 58.2 GB. Text sitting on the backdrop needs to
              stay legible at a glance; the veil only lifts contrast where copy
              lives.
            </p>
            <div className="sample-actions">
              <button type="button">Resume 1:12:40</button>
              <button type="button" className="ghost">
                Files
              </button>
            </div>
          </div>
        )}
        <div className="stage-title">
          <h1>{concept.name}</h1>
          <p>{concept.note}</p>
        </div>
      </div>

      <aside className="panel" aria-label="Glass controls">
        <section>
          <h2 className="label">Glass</h2>
          <Slider
            label="Rib width"
            value={params.ribWidth}
            min={4}
            max={48}
            step={1}
            format={(v) => `${v}px`}
            onChange={(v) => set("ribWidth", v)}
          />
          <Slider
            label="Distortion"
            value={params.distortion}
            min={0}
            max={1.6}
            step={0.01}
            onChange={(v) => set("distortion", v)}
          />
          <Slider
            label="Frost"
            value={params.blur}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => set("blur", v)}
          />
          <Slider
            label="Dispersion"
            value={params.dispersion}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => set("dispersion", v)}
          />
        </section>
        <section>
          <h2 className="label">Light</h2>
          <Slider
            label="Key angle"
            value={params.lightAngle}
            min={0}
            max={180}
            step={1}
            format={(v) => `${v}°`}
            onChange={(v) => set("lightAngle", v)}
          />
          <Slider
            label="Intensity"
            value={params.light}
            min={0.2}
            max={2}
            step={0.01}
            onChange={(v) => set("light", v)}
          />
        </section>
        <section>
          <h2 className="label">Palette</h2>
          <div className="swatches" role="radiogroup" aria-label="Palette">
            {concept.palettes.map((palette, i) => (
              <button
                key={palette.name}
                type="button"
                role="radio"
                aria-checked={params.palette === i}
                className="swatch"
                onClick={() => set("palette", i)}
              >
                <span className="chips" aria-hidden="true">
                  {palette.colors.map((color) => (
                    <span key={color} style={{ background: color }} />
                  ))}
                </span>
                {palette.name}
              </button>
            ))}
          </div>
        </section>
        <section>
          <h2 className="label">Preview</h2>
          <div className="segmented" role="radiogroup" aria-label="UI surface">
            {(["none", "light", "dark"] as Surface[]).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={surface === value}
                onClick={() => setSurface(value)}
              >
                {value === "none" ? "Bare" : `${value} UI`}
              </button>
            ))}
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={motion && !reducedMotion}
              disabled={reducedMotion}
              onChange={(e) => setMotion(e.target.checked)}
            />
            Slow drift{reducedMotion ? " (reduced motion is on)" : ""}
          </label>
        </section>
        <section>
          <h2 className="label">Export</h2>
          <div className="row">
            <select
              aria-label="Export size"
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
            >
              {sizes.map((item, i) => (
                <option key={item.label} value={i}>
                  {item.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Export format"
              value={format}
              onChange={(e) => setFormat(e.target.value as ExportType)}
            >
              <option value="image/png">PNG</option>
              <option value="image/webp">WebP</option>
            </select>
          </div>
          <button
            type="button"
            className="primary"
            disabled={exporting}
            onClick={() => void save()}
          >
            {exporting ? "Rendering…" : "Export still"}
          </button>
          <p className="status" role="status">
            {status}
          </p>
        </section>
        <div className="row">
          <button
            type="button"
            className="ghost"
            onClick={() => setParams(concept.defaults)}
          >
            Reset
          </button>
          <a className="ghost" href={`#${previous.id}`}>
            Previous: {previous.name}
          </a>
          <a className="ghost" href={`#${next.id}`}>
            Next: {next.name}
          </a>
        </div>
      </aside>
    </div>
  );
}

/** `?bare=<id>&palette=<n>` renders one backdrop full-bleed, for stills and testing. */
function Bare({ id, palette }: { id: string; palette?: number }) {
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <LenticularBackdrop
        concept={id}
        params={palette === undefined ? undefined : { palette }}
        maxDpr={1}
      />
    </div>
  );
}

function App() {
  const hash = useHash();
  const search = new URLSearchParams(location.search);
  const bare = search.get("bare");
  if (bare)
    return (
      <Bare
        id={bare}
        palette={
          search.has("palette") ? Number(search.get("palette")) : undefined
        }
      />
    );
  const [id] = hash.split("/");
  const concept = concepts.find((item) => item.id === id);
  return concept ? <Study concept={concept} /> : <Gallery />;
}

declare global {
  interface Window {
    __exportBackdrop?: typeof exportBackdrop;
    __getConcept?: typeof getConcept;
  }
}
window.__exportBackdrop = exportBackdrop;
window.__getConcept = getConcept;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
