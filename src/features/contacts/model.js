/* model.js — Contacts' pure logic. Port of the list pipeline of rie-dashboard2/js/contacts.js
 * (applyF: filters, sort, the growing render window; findDuplicate; the bulk-select helpers) with
 * the filter row as URL search params (spec C7 rule 4): the old sidebar selects and search box were
 * DOM values, state.contactFilter / sortCol / sortDir / tagFilter module state.
 *
 *   q     search text            proj  project            cat  category        loc  location
 *   prio  A | B | C              at    assigned-to (a deep link; the old UI had no such filter)
 *   tg    tag, repeated          sort  priority | name | org | category | lastMtg | nextStep
 *   dir   asc | desc (with sort) page  how many windows of PAGE_SIZE rows are showing (>= 1)
 *
 * `page` keeps the old behaviour: "Show more" and scrolling GROW the window by PAGE_SIZE rows; they
 * do not replace it. Unknown or stale values are ignored, never an error; a default is never written.
 *
 * No store, no DOM: plain Node can import it.
 */
import { allContactTags } from '../../lib/tags.js';

/** The render budget: how many rows one window adds (the old PAGE). */
export const PAGE_SIZE = 60;
export const PRIORITIES = ['A', 'B', 'C'];
export const SORT_COLUMNS = ['priority', 'name', 'org', 'category', 'lastMtg', 'nextStep'];
export const DEFAULT_SORT = { col: 'priority', dir: 1 };
export const CONTACT_KEYS = ['q', 'proj', 'cat', 'loc', 'prio', 'at', 'tg', 'sort', 'dir', 'page'];

export function defaultContactFilters() {
  return { q: '', project: '', category: '', location: '', priority: '', at: '', tags: [], sort: { ...DEFAULT_SORT }, page: 1 };
}

const toParams = (search) => {
  if (search == null) return new URLSearchParams();
  if (typeof search === 'string') return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return new URLSearchParams(search.toString());
};

export function parseContactParams(search) {
  const p = toParams(search);
  const f = defaultContactFilters();
  f.q = p.get('q') || '';
  f.project = p.get('proj') || '';
  f.category = p.get('cat') || '';
  f.location = p.get('loc') || '';
  const prio = p.get('prio');
  if (PRIORITIES.includes(prio)) f.priority = prio;
  f.at = p.get('at') || '';
  f.tags = [...new Set(p.getAll('tg').filter(Boolean))];
  const col = p.get('sort');
  if (SORT_COLUMNS.includes(col)) f.sort = { col, dir: p.get('dir') === 'desc' ? -1 : 1 };
  const page = Math.floor(Number(p.get('page')));
  f.page = page >= 1 ? page : 1;
  return f;
}

export function serializeContactParams(f) {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.project) p.set('proj', f.project);
  if (f.category) p.set('cat', f.category);
  if (f.location) p.set('loc', f.location);
  if (PRIORITIES.includes(f.priority)) p.set('prio', f.priority);
  if (f.at) p.set('at', f.at);
  for (const t of f.tags || []) if (t) p.append('tg', t);
  const s = f.sort || DEFAULT_SORT;
  if (SORT_COLUMNS.includes(s.col) && !(s.col === DEFAULT_SORT.col && s.dir === DEFAULT_SORT.dir)) {
    p.set('sort', s.col);
    if (s.dir === -1) p.set('dir', 'desc');
  }
  if (f.page > 1) p.set('page', String(f.page));
  return p.toString();
}

/** The next query string: every param that is not Contacts' own is kept, Contacts' are replaced by `f`. */
export function mergeContactParams(currentSearch, f) {
  const next = new URLSearchParams();
  for (const [key, value] of toParams(currentSearch)) if (!CONTACT_KEYS.includes(key)) next.append(key, value);
  for (const [key, value] of new URLSearchParams(serializeContactParams(f))) next.append(key, value);
  return next.toString();
}

/** Only the filters (not sort or window) as a query string, for the Table <-> Cards switch. */
export function viewQuery(f) {
  return serializeContactParams(f);
}

const SEARCH_FIELDS = ['name', 'org', 'designation', 'category', 'email', 'phone', 'location', 'nextStep', 'keyInputs', 'remarks', 'actionItem', 'source'];

/**
 * applyF's filter half: ABC, project, category, location, tags (OR over computed + stored tags), then
 * the search text (any of the SEARCH_FIELDS contains it). `at` is the assigned-to deep link.
 * ctx: { tasks, now } feed the computed tags.
 */
export function filterContacts(list, f, { tasks = [], now = new Date() } = {}) {
  let out = list;
  if (f.priority) out = out.filter((c) => c.priority === f.priority);
  if (f.project) out = out.filter((c) => c.project === f.project);
  if (f.category) out = out.filter((c) => c.category === f.category);
  if (f.location) out = out.filter((c) => c.location === f.location);
  if (f.at) out = out.filter((c) => c.assignedTo === f.at);
  if (f.tags?.length) {
    const want = new Set(f.tags);
    out = out.filter((c) => allContactTags(c, now, tasks).some((t) => want.has(t)));
  }
  const q = (f.q || '').toLowerCase();
  if (q) out = out.filter((c) => SEARCH_FIELDS.some((k) => (c[k] || '').toLowerCase().includes(q)));
  return out;
}

const ABC_RANK = { A: 0, B: 1, C: 2 };

/** applyF's sort half (dir 1 = ascending). Priority ranks A, B, C, then unset; the rest compare as text. */
export function sortContacts(list, { col, dir }) {
  return [...list].sort((a, b) => {
    let av = a[col] || '';
    let bv = b[col] || '';
    if (col === 'priority') {
      av = ABC_RANK[av] ?? 3; bv = ABC_RANK[bv] ?? 3;
      return (av - bv) * dir;
    }
    return av.toString().localeCompare(bv.toString()) * dir;
  });
}

/** Click on a column header (sortContacts): the same column flips, a new one starts ascending. */
export const nextSort = (cur, col) => (cur.col === col ? { col, dir: cur.dir * -1 } : { col, dir: 1 });

/**
 * The growing window: the first `page * pageSize` rows (clamped to the list). `page` is clamped to
 * 1..the number of windows the list needs.
 * @returns {{rows: Array, page: number, pageSize: number, total: number, shown: number, hasMore: boolean}}
 */
export function paginate(list, page, pageSize = PAGE_SIZE) {
  const total = list.length;
  const windows = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(Math.max(Math.floor(Number(page)) || 1, 1), windows);
  const shown = Math.min(p * pageSize, total);
  return { rows: list.slice(0, shown), page: p, pageSize, total, shown, hasMore: shown < total };
}

/** populateFilters: the sidebar selects' options (unique, non-empty, sorted). */
export function filterOptions(contacts) {
  const uniq = (key) => [...new Set(contacts.map((c) => c[key]).filter(Boolean))].sort();
  return { projects: uniq('project'), categories: uniq('category'), locations: uniq('location') };
}

/* ── duplicates ──────────────────────────────────────────────────────────── */

/**
 * findDuplicate: email (any of the comma-separated addresses), then phone (spaces ignored), then
 * name (+ organisation). The reason is data, not HTML: { kind: 'email'|'phone', value } or
 * { kind: 'name', name, org }.
 * @returns {{match: object|null, reason: object|null, ambiguous: object[]|null}}
 */
export function findDuplicate(data, contacts) {
  const email = (data.email || '').trim().toLowerCase();
  const phone = (data.phone || '').replace(/\s/g, '');
  const name = (data.name || '').trim().toLowerCase();
  const org = (data.org || '').trim().toLowerCase();
  const none = { match: null, reason: null, ambiguous: null };

  if (email) {
    const hit = contacts.find((c) => c.email && c.email.toLowerCase().split(',').map((x) => x.trim()).includes(email));
    if (hit) return { match: hit, reason: { kind: 'email', value: hit.email }, ambiguous: null };
  }
  if (phone) {
    const hit = contacts.find((c) => c.phone && c.phone.replace(/\s/g, '') === phone);
    if (hit) return { match: hit, reason: { kind: 'phone', value: hit.phone }, ambiguous: null };
  }
  if (name) {
    const nameHits = contacts.filter((c) => (c.name || '').toLowerCase() === name);
    const byName = (c) => ({ match: c, reason: { kind: 'name', name: c.name, org: c.org }, ambiguous: null });
    if (nameHits.length === 1) {
      const orgMatch = nameHits[0].org && nameHits[0].org.toLowerCase() === org;
      if (orgMatch || !org) return byName(nameHits[0]);
      return { match: null, reason: null, ambiguous: nameHits };
    }
    if (nameHits.length > 1) {
      const orgHits = nameHits.filter((c) => (c.org || '').toLowerCase() === org);
      if (orgHits.length === 1) return byName(orgHits[0]);
      return { match: null, reason: null, ambiguous: nameHits };
    }
  }
  return none;
}

/** The dedup dialog's table: rows with a value on either side; `diff` when the incoming value is non-empty and different. */
export function dedupFields(c, data) {
  return [
    ['Name', c.name, data.name],
    ['Org', c.org, data.org],
    ['Designation', c.designation, data.designation],
    ['Email', c.email, data.email],
    ['Phone', c.phone, data.phone],
    ['Priority', c.priority, data.priority],
    ['Location', c.location, data.location],
    ['Assigned To', c.assignedTo, data.assignedTo],
    ['Project', c.project, data.project],
    ['Next Step', c.nextStep, data.nextStep],
  ]
    .filter(([, ex, inc]) => ex || inc)
    .map(([label, existing, incoming]) => ({ label, existing, incoming, diff: Boolean(existing !== incoming && incoming) }));
}

/** "Update Existing": an empty incoming email / phone / birthday / LinkedIn keeps the matched contact's. */
export function mergePatchRow(row, existing) {
  if (!existing) return row;
  const out = { ...row };
  if (!out.e && existing.email) out.e = existing.email;
  if (!out.p && existing.phone) out.p = existing.phone;
  if (!out.bday && existing.birthday) out.bday = existing.birthday;
  if (!out.li && existing.linkedin) out.li = existing.linkedin;
  return out;
}

/* ── bulk selection ──────────────────────────────────────────────────────── */

/** bulkToggle: a new Set with `id` flipped. */
export function toggleId(set, id) {
  const next = new Set(set);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}

/** bulkToggleAll: over the given (visible) ids only. All selected -> unselect them; otherwise select them all. */
export function toggleAllIds(set, ids) {
  const next = new Set(set);
  const all = ids.every((id) => next.has(id));
  if (all) ids.forEach((id) => next.delete(id));
  else ids.forEach((id) => next.add(id));
  return next;
}

/** The confirm() text of bulkDelete. */
export function bulkDeleteMessage(names, count, linkedCount) {
  return `Delete ${count} contacts (${names.slice(0, 3).join(', ')}${count > 3 ? '…' : ''})${linkedCount ? ` and ${linkedCount} linked tasks` : ''}? Cannot be undone.`;
}

/** Tasks whose contact is one of `ids`. */
export function linkedTasksOf(tasks, ids) {
  const set = new Set(ids);
  return tasks.filter((t) => set.has(t.contactId));
}
