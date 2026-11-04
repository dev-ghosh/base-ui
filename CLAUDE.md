# Base-web-client

Next.js (App Router) rebuild of the vanilla-JS RIE dashboard ("BASE"). The old app is
`..\rie-dashboard2` and is a **read-only reference**: never edit it. Design:
`docs/superpowers/specs/2026-11-04-nextjs-migration-design.md`. Plan:
`docs/superpowers/plans/2026-11-04-nextjs-migration.md`. Routes:
`docs/route-inventory.md` (the canonical list of routes and sub-views).

## Hard rules

- **Plain JavaScript.** `.js` / `.jsx` only. No `.ts` / `.tsx`, no `tsconfig` (`jsconfig.json` only;
  alias `@/*` -> `src/*`). `package.json` has `"type": "module"`.
- **Backend frozen.** The Supabase project (`plixqfamfpxyhtvuietk`): tables, views, RLS, RPCs, migrations,
  edge functions, auth settings, Redirect URLs and email templates are never changed. This app is only
  another client of it. No Supabase JS SDK: keep the hand-rolled REST, auth and realtime clients.
- **Port 8080.** `npm run dev` = `next dev -p 8080` (8080 is an allowed Supabase redirect URL; 3000 belongs
  to the HR automation app). Run one dev server at a time. Magic-link `redirect_to` is always
  `origin + "/"`; the root page handles `#access_token` / `#pair` (spec C13).
- **Same UI.** Same layout, colours, copy, interactions and keyboard shortcuts. The old CSS is copied as
  global CSS unchanged; class names are kept.
- **Env vars** (see `.env.example`): `NEXT_PUBLIC_SB_URL`, `NEXT_PUBLIC_SB_KEY`,
  `NEXT_PUBLIC_HR_AUTOMATION_URL`.
- **Root element contract** (spec C15): `data-theme` attribute; classes `installed`, `ro`, `is-admin`,
  `side-collapsed`, `side-open` on `<html>`. Same `localStorage` keys as the old app (`rie_session`,
  `rie_data_cache`, `rie_side_collapsed`, theme key `rie-theme`). Email code length `OTP_LENGTH = 8`.

## Route rules (spec C7)

1. Every sidebar destination is a route.
2. Every sub-view or tab inside a screen is a nested route segment, not a `?view=` parameter or an
   in-page toggle.
3. Every record viewer (task, contact, lead, event, initiative) is an `[id]` route rendered as an
   intercepting route in the `@modal` slot: same modal over the page, real shareable URL.
4. Filters and sort are search parameters.
5. Forms (create/edit), confirmations and transient overlays stay as component state.
6. Old URLs keep working: `?tab=<old>` and the aliases `today`, `work`, `pipeline` redirect to the new
   routes; unknown values go to `/today`, never a 404. `#mx?...` is converted once to search params.

## Banned in `src/`

- `window.*` function shims (assigning functions onto `window`).
- `innerHTML` assignment of templated markup (use JSX).
- Inline `onclick="..."` strings.
- Hard-coded people, companies or function names (they come from the data).
- `.ts` / `.tsx` files, a `tsconfig`.

## State and structure

Almost everything is a client component (`"use client"`): the session JWT lives in `localStorage`, so the
server has nothing to render with. One small store read through `useSyncExternalStore`, with per-feature
hooks. Derive the queue at render time; never cache it. Pure logic modules are ported into `src/lib/`
with their tests. Read the whole old module before porting any screen (old `CLAUDE.md` is partly stale).

## Running tests

- `npm test` runs `node tests/run-all.mjs` (every `tests/*.test.mjs` with plain `node`, non-zero exit on
  any failure) and then `vitest run --passWithNoTests` (React/jsdom tests, `tests/**/*.test.jsx` only).
- Single logic test: `node tests/<name>.test.mjs`.
- Build check: `npm run build`.
- Testing writes real data (the only backend is production). Use a viewer-role account or take care.
