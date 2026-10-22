import { useEffect, useState, type ComponentType } from "react";
import { I18nProvider, loadNamespaces } from "../i18n";
import { Backdrop } from "../chrome/Backdrop";
import { Banners } from "../chrome/Banners";
import { Footer } from "../chrome/Footer";
import { Nav } from "../chrome/Nav";
import { Toasts } from "../chrome/Toasts";
import { CHROME_NAMESPACES, pages, type PageModule } from "./pages";
import { ShownPage, useNavigation } from "./router";
import type { PageState } from "./state";

interface Shown {
  Page: ComponentType;
  state: PageState;
}

async function prepare(state: PageState): Promise<PageModule> {
  const loader = pages[state.view];
  if (!loader) throw new Error(`no page for view ${state.view}`);
  const module = await loader();
  await loadNamespaces(state.session.lang, [
    ...CHROME_NAMESPACES,
    ...module.namespaces,
    ...(module.namespacesFor?.(state) ?? []),
  ]);
  return module;
}

/**
 * The frame every page sits in. A new page is swapped in only once its code
 * and its strings are loaded, so navigation never flashes an empty screen.
 */
export function App() {
  const { state, busy } = useNavigation();
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    let live = true;
    prepare(state).then(
      (module) => live && setShown({ Page: module.default, state }),
      () => live && location.reload(),
    );
    return () => {
      live = false;
    };
  }, [state]);

  if (!shown) return <Backdrop />;
  const { Page } = shown;
  return (
    <ShownPage value={shown.state}>
    <I18nProvider lang={shown.state.session.lang}>
      <Backdrop />
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className={busy ? "route-progress active" : "route-progress"} aria-hidden="true" />
      <Nav />
      <main id="main" tabIndex={-1}>
        <Banners />
        <Page />
      </main>
      <Footer />
      <Toasts />
    </I18nProvider>
    </ShownPage>
  );
}
