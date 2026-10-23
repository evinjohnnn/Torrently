/// <reference types="vite/client" />

declare module "virtual:locales" {
  type Messages = Record<string, string | Record<string, string>>;
  export const languages: string[];
  export const loaders: Record<string, Record<string, () => Promise<Messages>>>;
}
