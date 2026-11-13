/*
 * Cloudflare Turnstile for job starts by anonymous visitors (the server checks
 * cf-turnstile-response, handlers/action.verifyAction). A managed widget that
 * only shows itself when Cloudflare wants a click.
 */

interface TurnstileApi {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  remove(id: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let script: Promise<TurnstileApi> | null = null;

function load(): Promise<TurnstileApi> {
  script ??= new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    el.async = true;
    el.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing")));
    el.onerror = () => reject(new Error("turnstile failed to load"));
    document.head.append(el);
  });
  return script;
}

/** A fresh token, rendering the widget into `host` (it stays empty unless a click is needed). */
export async function turnstileToken(siteKey: string, host: HTMLElement): Promise<string> {
  const api = await load();
  return new Promise((resolve, reject) => {
    const id = api.render(host, {
      sitekey: siteKey,
      appearance: "interaction-only",
      callback: (token: string) => {
        resolve(token);
        setTimeout(() => api.remove(id), 0);
      },
      "error-callback": () => {
        reject(new Error("turnstile error"));
        setTimeout(() => api.remove(id), 0);
      },
    });
  });
}
