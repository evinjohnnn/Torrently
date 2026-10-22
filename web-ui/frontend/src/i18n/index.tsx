import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { languages, loaders } from "virtual:locales";

export type Lang = string;
type Value = string | Record<string, string>;
type Messages = Record<string, Value>;
type Params = Record<string, string | number>;

export const LANGUAGES: string[] = languages;

/** Names shown in the language picker, each in its own language. */
export const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  cs: "Čeština",
  de: "Deutsch",
  es: "Español",
  fr: "Français",
  it: "Italiano",
  nl: "Nederlands",
  pl: "Polski",
  pt: "Português",
  ru: "Русский",
  tr: "Türkçe",
};

const store = new Map<string, Messages>();
const pending = new Map<string, Promise<void>>();

function load(lang: Lang, ns: string): Promise<void> {
  const id = `${lang}/${ns}`;
  if (store.has(id)) return Promise.resolve();
  let promise = pending.get(id);
  if (!promise) {
    const loader = loaders[lang]?.[ns];
    promise = loader
      ? loader().then((messages: Messages) => void store.set(id, messages))
      : Promise.resolve(void store.set(id, {}));
    pending.set(id, promise);
  }
  return promise;
}

/** Loads the namespaces a screen needs, plus English to fall back on. */
export function loadNamespaces(lang: Lang, namespaces: string[]) {
  const wanted = new Set(namespaces);
  const jobs: Promise<void>[] = [];
  for (const ns of wanted) {
    jobs.push(load(lang, ns));
    if (lang !== "en") jobs.push(load("en", ns));
  }
  return Promise.all(jobs).then(() => undefined);
}

/** The chunk a key lives in; mirrors nsOf in frontend/locale-chunks.ts. */
export function nsOf(key: string) {
  const parts = key.split(".");
  if (parts[0] === "tool" && parts[2] === "about") return parts.slice(0, 3).join(".");
  return parts[0];
}

function lookup(lang: Lang, key: string): Value | undefined {
  const ns = nsOf(key);
  return store.get(`${lang}/${ns}`)?.[key] ?? store.get(`en/${ns}`)?.[key];
}

// go-i18n placeholders look like {{.Name}}
function fill(text: string, params?: Params) {
  if (!params) return text;
  return text.replace(/\{\{\s*\.(\w+)\s*\}\}/g, (match, name) =>
    name in params ? String(params[name]) : match,
  );
}

function pick(lang: Lang, value: Value, count?: number) {
  if (typeof value === "string") return value;
  const rule = new Intl.PluralRules(lang).select(count ?? 0);
  return value[rule] ?? value.other ?? Object.values(value)[0] ?? "";
}

export interface Translator {
  lang: Lang;
  /** Plain text; a missing key falls back to English, then to the key. */
  t(key: string, params?: Params): string;
  /** A plural form chosen by `count`, which is also passed as {{.Count}}. */
  tn(key: string, count: number, params?: Params): string;
  /** Text that may carry <a>, <strong>, <em>, <code> or <br>, as elements. */
  rich(key: string, params?: Params): ReactNode;
  /** Prefixes a path with the language, as the server's langPath does. */
  path(path: string): string;
}

export function langPath(lang: Lang, path: string) {
  if (lang === "en") return path;
  if (path === "/") return `/${lang}`;
  return `/${lang}${path}`;
}

export function makeTranslator(lang: Lang): Translator {
  const text = (key: string, params?: Params, count?: number) => {
    const value = lookup(lang, key);
    if (value === undefined) return key;
    return fill(pick(lang, value, count), params);
  };
  // values dropped into markup must not open tags of their own
  const escape = (params?: Params) =>
    params &&
    Object.fromEntries(
      Object.entries(params).map(([name, value]) => [
        name,
        String(value)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;"),
      ]),
    );
  return {
    lang,
    t: (key, params) => text(key, params),
    tn: (key, count, params) => text(key, { Count: count, ...params }, count),
    rich: (key, params) => renderRich(text(key, escape(params))),
    path: (path) => langPath(lang, path),
  };
}

const I18nContext = createContext<Translator>(makeTranslator("en"));

export function I18nProvider({
  lang,
  children,
}: {
  lang: Lang;
  children: ReactNode;
}) {
  return (
    <I18nContext.Provider value={makeTranslator(lang)}>
      {children}
    </I18nContext.Provider>
  );
}

export const useI18n = () => useContext(I18nContext);

/**
 * Loads a screen's namespaces before it renders, so text never flashes as
 * raw keys. Returns false until they are in.
 */
export function useNamespaces(namespaces: string[]) {
  const { lang } = useI18n();
  const key = `${lang}:${namespaces.join(",")}`;
  const [ready, setReady] = useState(() =>
    namespaces.every(
      (ns) =>
        store.has(`${lang}/${ns}`) && (lang === "en" || store.has(`en/${ns}`)),
    ),
  );
  useEffect(() => {
    let live = true;
    loadNamespaces(lang, namespaces).then(() => live && setReady(true));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return ready;
}

// ───────── rich text ─────────

const ALLOWED = new Set(["a", "strong", "b", "em", "i", "code", "br"]);

/**
 * Turns the handful of tags translations use into React elements. Anything
 * else is shown as text; links keep only their href, and leave the site in a
 * new tab when they point elsewhere.
 */
export function renderRich(source: string): ReactNode {
  const pattern = /<(\/?)([a-z]+)([^>]*)>/gi;
  type Frame = { tag: string; attrs: string; children: ReactNode[] };
  const root: Frame = { tag: "", attrs: "", children: [] };
  const stack: Frame[] = [root];
  let last = 0;
  let key = 0;
  const decode = (text: string) =>
    text
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  const top = () => stack[stack.length - 1];
  for (const match of source.matchAll(pattern)) {
    const [whole, closing, rawTag, attrs] = match;
    const tag = rawTag.toLowerCase();
    if (match.index! > last)
      top().children.push(decode(source.slice(last, match.index)));
    last = match.index! + whole.length;
    if (!ALLOWED.has(tag)) {
      top().children.push(whole);
      continue;
    }
    if (tag === "br") {
      top().children.push(<br key={key++} />);
      continue;
    }
    if (!closing) {
      stack.push({ tag, attrs, children: [] });
      continue;
    }
    if (stack.length > 1 && top().tag === tag) {
      const frame = stack.pop()!;
      top().children.push(element(frame, key++));
    }
  }
  if (last < source.length) top().children.push(decode(source.slice(last)));
  while (stack.length > 1) {
    const frame = stack.pop()!;
    top().children.push(element(frame, key++));
  }
  return <Fragment>{root.children}</Fragment>;

  function element(frame: Frame, k: number): ReactNode {
    const children = frame.children;
    switch (frame.tag) {
      case "a": {
        const href = /href\s*=\s*['"]([^'"]*)['"]/i.exec(frame.attrs)?.[1] ?? "";
        const safe = /^(https?:|mailto:|\/|#)/i.test(href) ? href : "#";
        const external = /^https?:/i.test(safe);
        return (
          <a
            key={k}
            href={safe}
            {...(external ? { target: "_blank", rel: "noopener" } : {})}
          >
            {children}
          </a>
        );
      }
      case "strong":
      case "b":
        return <strong key={k}>{children}</strong>;
      case "em":
      case "i":
        return <em key={k}>{children}</em>;
      case "code":
        return <code key={k}>{children}</code>;
      default:
        return <Fragment key={k}>{children}</Fragment>;
    }
  }
}
