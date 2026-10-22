import { useEffect, useState } from "react";

/** Fired on window each time the shared backdrop canvas has redrawn. */
export const BACKDROP_FRAME = "torrently:backdrop-frame";

let current: HTMLCanvasElement | null = null;
const listeners = new Set<(canvas: HTMLCanvasElement | null) => void>();

/** Makes the app backdrop's canvas available to glass that refracts it. */
export function shareBackdropCanvas(canvas: HTMLCanvasElement | null) {
  current = canvas;
  listeners.forEach((listener) => listener(canvas));
}

export function useBackdropCanvas() {
  const [canvas, setCanvas] = useState(current);
  useEffect(() => {
    listeners.add(setCanvas);
    setCanvas(current);
    return () => {
      listeners.delete(setCanvas);
    };
  }, []);
  return canvas;
}
