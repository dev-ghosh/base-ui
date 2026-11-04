import { store } from '../store/store.js';
import { parseD } from './format.js';

const INVESTOR_CATS = ['Investment','Investors','Investor','Potential Investor',
  'Existing Investor','Investment Professionals','Investment Banker'];
const GOVT_CATS = ['IAS/IPS etc','Political Leader','Bureaucrats','Embassy Contact','Government'];
const PRIORITY_CATS = ['Corporate Heads','Strategic Alliance','Business Tie-Ups'];

export function warmthLabel(score) {
  if (score >= 70) return 'Hot';
  if (score >= 45) return 'Warm';
  if (score >= 20) return 'Cool';
  return 'Cold';
}

/**
 * Score a contact (never stored directly). The old version read the wall clock
 * (Date.now(), new Date()) and `state.tasks`; the clock is now the `now`
 * parameter. `tasks` defaults to the store's tasks (what `state.tasks` was), so
 * callers keep the same two-argument shape but tests can pass tasks explicitly.
 */
export function computeWarmth(c, now = new Date(), tasks = store.getState().tasks) {
  if (!c) return 0;
  let score = 0;

  if (c.priority === 'A')      score += 40;
  else if (c.priority === 'B') score += 25;
  else if (c.priority === 'C') score += 10;
  else {
    if (INVESTOR_CATS.includes(c.category))      score += 30;
    else if (GOVT_CATS.includes(c.category))     score += 30;
    else if (PRIORITY_CATS.includes(c.category)) score += 20;
  }

  if (c.lastMtg) {
    const d = parseD(c.lastMtg);
    if (d) {
      const days = (now.getTime() - d.getTime()) / 86400000;
      if (days <= 30)       score += 30;
      else if (days <= 90)  score += 20;
      else if (days <= 365) score += 10;
    }
  }

  if (c.nextStep?.trim())    score += 15;
  if (c.keyInputs?.trim())   score += 10;

  const today = new Date(now); today.setHours(0, 0, 0, 0);
  let taskBonus = 0;
  tasks.forEach(t => {
    if (t.contactId !== c.id) return;
    if (t.status === 'Completed' || t.status === 'Dropped') return;
    const d = parseD(t.nextFollowUp);
    const isOverdue = d && d < today;
    if (isOverdue && taskBonus < 20)       taskBonus = Math.max(taskBonus, 20);
    if (t.priority === 'P1')               taskBonus = Math.max(taskBonus, 25);
    else if (t.priority === 'P2' && isOverdue) taskBonus = Math.max(taskBonus, 22);
  });
  score += taskBonus;

  return score;
}
