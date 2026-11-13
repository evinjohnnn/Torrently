import type { CSSProperties } from "react";

// Each rib repaints the same light scene, magnified around its own centre,
// which reproduces the refraction of fluted (lenticular) glass.
const RIBS = 36;

export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <div className="lens" style={{ "--ribs": RIBS } as CSSProperties}>
        {Array.from({ length: RIBS }, (_, i) => (
          <span
            key={i}
            className="lens-rib"
            style={{ "--i": i } as CSSProperties}
          />
        ))}
      </div>
      <div className="backdrop-dots" />
      <div className="backdrop-grain" />
    </div>
  );
}
