import { useEffect, useMemo, useState } from "react";
import { getEnv } from "./env.ts";
import { playbackContext, type DecodeDeclaration, type PlaybackContext } from "./playback.ts";

// usePlaybackContext: what the stream modal's video switches go by
// (playback.ts playbackContext) -- the transcoder's answer on the page and
// the browser's own, from the same probe the page declares with. Asked of
// every browser, not only of those taking part: the HEVC and HDR switches
// follow what the browser decodes. The probe runs in the background (its
// module is a lazy chunk) and is started here, on mount; the context is
// gathered again once it answers. Until then, and where it never does, the
// switches read "not answered", never "does not decode". A cached answer of
// this browser counts at once.
//
// `dd` is decode-declaration.js (startProbe, decodedTokens, declaredTokens,
// takesPart), passed in so a test can answer for the browser.
export function usePlaybackContext(win: Window, dd: DecodeDeclaration): PlaybackContext {
  const [answers, setAnswers] = useState(0);
  // Once per mount: the page and the module do not change under it, and a
  // probe asked again on every render would render again on every answer.
  useEffect(() => {
    let live = true;
    try {
      Promise.resolve(dd.startProbe(win)).then(
        () => live && setAnswers((n) => n + 1),
        () => {},
      );
    } catch {
      // No probe: the switches stay as for an unanswered one.
    }
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => playbackContext(win, dd, getEnv().passthrough), [win, dd, answers]);
}
