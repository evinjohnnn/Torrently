// Ported from assets/src/js/lib/auth/errors.js and nextLocation.js; the
// reasons are written there.

const CSRF_MISMATCH_BODY = "CSRF token mismatch";
const RELOAD_MARK = "auth.csrfReloadAt";
const RELOAD_WINDOW_MS = 60 * 1000;

type Failure = { status?: number; statusText?: string; message?: string; clone?: () => Response };

async function isCsrfMismatch(err: Failure) {
  if (!err || err.status !== 400 || typeof err.clone !== "function") return false;
  try {
    return (await err.clone().text()).trim() === CSRF_MISMATCH_BODY;
  } catch {
    return false;
  }
}

function claimReload(now: number) {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_MARK));
    if (last && now - last < RELOAD_WINDOW_MS) return false;
    sessionStorage.setItem(RELOAD_MARK, String(now));
    return true;
  } catch {
    return false;
  }
}

/** The message for a failed auth call, and whether the page is reloading. */
export async function describeAuthError(err: unknown, t: (key: string, value?: string | number) => string) {
  const e = (err ?? {}) as Failure;
  if (await isCsrfMismatch(e)) {
    if (claimReload(Date.now())) {
      setTimeout(() => location.reload(), 1500);
      return { message: t("auth.progress.sessionExpiredReloading"), reloading: true };
    }
    return { message: t("auth.progress.sessionExpired"), reloading: false };
  }
  if (e.statusText) return { message: e.statusText, reloading: false };
  if (e.message) return { message: e.message, reloading: false };
  if (e.status) return { message: t("auth.progress.requestFailed", e.status), reloading: false };
  return { message: t("auth.progress.unknownError"), reloading: false };
}

/** Where the refresh interstitial goes: null reloads in place. */
export function nextLocation(refreshed: boolean, { pathname, search }: { pathname: string; search: string }) {
  if (refreshed) return null;
  return "/login?return-url=" + encodeURIComponent(pathname + search);
}
