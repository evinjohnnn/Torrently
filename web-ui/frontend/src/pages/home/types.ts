// Mirrors handlers/spa/home.go.

export interface Step {
  title: string;
  text: string;
}

export interface Section {
  kind: "steps" | "prose" | "checklist" | "compare";
  badge: string;
  title: string;
  subtitle?: string;
  steps?: Step[];
  paras?: string[];
  items?: string[];
  cols?: { label: string; items: string[] }[];
  footer?: string;
  note?: string;
  extra?: Step;
  cap?: string;
  rate?: number;
  link?: { url: string; title: string };
  cta?: "discover" | "stremio" | "";
}

export interface Tool {
  url: string;
  title: string;
  benefit: string;
  description: string;
  guide: boolean;
  sections: Section[];
  aboutKey: string;
  faq: number;
}

export interface ContinueItem {
  resourceId: string;
  path: string;
  title: string;
  poster: string;
  adult: boolean;
  progress: number;
  updatedAt: string;
}

export interface OnboardingStep {
  key: string;
  done: boolean;
  locked: boolean;
  title: string;
  desc: string;
  cta: string;
  ctaCount?: number;
  path?: string;
  fragment?: string;
}

export interface FAQItem {
  q: string;
  a: string[];
  params?: Record<string, number>;
  guide?: string;
}

export interface HomeData {
  instruction: string;
  tool: Tool | null;
  query?: string;
  jobLogUrl?: string;
  demoMagnet?: string;
  continueWatching: ContinueItem[];
  onboarding?: { done: number; total: number; steps: OnboardingStep[] };
  ai?: { provider: string; freeQuota: number; paidQuota: number };
  faq: FAQItem[];
  related?: { url: string; benefit: string; description: string }[];
}
