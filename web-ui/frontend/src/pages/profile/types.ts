// Mirrors handlers/spa/profile.go and handlers/spa/payments.go.

export interface Backend {
  id: string;
  name: string;
  enabled: boolean;
  status?: "ok" | "invalid_credentials" | "rate_limited" | "error";
  checkedAt?: string;
}

export interface Addon {
  id: string;
  url: string;
  name?: string;
  logo?: string;
  resources: string[];
  enabled: boolean;
}

export interface Indexer {
  id: string;
  url: string;
  name: string;
  apiKey: boolean;
  movie: boolean;
  series: boolean;
  enabled: boolean;
}

export interface Subscription {
  id: string;
  title: string;
  poster: string;
  season?: number;
  state: "pending" | "active" | "completed";
  enabled: boolean;
  checkedAt?: string;
  resolutions: string[];
  language?: string;
  wants: string[];
}

export interface Resolution {
  resolution: string;
  enabled: boolean;
}

export interface ProfileData {
  tier: { name: string; rate?: number; ads: boolean };
  paid: boolean;
  errKey?: string;
  errFrom?: string;
  hasPayments: boolean;
  billing?: { provider: string; manageUrl: string; cancelGuideUrl?: string };
  vault?: { available: number | null; vaulted: number };
  stremio: { addonUrl: string };
  backends: Backend[];
  backendTypes: { type: string; name: string }[];
  addons: Addon[];
  indexers: Indexer[];
  listLimit: number;
  settings: { resolutions: Resolution[]; discoverOnly: boolean; preferredLanguage: string };
  subscriptions: Subscription[];
  subscriptionLimit: number;
  languages: { code: string; name: string; flag: string }[];
  resolutions: string[];
  webdav?: { value: string };
  s3?: { endpoint?: string; accessKey?: string; secretKey?: string; region?: string };
  api?: {
    endpoint?: string;
    key?: string;
    docs: string;
    devices: { name: string; fullName: string; createdAt: string }[];
  };
  embedDomains?: { id: string; domain: string }[];
  embed: boolean;
  password?: { set: boolean; managedByEnv: boolean };
  email?: { current?: string; pending?: string };
  showAdult: boolean;
}

export interface PaymentsData {
  rows: {
    date: string;
    method: string;
    tier: string;
    periodDays: number;
    amountUsd: string;
    status: "paid" | "pending" | "partial" | "failed" | "refunded";
    paymentId: string;
  }[];
}

export interface EmailVerifiedData {
  ok: boolean;
}
