import { Suspense, lazy } from "react";

// The WebGL renderer loads after the page; until then the paper shows.
const Lenticular = lazy(() =>
  import("../glass/LenticularBackdrop").then((module) => ({
    default: module.LenticularBackdrop,
  })),
);

/** Leaves seen through reeded glass, behind every page. */
export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <Suspense fallback={null}>
        <Lenticular concept="leaves" params={{ palette: 0 }} />
      </Suspense>
    </div>
  );
}
