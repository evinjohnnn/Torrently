// The SuperTokens browser SDK, set up the way assets/src/js/lib/supertokens.js
// does: every call carries the page's CSRF token (web-ui's CSRF middleware
// covers /auth/*).
import SuperTokens from "supertokens-web-js";
import Session from "supertokens-web-js/recipe/session";
import Passwordless, { consumeCode, createCode, signOut } from "supertokens-web-js/recipe/passwordless";
import ThirdParty, { getAuthorisationURLWithQueryParamsAndSetState, signInAndUp } from "supertokens-web-js/recipe/thirdparty";

type Hook = (context: { requestInit: RequestInit; url: string }) => Promise<{ requestInit: RequestInit; url: string }>;

function preAPIHook(csrf: string): Hook {
  return async ({ requestInit, url }) => ({
    url,
    requestInit: { ...requestInit, headers: { ...requestInit.headers, "X-CSRF-TOKEN": csrf } },
  });
}

let ready = false;
function init(csrf: string, domain: string) {
  if (ready) return;
  ready = true;
  SuperTokens.init({
    appInfo: { apiDomain: domain, apiBasePath: "/auth", appName: "torrently" },
    recipeList: [Session.init({ preAPIHook: preAPIHook(csrf) }), Passwordless.init(), ThirdParty.init()],
  });
}

export interface Tokens {
  csrf: string;
  domain: string;
}

export async function sendMagicLink(email: string, { csrf, domain }: Tokens) {
  init(csrf, domain);
  return createCode({ email, options: { preAPIHook: preAPIHook(csrf) } });
}

export async function handleMagicLinkClicked({ csrf, domain }: Tokens) {
  init(csrf, domain);
  return consumeCode({ options: { preAPIHook: preAPIHook(csrf) } });
}

export async function handleCallback({ csrf, domain }: Tokens) {
  init(csrf, domain);
  return signInAndUp({ options: { preAPIHook: preAPIHook(csrf) } });
}

export async function logout({ csrf, domain }: Tokens) {
  init(csrf, domain);
  // the Session recipe's hook (init) carries the CSRF token here
  await signOut();
  return { status: "OK" };
}

export async function refresh({ csrf, domain }: Tokens) {
  init(csrf, domain);
  return Session.attemptRefreshingSession();
}

export async function signInWith(provider: string, { csrf, domain }: Tokens) {
  init(csrf, domain);
  const url = await getAuthorisationURLWithQueryParamsAndSetState({
    thirdPartyId: provider,
    frontendRedirectURI: `${domain}/auth/callback/${provider}`,
    options: { preAPIHook: preAPIHook(csrf) },
  });
  location.assign(url);
}
