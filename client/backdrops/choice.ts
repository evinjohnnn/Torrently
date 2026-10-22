import { useEffect, useState } from "react";
import { concepts } from "./concepts";

/** Which lenticular backdrop the app shows; `concept: null` is the original CSS one. */
export interface BackdropChoice {
  concept: string | null;
  palette: number;
}

const EVENT = "torrently:backdrop";

/** The app's background unless the address bar asks for another. */
export const DEFAULT_CHOICE: BackdropChoice = { concept: "bleed", palette: 0 };

/**
 * Reads `?backdrop=<id>&palette=<n>` from the address bar;
 * `?backdrop=original` shows the original CSS background.
 */
export function readChoice(): BackdropChoice {
  const search = new URLSearchParams(location.search);
  const id = search.get("backdrop");
  if (id === "original") return { concept: null, palette: 0 };
  if (!id) return DEFAULT_CHOICE;
  const concept = concepts.find((item) => item.id === id) ?? null;
  if (!concept) return DEFAULT_CHOICE;
  const palette = Number(search.get("palette") ?? 0);
  return {
    concept: concept?.id ?? null,
    palette:
      concept && Number.isInteger(palette) && concept.palettes[palette]
        ? palette
        : 0,
  };
}

export function setChoice(choice: BackdropChoice) {
  const url = new URL(location.href);
  if (choice.concept) {
    url.searchParams.set("backdrop", choice.concept);
    url.searchParams.set("palette", String(choice.palette));
  } else {
    url.searchParams.set("backdrop", "original");
    url.searchParams.delete("palette");
  }
  history.replaceState(history.state, "", url);
  dispatchEvent(new Event(EVENT));
}

export function useBackdropChoice() {
  const [choice, setState] = useState(readChoice);
  useEffect(() => {
    const update = () => setState(readChoice());
    addEventListener(EVENT, update);
    addEventListener("popstate", update);
    return () => {
      removeEventListener(EVENT, update);
      removeEventListener("popstate", update);
    };
  }, []);
  return choice;
}
