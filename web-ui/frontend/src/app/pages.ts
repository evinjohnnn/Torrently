import type { ComponentType } from "react";
import type { PageState } from "./state";

export interface PageModule {
  default: ComponentType;
  /** i18n namespaces the page reads (see nsOf in src/i18n). */
  namespaces: string[];
  /** Namespaces that depend on the page's data, e.g. one tool page's copy. */
  namespacesFor?: (state: PageState) => string[];
}

/**
 * Go view name (templates/views/<name>.html) → React page. Each page folder
 * declares its views in a routes.ts next to it; the server only answers
 * with a view that has a builder in handlers/spa, so the two grow together.
 */
export const pages: Record<string, () => Promise<PageModule>> = Object.assign(
  {},
  ...Object.values(
    import.meta.glob<{ routes: Record<string, () => Promise<PageModule>> }>("../pages/*/routes.ts", {
      eager: true,
    }),
  ).map((module) => module.routes),
);

/** Namespaces the frame around every page reads. */
export const CHROME_NAMESPACES = ["nav", "footer", "tool", "home", "error", "toast", "meta", "langSuggest", "banner"];
