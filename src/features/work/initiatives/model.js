// Pure logic for Initiatives and the initiative viewer (js/entities.js). No React, no store reads.
import { isMine } from '../../../lib/scope.js';
import { todayISO } from '../../../lib/queue.js';

export const HEALTH_COLOR = { red: 'var(--hot)', yellow: 'var(--warm)', green: 'var(--gr)' };
export const HEALTH_LABEL = { red: 'At Risk', yellow: 'Caution', green: 'Healthy' };
export const PRIORITY_COLOR = { P1: 'var(--hot)', P2: 'var(--warm)', P3: 'var(--txm)' };
export const TIER_ICON = { initiative: 'flag', workstream: 'layers', task: 'check', action: 'zap' };

export const SC_STATUS_COLOR = { met: 'var(--gr)', not_met: 'var(--hot)', unknown: 'var(--txd)' };
export const SC_STATUS_LABEL = { met: '✓ Met', not_met: '✗ Not met', unknown: '? Unknown' };
export const SC_NEXT_STATUS = { met: 'not_met', not_met: 'unknown', unknown: 'met' };

export const LIFECYCLE = [
  { id: 'pending', label: 'Not started' },
  { id: 'in_progress', label: 'Active' },
  { id: 'on_hold', label: 'On hold' },
  { id: 'completed', label: 'Closed' },
];

/** Outcomes are the point of closing: "completed" says the work stopped, the outcome says whether it worked. */
export const OUTCOMES = [
  { id: 'won', label: 'Won', blurb: 'We got what we set out to get.' },
  { id: 'done', label: 'Done', blurb: 'Delivered; no win/lose framing.' },
  { id: 'lost', label: 'Lost', blurb: 'Pursued and did not get it.' },
  { id: 'blocked_external', label: 'Blocked', blurb: 'Stopped by something outside our control.' },
  { id: 'dropped', label: 'Dropped', blurb: 'We chose to stop.' },
  { id: 'superseded', label: 'Superseded', blurb: 'Replaced by different work.' },
];

export const STATUS_OPTIONS = ['pending', 'in_progress', 'on_hold', 'completed', 'dropped'];

export const isClosed = (st) => st === 'completed' || st === 'dropped' || st === 'superseded' || st === 'archived';

const LIVE = new Set(['Pending', 'In Progress', 'On Hold']);

/** A one-line explanation of why a heartbeat row got its colour. */
export function healthExplain(i) {
  const parts = [];
  if (i.progressScore != null) parts.push(`progress ${i.progressScore.toFixed(2)}`);
  if (i.momentumScore != null) parts.push(`momentum ${i.momentumScore.toFixed(2)}`);
  if (i.expectedWindowDays == null) {
    parts.push('no active children — momentum N/A');
  } else {
    const win = i.expectedWindowDays;
    const since = i.daysSinceActivity;
    parts.push(
      win === 3 ? 'overdue items in play — expect activity every 3d'
        : win === 7 ? 'child due within a week — expect activity every 7d'
          : win === 30 ? 'monitor mode — expect activity every 30d'
            : `expect activity every ${win}d`,
    );
    if (since != null) parts.push(`last update ${since.toFixed(1)}d ago`);
    else parts.push('no child activity recorded');
  }
  return parts.join(' · ');
}

/** My open tasks inside an initiative (three levels of `contains` links). */
export function myShare(init, { tasks, links, me, now = new Date() }) {
  if (!me) return { mine: 0, dueSoon: 0, fire: false };
  const kids = new Map();
  for (const l of links || []) {
    const k = String(l.parentId);
    if (!kids.has(k)) kids.set(k, []);
    kids.get(k).push(String(l.childId));
  }
  const seen = new Set();
  let frontier = [String(init.id)];
  for (let lvl = 0; lvl < 3 && frontier.length; lvl++) {
    const next = [];
    for (const id of frontier) for (const c of kids.get(id) || []) if (!seen.has(c)) { seen.add(c); next.push(c); }
    frontier = next;
  }
  const tod = todayISO(now);
  const d = new Date(now); d.setDate(d.getDate() + 7);
  const in7 = todayISO(d);
  const mine = (tasks || []).filter((t) => seen.has(String(t.id)) && isMine(t, me) && LIVE.has(t.status));
  return {
    mine: mine.length,
    dueSoon: mine.filter((t) => t.nextFollowUp && t.nextFollowUp <= in7).length,
    // Red is for fire: one of my P1s, overdue.
    fire: mine.some((t) => t.priority === 'P1' && t.nextFollowUp && t.nextFollowUp < tod),
  };
}

/**
 * Initiatives (already in scope) -> { open, shut, groups }. Groups by attention needed, mine first
 * inside each. Every item is { i, share }.
 */
export function groupInitiatives(inScopeList, ctx) {
  const open = inScopeList.filter((i) => !isClosed(i.status));
  const shut = inScopeList.filter((i) => isClosed(i.status));
  const item = (i) => ({ i, share: myShare(i, ctx) });
  const mineFirst = (a, b) => Number(b.i.ownerCode === ctx.me) - Number(a.i.ownerCode === ctx.me);
  const annotated = open.map(item);
  const hot = (x) => x.i.health === 'red' || x.share.fire;
  const groups = [
    { key: 'attention', title: 'Needs attention', blurb: 'At risk, or holding one of your overdue tasks.', items: annotated.filter(hot) },
    { key: 'moving', title: 'Moving', blurb: '', items: annotated.filter((x) => !hot(x) && x.i.activeChildren > 0) },
    { key: 'quiet', title: 'Quiet', blurb: 'No active children. Parked, or finished and not yet closed.', items: annotated.filter((x) => !hot(x) && !(x.i.activeChildren > 0)) },
  ];
  groups.forEach((g) => g.items.sort(mineFirst));
  // Closed ones are not annotated (the old code only annotated open initiatives).
  return { open, shut: shut.map((i) => ({ i, share: { mine: 0, dueSoon: 0, fire: false } })), groups };
}

/** Children of the drill: on-hold last, then by priority. */
export function sortChildren(children) {
  const rank = { P1: 1, P2: 2, P3: 3 };
  return [...children].sort((a, b) => {
    const ah = a.status === 'on_hold' ? 1 : 0;
    const bh = b.status === 'on_hold' ? 1 : 0;
    if (ah !== bh) return ah - bh;
    return (rank[a.priority] || 4) - (rank[b.priority] || 4);
  });
}

/** The heartbeat row key an entity column maps to (next_follow_up is target_date there: not mirrored). */
export const HEARTBEAT_KEY = { status: 'status', priority: 'priority', owner_code: 'ownerCode' };
