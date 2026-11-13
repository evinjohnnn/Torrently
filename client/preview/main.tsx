// Design preview of the Torrently app: the real interface, running on sample
// data, with a switcher for every backdrop and palette.
import "./mock";
import "../main";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { concepts } from "../backdrops/concepts";
import { setChoice, useBackdropChoice } from "../backdrops/choice";
import "./preview.css";

function Switcher() {
  const [open, setOpen] = useState(() => innerWidth > 760);
  const { concept, palette } = useBackdropChoice();
  const current = concepts.find((item) => item.id === concept);
  const summary = current
    ? `${current.name}, ${current.palettes[palette].name}`
    : "Original background";
  const signedOut =
    new URLSearchParams(location.search).get("signedout") === "1";

  function signInPage(show: boolean) {
    const url = new URL(location.href);
    if (show) url.searchParams.set("signedout", "1");
    else url.searchParams.delete("signedout");
    location.assign(url);
  }

  return (
    <div className="pv" data-open={open}>
      <button
        type="button"
        className="pv-toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="pv-dot" aria-hidden="true" />
        Backdrop: {summary}
      </button>
      {open && (
        <div className="pv-panel">
          <p className="pv-note">
            Design preview with sample data. Pick any backdrop and palette; the
            app keeps working underneath.
          </p>
          <div className="pv-list" role="radiogroup" aria-label="Backdrop">
            <button
              type="button"
              role="radio"
              aria-checked={!concept}
              onClick={() => setChoice({ concept: null, palette: 0 })}
            >
              Original background
            </button>
            {concepts.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={concept === item.id}
                onClick={() =>
                  setChoice({
                    concept: item.id,
                    palette: concept === item.id ? palette : 0,
                  })
                }
              >
                {item.name}
              </button>
            ))}
          </div>
          {current && (
            <div className="pv-palettes" role="radiogroup" aria-label="Palette">
              {current.palettes.map((item, i) => (
                <button
                  key={item.name}
                  type="button"
                  role="radio"
                  aria-checked={palette === i}
                  onClick={() => setChoice({ concept: current.id, palette: i })}
                >
                  <span className="pv-chips" aria-hidden="true">
                    {item.colors.map((color) => (
                      <span key={color} style={{ background: color }} />
                    ))}
                  </span>
                  {item.name}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            className="pv-link"
            onClick={() => signInPage(!signedOut)}
          >
            {signedOut ? "Show the signed-in app" : "Show the sign-in page"}
          </button>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("preview-controls")!).render(<Switcher />);
