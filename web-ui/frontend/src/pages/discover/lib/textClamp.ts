// The text-clamping math for the inline "…" expander (ExpandableText),
// copied from assets/src/js/lib/textClamp.js so the two cut the same way.

// Line-height factor the height budget is computed with. Must match the
// line-height of the clamped text (1.625, set on .expandable in discover.css).
export const CLAMP_LINE_HEIGHT = 1.625;

// findTextCut returns the longest prefix of `text` that fits the
// element's height budget with room reserved for the inline "…" link
// (three ellipsis chars approximate its rendered width), or null when
// the full text already fits. `meas` must have max-height + overflow
// hidden applied; its textContent is mutated during the binary search —
// callers discard the element afterwards.
export function findTextCut(meas: HTMLElement, text: string): number | null {
  meas.textContent = text;
  const limit = meas.clientHeight;
  if (meas.scrollHeight <= limit + 1) return null;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    meas.textContent = text.slice(0, mid) + "………";
    if (meas.scrollHeight <= limit + 1) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

// trimTextCut slices at the cut point and drops trailing whitespace /
// punctuation so the inline "…" doesn't trail a comma or period.
export function trimTextCut(text: string, cut: number) {
  return text.slice(0, cut).replace(/[\s.,;:!?]*$/u, "");
}
