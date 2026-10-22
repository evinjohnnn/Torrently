// Pre-rendered stills used when WebGL2 is unavailable. Regenerate with
// `npm run backdrops:render` after changing a scene.
const files = import.meta.glob<string>("./fallbacks/*.webp", {
  eager: true,
  import: "default",
  query: "?url",
});

export function fallbackFor(conceptId: string): string | undefined {
  return files[`./fallbacks/${conceptId}.webp`];
}
