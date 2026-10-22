import { Suspense, lazy, useEffect } from "react";
import { Backdrop } from "./Backdrop";
import { getConcept } from "./backdrops/concepts";
import { useBackdropChoice } from "./backdrops/choice";

// The WebGL renderer only loads when a lenticular backdrop is chosen.
const Lenticular = lazy(() =>
  import("./backdrops/LenticularBackdrop").then((module) => ({
    default: module.LenticularBackdrop,
  })),
);

/** Bleed on paper by default; `?backdrop=` picks another study or the original. */
export function AppBackdrop() {
  const { concept, palette } = useBackdropChoice();
  const tone = concept ? getConcept(concept).palettes[palette].tone : null;

  // Text that sits directly on a dark backdrop switches to light ink.
  useEffect(() => {
    const root = document.documentElement;
    if (tone === "dark") root.dataset.surface = "dark";
    else delete root.dataset.surface;
    if (concept) root.dataset.backdrop = concept;
    else delete root.dataset.backdrop;
  }, [tone, concept]);

  if (!concept) return <Backdrop />;
  return (
    <div className="backdrop-gl" aria-hidden="true">
      <Suspense fallback={null}>
        <Lenticular concept={concept} params={{ palette }} />
      </Suspense>
    </div>
  );
}
