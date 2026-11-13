// The player's decode declaration (assets/src/js/lib/player/
// decode-declaration.js), shared rather than copied: Discover's video
// switches must read exactly the probe and tokens the player declares to the
// transcoder, so the two cannot be allowed to drift.

// @ts-expect-error -- plain JS shared with the classic UI, without types
import * as dd from "../../../../../assets/src/js/lib/player/decode-declaration.js";
import type { DecodeDeclaration } from "./playback.ts";

export const DECODE: DecodeDeclaration = {
  startProbe: (win) => dd.startProbe(win),
  decodedTokens: (win) => dd.decodedTokens(win),
  declaredTokens: (win) => dd.declaredTokens(win),
  takesPart: (win) => dd.takesPart(win),
};
