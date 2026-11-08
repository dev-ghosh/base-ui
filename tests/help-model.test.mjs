// Help: the registry, where every action goes (checked against docs/route-inventory.md), and the tour's state.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

let bad = 0;
const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL') + '  ' + m); if (!c) bad++; };

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
};

const { TOOLS, SHORTCUTS, OVERLAY_IDS, helpTarget, visibleTools } = await import('../src/features/help/registry.js');
const tour = await import('../src/features/help/tour.js');
const { NAV_KEYS } = await import('../src/lib/nav.js');

// ---- the route inventory (section 11 list + the section 12 rulings), as tests/routes.test.mjs reads it ----
const root = fileURLToPath(new URL('../', import.meta.url));
const inv = readFileSync(join(root, 'docs', 'route-inventory.md'), 'utf8').replace(/\r\n/g, '\n');
const block = inv.split('## 11. Route list')[1].split('## 12.')[0].match(/```\n([\s\S]*?)```/)[1];
const routes = new Set();
for (const line of block.split('\n')) {
  if (!line.trim() || /^Proposed additions/.test(line)) continue;
  for (const tok of line.trim().split(/\s+/)) {
    if (tok.startsWith('/')) routes.add(tok);
    if (tok === '->') break;
  }
}
routes.delete('/profile/profile');
routes.add('/profile/general');
check(routes.size >= 40 && routes.has('/work/board') && routes.has('/today/triage'), `inventory has ${routes.size} routes`);

// ---- registry shape ----
check(TOOLS.length === 25, `25 tools (${TOOLS.length})`);
check(new Set(TOOLS.map((t) => t.id)).size === TOOLS.length, 'tool ids are unique');
check([...new Set(TOOLS.map((t) => t.group))].join('|') === 'Daily work|People & pipeline|Staying on top|Money & people|You & the system', 'five groups in the old order');
check(TOOLS.every((t) => t.name && t.where && t.what && t.steps.length && t.icon && t.open), 'every tool has name, where, what, steps, icon and an action');
check(TOOLS.filter((t) => t.adminOnly).map((t) => t.id).join() === 'access', 'only Manage access is admin-only');
check(SHORTCUTS.length === 7 && SHORTCUTS[0][0] === 'Ctrl / ⌘ + K', 'seven shortcuts, Ctrl/⌘ + K first');

// ---- every action goes somewhere that exists ----
let allOk = true;
for (const t of TOOLS) {
  const target = helpTarget(t.open);
  let ok = false;
  if (target?.href) {
    const [path, qs] = target.href.split('?');
    ok = routes.has(path) && (!qs || /^[a-z]+=[a-z0-9]+$/.test(qs));
  } else if (target?.overlay) ok = OVERLAY_IDS.includes(target.overlay);
  else if (target?.menu) ok = target.menu === 'new' || target.menu === 'user';
  else if (target?.alerts) ok = true;
  if (!ok) { allOk = false; console.log('     bad action', t.id, t.open, JSON.stringify(target)); }
}
check(allOk, 'every Help action is a route of the inventory (with a plain search param) or an existing overlay or menu');

// the actions that used to be `later(() => window.x())`
check(helpTarget('triage').href === '/today/triage', 'triage -> /today/triage');
check(helpTarget('bulk').href === '/work/board?bulk=1', 'bulk -> /work/board?bulk=1');
check(helpTarget('pair').href === '/profile?pair=1', 'pair -> /profile?pair=1');
check(helpTarget('surface:flat').href === '/work/board' && helpTarget('surface:decide').href === '/work/decide', 'Work surfaces -> work routes (flat is the Board)');
check(helpTarget('tab:home').href === '/today' && helpTarget('tab:tasks').href === '/work' && helpTarget('tab:leads').href === '/pipeline', 'old tabs -> pages');
check(helpTarget('tab:escalations').href === '/escalations' && helpTarget('tab:events').href === '/events', 'not-yet-built pages -> their placeholder URL');
check(helpTarget('workload').overlay === 'mo-workload' && helpTarget('activity').overlay === 'mo-activity', 'workload and activity are overlays');
check(helpTarget('search').overlay === 'mo-smart-search' && helpTarget('access').overlay === 'mo-access', 'search and access are overlays');
check(helpTarget('newmenu').menu === 'new' && helpTarget('usermenu').menu === 'user', 'menus');
check(helpTarget('nope') === null && helpTarget('tab:nope') === null && helpTarget('') === null && helpTarget(undefined) === null, 'unknown actions go nowhere');

// ---- search and admin filtering ----
check(visibleTools('', false).length === 24 && visibleTools('', true).length === 25, 'admins see 25 tools, others 24');
check(visibleTools('escalate', false).some((t) => t.id === 'escalations'), 'search "escalate" finds Escalations');
check(visibleTools('EXPORT', false).some((t) => t.id === 'export'), 'search ignores case');
check(visibleTools('manage access', false).length === 0 && visibleTools('manage access', true).length >= 1, 'an admin-only card is not found by a non-admin');
check(visibleTools('zzzzzz', true).length === 0, 'no match -> none');

// ---- the tour ----
check(tour.STEPS.length === 11 && tour.STEPS[0].title === 'Welcome to BASE' && tour.STEPS[10].title === 'Help & tools', 'eleven steps, welcome to help');
const navSel = tour.STEPS.filter((s) => s.target?.startsWith('[data-nav=')).map((s) => s.target.match(/"(.+)"/)[1]);
check(navSel.every((k) => NAV_KEYS.includes(k)), 'every menu step points at a real sidebar item: ' + navSel.join());
check(tour.STEPS.filter((s) => s.nav).every((s) => s.target.startsWith('[data-nav=')), 'steps in the side menu are the ones flagged nav');

check(tour.isTourCompleted() === false, 'tour not completed at first');
tour.startTour();
check(tour.tourStore.getState().open && tour.tourStore.getState().step === 0, 'start opens at step 1');
tour.prevTourStep();
check(tour.tourStore.getState().step === 0, 'Back at the first step stays');
for (let i = 0; i < 10; i++) tour.nextTourStep();
check(tour.tourStore.getState().step === 10 && tour.tourStore.getState().open, 'ten Nexts reach the last step');
tour.prevTourStep();
check(tour.tourStore.getState().step === 9, 'Back goes back');
tour.nextTourStep(); tour.nextTourStep();
check(!tour.tourStore.getState().open && mem.get('rie_tour_v2_seen') === '1', 'Next on the last step (Done) closes and remembers');
tour.startTour();
check(!tour.tourStore.getState().open, 'a finished tour is not started again without force');
tour.startTour(true);
check(tour.tourStore.getState().open, '... but replaying forces it');
tour.closeTour();
check(!tour.tourStore.getState().open && tour.isTourCompleted(), 'close (Skip / Esc) closes and remembers');
tour.nextTourStep();
check(!tour.tourStore.getState().open, 'stepping a closed tour does nothing');

if (bad) { console.error(`${bad} check(s) failed`); process.exit(1); }
console.log('all help checks passed');
