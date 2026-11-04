# Base-web-client: migrating the RIE dashboard UI to Next.js

Status: DRAFT, awaiting approval from the owner.
Source app: `..\rie-dashboard2` (vanilla JS SPA, "BASE"). It stays untouched and keeps running.
New app: `..\Base-web-client` (this folder).

## 1. Intent and why

The current UI is a no-build vanilla JS single-page app: one 7,573-line `index.html` holding every panel and modal, ~6,500 lines of CSS inline in it, 55 ES modules (~14,000 lines) that render HTML strings with `innerHTML`, 152 inline `onclick` handlers backed by ~243 `window.*` shims, and one mutable `state` singleton that every module mutates and re-renders by hand.

The owner wants the same product rebuilt on Next.js for three reasons, in their words:

1. a better component structure,
2. the advantage of having many hooks,
3. structured rendering of each feature, with a file-based routing structure for the UI.

This is a structural migration. It is not a redesign and not a feature project.

## 2. Goals

- G1. Every screen of the current app exists in Base-web-client and looks and behaves the same as it does today.
- G2. One route per screen using the Next.js App Router (file-based routing).
- G3. Each feature lives in its own folder with its own components and hooks. No `window.*` shims, no inline `onclick` strings, no `innerHTML` templates.
- G4. Shared behaviour (session, access/role, realtime, scope, queue, modals, status toasts) is exposed as hooks.
- G5. At the end of every slice (section 7) the new app runs and shows real data. There is never a long period with a broken app.
- G6. The pure logic and its tests carry over unchanged, so behaviour is provably the same.

## 3. Non-goals

- No visual redesign. No new features. No behaviour fixes smuggled in (log them instead).
- No backend change of any kind (see section 4).
- No TypeScript.
- No change to `rie-dashboard2`, not even to docs or config.
- No switch-over, DNS change or deployment decision in this project. The old app stays the live app until the owner decides otherwise.

## 4. Constraints (decided by the owner)

- **Plain JavaScript.** `.js` / `.jsx` files only. No `.ts` / `.tsx`, no `tsconfig`.
- **Backend frozen.** The Supabase project (`plixqfamfpxyhtvuietk`), its tables, views, RLS policies, RPCs, migrations, auth settings and edge functions are not changed. That includes the Supabase dashboard settings (Redirect URLs, email templates). The new app is just another client of the same backend.
- **Separate folder.** `Base\Base-web-client`, a sibling of `rie-dashboard2`.
- **Same UI.** Same layout, same colours, same copy, same interactions.

## 5. Decisions

### Made by the owner
Above (section 4), plus: the goal is structure and hooks, not new capability; the whole app is to be ported in slices (the owner approved "build in slices", see section 7).

### My calls (the owner has not seen these; each is easy to reverse)

| # | Call | Why |
|---|------|-----|
| C1 | **Every screen is ported**, including the less central ones (Expenses, Team, HR automation, Events). | The owner approved the sliced plan without excluding any screen. They can drop screens later. |
| C2 | **Next.js App Router, with almost everything as client components** (`"use client"`). | Sign-in lives in browser `localStorage` (`rie_session`) and access is enforced by Supabase RLS using that JWT. The server has no session to render with, so server rendering would buy nothing and add risk. Routing, layouts and code-splitting still come from Next.js. |
| C3 | **Reuse the existing CSS as global CSS, unchanged.** The `<style>` block from `index.html` and `css/shell.css` are copied into `app/` global stylesheets, and class names are kept. | It is the cheapest way to guarantee the same look, and it lets the markup port 1:1. CSS Modules/Tailwind would be a second migration. |
| C4 | **Port the pure modules as they are** into `src/lib/`: `queue.js`, `scope.js`, `vocab.js`, `warmth.js`, the `db.js` mappers, `utils.js` helpers, `auth.js` and the Supabase REST wrappers. Remove only their DOM and `window` access where present. Existing `tests/*.test.mjs` that cover them are copied and must pass. | These hold the business rules (queue ordering, scope, ownership, warmth) that CLAUDE.md says are tested for parity with the database views. Rewriting them is risk with no benefit. |
| C5 | **No Supabase JS SDK.** Keep the hand-rolled REST, auth and realtime clients. | Same behaviour, same measured quirks (8-digit OTP, `redirect_to` as a query parameter). `docs/SIGN_IN.md` in the old repo records why. |
| C6 | **State: one small store plus hooks, no extra state library.** The `state` singleton becomes a store read through `useSyncExternalStore`, with per-feature hooks (`useTasks`, `useContacts`, `useLeads`, `useEvents`, `useAccess`, `useSession`, `useScope`, `useQueue`, `useRealtime`, `useModal`, `useStatus`, ...). | Keeps the dependency list short and keeps the "derive the queue at render, never cache it" rule from CLAUDE.md. The builder may swap in a library if there is a concrete reason. |
| C7 | **File-based routing for every view that has its own identity**, not only the sidebar items (owner request: "file-based routing everywhere"). Three rules: (a) every sidebar destination is a route; (b) every sub-view or tab inside a screen is a nested route segment, not a `?view=` parameter or an in-page toggle; (c) every record viewer (task, contact, lead, event) is a `[id]` route rendered as an intercepting route, so it still opens as the same modal over the page but has a real, shareable URL. Filters and sort are search parameters. Forms (create/edit), confirmations and transient overlays stay as component state. Full route map in section 6. | The old app tracks "where am I" in a JS variable (`state.taskView`, analytics `TABS`, `switchTabByName`). Routes make that structural, give back/forward and deep links for free, and are what the owner asked for. |
| C8 | **Old URLs keep working.** `?tab=<old value>` (and the aliases `today`, `work`, `pipeline`) redirect to the new routes. The legacy matrix hash `#mx?...` is read once and converted to search parameters. `#access_token=...` (magic-link return) and `#pair=...` (QR pairing) are still handled, see C13. | Home Screen shortcuts, push payloads, the iOS shell (`RIE.openTab`) and saved matrix links already use them. |
| C9 | **Config via environment variables** (`NEXT_PUBLIC_SB_URL`, `NEXT_PUBLIC_SB_KEY`) using the same public anon key already in the old `index.html`. | Replaces the `<meta name="rie-config">` tag. |
| C10 | **Run the dev server on port 8080** (`next dev -p 8080`), one app at a time. | `http://localhost:8080` is the redirect URL already allowed in Supabase. Using it avoids touching the frozen backend settings. The email-code and QR sign-in routes need no redirect at all. It also avoids Next.js's default port 3000, which the HR automation iframe already uses (C14). |
| C11 | **Parity is checked by screenshot**, old vs new, per screen, per theme (dark and light), at a desktop and a phone width. The repo's `reports/qa/` screenshots are a starting baseline. | "Same UI" needs a checkable definition. |
| C12 | **Later, not in the first slices:** PWA/service worker/manifest, web push, the iOS shell, and deployment (see the hosting risk in section 10). | They depend on where the new app is hosted, which is undecided. |
| C13 | **Sign-in return URL must stay the site root.** The old app sends `redirect_to = origin + pathname` for the magic link, and Supabase only accepts URLs on its allowed list, which is frozen. So the new app always requests `redirect_to = origin + "/"`, and `src/app/page.jsx` (the root) reads `#access_token=...` / `#pair=...` from the URL hash, completes sign-in, clears the hash, then redirects to the user's landing route. `/login` is only for people who are not signed in. | Found in the audit: without this, magic-link sign-in started from `/login` would fail on the unchanged backend. |
| C14 | **HR automation stays an iframe** of a separate app (`http://localhost:3000` in the old code), so its URL becomes `NEXT_PUBLIC_HR_AUTOMATION_URL`. The theme sync `postMessage({type:'rie-theme'})` is kept exactly. | It is a different application, not a screen of this one. |
| C15 | **Root-element state the CSS depends on is kept**: the `data-theme` attribute, and the classes `installed`, `ro`, `is-admin`, `side-collapsed`, `side-open` on `<html>`, plus the tiny inline script that sets `installed` and the theme before first paint (no flash). Same `localStorage` keys (`rie_session`, `rie_data_cache`, `rie_side_collapsed`, theme). `rie_task_surface` is replaced by the route. | The ~6,500 lines of copied CSS key off these. |
| C16 | **The iOS bridge contract is preserved:** `window.RIE.{applyTokens, openTab, refresh, signOut, isSignedIn}` is provided by one small client component with the same signatures, with `openTab` mapping to router navigation. Built in slice 9, but nothing is designed against it before then. | CLAUDE.md: the Swift code calls these by name. |
| C17 | **Project hygiene:** the folder gets its own `git init` (no remote), so it is not tracked by the repository that currently surrounds the home directory, and a `CLAUDE.md` with the conventions (routes, hooks, no inline handlers, backend frozen) is written in slice 0. The Next.js version is chosen at scaffold time (current stable; Node 24 is installed). | So the next person or session starts from the rules, not from this design. |

## 6. Target structure and route map

```
Base-web-client/
  package.json, next.config.mjs, jsconfig.json, .env.example, CLAUDE.md
  public/                          icons, manifest, favicon (copied)
  src/
    app/
      layout.jsx                   fonts, global CSS, early theme/installed script
      globals.css, shell.css       copied from index.html <style> and css/shell.css
      page.jsx                     root: handles #access_token / #pair, then redirects (C13)
      login/page.jsx
      (app)/
        layout.jsx                 session gate, sidebar, header, status bar, @modal slot
        @modal/                    intercepting routes for record viewers
        today/
          page.jsx
          triage/page.jsx          (intercepted as the Triage overlay)
          classify/page.jsx
        work/
          layout.jsx               scope control (Mine/Team/Everyone) + surface switcher
          page.jsx                 redirects to /work/matrix
          matrix/page.jsx   board/page.jsx   hierarchy/page.jsx
          initiatives/page.jsx   decide/page.jsx
          tasks/[id]/page.jsx      task viewer
        pipeline/
          layout.jsx   page.jsx    (kanban | table become /pipeline/board, /pipeline/table)
          [id]/page.jsx            lead viewer
        contacts/  page.jsx  [id]/page.jsx
        events/    page.jsx  [id]/page.jsx
        escalations/page.jsx
        analytics/
          layout.jsx   page.jsx -> overview
          overview/  people/  areas/  pipeline/     (the four existing tabs)
        expenses/page.jsx   team/page.jsx   hr-automation/page.jsx
        profile/page.jsx   help/page.jsx
    features/<name>/{components,hooks,index.js}     one folder per feature
    components/                    shared UI: Modal, Status bar, Sidebar, Splash, ...
    hooks/                         cross-feature hooks (useSession, useAccess, useRealtime, ...)
    lib/                           ported pure modules (C4) and REST/auth/realtime clients
    store/                         the state store (C6)
  tests/                           copied logic tests + route, redirect and hook tests
  docs/superpowers/specs/          this file
```

The route inventory is a minimum, not a ceiling. In slice 0 the builder lists every view toggle, tab and record viewer in the old code and gives each one a segment. The audit found: Work's five surfaces, Pipeline kanban/table, Analytics' four tabs, and the record viewers behind `mo-tv`, `mo-det`, `mo-ldet`, `mo-edet` and `mo-entity-det`. Anything found later follows rule C7.

## 7. Slices (order of work)

Each slice ends with the app running against real data and a parity check of what it added.

0. **Scaffold.** Next.js project in plain JS, `git init`, `CLAUDE.md`, global CSS copied, env vars, fonts, early theme script, full route inventory of the old code (C7). A blank page renders with the right background.
1. **Logic port.** `src/lib/` ported; copied unit tests pass under the new project.
2. **Sign-in and shell.** root callback handling (C13), `/login` (email code, magic link, QR pairing), session handling and refresh, access/role load, sidebar and header, theme toggle, the read-only banner.
3. **Data and realtime.** The initial load, offline cache fallback, the row-level realtime apply, the status bar.
4. **Today.** Ranked queue, row actions and keyboard keys, Triage, the task form and task view modals.
5. **Work.** Scope control, then Matrix, Board, Hierarchy, Initiatives, Decide.
6. **Pipeline** (leads).
7. **Contacts and Events**, including the AI edge-function features.
8. **Remaining screens:** Escalations, Analytics, Expenses, Team, HR automation, Profile, Help and the tour.
9. **Platform layer** (C12), once hosting is decided.

## 8. Success criteria

- Every screen listed in C7 exists, and a side-by-side screenshot comparison shows no visible difference in both themes at both widths, except differences the owner has accepted in writing.
- The same signed-in user sees the same data and the same role/scope/company restrictions as in the old app (this is enforced by the database, and must stay true).
- No `window.*` function shims, no `innerHTML` assignments of templated markup and no inline `onclick` strings remain in `src/`.
- The ported logic tests pass; new tests cover routes, deep-link redirects and the key hooks.
- `rie-dashboard2` and the Supabase project are byte-for-byte unchanged by this work.

## 9. Anti-goals (a failure even if everything "works")

- A screen that looks slightly different because it was "cleaned up".
- Any write to the database that the old app would not have made, or any change to a policy, table, view, function or auth setting.
- Quietly dropping a keyboard shortcut, deep link, empty state or role restriction.
- Hard-coding people, company or function names (the old repo has tests forbidding this; the rule carries over).

## 10. Risks and things to know

- **Testing writes real data.** The only backend is production. Signing in and using the new app edits live records. Use a viewer-role account (writes are blocked by RLS) or take care when testing writes.
- **Hidden behaviour in 14k lines of JS.** CLAUDE.md is partly stale (for example it says 6 edge functions where the repo has 10, and it never mentions the `HR automation`, `Expenses` or `Team` panels). The builder must read each old module in full before porting its screen.
- **Always-mounted modals.** The old app keeps ~13 modals permanently in the DOM and toggles a class. In React they become components with open state; a form that relied on leftover DOM state needs care.
- **Timing hacks** such as `later(() => ...)` in `help.js` rely on DOM timing and will need a proper replacement (an effect or event).
- **Third-party scripts:** SheetJS is loaded from a CDN, and `qrcode.js`/`jsqr.js` are vendored and lazy-loaded. Keep them lazy.

- **Detail routes vs. static hosting.** Record ids are only known at runtime, so `[id]` routes cannot be pre-built by Next.js static export (`output: 'export'`). The hosting decision in slice 9 therefore needs a host that runs Next.js (for example the OpenNext adapter on Cloudflare Workers, or Vercel). This is the price of C7(c); if static hosting matters more, the record viewers can fall back to `?id=`.
- **Hash-based flows.** `#access_token` and `#pair` never reach the server, so they can only be read in a client component on the root route (C13).
- **DOM-based tests.** `tests/nav.test.mjs` tests tab resolution; it is rewritten as a redirect/route test rather than copied.

## 11. Left to the builder

- Exact component boundaries and naming inside each feature.
- Store and hook internals (C6).
- How the global CSS is split (one file or several) as long as class names and cascade order are preserved.
- Test tooling for components and routes.
- The screenshot-comparison method.
