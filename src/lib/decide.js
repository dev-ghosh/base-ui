/* decide.js — the decision queue and the cleanup queue: loading, pure helpers and every write.
 * Port of js/decide.js and resolveCleanup in js/entities.js.
 *
 * Rows are v_decision_queue rows (snake_case: kind, age_days, entity_title, company, func ...),
 * held in the store (`decideRows`) so a segment change keeps them, as the old module-level `rows`
 * did, and a sign-out clears them.
 *
 * Writes follow the old Write flow: the store changes first, then the REST call; on failure the rows
 * are put back and the error goes to the status bar. A view-only user's call throws the "view-only"
 * sentence from rest.js BEFORE any fetch, so the rows come straight back.
 * Plain JS with relative imports so plain Node can import it.
 */
import { store } from '../store/store.js';
import { safeGet, sbUpdate } from './rest.js';
import { setStatus } from './status.js';
import { fmtD } from './format.js';
import { idInScope } from './scope.js';

// This week: the first five. Later: the rest, folded, revealed five at a time.
// Five, because a decision is a paragraph to read, not a card to scan.
export const WEEK = 5;
export const STEP = 5;

export const OUTCOMES = [
  { id: 'approved', label: 'Decided', blurb: 'A call was made. Say what it was.' },
  { id: 'rejected', label: 'Declined', blurb: 'We are not doing this. Say why.' },
];

const key = (id) => String(id);
const who = () => store.getState().currentUser || 'unknown';

/* ── pure ─────────────────────────────────────────────────────────────────── */

/** Rows in the current Work scope. A decision about my task, workstream or initiative is mine; one
 *  with no entity is everyone's. */
export function scopedRows(rows, scope, mineIds) {
  return rows.filter((r) => idInScope(r.entity_id, scope, mineIds));
}

export function decideCounts(rows, scope, mineIds) {
  const list = scopedRows(rows, scope, mineIds);
  return {
    business: list.filter((r) => r.kind === 'business').length,
    system: list.filter((r) => r.kind === 'system').length,
  };
}

/** The stream's rows split into the first five and the folded rest. */
export function partition(rows, kind, scope, mineIds) {
  const list = scopedRows(rows, scope, mineIds).filter((r) => r.kind === kind);
  return { list, week: list.slice(0, WEEK), later: list.slice(WEEK) };
}

/** Strip the shouted lead-in the analysis writes, same as Today does. */
export function headline(d) {
  let q = (d.question || '').trim();
  q = q.replace(/^[A-Z][A-Z ,'"\-]{6,}[—:-]\s*/, '');
  return q || d.recommended_action || d.signal_code;
}

/** Age in words, neutral ink. A question nobody answered for four months is not more urgent for being
 *  red; it is less. */
export function ageWords(n) {
  n = Number(n) || 0;
  if (n < 1) return 'today';
  if (n < 7) return `${n}d`;
  if (n < 30) return `${Math.round(n / 7)}w`;
  if (n < 365) return `${Math.round(n / 30)}mo`;
  return `${Math.round(n / 365)}y`;
}

/** The entity title can be a whole sentence; it is context, not the headline. */
export function metaLine(d) {
  const title = d.entity_title && d.entity_title.length > 42
    ? d.entity_title.slice(0, 42).replace(/\s+\S*$/, '') + '…'
    : d.entity_title;
  return [d.company, d.func, title].filter(Boolean).join(' · ');
}

/* ── loading ──────────────────────────────────────────────────────────────── */

export async function loadDecisions() {
  // v_decision_queue is security_invoker, so company scoping applies: a restricted user never sees a
  // decision about work they cannot see. Newest first, for the reason Today gives.
  const rows = await safeGet('v_decision_queue', 'order=age_days.asc');
  store.setState({ decideRows: rows, decideLoaded: true });
  return rows;
}

/* ── optimistic helpers ───────────────────────────────────────────────────── */

function dropRows(ids) {
  const s = store.getState();
  const before = { rows: s.decideRows, decisions: s.decisions };
  store.setState({
    decideRows: s.decideRows.filter((r) => !ids.has(key(r.id))),
    decisions: s.decisions.filter((d) => !ids.has(key(d.id))),
  });
  return before;
}

/** Put the rows in `ids` back where they were (anything that arrived meanwhile stays). */
function putBack(before, ids) {
  const s = store.getState();
  const have = new Set(s.decideRows.map((r) => key(r.id)));
  const haveD = new Set(s.decisions.map((d) => key(d.id)));
  store.setState({
    decideRows: before.rows.filter((r) => ids.has(key(r.id)) || have.has(key(r.id))),
    decisions: before.decisions.filter((d) => ids.has(key(d.id)) || haveD.has(key(d.id))),
  });
}

let busy = false;

/* ── resolving ────────────────────────────────────────────────────────────── */

/**
 * Write the decision down and close it. The note is mandatory: it is the only durable artefact this
 * surface produces.
 * @returns {Promise<'ok'|'invalid'|'failed'|'busy'>}
 */
export async function decideResolve(id, status, note) {
  if (busy) return 'busy';
  const text = (note || '').trim();
  if (text.length < 4) {
    setStatus('error', 'Write what was decided. That sentence is the point of this queue.');
    return 'invalid';
  }
  busy = true;
  const ids = new Set([key(id)]);
  const before = dropRows(ids);
  try {
    setStatus('syncing', 'Recording…');
    await sbUpdate('decision_queue', id, {
      status,
      resolved_at: new Date().toISOString(),
      resolved_by: who(),
      resolution_notes: text,
    });
    setStatus('online', status === 'approved' ? 'Decided' : 'Declined');
    return 'ok';
  } catch (e) {
    putBack(before, ids);
    setStatus('error', 'Could not record that: ' + e.message);
    return 'failed';
  } finally {
    busy = false;
  }
}

/** Push it out to a real date. The old defer added a blind seven days.
 *  @returns {Promise<'ok'|'invalid'|'failed'>} */
export async function decideDefer(id, when) {
  if (!when) { setStatus('error', 'Pick a date to come back to it.'); return 'invalid'; }
  const ids = new Set([key(id)]);
  const before = dropRows(ids);
  try {
    setStatus('syncing', 'Deferring…');
    await sbUpdate('decision_queue', id, {
      raised_at: new Date(when + 'T09:00:00').toISOString(),
      resolution_notes: `Deferred to ${when} by ${who()}`,
    });
    setStatus('online', `Back on ${fmtD(when)}`);
    return 'ok';
  } catch (e) {
    putBack(before, ids);
    setStatus('error', 'Could not defer: ' + e.message);
    return 'failed';
  }
}

/**
 * Sweep: push everything in Later to one date with one note. The same PATCH decideDefer issues, in a
 * loop. Stops at the first failure and says how far it got (F7); the rows not done come back. The
 * previous dates are kept so the sweep can be put back.
 * @param later the rows to push
 */
export async function decideSweep(later, when, note) {
  if (busy) return 'busy';
  if (!when) { setStatus('error', 'Pick the date to come back to these.'); return 'invalid'; }
  if (!later.length) return 'ok';
  busy = true;
  const all = new Set(later.map((r) => key(r.id)));
  const before = dropRows(all);
  const done = [];
  const extra = (note || '').trim();
  let result = 'ok';
  try {
    setStatus('syncing', `Deferring ${later.length}…`);
    for (const r of later) {
      await sbUpdate('decision_queue', r.id, {
        raised_at: new Date(when + 'T09:00:00').toISOString(),
        resolution_notes: `Deferred to ${when} by ${who()}${extra ? ': ' + extra : ''}`,
      });
      done.push({ id: r.id, raised_at: r.raised_at, resolution_notes: r.resolution_notes ?? null });
    }
    setStatus('online', `${done.length} back on ${fmtD(when)}`);
  } catch (e) {
    result = 'failed';
    const doneIds = new Set(done.map((d) => key(d.id)));
    putBack(before, new Set([...all].filter((i) => !doneIds.has(i))));
    setStatus('error', `Deferred ${done.length} of ${later.length}, then: ${e.message}`);
  } finally {
    store.setState({ decideSweep: done });
    busy = false;
  }
  return result;
}

export async function decideSweepUndo() {
  const put = store.getState().decideSweep;
  if (busy || !put.length) return;
  busy = true;
  store.setState({ decideSweep: [] });
  try {
    setStatus('syncing', 'Putting them back…');
    for (const d of put) await sbUpdate('decision_queue', d.id, { raised_at: d.raised_at, resolution_notes: d.resolution_notes });
    await loadDecisions();
    setStatus('online', `${put.length} back in the queue`);
  } catch (e) {
    setStatus('error', 'Could not put them all back: ' + e.message);
  } finally {
    busy = false;
  }
}

/* ── cleanup queue (duplicates; lives under Decide's BASE-health stream) ───── */

export async function resolveCleanup(cleanupId, resolution, action) {
  const before = store.getState().cleanups;
  store.setState({ cleanups: before.filter((c) => key(c.id) !== key(cleanupId)) });
  setStatus('syncing', 'Resolving duplicate…');
  try {
    await sbUpdate('cleanup_queue', cleanupId, {
      status: resolution,
      resolved_at: new Date().toISOString(),
      resolved_by: who(),
      resolution_notes: action,
    });
    setStatus('online', 'Cleanup resolved');
    return true;
  } catch (e) {
    const have = new Set(store.getState().cleanups.map((c) => key(c.id)));
    store.setState({ cleanups: before.filter((c) => key(c.id) === key(cleanupId) || have.has(key(c.id))) });
    setStatus('error', 'Cleanup resolve failed: ' + e.message);
    return false;
  }
}
