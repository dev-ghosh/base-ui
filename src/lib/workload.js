/* workload.js — Team Capacity & Workload Balance. Port of computeWorkload() and WORKLOAD_THRESHOLDS in
 * rie-dashboard2/js/workload.js. Pure: tasks in, one row per person out. Plain JS with relative
 * imports so plain Node can run it.
 */
import { assigneesOf, personCode } from './mappers.js';
import { todayISO } from './queue.js';

export const WORKLOAD_THRESHOLDS = {
  low: 5,
  medium: 12,
  high: 18,
  critical: 25,
};

/**
 * @param {object[]} tasks
 * @param {{now?: Date, codeOf?: (name: string) => string}} [opts] codeOf maps a display name to a
 *   person code (default: the people in the store)
 * @returns rows sorted by open tasks, most first: { name, ownerCode, totalOpen, overdue, p1, tasks,
 *   score, status, statusBg, statusColor, barColor }
 *
 * A shared task counts once for each person on it, never for a combined "A, B" person. Overdue
 * compares local YYYY-MM-DD strings (new Date('2026-10-19') is UTC midnight, which made today's
 * tasks overdue from 05:30 IST). Unlike Analytics, archived tasks are not left out here.
 */
export function computeWorkload(tasks, { now = new Date(), codeOf = personCode } = {}) {
  const openTasks = (tasks || []).filter((t) => t.status !== 'Completed' && t.status !== 'Dropped');
  const perPerson = {};
  const today = todayISO(now);

  for (const t of openTasks) {
    const names = assigneesOf(t);
    for (const owner of names.length ? names : ['Unassigned']) {
      if (!perPerson[owner]) {
        perPerson[owner] = { name: owner, ownerCode: codeOf(owner) || '', totalOpen: 0, overdue: 0, p1: 0, tasks: [] };
      }
      perPerson[owner].totalOpen++;
      if (t.isOverdue || (t.nextFollowUp && t.nextFollowUp < today)) perPerson[owner].overdue++;
      if (t.priority === 'P1' || t.priority === 'A') perPerson[owner].p1++;
      perPerson[owner].tasks.push(t);
    }
  }

  const result = Object.values(perPerson).map((p) => {
    let status = 'Normal';
    let statusBg = 'rgba(34, 197, 94, 0.12)';
    let statusColor = 'var(--gr, #22c55e)';
    let barColor = 'var(--gr, #22c55e)';

    if (p.totalOpen >= WORKLOAD_THRESHOLDS.critical) {
      status = 'Critical';
      statusBg = 'rgba(239, 68, 68, 0.12)';
      statusColor = 'var(--hot, #ef4444)';
      barColor = 'var(--hot, #ef4444)';
    } else if (p.totalOpen >= WORKLOAD_THRESHOLDS.high) {
      status = 'Heavy';
      statusBg = 'rgba(249, 115, 22, 0.12)';
      statusColor = 'var(--warm, #f97316)';
      barColor = 'var(--warm, #f97316)';
    } else if (p.totalOpen >= WORKLOAD_THRESHOLDS.medium) {
      status = 'Active';
      statusBg = 'rgba(59, 130, 246, 0.12)';
      statusColor = 'var(--cold, #3b82f6)';
      barColor = 'var(--cold, #3b82f6)';
    }

    const score = Math.min(100, Math.round((p.totalOpen / WORKLOAD_THRESHOLDS.critical) * 100));
    return { ...p, score, status, statusBg, statusColor, barColor };
  });

  result.sort((a, b) => b.totalOpen - a.totalOpen);
  return result;
}
