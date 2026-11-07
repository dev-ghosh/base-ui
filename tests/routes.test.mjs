// Every route in docs/route-inventory.md (section 11 + the section 12 rulings) has a
// page, every record viewer has its intercepting @modal twin, and every sidebar link
// points at one of those routes.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NAV_SECTIONS, FOOT_ITEMS, PROFILE_ITEM, ADMIN_ITEM, NAV_KEYS, navKeyForPath, titleForPath } from '../src/lib/nav.js';

let bad = 0;
const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL') + '  ' + m); if (!c) bad++; };

const root = fileURLToPath(new URL('../', import.meta.url));
const appDir = join(root, 'src', 'app', '(app)');

// ── the inventory ─────────────────────────────────────────────────────────────
const inv = readFileSync(join(root, 'docs', 'route-inventory.md'), 'utf8');
const sec11 = inv.split('## 11. Route list')[1].split('## 12.')[0];
const block = sec11.match(/```\n([\s\S]*?)```/)[1];
const routes = new Set();
for (const line of block.split(/\r?\n/)) {
  if (!line.trim() || /^Proposed additions/.test(line)) continue;
  // "/work   -> /work/matrix   comment"  or  "/escalations/waiting   /escalations/raised"
  for (const tok of line.trim().split(/\s{2,}|\s+/)) {
    if (tok.startsWith('/')) routes.add(tok);
    if (tok === '->') break;                 // everything after an arrow is a redirect target / comment
  }
}
// Ruling 12.1: `general` replaces `/profile/profile`.
routes.delete('/profile/profile');
routes.add('/profile/general');

check(routes.size >= 40, `parsed ${routes.size} routes from the inventory`);
for (const r of ['/work/decide/business', '/work/decide/system', '/contacts/table', '/contacts/cards',
  '/escalations/waiting', '/escalations/raised', '/escalations/open', '/escalations/closed',
  '/team/cards', '/team/table', '/profile/general', '/profile/notifications', '/profile/appearance',
  '/profile/security', '/work/initiatives/[id]', '/work/tasks/[id]']) {
  check(routes.has(r), `inventory parse includes ${r}`);
}

const pageFile = (route) => join(appDir, ...route.split('/').filter(Boolean), 'page.jsx');
const modalFile = (route) => {
  const [first, ...rest] = route.split('/').filter(Boolean);
  return join(appDir, '@modal', `(.)${first}`, ...rest, 'page.jsx');
};

for (const r of routes) {
  if (r === '/' || r === '/login') continue;   // outside the (app) group
  check(existsSync(pageFile(r)), `page for ${r}`);
}
check(existsSync(join(root, 'src', 'app', 'page.jsx')), 'page for /');
check(existsSync(join(root, 'src', 'app', 'login', 'page.jsx')), 'page for /login');

for (const r of routes) {
  if (!r.endsWith('/[id]')) continue;
  check(existsSync(modalFile(r)), `intercepting @modal page for ${r}`);
}
// Ruling 12.10: Next registers each interception as a rewrite on `/<parent>/:id` with no static
// exclusion, so an [id] viewer must not share a level with static sibling segments.
for (const r of routes) {
  if (!r.endsWith('/[id]')) continue;
  const parent = join(appDir, ...r.split('/').filter(Boolean).slice(0, -1));
  const siblings = existsSync(parent) ? readdirSync(parent, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== '[id]') : [];
  check(siblings.length === 0, `${r} has no static sibling segments`);
}
check(routes.has('/pipeline/leads/[id]') && routes.has('/contacts/people/[id]'), 'pipeline and contacts viewers live under /pipeline/leads and /contacts/people');
check(!routes.has('/pipeline/[id]') && !routes.has('/contacts/[id]'), 'no /pipeline/[id] or /contacts/[id]');
check(existsSync(join(appDir, '@modal', 'default.jsx')), '@modal/default.jsx');
check(existsSync(join(appDir, 'layout.jsx')), '(app)/layout.jsx');
check(!existsSync(join(appDir, 'page.jsx')), 'no (app)/page.jsx (would collide with the root page)');

// ── the sidebar ───────────────────────────────────────────────────────────────
const items = [...NAV_SECTIONS.flatMap((s) => s.items), ...FOOT_ITEMS, PROFILE_ITEM, ADMIN_ITEM];
for (const it of items) {
  if (!it.href) continue;                      // overlay items (workload, activity, manage access)
  check(routes.has(it.href), `sidebar "${it.label}" -> ${it.href} is an inventory route`);
}
check(items.filter((i) => i.nav).length === 12, 'twelve sidebar destinations carry a data-nav');

// ── active item + titles (NAV_FOR / TITLES in the old shell.js) ───────────────
const navCases = {
  '/today': ['home', 'Today'],
  '/today/triage': ['home', 'Today'],
  '/work/matrix': ['tasks', 'Work'],
  '/work/initiatives': ['tasks', 'Work'],        // initiatives keeps Work lit
  '/work/initiatives/42': ['tasks', 'Work'],
  '/work/decide/system': ['tasks', 'Work'],      // so does decide
  '/work/tasks/abc': ['tasks', 'Work'],
  '/pipeline/board': ['leads', 'Pipeline'],
  '/pipeline/leads/5': ['leads', 'Pipeline'],
  '/contacts/people/7': ['contacts', 'Contacts'],
  '/escalations/open': ['escalations', 'Escalations'],
  '/analytics/people': ['analytics', 'Analytics'],
  '/expenses': ['expenses', 'Expenses'],
  '/hr-automation': ['hr-automation', 'HR automation'],
  '/team/cards': ['team', 'Team'],
  '/contacts/7': ['contacts', 'Contacts'],
  '/events': ['events', 'Events'],
  '/profile/security': ['profile', 'Profile & settings'],
  '/help': ['help', 'Help & tools'],
};
for (const [path, [nav, title]] of Object.entries(navCases)) {
  check(navKeyForPath(path) === nav, `${path} lights "${nav}"`);
  check(titleForPath(path) === title, `${path} is titled "${title}"`);
}
check(navKeyForPath('/nope') === null && titleForPath('/nope') === '', 'an unknown path lights nothing and has no title');
check(NAV_KEYS.length === 12, 'twelve nav keys');

process.exit(bad ? 1 : 0);
