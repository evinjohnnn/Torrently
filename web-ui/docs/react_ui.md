# React interface (Torrently)

The site is moving from Go templates to a React app, one view at a time. The
Go server stays the backend: routes, handlers, middleware, auth, CSRF, i18n
and SEO are unchanged. What changes is who draws the page.

## How a request becomes a React page

```
GET /lib/            handler builds its Data as always ──► tb.Build("library/index").HTML(200, ctx)
                                                            │
                     template.Manager takeover hook ◄───────┘
                     services/spa.Service.Serve(view, layout, code, ctx)
                       ├─ view has no page in handlers/spa  → template renders (classic)
                       ├─ X-Torrently-Page header           → JSON PageState
                       └─ otherwise                         → layouts/spa.html + embedded PageState
```

- `services/template/template.go` — `Manager.WithTakeover`; `Template.HTML`
  asks the takeover first.
- `services/spa` — the takeover. `Register(view, Page)` for full pages
  (layout "main"), `RegisterFragment(view, Page)` for layout-less views the
  app POSTs to (e.g. `action/post` answers a job start with its log URL).
  `Session` is what every page shares (CSRF, session id, user, tier, lang,
  instance switches, the footer's tool list).
- `templates/layouts/spa.html` — the app's document. It renders the view's own
  `title`, `description`, `canonical`, `og` and `head_extra` blocks, so search
  engines and link previews see exactly what the classic page gave them. The
  view's `main` block is not rendered.
- `handlers/spa` — one file per page: a builder that turns the handler's Data
  (`ctx.Data`) into a JSON DTO. Builders only reshape; queries, checks and
  redirects stay in the handler. Each file registers itself:
  `func init() { page("library/index", (*config).library) }`.
- `WEB_UI=react` (flag `--web-ui`) turns the app on; `?ui=react` /
  `?ui=classic` sets a cookie for one browser. Without the build
  (`assets/dist/app/.vite/manifest.json`) every view falls back to templates.

## What renders in React

| Area | Views (templates/views/…) | Builder (handlers/spa) | Page (frontend/src/pages) |
|---|---|---|---|
| Home and the 22 tool landings | `index` | `home.go` | `home/` |
| Torrent page; file actions | `resource/get`; fragment `action/post` | `resource.go`, `action.go` | `torrent/` |
| Sign-in | `auth/{login,password,verify,callback,logout,refresh}` | `auth.go` | `auth/` |
| Discover | `discover/index` | `discover.go` | `discover/` |
| Account | `library/index`, `notifications/get`, `vault/index`, `device/get`, `subscription/*` | `library.go`, `notifications.go`, `vault.go`, `device.go`, `subscription.go` | `library/`, `notifications/`, `vault/`, `device/`, `subscription/` |
| Profile | `profile/{get,payments,email_verified}` | `profile.go`, `payments.go` | `profile/` |
| Content | `about/index`, `instructions/*`, `legal/*`, `support/*`, `speedtest/*`, `donate/*`, `error/page` | `about.go`, `instructions.go`, `legal.go`, `support.go`, `speedtest.go`, `donate.go`, `errorpage.go` | `content/`, `support/`, `speedtest/`, `donate/` |

Still classic, on purpose: `embed/*` (the player other sites frame — its own
SDK contract), `ext/*` (the browser extension's pages), `tests/*`, and the
cards jobs render server-side that the app hosts as islands (the player,
file info, image preview).

## The app (`frontend/`)

Vite + React + TypeScript, built to `assets/dist/app` (`npm run build:app`,
part of `npm run build`). Entry `src/main.tsx`.

| Piece | File | Notes |
|---|---|---|
| Boot state | `src/app/state.ts` | `PageState {view, status, title, error, session, data}` from `#torrently-state` |
| Router | `src/app/router.tsx` | `navigate(url)` fetches the same URL with `X-Torrently-Page`, follows redirects, falls back to a full load when the answer is not JSON (a classic page). `submit(url, FormData)` POSTs with CSRF and lands on the page the server redirects back to (`X-Return-Url`). `<Link>` for in-app links. `usePage<T>()` is the page on screen; `useSession()` |
| Forms | `src/app/api.ts` | `postForm(url, fields, session)` for JSON answers (job starts, dialogs), `fetchPage(url)` to read a page's state without showing it, `formData(fields)` |
| Page registry | `src/app/pages.ts` | collects `src/pages/*/routes.ts`: `{ "library/index": () => import("./Library") }` |
| i18n | `src/i18n` | the server's `locales/*.json`, split per namespace by `frontend/locale-chunks.ts`. `t(key, params)`, `tn(key, count, params)`, `rich(key, params)` for values with `<a>`/`<strong>`, `path("/x")` = langPath. A page exports `namespaces` (and optionally `namespacesFor(state)`) and is shown only once they are loaded |
| Chrome | `src/chrome` | Nav (liquid glass), Footer, Toasts (`toast(text)`), Backdrop (lenticular glass) |
| Jobs | `src/jobs` | `useJobLog(url)` follows `/queue/<q>/job/<id>/log`; `JobSteps`; `useAction()` starts a file action (Turnstile for anonymous visitors); `ActionRun` shows steps, then a card or the player |
| Classic islands | `src/legacy/Island.tsx` | hosts server-rendered pieces whose scripts we keep (the player): inserts the HTML, runs its scripts, stands in for `window.av` |
| UI | `src/ui` | `Icon`, `Dialog`, `format.ts` (`fileSize`, `timeAgo`) |
| Styles | `src/styles` | `base.css` tokens and primitives, `chrome.css`, `components.css`; each page imports its own CSS |

A page module:

```tsx
export const namespaces = ["library", "resource"];
export default function Library() {
  const { data, session } = usePage<LibraryData>();
  const { t, path } = useI18n();
  …
}
```

### Content pages

About, the `/instructions/*` guides, legal, support, speed test, `/donate`
and the error page share `src/pages/content/kit.tsx`: `PageHead` (title
over the glass), `Sheet` (paper for the rest), `Prose` (reading measure;
same-origin links inside translated markup stay in the app). The legal text
is not translated and stays in its template: each `legal/*` view defines
`legal_body` (and `legal_updated`), which the classic page renders in its
frame and `handlers/spa/legal.go` renders through `spa.Service.Block`. The
crypto checkout (`POST /donate/crypto`) stays a native form post: it
redirects to the payment provider, which `submit()` cannot follow.

### Mutations

Handlers answer a form POST with a redirect to `X-Return-Url`
(`web.RedirectWithSuccess*`), which the app sends with every request. So:

- a button that changes the page it is on: `submit(path("/lib/add"), formData({resource_id}), { scroll: false })` — the page comes back with the new state, `?message=` becomes a toast;
- a dialog: `postForm` and read the answer's `data`.

Never send `Accept: application/json` to a classic endpoint: several of them
switch to a different JSON shape on it (`web.RedirectWith*`, POST `/`).

### Job cards

Job logs carry pre-rendered HTML for cards (`custom`) and the player
(`rendertemplate`). `services/job` items have an optional `data` field
(`Job.CustomWithData`, `RenderTemplateWithData`): give a card its data there
and draw it in React; the classic UI keeps using `body`. The player stays an
island.

## Design language

Torrently: paper, ink and olive, seen through reeded glass. Keep to it:

- Tokens in `src/styles/base.css`: `--paper #f4f0e5`, `--ink #1c1f14`,
  `--olive #5f6f2c` (actions), `--olive-ink #4b5823` (links, accent text),
  `--cream`, `--honey` (warnings, plans), `--brick` (errors). No other hues.
- Type: Space Grotesk for everything; the Doto wordmark only for the name;
  Space Mono only for real technical text (hashes, magnets, sizes, speeds,
  code). Sentence case. No tracked all-caps labels over headings.
- Surfaces: `.glass` panes over the backdrop; long pages put their body on the
  paper `.sheet` (see the home page). One radius family: `--r-xl` for the
  big panes, `--r-md`/`--r-sm` inside.
- Controls: `.button` (`.primary` ink, `.accent` olive, `.quiet`, `.small`,
  `.large`, `.danger`, `.on`), `.icon-button`, `.chip` (`.olive`, `.honey`,
  `.brick`), `.notice` (`.error`, `.warn`), `.field` + `.input`/`.select`/`.textarea`,
  `.check`, `.progress`, `.spinner`, `Dialog`.
- Lists are rows with hairlines, not grids of identical cards. Numbers only
  for real sequences.
- Motion only in answer to an action; respect `prefers-reduced-motion`.
- 44px touch targets, visible focus, 4.5:1 text contrast, works at 360px.

## Strings

Reuse the existing keys; the copy is translated into 11 languages. A new key
goes into all 11 `locales/*.json` with a real translation, next to the keys
of the same prefix (not at the end of the file). Brand names are not
translated.

## Local development

```
REST_API_SERVICE_HOST=… REST_API_SERVICE_PORT=… WEB_UI=react GIN_MODE=release \
GOLANG_PROTOBUF_REGISTRATION_CONFLICT=warn SESSION_SECRET=… ./web-ui s
npm run watch:app      # rebuilds assets/dist/app; the server picks the new manifest up
```

Postgres, Redis and SuperTokens are optional; without Postgres, account pages
answer as for an anonymous visitor.
