/* scope.js — whose work is on screen.
 *
 * Pure and Node-importable, like queue.js. Every Work surface (Matrix, Board,
 * Hierarchy, Initiatives, Decide) filters through inScope() so they cannot
 * disagree about what "mine" means, and Today keeps using the same isMine().
 *
 * WHY THIS EXISTS
 * ---------------
 * Measured 2026-09-20: 189 open tasks, of which 81 belong to one person, 31
 * to another, 15 to a third. Every Work surface defaulted to all 189 (and the
 * Board to all 619, closed ones included). The sharp feedback was that this
 * "creates panic". The scope is the smallest change that makes each person's
 * first paint their own working set, with the whole team one click away.
 *
 * Identity is a person CODE from rie_allowed_users.person_code. Nothing here
 * knows a name; tests/no-hardcoded-people.test.mjs guards that.
 */

export const SCOPES = ['mine', 'team', 'everyone'];
export const SCOPE_LABEL = { mine: 'Mine', team: 'Team', everyone: 'Everyone' };

/** Owner code of a task in either shape: state.tasks (ownerCode) or a
 *  buildQueue row (owner). A legacy free-text assignee is never a code, so a
 *  legacy-owned task is nobody's until an admin binds it (F2 in the spec). */
function ownerOf(t) {
  if (!t) return null;
  if ('owner' in t && !('ownerCode' in t)) return t.owner || null;
  return t.ownerCode || null;
}
function coOwnersOf(t) {
  return (t?.co_owners ?? t?.coOwnerCodes ?? []) || [];
}

/** Mine = I am the owner, or I am an active co-owner. */
export function isMine(t, me) {
  if (!me || !t) return false;
  return ownerOf(t) === me || coOwnersOf(t).includes(me);
}

/** The one predicate every surface uses. `team` is everyone else, including
 *  unowned work, because unowned is a team fact and not a personal one. */
export function inScope(t, scope, me) {
  if (scope === 'mine') return isMine(t, me);
  if (scope === 'team') return !isMine(t, me);
  return true;
}

/** Which scope to start on. A stored choice wins; otherwise Mine when the
 *  sign-in is bound to a person and Everyone when it is not (F1: a Mine that
 *  can never be non-empty is not a default anyone asked for). A stored Mine
 *  for a sign-in that has since been unbound falls back the same way (F8). */
export function resolveScope(stored, me) {
  if (SCOPES.includes(stored) && !(stored === 'mine' && !me)) return stored;
  return me ? 'mine' : 'everyone';
}

/** Open-task counts per scope, for the pill. `rows` are buildQueue rows. */
export function scopeCounts(rows, me) {
  const mine = rows.filter(t => isMine(t, me)).length;
  return { mine, team: rows.length - mine, everyone: rows.length };
}

/**
 * Ancestors of a set of entity ids through `contains` links: the workstreams
 * and initiatives that hold my tasks. Bounded to `depth` levels and guarded by
 * a visited set so a cycle in entity_links terminates (F6). The SQL side,
 * rie_task_visible(), walks the same three levels.
 */
export function ancestorsOf(ids, links, depth = 3) {
  const parents = new Map();
  for (const l of links || []) {
    if (!l || l.parentId == null || l.childId == null) continue;
    const k = String(l.childId);
    if (!parents.has(k)) parents.set(k, []);
    parents.get(k).push(String(l.parentId));
  }
  const out = new Set();
  let frontier = [...ids].map(String);
  for (let level = 0; level < depth && frontier.length; level++) {
    const next = [];
    for (const id of frontier) {
      for (const p of parents.get(id) || []) {
        if (out.has(p)) continue;
        out.add(p);
        next.push(p);
      }
    }
    frontier = next;
  }
  return out;
}

/**
 * Everything that counts as mine: my open task ids plus every workstream and
 * initiative that contains one. Initiatives and Decide filter on this set.
 */
export function mineSet(tasks, links, me) {
  const ids = (tasks || []).filter(t => isMine(t, me)).map(t => String(t.id));
  const set = new Set(ids);
  for (const a of ancestorsOf(ids, links)) set.add(a);
  return set;
}
