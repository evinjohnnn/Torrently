import { sessionHeaders } from "./router";
import type { PageState, Session } from "./state";

export type Fields = Record<string, string | string[] | Blob | undefined | null>;

export function formData(fields: Fields) {
  const fd = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    if (value == null) continue;
    if (Array.isArray(value)) for (const item of value) fd.append(name, item);
    else fd.set(name, value);
  }
  return fd;
}

/**
 * POSTs a form for its JSON answer: a job start (action/post) or anything
 * else the server answers with page state. Throws when the answer is not
 * the app's (a network error, an HTML error page).
 */
export async function postForm<T>(url: string, fields: Fields, session: Session): Promise<PageState<T>> {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    body: formData(fields),
    headers: { ...sessionHeaders(session), "X-Torrently-Page": "1" },
  });
  const type = response.headers.get("Content-Type") ?? "";
  if (!type.includes("application/json")) throw new Error(`unexpected answer ${response.status}`);
  return (await response.json()) as PageState<T>;
}

/** Reads a page's state without showing it (e.g. a dialog the page renders on ?flag=true). */
export async function fetchPage<T>(url: string): Promise<PageState<T>> {
  const response = await fetch(url, { credentials: "same-origin", headers: { "X-Torrently-Page": "1" } });
  const type = response.headers.get("Content-Type") ?? "";
  if (!type.includes("application/json")) throw new Error(`unexpected answer ${response.status}`);
  return (await response.json()) as PageState<T>;
}
