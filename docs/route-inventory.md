# Route inventory

Canonical list of routes and sub-views for Tasks 6-16. Built from the old app (`..\rie-dashboard2`,
read-only) by reading `index.html` (`tab-*` panels, sidebar, modals), `js/shell.js` (`NAV_FOR`, `TITLES`),
`js/platform.js` (`TABS`, `TAB_ALIASES`), `js/analytics.js` (`TABS`), `js/tasks.js` (`PANEL_VIEWS`,
surfaces), `js/leads.js`, `js/contacts.js`, `js/events.js`, `js/matrix.js`, `js/profile.js`,
`js/escalations.js`, `js/team.js`, `js/decide.js`, `js/entities.js`, `js/taskview.js`, `js/help.js`,
`js/today.js`, `js/triage.js`, `js/classify.js`.

Rules (spec C7): sidebar destination = route; sub-view/tab = nested segment; record viewer = `[id]`
intercepting route; filters/sort = search params; forms, confirmations, transient overlays = component
state. Anything marked **to confirm** was not determinable from the old code or is a judgement the owner
has not made; the routes marked **(proposed)** are not in spec section 6 and follow from rule C7(b)/(c).

Kinds: `page` (sidebar destination) | `sub-view` (nested segment) | `record viewer` (`[id]` intercepting
route) | `overlay-state` (component state, no route) | `overlay-route` (spec section 6 gives it a route).

## 1. Pages (sidebar destinations)

Sidebar order and sections are from `index.html` (`aside#side`). Page titles are `TITLES` in `shell.js`.
`NAV_FOR` decides which item is lit.

| Route path | Old identifier | Kind | Sidebar section / title / notes |
|---|---|---|---|
| `/` | none (old app is one page, `?tab=`) | page (redirector) | Handles `#access_token` / `#pair` (C13), then redirects to the landing route. Old default panel is `tab-home` (Today). |
| `/login` | `mo-user` modal ("Sign in to BASE") and `mo-pair` ("Sign in another device") | page | Only for signed-out users. In the old app sign-in is a modal over the shell, not a panel. |
| `/today` | `tab-home` / `home` | page | Operate. Title "Today". |
| `/work` | `tab-tasks` / `tasks` | page (redirects to `/work/matrix`) | Operate. Title "Work". Also keeps Work lit while on Initiatives (`NAV_FOR.initiatives = 'tasks'`) and Decide (see section 3 note). |
| `/pipeline` | `tab-leads` / `leads` | page (redirects to `/pipeline/board`) | Operate. Title "Pipeline". |
| `/escalations` | `tab-escalations` / `escalations` | page | Operate. Title "Escalations". Sidebar item carries a count badge (`data-badge="escalations"`). |
| `/analytics` | `tab-analytics` / `analytics` | page (redirects to `/analytics/overview`) | Insight. Title "Analytics". |
| `/expenses` | `tab-expenses` / `expenses` | page | Finance. Title "Expenses". |
| `/hr-automation` | `tab-hr-automation` / `hr-automation` | page | Automation. Title "HR automation". Iframe of a separate app (C14), URL from `NEXT_PUBLIC_HR_AUTOMATION_URL`. |
| `/team` | `tab-team` / `team` | page | People. Title "Team". |
| `/contacts` | `tab-contacts` / `contacts` | page | People. Title "Contacts". Also reached from search (`openDirectory()` in `app.js`). |
| `/events` | `tab-events` / `events` | page | People. Title "Events". |
| `/help` | `tab-help` / `help` | page | Sidebar footer. Title "Help & tools". |
| `/profile` | `tab-profile` / `profile` | page | Sidebar footer (the user button) and account menu. Title "Profile & settings". |

Page-level details from the code:

- Old default panel: `home` (Today). `switchTab()` ignores an unknown name (no matching `tab-<name>` panel).
- Panels that exist in `index.html` but have no sidebar item of their own: `tab-initiatives` and
  `tab-decide` (both are Work surfaces, see section 3).
- Admin-only sidebar entries (shown only with `html.is-admin`): section "Admin" with "Manage access"
  (opens `mo-access`, an overlay, see section 6).

## 2. Legacy URL redirects (C8)

`platform.js`: `TABS = ['home','contacts','tasks','leads','events','initiatives','analytics','escalations','profile','help','expenses','team']`;
`TAB_ALIASES = { today: 'home', work: 'tasks', pipeline: 'leads' }`. An unknown `?tab=` makes
`applyDeepLink` return false (nothing happens in the old app). New behaviour per plan Review Focus 4:
unknown goes to `/today`.

| Old `?tab=` value | New route | Notes |
|---|---|---|
| `home`, `today` | `/today` | |
| `tasks`, `work` | `/work` (-> `/work/matrix`) | Old app opens the last-used surface (`rie_task_surface`, default `matrix`). Whether the redirect should honour a stored surface is **to confirm**; `rie_task_surface` is replaced by the route (C15). |
| `initiatives` | `/work/initiatives` | |
| `leads`, `pipeline` | `/pipeline` (-> `/pipeline/board`) | |
| `contacts` | `/contacts` | |
| `events` | `/events` | |
| `analytics` | `/analytics` (-> `/analytics/overview`) | Old app restores the last tab from `rie_an_tab`. |
| `escalations` | `/escalations` | |
| `profile` | `/profile` | |
| `help` | `/help` | |
| `expenses` | `/expenses` | |
| `team` | `/team` | |
| `hr-automation` | `/hr-automation` | NOT in the old `TABS` (the old deep link ignores it), although `switchTab('hr-automation')` works and the sidebar uses it. Accepting it is an addition; **to confirm**. |
| `decide` | `/work/decide` | NOT in the old `TABS` either (a panel `tab-decide` exists). Same: **to confirm**. |
| anything else | `/today` | Plan Review Focus 4. |

Callers of `?tab=`: `manifest.webmanifest` shortcuts (`?tab=home`, `?tab=tasks`, `?tab=leads`), `sw.js`
notification click (`/?tab=<tab>`), `window.RIE.openTab(tab)` (`app.js`, used by the iOS shell and
`rie://open?tab=...`).

Hash flows: `#mx?...` (matrix filter and drill state, written by `matrix.js` `writeHash`, read by
`readHash`) is converted once to search params, see section 3. `#access_token=...` (`auth.js`) and
`#pair=...` (`devicepair.js`) stay hash flows handled on `/` (C13).

## 3. Work (`/work`, old `tab-tasks`, `tab-initiatives`, `tab-decide`)

Five surfaces, switched by `setTaskSurface(v)` and stored in `state.taskView` / `localStorage.rie_task_surface`.
Buttons in `index.html` (`#tvw-*`): Matrix, Board, Hierarchy, Initiatives, Decide.
Old surface ids: `matrix`, `flat` (labelled Board), `hierarchy`, `initiatives`, `decide`. `PANEL_VIEWS`
(`tasks.js`) = `{ initiatives: 'tab-initiatives', decide: 'tab-decide' }`: these two render their own panel.

| Route path | Old identifier | Kind | Notes |
|---|---|---|---|
| `/work/matrix` | surface `matrix`, `#mx-root`, `matrix.js` | sub-view | Default surface (`state.taskView` default `'matrix'`). Company x function grid. |
| `/work/board` | surface `flat`, `#kb-board`, button "Board" | sub-view | Status kanban. Legacy filter row. Old id is `flat`; the route name is `board` (spec section 6). |
| `/work/hierarchy` | surface `hierarchy`, button "Hierarchy" | sub-view | `toggleTaskView()` also flips `flat` <-> `hierarchy`. |
| `/work/initiatives` | surface `initiatives`, `tab-initiatives`, `renderInitiativesTab` | sub-view | Also reached via `?tab=initiatives` and Today "Review all" decisions (`todayGoto('decisions')`). Has a collapsible "closed" group (`<details class="ih-closed">`): overlay-state, not a route. |
| `/work/decide` | surface `decide`, `tab-decide`, `decide.js` | sub-view | The decision queue. |
| `/work/decide/business`, `/work/decide/system` **(proposed)** | `decide.js` `kind` (`'business'` \| `'system'`), `decideSetKind(k)` | sub-view | In-page segmented toggle in the old app, so C7(b) makes it segments. Whether `/work/decide` alone shows `business` (the default) is **to confirm**. The spec lists only `decide/page.jsx`. |
| `/work/tasks/[id]` | modal `mo-tv` (`#tv-box`), `openTaskView(id)` in `taskview.js` | record viewer | Intercepting route in `@modal`. Id is the task's string id (`String(t.id)` comparison). `openTaskView` falls back to the edit form when the id is not a loaded task (for example a workstream); how a direct URL to such an id behaves is **to confirm**. |
| `/work/initiatives/[id]` **(proposed)** | modal `mo-entity-det`, `openInitiativeDrill(entityId)` in `entities.js` | record viewer | Initiative/workstream drill-down (children, audit events, lineage). Not in spec section 6 (the spec names `mo-entity-det` among the viewers but lists no route for it). Also opened from the cleanup queue ("View A" / "View B"). Route name **to confirm**. |

Work-level controls that stay as search params / state, not routes:

- Scope Mine / Team / Everyone (`SCOPES` in `scope.js`, stored in `rie_work_scope`): spec section 6 puts the scope control in `work/layout.jsx`. Whether scope is a search param (`?scope=`) or only stored state is **to confirm**. "Mine" is disabled when no owner code resolves.
- Matrix filters (`mx` in `matrix.js`): statuses (`s`, `|`-separated), owner (`o`), priority (`p`), search (`q`), overdue only (`od=1`), needs review (`rv=1`). Legacy `#mx?` keys are exactly these short names.
- Board/Hierarchy legacy filters: project (`tf-proj`), search (`tf-task`), category (`tf-cat`), assigned-to (multi), priority (multi), created (today, week, month, quarter, custom range), due (all, overdue, today, 3 days), tags.
- Board "closed" rail open/closed (`rie_board_closed`): overlay-state.
- Matrix drill slide-over (`mxDrill(company, func, kind)`, `mx.drill`): see next.

Matrix drill panel (`matrix.js`, "DRILL PANEL"): the old code says explicitly it is a right slide-over, "NOT a
route change", so the comparison context between cells survives. It has sub-views and URL state.

| Route path | Old identifier | Kind | Notes |
|---|---|---|---|
| `/work/matrix` + search params `c`, `f`, `k`, `t`, `pv` **(proposed)** | `mx.drill = { company, func, kind }`; `kind` is `'cell'` \| `'untagged'` \| `'review'`; hash keys `c`, `f`, `k`, `t`, `pv` | overlay-state | The drill is kept as a slide-over driven by search params, not a nested route, because its own design (spec 7.7) forbids a page swap. This conflicts with a literal reading of C7(b); **to confirm with the owner**. |
| drill tab `board` / `list` / `pivot` (`mx.tab`, hash `t`, default `board`) | `mxSetTab`, buttons "Kanban", "List", "Pivot" | sub-view of the drill | Segments (`/work/matrix/drill/...`) only if the owner chooses routes for the drill; **to confirm**. |
| pivot axis (`mx.pivot`, hash `pv`) | `PIVOT_AXES`: `assignedTo` (Owner), `priority`, `dueBucket` (Due bucket), `func` (Function), `company`, `contactOrg` (Counterparty) | search param | Only when tab is `pivot`. Default `assignedTo`. |

Legacy hash conversion (C8): `#mx?s=..&o=..&p=..&q=..&od=1&rv=1&c=..&f=..&k=..&t=..&pv=..` -> search params
on `/work/matrix`. Unknown or stale values are ignored, not errored (`readHash` comment, spec 7.13).

## 4. Today (`/today`, old `tab-home`)

| Route path | Old identifier | Kind | Notes |
|---|---|---|---|
| `/today/triage` | modal `mo-triage`, `openTriage(scope)` / `closeTriage()` in `triage.js` | overlay-route | Spec section 6: intercepted as the Triage overlay. `scope` is `'mine'` (default) or `'all'`: search param (name **to confirm**). Keyboard-driven stepper over overdue tasks. Direct visit with a queue that is empty: behaviour **to confirm**. |
| `/today/classify` | modal `mo-classify`, `openClassify()` in `classify.js` | overlay-route | Spec section 6 lists `classify/page.jsx` (intercepted like triage; the spec only says triage is intercepted). The Today action is "Classify N". |

Today's rows navigate out through `todayGoto(kind, value)`: `decisions` -> `/work/initiatives` (see
**note**: the comment in `today.js` says the decision queue is "rendered by the Initiatives view inside Work",
and the code switches to `initiatives`, not `decide`); `owner` -> Work, scope everyone, surface matrix, matrix
owner filter = that person's display name; `unowned` -> Work, scope team, matrix, owner filter cleared;
default -> Work. In the new app these become links with search params.

## 5. Pipeline (`/pipeline`, old `tab-leads`)

| Route path | Old identifier | Kind | Notes |
|---|---|---|---|
| `/pipeline/board` | `state.leadView = 'kanban'` (default), `#lead-board`, toggle button "Table"/"Kanban" | sub-view | `toggleLeadView()` flips `kanban` <-> `table`. |
| `/pipeline/table` | `state.leadView = 'table'`, `renderLeadTable` | sub-view | |
| `/pipeline/leads/[id]` | modal `mo-ldet`, `openLeadDetail(id)` in `leads.js` | record viewer | Intercepting route. Lead ids are numeric in the old markup (`openLeadDetail(${l.id})`); the route param is a string, so coerce. Contains a touchpoint timeline (`loadLeadTimeline`), links to the contact and to linked tasks. |

Search params: search (`lf-search`), type (`lf-type`: Investor, Grant, Tender, Govt/Official Pitch,
Sales/BD, Award/Program, Other), owner (`lf-at`, filled from `public.people`), show closed
(`state.leadShowClosed`, default false, button "Closed (n)" / "Hide closed": Won/Lost columns; it is a
filter, so a search param, not a route). Note: the lead viewer lives under its own segment,
`/pipeline/leads/[id]`, not at `/pipeline/[id]`, so that its interception rewrite cannot shadow the static
siblings `board` and `table` (ruling 12.10).

Forms (component state): `mo-lf` (Add/Edit lead), `openAddTaskForLead` (task form prefilled from a lead).

## 6. Contacts, Events (`/contacts`, `/events`)

| Route path | Old identifier | Kind | Notes |
|---|---|---|---|
| `/contacts` | `tab-contacts`; default `state.contactView = 'table'` | page | Default view is the table (`#ctbl-wrap`). |
| `/contacts/cards`, `/contacts/table` **(proposed)** | `setContactView('card' \| 'table')`, buttons `#vt-card`, `#vt-table` (`.view-toggle`) | sub-view | In-page toggle in the old app, so C7(b) makes it segments. Spec section 6 lists only `contacts/page.jsx` + `[id]/page.jsx`. Segment names and whether `/contacts` redirects to `table` are **to confirm**. |
| `/contacts/people/[id]` | modal `mo-det`, `openContact(id)` in `contacts.js` | record viewer | Intercepting route. Contact ids are numeric in the old markup. Contains history (`getContactHistory`) and AI actions. |
| `/events` | `tab-events`, `#ev-grid` | page | No view toggle exists in `events.js` (searched for view/toggle; none found). |
| `/events/[id]` | modal `mo-edet`, `openEventDetail(id)` in `events.js` | record viewer | Intercepting route. Event ids are numeric. Contains guests, RSVP sync and invite flows (edge functions). |

Search params, Contacts: search (`csearch`, `c-search`), project (`f-proj`), ABC priority (`togF('priority', 'A' \| 'B' \| 'C')`),
category (`f-cat`), location (`f-loc`), tag filter (`state.tagFilter`, bar `#tag-filter-bar`), contact
filter (`state.contactFilter`), sort column and direction (`sortContacts(col)`: name, org, category, lastMtg,
nextStep). Infinite scroll window (60 rows) is component state. Mobile filter drawer (`toggleSidebar`,
`#contacts-sb`) is overlay-state. Search params, Events: search (`ev-search`), type (Birthday, Party,
Cricket, Golf, Other), status (Draft, Invites Sent, Completed, Cancelled).

Forms (component state): `mo-cf` (Add/Edit contact), `mo-ef` (Create/Edit event), `mo-guest` (Add Guest),
`mo-dedup` ("Possible duplicate found"), `mo-del` ("Confirm delete").

## 7. Analytics (`/analytics`, old `tab-analytics`)

`analytics.js`: `TABS = [['overview','Overview'],['people','People'],['areas','Companies & functions'],['pipeline','Pipeline']]`,
current tab kept in `localStorage.rie_an_tab` (default `overview`, unknown values fall back to `overview`).

| Route path | Old identifier | Kind | Notes |
|---|---|---|---|
| `/analytics/overview` | tab `overview`, "Overview" | sub-view | Default. |
| `/analytics/people` | tab `people`, "People" | sub-view | |
| `/analytics/areas` | tab `areas`, "Companies & functions" | sub-view | The route name is `areas`, label stays "Companies & functions". |
| `/analytics/pipeline` | tab `pipeline`, "Pipeline" | sub-view | Do not confuse with `/pipeline`. |

Search params (filters, `f` in `analytics.js`): range (`7`, `30` default, `90`, `ALL`), company (`ALL` default),
person (`ALL` default). Every number opens the tasks behind it in a dialog (`openDialog({ wide: true, ... })`,
a generic dialog, not one of the `mo-*` modals): overlay-state. Tab count badges (`shd-count`) are
derived. `mo-analytics` ("Analytics & Performance Reports") exists in `index.html` but nothing opens it
(no `openMo('mo-analytics')` anywhere in `js/` or `index.html`), apparently dead markup; **to confirm**
before dropping.

## 8. Other pages with in-page sub-views

| Route path | Old identifier | Kind | Notes |
|---|---|---|---|
| `/escalations` | `tab-escalations` | page | Four views in `escalations.js` (`view`, `setEscView(v)`): `waiting` ("Waiting on me"), `raised` ("Raised by me"), `open` ("All open"), `closed` ("Closed"). Default is dynamic: `waiting` if anything waits on me, else `open`. |
| `/escalations/waiting`, `/escalations/raised`, `/escalations/open`, `/escalations/closed` **(proposed)** | `setEscView` tabs (`role="tablist"`) | sub-view | C7(b). Spec section 6 lists only `escalations/page.jsx`. How `/escalations` picks the default (redirect on first paint) is **to confirm**. |
| `/team/cards`, `/team/table` **(proposed)** | `team.js` `view` (`'grid'` default \| `'table'`), `teamView(v)`, `localStorage.rie_team_view`, buttons "Cards" / "Table" | sub-view | C7(b). Old values are `grid` and `table`; segment names **to confirm**. Team member rows open the task view (`/work/tasks/[id]`). |
| `/profile/profile`, `/profile/notifications`, `/profile/appearance`, `/profile/security` **(proposed)** | `profile.js` `SECTIONS`, `setProfileSection(s)`, `localStorage.rie_profile_tab` (default `profile`) | sub-view | C7(b). Sections: Profile, Notifications, Appearance, Security. The account menu has a direct "Notification settings" item (`setProfileSection('notifications'); switchTab('profile')`). Segment naming (`/profile/profile` is awkward) **to confirm**. |
| `/expenses` | `tab-expenses`, `expenses.js` | page | No tabs found. Filters in `f = { card, category, person, status }` plus a month selector (`expMonth`) and card picker (`pickCard`): search params. Forms (`openExpenseForm`, cards) are component state. |
| `/help` | `tab-help`, `help.js` | page | One page: tool guide (grouped `<details>` cards, search `help-q`) + keyboard shortcuts. No tabs. The tour (`startTour`) is an overlay (section 9). |
| `/hr-automation` | `tab-hr-automation` | page | Iframe, `postMessage({ type: 'rie-theme', theme })` on theme change and on iframe load (C14). |

## 9. Overlays, record viewers not in the spec, and transient state (no route)

Always-mounted `mo-*` modals in `index.html` (about 13 of them are always in the DOM; spec section 10). The five
named in the plan are routes in sections 3-6. The rest:

| Identifier | Opened by | Kind | Notes |
|---|---|---|---|
| `mo-tv` | `openTaskView(id)` | record viewer | Route `/work/tasks/[id]` (section 3). |
| `mo-det` | `openContact(id)` | record viewer | Route `/contacts/people/[id]`. |
| `mo-ldet` | `openLeadDetail(id)` | record viewer | Route `/pipeline/leads/[id]`. |
| `mo-edet` | `openEventDetail(id)` | record viewer | Route `/events/[id]`. |
| `mo-entity-det` | `openInitiativeDrill(entityId)` | record viewer | Route `/work/initiatives/[id]` (proposed, section 3). |
| `mo-triage`, `mo-classify` | `openTriage()`, `openClassify()` | overlay-route | `/today/triage`, `/today/classify` (section 4). |
| `mo-tf` | `openAddTask()`, `openTaskEdit(id)` | overlay-state | Task form. After saving from the task view the old code reopens the viewer (`state.viewAfterSave`). |
| `mo-cf`, `mo-lf`, `mo-ef`, `mo-guest` | `openAddContact`/`openContactEdit`, `openAddLead`/`openLeadEdit`, `openAddEvent`/`openEventEdit`, `openAddGuest` | overlay-state | Forms stay as component state (C7). The top-bar "New" menu offers Task, Contact, Lead, Event. |
| `mo-del`, `mo-dedup` | delete confirmation, duplicate warning | overlay-state | |
| `mo-user` | sign-in modal | replaced by `/login` | |
| `mo-pair` ("Sign in another device") | account/profile/help | overlay-state | Shows a QR to sign another device in. |
| `mo-access` ("Access") | sidebar "Manage access" (admin only), `openAccess()` | overlay-state | Admin only. Not in spec section 6; whether it deserves a route is **to confirm**. |
| `mo-workload` ("Team Capacity & Workload Balance") | sidebar "Team workload", `renderWorkloadPanel()` | overlay-state | Sidebar item with no panel of its own. |
| `mo-activity` ("Real-time Activity Timeline") | sidebar "Activity", `renderActivityFeedPanel()` | overlay-state | Same. |
| `mo-smart-search` ("Smart Search & Filter Presets") | top-bar search pill, Ctrl+K | overlay-state | Saved filters (`saved-filters.js`). |
| `mo-escalate`, `mo-esc-action` | `openEscalateModal()`, escalation row actions | overlay-state | Escalate form; Resolve/withdraw action dialog. |
| `mo-dyn` | `openDialog()` generic dialog (`ui.js`) | overlay-state | Used by Analytics drilldowns and others. |
| `mo-analytics` | nothing found | unused | See section 7. |
| Alerts panel (`#alerts-panel`, `#alerts-scrim`) | bell button, `openAlertsPanel()` | overlay-state | Drawer; has a segmented filter (`#alerts-seg`) and "Mark all read". The segments are in-panel state; whether they merit routes is **to confirm** (not examined in depth). |
| Tour (`#tour-root`) | `startTour(true)`, first-run (`TOUR_SEEN_KEY`) | overlay-state | Highlights real controls; Esc closes. |
| Top-bar menus: theme menu, New menu, account menu (`#theme-menu`, `#new-menu`, `#user-menu`) | buttons | overlay-state | |
| Sidebar collapsed/open | `rie_side_collapsed`, `side-collapsed`, `side-open` | overlay-state | `[` key toggles; Esc closes the drawer. |
| Splash (`#splash`) | boot | overlay-state | |

Themes: the old app has FOUR (`dark`, `light`, `spc`, `spc-modern`; `index.html` early script and `setTheme`),
stored in `localStorage['rie-theme']`; spec text mentions only dark and light (parity C11). The new app must
carry all four. Flagged for the owner.

## 10. Record id types (for route parameters)

| Record | Old id as used in markup | Route param handling |
|---|---|---|
| Task, Initiative (entity) | quoted string (`openTaskView('${t.id}')`, `String(t.id) === String(id)`) | Compare as strings. |
| Contact | unquoted number (`openContact(${c.id})`) | Param is a string; convert before comparing. |
| Lead | unquoted number (`openLeadDetail(${l.id})`) | Same. |
| Event | unquoted number (`openEventDetail(${ev.id})`) | Same. |

Whether the task/entity ids are UUIDs or integers was not verified here (they are strings in the markup);
**to confirm** in the data-port task.

## 11. Route list (flat, the minimum for Tasks 6-16)

Spec section 6 routes, then proposed additions.

```
/                           root (hash handling, redirect)
/login
/today
/today/triage
/today/classify
/work                       -> /work/matrix
/work/matrix
/work/board
/work/hierarchy
/work/initiatives
/work/decide
/work/tasks/[id]            intercepted (mo-tv)
/pipeline                   -> /pipeline/board
/pipeline/board
/pipeline/table
/pipeline/leads/[id]        intercepted (mo-ldet)
/contacts
/contacts/people/[id]       intercepted (mo-det)
/events
/events/[id]                intercepted (mo-edet)
/escalations
/analytics                  -> /analytics/overview
/analytics/overview
/analytics/people
/analytics/areas
/analytics/pipeline
/expenses
/team
/hr-automation
/profile
/help

Proposed additions (C7 applied to toggles/tabs/viewers the spec section 6 does not list; each to confirm):
/work/initiatives/[id]      intercepted (mo-entity-det)
/work/decide/business       /work/decide/system
/contacts/cards             /contacts/table
/escalations/waiting        /escalations/raised   /escalations/open   /escalations/closed
/team/cards                 /team/table
/profile/profile            /profile/notifications   /profile/appearance   /profile/security
```

## 12. Rulings (controller, 2026-11-04; binding for Tasks 1-17)

These settle every item marked "to confirm" above. Spec C7 is the authority; each is cheap to reverse.

1. **Proposed segments are accepted** (C7(b)): `/work/decide/{business,system}`, `/contacts/{table,cards}`,
   `/escalations/{waiting,raised,open,closed}`, `/team/{cards,table}`, `/profile/{general,notifications,appearance,security}`
   (`general` replaces the awkward `/profile/profile`; the tab label stays "Profile"), and the record viewer
   `/work/initiatives/[id]` (intercepted, `mo-entity-det`). The index route of each group redirects to the old
   default: decide -> `business`, contacts -> `table`, team -> `cards`, profile -> `general`, escalations ->
   `waiting` if anything waits on the user else `open` (client-side redirect after data loads).
2. **Matrix drill stays an overlay** driven by search params `c f k t pv` (old design: "NOT a route change").
   Its board/list/pivot tabs are search params, not segments.
3. **Four themes** are carried: `dark`, `light`, `spc`, `spc-modern`, stored in `localStorage['rie-theme']`.
4. **Legacy `?tab=`** additionally accepts `hr-automation` -> `/hr-automation` and `decide` -> `/work/decide`.
   `tasks|work` -> `/work/matrix` (the stored `rie_task_surface` is replaced by the route and ignored).
   `analytics` -> `/analytics/overview`.
5. **Scope** is the search param `?scope=mine|team|everyone` on `/work/*`, defaulting to the stored `rie_work_scope`
   (then `resolveScope`). Triage scope is `?scope=mine|all` (default `mine`).
6. **Record ids** are route params compared as strings; coerce to number for contacts, leads and events.
7. **Direct visit to a viewer route** (e.g. `/work/tasks/<unknown id>`) renders a not-found message inside the
   page frame, never a crash; an empty Triage queue shows its empty state.
8. **`mo-analytics`** is dead markup and is not ported. `mo-access`, `mo-workload`, `mo-activity`,
   `mo-smart-search`, alerts panel and tour stay overlay-state.
9. Line endings: this machine converts LF to CRLF; byte-exact CSS copies must be compared with line endings
   normalised to LF.
10. **Viewers for pipeline and contacts live under `/pipeline/leads/[id]` and `/contacts/people/[id]`** to avoid
    interception rewrites shadowing static siblings (Next registers each interception as a rewrite with source
    `/pipeline/:id`, which would also match `/pipeline/board`). Events (`/events/[id]`, no static siblings),
    `/work/tasks/[id]` and `/work/initiatives/[id]` keep their paths. Each has its intercepting twin
    `@modal/(.)pipeline/leads/[id]` and `@modal/(.)contacts/people/[id]`.
