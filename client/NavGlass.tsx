import { Suspense, lazy, useEffect, useState } from "react";
import { BACKDROP_FRAME, useBackdropCanvas } from "./backdrops/surface";
import "./vendor/react-bits/FluidGlass.css";

// React Bits' Fluid Glass, only loaded where the navbar is drawn.
const FluidGlass = lazy(() => import("./vendor/react-bits/FluidGlass"));

function supportsWebGL2() {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

/**
 * A bar of fluid glass behind the navbar, refracting the live backdrop.
 * Without WebGL 2 it renders nothing and the CSS glass stays in place.
 */
export function NavGlass() {
  const source = useBackdropCanvas();
  const [supported] = useState(supportsWebGL2);

  useEffect(() => {
    if (!supported) return;
    const root = document.documentElement;
    root.dataset.navGlass = "";
    return () => {
      delete root.dataset.navGlass;
    };
  }, [supported]);

  if (!supported) return null;
  return (
    <div className="nav-glass" aria-hidden="true">
      <Suspense fallback={null}>
        <FluidGlass
          shape="bar"
          text=""
          interaction="static"
          morphOnClick={false}
          idle={false}
          spin={0}
          wobble={0}
          shadow={0.25}
          elevation={0.15}
          refraction={1}
          dispersion={0.35}
          reflection={1}
          frost={0.18}
          color="#ffffff"
          tint={0.32}
          barFill={0.72}
          source={source}
          sourceEvent={BACKDROP_FRAME}
        />
      </Suspense>
    </div>
  );
}
