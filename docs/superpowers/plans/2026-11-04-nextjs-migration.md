# Base-web-client (Next.js migration) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the vanilla-JS RIE dashboard ("BASE") as a plain-JavaScript Next.js App Router app with identical UI, file-based routing everywhere, and hooks per feature, against the unchanged Supabase backend.

**Architecture:** Client-component Next.js app (the JWT lives in `localStorage`, so there is nothing to render on the server). The old `state` singleton becomes a small store read through `useSyncExternalStore`; each feature gets hooks and components; pure logic modules are ported unchanged and keep their tests. The old CSS is copied verbatim as global CSS so class names and markup port 1:1.

**Tech Stack:** Next.js (current stable, chosen at scaffold time), React, plain JS (`.js`/`.jsx`), Node 24, Vitest + @testing-library/react + jsdom for new tests, plain `node` scripts for ported logic tests.

**Spec:** `docs/superpowers/specs/2026-11-04-nextjs-migration-design.md` (call numbers C1-C17 below refer to its section 5). Old app (read-only reference, never edit): `..\rie-dashboard2`, call it `$OLD`.

## Global Constraints

- Plain JavaScript only: no `.ts`/`.tsx`, no `tsconfig` (jsconfig only).
- Backend frozen: no change to Supabase tables, views, RLS, RPCs, migrations, edge functions, auth settings, Redirect URLs, or email templates. `$OLD` is never modified.
- UI identical: same layout, colours, copy, interactions, keyboard shortcuts; old CSS copied unchanged, class names kept.
- Dev server: `next dev -p 8080` (8080 is the allowed redirect URL; 3000 belongs to the HR automation app).
- Magic-link `redirect_to` is always `origin + "/"` (C13).
- Env vars: `NEXT_PUBLIC_SB_URL`, `NEXT_PUBLIC_SB_KEY` (the existing public anon key), `NEXT_PUBLIC_HR_AUTOMATION_URL`.
- Same `localStorage` keys: `rie_session`, `rie_data_cache`, `rie_side_collapsed`, theme key as in `$OLD/js/app.js`. Email code length `OTP_LENGTH = 8`.
- Root `<html>` contract: attribute `data-theme`; classes `installed`, `ro`, `is-admin`, `side-collapsed`, `side-open` (C15).
- In `src/`: no `window.*` function shims, no `innerHTML` of templated markup, no inline `onclick` strings. No hard-coded people, companies or function names.
- Every sub-view/tab is a route segment; every record viewer is an intercepting `[id]` route; forms/confirmations stay as component state (C7).
- Before porting any screen, read its whole old module(s) in `$OLD/js/`; CLAUDE.md in `$OLD` is partly stale.

## Review Focus

Failure modes the spec implies that no feature task would otherwise test; each is pinned in the task named:

1. Magic-link or QR return lands on `/` with a bad/expired hash while already signed out: show `/login` with a message, never a blank page (Task 5).
2. Viewer role: write controls hidden and any write attempt yields the sentence from `assertCanWrite`, never a raw PostgREST error (Task 6, Task 8).
3. Zero rows / offline: empty states render, and a failed load falls back to `rie_data_cache` with the age warning (Task 7).
4. Legacy and junk URLs: `?tab=bogus` goes to `/today`, not a 404; `?tab=initiatives` goes to `/work/initiatives` (Task 6).
5. Session expiry mid-use and realtime reconnect: token refresh happens before `expiresAt - 60s`, reconnect triggers one full resync, a rejected refresh returns the user to `/login` (Task 4, Task 7).

---

## Task 0: Scaffold, repo hygiene, route inventory

**Files:**
- Create: `package.json` (`"type": "module"`, scripts `dev` = `next dev -p 8080`, `build`, `start`, `test`), `next.config.mjs`, `jsconfig.json` (alias `@/*` -> `src/*`), `.env.example`, `.gitignore`, `CLAUDE.md`, `src/app/layout.jsx`, `src/app/page.jsx`, `tests/run-all.mjs`, `docs/route-inventory.md`
- Test: `tests/smoke.test.mjs`

**Interfaces:**
- Produces: `npm run dev` serving on 8080; `npm test` runs every `tests/*.test.mjs` via `tests/run-all.mjs` (exit non-zero on any failure) plus `vitest run`; `docs/route-inventory.md` listing every route and sub-view (the canonical list for Tasks 6-16).

- [ ] **Step 1:** `git init` in the folder (no remote). Install `next react react-dom` and dev deps `vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom`.
- [ ] **Step 2: Write failing test** `tests/smoke.test.mjs`: asserts `package.json` has `"type":"module"`, the `dev` script contains `-p 8080`, no `*.ts`/`*.tsx` files exist under `src/`, and `.env.example` names the three env vars from Global Constraints.
- [ ] **Step 3:** Run `node tests/smoke.test.mjs`. Expected: FAIL.
- [ ] **Step 4:** Implement the files above. `CLAUDE.md` records: plain JS, backend frozen, port 8080, route rules (C7), banned patterns (Global Constraints), how to run tests.
- [ ] **Step 5:** Write `docs/route-inventory.md`: read `$OLD/index.html` panels (`tab-*`), `$OLD/js/shell.js` (`NAV_FOR`, `TITLES`), `$OLD/js/platform.js` (`TABS`, `TAB_ALIASES`), `$OLD/js/analytics.js` (`TABS`), `$OLD/js/tasks.js` (`PANEL_VIEWS`, surfaces), `$OLD/js/leads.js` and `$OLD/js/contacts.js` view toggles, and the modals `mo-tv mo-det mo-ldet mo-edet mo-entity-det`. List each as: route path | old identifier | kind (page / sub-view / record viewer / overlay-state). It must contain at least the routes of spec section 6.
- [ ] **Step 6:** `node tests/smoke.test.mjs` -> PASS; `npm run build` -> succeeds; `npm run dev` then `curl -s -o NUL -w "%{http_code}" http://localhost:8080/` -> `200`.
- [ ] **Step 7: Commit** `chore: scaffold Base-web-client`.

## Task 1: Global CSS, fonts, root layout

**Files:**
- Create: `src/app/globals.css` (verbatim body of the `<style>` block in `$OLD/index.html`), `src/app/shell.css` (verbatim `$OLD/css/shell.css`), `src/lib/early-script.js` (string constant), `tools/extract-css.mjs`
- Modify: `src/app/layout.jsx`
- Test: `tests/css-parity.test.mjs`

**Interfaces:**
- Produces: `export const EARLY_SCRIPT: string` in `src/lib/early-script.js`: sets `installed` class (same conditions as `$OLD/index.html` lines 28-40) and `data-theme` before first paint; layout renders it in `<head>` and sets `suppressHydrationWarning` on `<html>`. Default `data-theme="dark"`, `lang="en"`.

- [ ] **Step 1: Write failing test** `tests/css-parity.test.mjs`: reads `$OLD/index.html` (path from env `OLD_REPO`, default `../rie-dashboard2`), extracts the first `<style>...</style>` body, asserts `src/app/globals.css` equals it after trimming; asserts `src/app/shell.css` equals `$OLD/css/shell.css`; asserts `EARLY_SCRIPT` contains `display-mode: standalone`.
- [ ] **Step 2:** Run it. Expected: FAIL (files missing).
- [ ] **Step 3:** Implement `tools/extract-css.mjs(oldRepoPath)` that writes both CSS files; run it. Import both in `layout.jsx`, plus the Inter `<link>` and the manifest/theme-color/meta tags from `$OLD/index.html` lines 5-26.
- [ ] **Step 4:** Test -> PASS. In the browser at `:8080` the page background and font match the old app in dark and light (`data-theme`).
- [ ] **Step 5: Commit** `feat: copy global CSS and root layout`.

## Task 2: State store and hook primitives

**Files:**
- Create: `src/store/store.js`, `src/store/useStore.js`
- Test: `tests/store.test.jsx` (vitest)

**Interfaces:**
- Produces:
  - `createStore(initial: object) -> { getState(): object, setState(patch: object | (s)=>object): void, subscribe(fn): () => void }`
  - `store` singleton whose initial shape is copied from `$OLD/js/state.js` minus UI-only fields that become route/search params (`taskView`, `contactView`, filters stay as search params; in-flight edit ids stay as component state).
  - `useStore(selector: (s)=>T) -> T` (via `useSyncExternalStore`; rerenders only when the selected value changes by `Object.is`).

- [ ] **Step 1: Write failing tests:** `setState` merges and notifies subscribers once; unsubscribe stops notifications; a component using `useStore(s => s.tasks.length)` rerenders when `tasks` changes length and does not rerender when an unrelated key changes.
- [ ] **Step 2:** Run `npx vitest run tests/store.test.jsx` -> FAIL.
- [ ] **Step 3:** Implement per Interfaces.
- [ ] **Step 4:** Run -> PASS. **Step 5: Commit** `feat: add state store`.

## Task 3: Port the pure logic modules and their tests

**Files:**
- Create: `src/lib/vocab.js`, `queue.js`, `scope.js` (copied unchanged from `$OLD/js/`), `src/lib/format.js` (pure helpers from `utils.js`: `parseD`, `fmtD`, `dueLabel`, `dueCls`; `esc` is dropped because React escapes), `src/lib/warmth.js`, `src/lib/mappers.js` (all `row*`/`*ToRow` functions and `assigneesOf`, `personName`, `personCode`, `internalPeople`, `peopleNames` from `db.js`), `src/lib/people.js`
- Test: copy `$OLD/tests/work-scope.test.mjs`, `db-mappers.test.mjs`, `no-hardcoded-people.test.mjs` into `tests/` with import paths fixed

**Interfaces:**
- Consumes: `store` from Task 2.
- Produces: unchanged signatures `buildQueue(tasks, now)`, `isMine(t, me)`, `inScope(t, scope, me)`, `resolveScope(stored, me)`, `scopeCounts`, `ancestorsOf`, `mineSet`, `SCOPES`, `SCOPE_LABEL`; `computeWarmth(contact, now = new Date())` and `warmthLabel(score)` (the `state` read in `warmth.js` becomes a parameter); mapper functions read the people list through `getPeople()` from `src/lib/people.js` (`setPeople(list)` is called by the data loader in Task 7).

- [ ] **Step 1:** Copy the three test files and fix their imports to `../src/lib/...`. `no-hardcoded-people.test.mjs` must now scan `src/` instead of `js/`.
- [ ] **Step 2:** Run `node tests/work-scope.test.mjs` etc. -> FAIL (modules missing).
- [ ] **Step 3:** Port the modules. Remove DOM and `state` access only; do not change logic.
- [ ] **Step 4:** All three copied tests PASS. Add `tests/warmth.test.mjs`: `warmthLabel(70)==='Hot'`, `(45)==='Warm'`, `(20)==='Cool'`, `(19)==='Cold'`.
- [ ] **Step 5: Commit** `feat: port pure logic modules with tests`.

## Task 4: Backend clients (config, REST, auth, realtime)

**Files:**
- Create: `src/lib/config.js`, `src/lib/rest.js`, `src/lib/auth.js`, `src/lib/realtime.js`, `src/lib/edge.js`
- Test: `tests/auth.test.mjs`, `tests/rest.test.mjs`

**Interfaces:**
- Produces:
  - `config.js`: `SB_URL`, `SB_KEY` from env; `getHeaders(): Promise<object>` (JWT-aware, falls back to anon key) as in `$OLD/js/config.js`.
  - `rest.js`: `sbGet(table, params)`, `sbInsert`, `sbUpdate(table, id, data)`, `sbDelete`, `sbPatchWhere`, `safeGet`, `sbRpc(fn, body)`; `assertCanWrite()` reads `store.getState().access?.can_write` and throws an `Error` whose message is the old viewer sentence.
  - `auth.js`: the exports of `$OLD/js/auth.js` unchanged in name and behaviour (`sendMagicLink`, `verifyEmailCode`, `verifySignInLink`, `parseAuthCallback`, `decodeSession`, `getSession`, `clearSession`, `refreshSession`, `scheduleAutoRefresh`, `cancelAutoRefresh`, `signOut`, `OTP_LENGTH`), except `sendMagicLink` always passes `redirect_to = origin + "/"` (C13).
  - `realtime.js`: `initRealtime(onChange)` / `destroyRealtime()` as old, plus `onChange({type:'resync'})` on reconnect.
  - `edge.js`: `callEdgeFunction(fnName, body)` as in `$OLD/js/contacts.js`.

- [ ] **Step 1: Write failing tests (`tests/auth.test.mjs`, fetch mocked):** `sendMagicLink('a@b.co')` requests `/auth/v1/otp?redirect_to=` + `encodeURIComponent(origin + '/')`; `OTP_LENGTH === 8`; `getSession()` returns `null` when `expiresAt` is 59 seconds away and a session when 61 seconds away; `decodeSession` round-trips a fabricated JWT. `tests/rest.test.mjs`: with `access.can_write=false`, `sbInsert('tasks', {})` rejects without calling fetch.
- [ ] **Step 2:** Run -> FAIL. **Step 3:** Port, replacing DOM/`window.location` with injectable `location` argument for testability.
- [ ] **Step 4:** Run -> PASS. **Step 5: Commit** `feat: port backend clients`.

## Task 5: Session hooks, root callback route, login

**Files:**
- Create: `src/hooks/useSession.js`, `src/app/page.jsx` (root callback), `src/app/login/page.jsx`, `src/features/auth/{LoginForm,EmailCodeForm,PairScan,PairShow}.jsx`, `src/lib/devicepair.js` (port of `$OLD/js/devicepair.js`), `src/lib/vendor/{qrcode,jsqr}.js` (copied; loaded with dynamic `import()` only)
- Test: `tests/session.test.jsx`, `tests/root-callback.test.jsx`, copy `$OLD/tests/qr-roundtrip.test.mjs` into `tests/` (imports fixed to `src/lib/vendor/`); `device-pair.test.js` is not copied because it needs a service key

**Interfaces:**
- Produces: `useSession() -> { status: 'loading'|'signedIn'|'signedOut', session, signOut(): Promise<void> }`; `src/app/page.jsx` reads `#access_token=...&refresh_token=...` and `#pair=<12 chars>` from `location.hash`, completes sign-in, clears the hash with `history.replaceState`, then `router.replace('/today')`; with no hash and no session it replaces to `/login`; with a session it replaces to `/today`.

- [ ] **Step 1: Write failing tests:** root with a valid-looking hash stores `rie_session` and navigates to `/today`; root with `#access_token=garbage` navigates to `/login?error=link` and `LoginForm` shows a sentence (Review Focus 1); `useSession` reports `signedOut` when `getSession()` is null and calls `scheduleAutoRefresh` when signed in; a rejected `refreshSession` leads to `signedOut` (Review Focus 5).
- [ ] **Step 2:** Run -> FAIL. **Step 3:** Port the markup and copy of `#mo-user` (index.html lines ~7000-7170) into the form components with the same class names and strings; email-code, link-paste, QR scan and QR show flows all work. **Step 4:** Tests PASS, including `qr-roundtrip`; with a real allowed email, email-code sign-in works at `http://localhost:8080` (ask the owner to do this check; do not create accounts).
- [ ] **Step 5: Commit** `feat: sign-in, session hooks, root callback`.

## Task 6: App shell, access, legacy redirects, route stubs

**Files:**
- Create: `src/app/(app)/layout.jsx`, `src/components/{Sidebar,Header,StatusBar,Splash,ReadOnlyBanner,Modal}.jsx`, `src/hooks/{useAccess,useTheme,useStatus,useModal}.js`, `src/lib/legacy-urls.js` (redirects run client-side because hashes never reach the server, so there is no `middleware.js`), `src/app/(app)/<route>/page.jsx` placeholders for every route in `docs/route-inventory.md`
- Test: `tests/legacy-urls.test.mjs`, `tests/shell.test.jsx`

**Interfaces:**
- Produces:
  - `resolveLegacyUrl(search: string, hash: string) -> string | null` returning the new path (with search params) for old URLs: `?tab=` values `home|today -> /today`, `tasks|work -> /work/matrix`, `initiatives -> /work/initiatives`, `decide -> /work/decide`, `leads|pipeline -> /pipeline`, `contacts events analytics escalations profile help expenses team -> /<same>`, `hr-automation -> /hr-automation`, anything else -> `/today`; `#mx?<qs>` -> `/work/matrix?<qs>`. Called once from the `(app)` layout on mount.
  - `useAccess() -> { canWrite, isAdmin, seesAssignedOnly, access }` backed by `loadMyAccess` (`rie_my_access()` RPC) and mirrored into `html.ro` / `html.is-admin` (C15).
  - `useModal(id) -> { open, show(), hide() }`; `<Modal>` renders the old `.mo` / `.mb` structure with `.open` class.
  - Sidebar items, titles and active-item mapping exactly as `NAV_FOR`/`TITLES` in `$OLD/js/shell.js`; collapse state persisted in `rie_side_collapsed`; drawer behaviour below 1024px.

- [ ] **Step 1: Write failing tests:** table test for `resolveLegacyUrl` covering every value above plus `?tab=bogus -> /today` and `?tab=initiatives -> /work/initiatives` (Review Focus 4); shell test: with `access.can_write=false` the root gets class `ro` and the read-only banner shows; with `is_admin=true` it gets `is-admin` (Review Focus 2); the active sidebar item for `/work/initiatives` is Work.
- [ ] **Step 2:** Run -> FAIL. **Step 3:** Implement. Port sidebar and header markup from `$OLD/index.html` (the `#side` and header sections) and `$OLD/js/shell.js` behaviour without inline handlers. **Step 4:** PASS; every sidebar link navigates and the placeholders render.
- [ ] **Step 5: Parity check** (procedure in Task 17) for the empty shell, both themes. **Step 6: Commit** `feat: app shell, access, legacy URL redirects`.

## Task 7: Data loading and realtime hooks

**Files:**
- Create: `src/hooks/{useDataLoader,useRealtime}.js`, `src/lib/apply-realtime.js`, `src/lib/data-cache.js`
- Test: `tests/apply-realtime.test.mjs`, `tests/data-loader.test.jsx`

**Interfaces:**
- Consumes: `store`, `rest.js`, `realtime.js`, mappers.
- Produces: `loadData(): Promise<void>` (the 14 endpoints of `$OLD/js/app.js` `loadData`/`syncData`, writing `store`, calling `setPeople`); `applyRealtimeChange(change: {table, eventType, new, old} | {type:'resync'}) -> 'applied'|'resync'` implementing the exact rules in `$OLD` CLAUDE.md "Realtime" (row-level upsert/remove; full resync for reconnect, unusable payload, derived tables `v_initiative_heartbeat`, `v_opening_move_candidates`, `decision_queue`, initiative-tier entities, or any exception); `readCache()/writeCache()` for `rie_data_cache`; `useDataLoader()` loads once after sign-in; `useRealtime()` subscribes while signed in and unsubscribes on unmount.

- [ ] **Step 1: Write failing tests:** an `UPDATE` on `entities` with `tier:'task'` upserts that one task and returns `'applied'`; the three derived tables and `{type:'resync'}` return `'resync'`; an update with `new: null` returns `'resync'`; a failed `loadData` with a cache present sets a status message containing the cache age (Review Focus 3); empty arrays leave the store with empty lists and no throw.
- [ ] **Step 2:** Run -> FAIL. **Step 3:** Port logic from `app.js` (`loadData`, `syncData`, `applyRealtimeChange`). **Step 4:** PASS. **Step 5: Commit** `feat: data loading and realtime`.

## Task 8: Today, Triage, Classify, task viewer and task form

**Files:**
- Create: `src/features/today/{TodayPage,QueueRow,TeamSection}.jsx`, `src/features/today/hooks/{useQueue,useTodayKeys}.js`, `src/features/tasks/{TaskForm,TaskViewer}.jsx`, `src/features/tasks/hooks/{useTaskActions,useTaskForm}.js`, `src/features/triage/{TriageOverlay}.jsx`, `src/features/triage/hooks/useTriage.js`, `src/features/classify/ClassifyOverlay.jsx`, routes `src/app/(app)/today/{page,triage/page,classify/page}.jsx`, `src/app/(app)/@modal/(.)work/tasks/[id]/page.jsx`, `src/app/(app)/work/tasks/[id]/page.jsx`
- Test: `tests/today.test.jsx`, `tests/triage.test.jsx`, `tests/task-actions.test.jsx`

**Interfaces:**
- Consumes: `buildQueue`, `inScope`, `isMine`, `useAccess`, `sbUpdate`, `sbInsert`, store.
- Produces: `useQueue() -> { decisions, p1Overdue, overdue, dueNext, team, toClassify }` derived at render from `store.tasks` (never cached); `useTaskActions() -> { markDone(id), pushWeek(id), setStatus(id, status), saveTask(task) }` with optimistic update, rollback and error status on failure; `saveTask` refuses a new task without `func` (old `saveTask` rule); `useTriage() -> { current, remaining, done(), push(days: 1|2|3), drop(), skip(), undo() }` with the queue snapshotted on open and a 10-second undo.

- [ ] **Step 1: Write failing tests:** Today renders the five groups in the order of `$OLD/js/today.js`; clicking ✓ calls `sbUpdate` once and the row disappears immediately (optimistic), and on a rejected update it reappears with an error status; focused row keys `Enter D 2 J K` behave as in the old file; Triage keys `D 1 2 3 X S U` map to the outcomes in `$OLD` CLAUDE.md and the queue does not reorder after an action; as a viewer, ✓ shows the `assertCanWrite` sentence and calls no fetch (Review Focus 2); `saveTask` without `func` rejects.
- [ ] **Step 2:** Run -> FAIL. **Step 3:** Port from `today.js`, `triage.js`, `classify.js`, `taskview.js`, and the task form portion of `tasks.js`/`index.html` (`mo-tf`). The viewer opens as an intercepting route over `/today` or `/work/*` and as a full page on direct load. **Step 4:** PASS. **Step 5: Parity check** for Today (signed-in viewer account), Triage, task viewer. **Step 6: Commit** `feat: Today, Triage, task viewer and form`.

## Task 9: Work (layout, scope control, five surfaces)

**Files:**
- Create: `src/app/(app)/work/layout.jsx`, `src/features/work/{ScopePill,SurfaceTabs}.jsx`, `src/features/work/hooks/{useScope,useWorkFilters}.js`, `src/features/work/{matrix,board,hierarchy,initiatives,decide}/*` with matching `page.jsx` in `src/app/(app)/work/<surface>/`
- Test: `tests/work-routes.test.jsx`, `tests/matrix-url.test.mjs`

**Interfaces:**
- Consumes: `scope.js`, `queue.js`, store.
- Produces: `useScope() -> { scope: 'mine'|'team'|'everyone', setScope(s), counts }` (default per `resolveScope(stored, me)`, persisted as in `$OLD/js/work.js`); `parseMatrixParams(search) -> filters` and `serializeMatrixParams(filters) -> string` for the matrix filter state (replaces the `#mx?` hash contract in `$OLD/js/matrix.js` lines ~201-240; the legacy hash is converted by `resolveLegacyUrl`).

- [ ] **Step 1: Write failing tests:** `/work` redirects to `/work/matrix`; the layout shows the same scope on all five surfaces; `parseMatrixParams(serializeMatrixParams(f))` equals `f` for filters with status, owner, priority and company; Board shows eight cards per column before the fold; colour rule (`red only where P1, overdue and mine; overdue alone amber`) via class assertions; a user with no `person_code` and scope `mine` sees an explanatory empty state, not a crash.
- [ ] **Step 2:** Run -> FAIL. **Step 3:** Port `matrix.js`, `tasks.js` (board/hierarchy), `entities.js`, `decide.js`, `work.js`, `taskview` hooks per surface; drag-and-drop writes through `useTaskActions`. **Step 4:** PASS. **Step 5: Parity check** all five surfaces in both themes. **Step 6: Commit** `feat: Work surfaces`.

## Task 10: Pipeline (leads)

**Files:**
- Create: `src/features/pipeline/{PipelineBoard,PipelineTable,LeadForm,LeadViewer,TouchpointLog}.jsx`, `src/features/pipeline/hooks/{useLeads,useLeadActions}.js`, routes `src/app/(app)/pipeline/{layout,page}.jsx`, `pipeline/board/page.jsx`, `pipeline/table/page.jsx`, `pipeline/[id]/page.jsx`, `@modal/(.)pipeline/[id]/page.jsx`
- Test: `tests/pipeline.test.jsx`

**Interfaces:**
- Produces: `useLeads() -> { leads, byStage }` with stages `Identified, Applied/Contacted, In Conversation, Won, Lost, On Hold`; `useLeadActions() -> { saveLead, moveStage(id, stage), addTouchpoint(id, entry), convertFromTask(taskId) }`. `/pipeline` redirects to the view `$OLD/js/leads.js` shows by default.

- [ ] **Step 1: Write failing tests:** a lead appears in the column of its stage; `moveStage` does optimistic move and rolls back on error; `convertFromTask` sets `source_task_id`; viewer cannot save. **Step 2:** FAIL. **Step 3:** Port `leads.js`. **Step 4:** PASS. **Step 5:** Parity check. **Step 6: Commit** `feat: Pipeline`.

## Task 11: Contacts

**Files:**
- Create: `src/features/contacts/*` (list, filters, pagination, bulk ops, form, dedup dialog, viewer, NL search, enrich, follow-up), `src/features/contacts/hooks/{useContacts,useContactFilters,useBulkSelection,useContactAi}.js`, routes `contacts/page.jsx`, `contacts/[id]/page.jsx`, `@modal/(.)contacts/[id]/page.jsx`
- Test: `tests/contacts.test.jsx`

**Interfaces:**
- Produces: `useContacts() -> { contacts, page, pageSize, total }`; `useContactFilters()` stores filters/sort/page in search params (`q`, `cat`, `prio`, `at`, `sort`, `dir`, `page`); `useContactAi() -> { nlSearch(query), enrich(id), suggestFollowup(id) }` calling `callEdgeFunction('nl-search' | 'enrich-contact' | 'suggest-followup', ...)`.

- [ ] **Step 1: Write failing tests:** pagination slices `pageSize` rows; filters round-trip through search params; bulk select-all selects only visible rows; duplicate create opens the dedup dialog holding `pendingContactData`; dates: birthday `DD/MM/YYYY` in, empty date becomes `null` in `contactToRow`. **Step 2:** FAIL. **Step 3:** Port `contacts.js`, `bulk-ops.js`, `saved-filters.js`, `tags.js`; Excel export lazy-loads SheetJS (keep the same CDN build `https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.mini.min.js` the old app uses, loaded on demand). **Step 4:** PASS. **Step 5:** Parity check. **Step 6: Commit** `feat: Contacts`.

## Task 12: Events

**Files:** `src/features/events/*`, `src/features/events/hooks/{useEvents,useGuests}.js`, routes `events/page.jsx`, `events/[id]/page.jsx`, `@modal/(.)events/[id]/page.jsx`; Test: `tests/events.test.jsx`.

**Interfaces:** `useEvents() -> { events, guestsByEvent }`; `useGuests(eventId) -> { guests, addGuest, setRsvp, sendInvites(), syncRsvps(emailText) }` calling edge functions `send-invites` and `sync-rsvps` (body `{ eventId, emailText }` for the latter).

- [ ] **Step 1: Write failing tests:** RSVP change is optimistic with rollback; `syncRsvps` posts `{ eventId, emailText }`. **Step 2:** FAIL. **Step 3:** Port `events.js`. **Step 4:** PASS. **Step 5:** Parity check. **Step 6: Commit** `feat: Events`.

## Task 13: Escalations and Alerts

**Files:** `src/features/escalations/*`, `src/features/notifications/*`, `src/hooks/useAlerts.js`, `escalations/page.jsx`; Test: `tests/escalations.test.jsx`, `tests/alerts.test.mjs`.

**Interfaces:** `useAlerts(me) -> Alert[]` derived from the store and **assigned-to-me only** via `isMine` by `person_code` (never team-wide, no fuzzy name matching); `useEscalations() -> { escalations, escalate(taskId, note), resolve(id) }`.

- [ ] **Step 1: Write failing tests:** an alert for a task owned by someone else is not produced; matching is by `person_code` only (a task whose owner *name* equals mine but code differs yields no alert). **Step 2:** FAIL. **Step 3:** Port `escalations.js`, `notifications.js`. **Step 4:** PASS. **Step 5:** Parity check. **Step 6: Commit** `feat: Escalations and Alerts`.

## Task 14: Analytics

**Files:** `src/features/analytics/*`, `src/lib/analytics.js` (pure `computeAnalytics`), routes `analytics/layout.jsx`, `analytics/page.jsx` (redirects to `overview`), `analytics/{overview,people,areas,pipeline}/page.jsx`; Test: `tests/analytics.test.mjs`, `tests/analytics-routes.test.jsx`.

**Interfaces:** `computeAnalytics(state) -> { ... }` same output shape as `$OLD/js/analytics.js`; tabs are links with `aria-current` on the active segment.

- [ ] **Step 1: Write failing tests:** `computeAnalytics` on a fixture state equals the output of the old function on the same fixture (generate the expected object by running the old function once, commit it as `tests/fixtures/analytics.expected.json`); `/analytics` goes to `/analytics/overview`; the four tab names match `['Overview','People','Companies & functions','Pipeline']`. **Step 2:** FAIL. **Step 3:** Port. **Step 4:** PASS. **Step 5:** Parity check. **Step 6: Commit** `feat: Analytics`.

## Task 15: Expenses, Team, HR automation

**Files:** `src/features/expenses/*`, `src/features/team/*`, `src/features/hr/HrFrame.jsx`, routes `expenses/page.jsx`, `team/page.jsx`, `hr-automation/page.jsx`; Test: `tests/hr-frame.test.jsx`, `tests/expenses.test.jsx`, `tests/team.test.jsx`.

**Interfaces:** `<HrFrame/>` renders the iframe with `src = process.env.NEXT_PUBLIC_HR_AUTOMATION_URL` and posts `{ type: 'rie-theme', theme }` to `new URL(src).origin` on load and on theme change; `useExpenses()`, `useTeam()` as the old `loadExpenses`/`loadTeam` (read each old file fully; these screens are undocumented).

- [ ] **Step 1: Write failing tests:** `HrFrame` posts the theme message with the iframe's origin on load and again after the theme toggles; expenses/team render their empty states with empty data. **Step 2:** FAIL. **Step 3:** Port `expenses.js`, `team.js`. **Step 4:** PASS. **Step 5:** Parity check. **Step 6: Commit** `feat: Expenses, Team, HR automation`.

## Task 16: Profile, Access admin, Help and tour

**Files:** `src/features/profile/*` (preferences, avatar, device-pair share), `src/features/access/*` (admin page: add/remove people, role, scope, companies, extras), `src/features/help/*` (tool registry, tour), routes `profile/page.jsx`, `help/page.jsx`; Test: `tests/access-admin.test.jsx`, `tests/help.test.jsx`.

**Interfaces:** `useAccessAdmin() -> { people, add(email), setRole, setScope, toggleExtra, setPerson, toggleCompany, toggleActive }` (each calling the same RPC/REST as `$OLD/js/access.js`); Help actions that were `later(() => window.x())` become route navigations plus search params (`/work/board?bulk=1`, `/today/triage`, `/profile?pair=1`).

- [ ] **Step 1: Write failing tests:** the access admin page is unreachable (redirects to `/today`) for non-admins; every Help action navigates to an existing route from `docs/route-inventory.md`; the tour can be started, advanced, and closed. **Step 2:** FAIL. **Step 3:** Port `access.js` (page part), `profile.js`, `help.js`. **Step 4:** PASS. **Step 5:** Parity check. **Step 6: Commit** `feat: Profile, Access and Help`.

## Task 17: Parity sweep and conventions audit

**Files:**
- Create: `tools/audit-conventions.mjs`, `docs/parity.md`, `parity/old/`, `parity/new/` (screenshots, git-ignored except `docs/parity.md`)
- Test: `tests/conventions.test.mjs`

**Parity procedure (used by every "Parity check" step):** run `$OLD` with `python -m http.server 8080`, sign in with a **viewer-role** account, capture screenshots with the browser tool for each route in `docs/route-inventory.md` in dark and light at 1440px and 390px widths into `parity/old/<route>-<theme>-<width>.png`; stop it; run `npm run dev` (also 8080), repeat into `parity/new/`; compare pairs side by side; record each screen as identical / accepted difference (owner sign-off in writing) / defect in `docs/parity.md`. Never use a writer account for this.

- [ ] **Step 1: Write failing test** `tests/conventions.test.mjs`: scans `src/` and fails on `window.[a-zA-Z]+ *= *`, `onclick=`, `innerHTML`, `dangerouslySetInnerHTML` (except `src/app/layout.jsx` for `EARLY_SCRIPT`), any `.ts`/`.tsx` file, and any of the people/company/function names found in `$OLD`'s `people` and `task_functions` seed data.
- [ ] **Step 2:** Run -> FAIL until all earlier tasks comply; fix findings. **Step 3:** `npm test` fully green; `npm run build` succeeds. **Step 4:** Complete `docs/parity.md` for every route; list defects and fix them. **Step 5:** Verify `$OLD` is unchanged: `git -C ..\rie-dashboard2 status --short` prints nothing new. **Step 6: Commit** `chore: parity sweep and conventions audit`.

---

## Not in this plan (spec C12)

PWA/service worker/manifest wiring, web push, the iOS `window.RIE` bridge (C16), and deployment/hosting (the `[id]` routes need a host that runs Next.js, see spec section 10). These get their own plan once the hosting decision is made.
