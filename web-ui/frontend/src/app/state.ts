/** Mirrors services/spa: what every page boots from. */
export interface Session {
  csrf: string;
  sessionId: string;
  lang: string;
  path: string;
  domain: string;
  user: { email: string; isNew: boolean } | null;
  tier: string;
  tierId: number;
  showAdult: boolean;
  suggestLang?: string;
  openInstance: boolean;
  vault: boolean;
  unreadNotifications: number;
  superTokens: boolean;
  turnstile?: string;
  umami?: { website_id?: string; host_url?: string };
  embed: boolean;
  apiDocs: string;
  support: boolean;
  tools: { url: string; title: string; guide: boolean; group?: string }[];
  legacyCss: string;
}

export interface PageError {
  key: string;
  args?: { Count: number; Full: string } | null;
}

export interface PageState<T = unknown> {
  view: string;
  status: number;
  title?: string;
  error?: PageError | null;
  session: Session;
  data: T;
}

export function readBootState(): PageState {
  const node = document.getElementById("torrently-state");
  return JSON.parse(node?.textContent || "null");
}
