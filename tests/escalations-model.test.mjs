// Escalations: the pure parts (rie-dashboard2/js/escalations.js). Expected values worked out by hand.
import {
  MAX_LEVEL, LEVEL_NAME, ESCALATION_REASONS, VIEWS, VIEW_KEYS, ago, defaultView, splitEscalations, nextUpFrom, suggestionHint,
  pickableTasks, raiseProblem, escalationInsert, raiseErrorText, actionPatch, actionErrorText, statusAfterRelease, cardRights, actionHelp,
} from '../src/features/escalations/model.js';

let bad = 0;
const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL') + '  ' + m); if (!c) bad++; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

check(MAX_LEVEL === 4 && eq(Object.values(LEVEL_NAME), ['Raised', 'Escalated', 'Senior review', 'Final stop']), 'four steps, named');
check(ESCALATION_REASONS.length === 6 && ESCALATION_REASONS.at(-1) === 'Other', 'six reasons, "Other" last');
check(eq(VIEWS, [['waiting', 'Waiting on me'], ['raised', 'Raised by me'], ['open', 'All open'], ['closed', 'Closed']]) && VIEW_KEYS.join() === 'waiting,raised,open,closed', 'four views, in tab order');

const now = Date.parse('2026-11-10T12:00:00Z');
const at = (min) => new Date(now - min * 60000).toISOString();
check(eq([0, 1, 59, 60, 1439, 1440, 2879, 4320].map((m) => ago(at(m), now)), ['just now', '1m ago', '59m ago', '1h ago', '24h ago', 'yesterday', '2d ago', '3d ago']), 'ago(): minutes, hours, yesterday, days');
check(ago(new Date(now + 600000).toISOString(), now) === 'just now', 'a time in the future reads "just now"');

const e = (o) => ({ id: 1, status: 'open', assigned_to: 'A', raised_by: 'B', level: 1, ...o });
const list = [e({ id: 1 }), e({ id: 2, assigned_to: 'C', raised_by: 'A' }), e({ id: 3, status: 'resolved' }), e({ id: 4, status: 'withdrawn', raised_by: 'A' })];
const s = splitEscalations(list, 'A');
check(eq([s.waiting, s.raised, s.open, s.closed].map((x) => x.map((y) => y.id)), [[1], [2], [1, 2], [3, 4]]), 'waiting / raised / open / closed');
check(defaultView(list, 'A') === 'waiting' && defaultView(list, 'C') === 'waiting' && defaultView(list, 'B') === 'open' && defaultView([], 'A') === 'open', 'default view: waiting if anything waits on me, else open');
check(splitEscalations([e({ assigned_to: null })], null).waiting.length === 0, 'an unlinked sign-in has nothing waiting (a null assignee is not "me")');

const people = [{ code: 'ME', reports_to: 'BS' }, { code: 'BS', reports_to: null }, { code: 'NB', reports_to: null }];
check(nextUpFrom(people, 'ME', [], ['AD']) === 'BS', 'next up: the reporting line first');
check(nextUpFrom(people, 'ME', ['BS'], ['BS', 'AD']) === 'AD', '... skipping anyone to avoid, then an admin');
check(nextUpFrom(people, 'NB', [], ['NB', 'AD']) === 'AD', '... never the same person');
check(nextUpFrom(people, 'NB', [], ['NB']) === null && nextUpFrom(people, 'NB', [], []) === null, '... or no one');
const nm = (c) => ({ BS: 'Bo', AD: 'Ada' }[c]);
check(suggestionHint('BS', 'ME', people, nm) === 'Suggested: Bo (your reporting line).' && suggestionHint('AD', 'ME', people, nm) === 'Suggested: Ada (an admin).'
  && suggestionHint(null, 'ME', people, nm) === 'No reporting line is set for you, so choose who should handle it.', 'the suggestion line');

const tasks = [
  { id: 1, task: 'b', status: 'Pending', priority: 'P2', ownerCode: 'ME' }, { id: 2, task: 'a', status: 'Pending', priority: 'P2', ownerCode: 'ME' },
  { id: 3, task: 'z', status: 'In Progress', priority: 'P1', ownerCode: 'ME' }, { id: 4, task: 'x', status: 'Completed', ownerCode: 'ME' },
  { id: 5, task: 'o', status: 'Pending', priority: 'P2', ownerCode: 'OT' }, { id: 6, task: 'co', status: 'Pending', priority: 'P2', ownerCode: 'OT', coOwnerCodes: ['ME'] },
  { id: 7, task: 'held', status: 'On Hold', priority: 'P2', ownerCode: 'ME' }, { id: 8, task: 'd', status: 'Dropped', ownerCode: 'OT' },
];
const p = pickableTasks(tasks, [{ status: 'open', entity_id: '7' }, { status: 'resolved', entity_id: 2 }], 'ME');
check(eq(p.mine.map((t) => t.id), [3, 2, 1, 6]) && eq(p.rest.map((t) => t.id), [5]), 'pickable: open, not already escalated (a resolved one does not block), mine (incl. co-owned) first, P1 first, then by title');
check(pickableTasks(Array.from({ length: 200 }, (_, i) => ({ id: i, task: 't' + i, status: 'Pending', ownerCode: 'OT' })), [], 'ME').rest.length === 150, 'the rest is capped at 150');
check(pickableTasks(tasks, [], null).mine.length === 0, 'no person code: nothing is "mine"');

check(raiseProblem({ taskId: '', to: 'x', me: 'ME', task: {} }) === 'Choose the task first.'
  && raiseProblem({ taskId: 1, to: '', me: 'ME', task: {} }) === 'Choose who should handle it.'
  && raiseProblem({ taskId: 1, to: 'ME', me: 'ME', task: {} }) === 'An escalation has to go to someone else.'
  && raiseProblem({ taskId: 1, to: 'BS', me: 'ME', task: undefined }) === 'That task is no longer available. Refresh and try again.'
  && raiseProblem({ taskId: 1, to: 'BS', me: 'ME', task: {} }) === '', 'raiseProblem: the four sentences, in the old order');
check(eq(escalationInsert({ task: { id: '11', task: 'T' }, me: 'ME', to: 'BS', reason: 'R', notes: '', previousStatus: 'pending', now: 'N' }), {
  entity_id: 11, task_title: 'T', raised_by: 'ME', assigned_to: 'BS', level: 1, reason: 'R', notes: null, previous_status: 'pending',
  trail: [{ at: 'N', by: 'ME', action: 'raised', to: 'BS', note: 'R' }],
}), 'the inserted row: numeric entity id, level 1, null notes, the reason as the trail note');
check(escalationInsert({ task: { id: 1, task: '' }, me: 'ME', to: 'BS', reason: 'R', notes: 'n', previousStatus: 'x', now: 'N' }).task_title === 'Untitled task', 'an untitled task is "Untitled task"');
check(raiseErrorText('duplicate key value violates unique constraint "escalations_one_open_per_task"') === 'This task already has an open escalation.'
  && raiseErrorText('INSERT escalations failed: nope') === 'nope' && actionErrorText('UPDATE escalations failed: boom') === 'boom', 'error sentences');

const open = { id: 1, level: 2, trail: [{ by: 'A' }] };
check(eq(actionPatch('push', open, { me: 'ME', note: 'n', to: 'AD', now: 'N' }), { patch: { assigned_to: 'AD', level: 3, trail: [{ by: 'A' }, { at: 'N', by: 'ME', action: 'escalated', to: 'AD', note: 'n' }] } }), 'push: level + 1, re-assign, trail');
check(actionPatch('push', open, { me: 'ME', note: '', to: '', now: 'N' }).error === 'Choose who it goes to.' && actionPatch('push', { ...open, level: 4 }, { me: 'ME', to: 'AD', now: 'N' }).error === 'This is already at the final step.', 'push: needs a recipient, and stops at step 4');
check(actionPatch('push', open, { me: 'ME', note: '', to: 'AD', now: 'N' }).patch.trail[1].note === null, 'push without a note: null');
check(eq(actionPatch('resolve', open, { me: 'ME', note: 'ok', now: 'N' }), { patch: { status: 'resolved', resolution: 'ok', resolved_by: 'ME', resolved_at: 'N', trail: [{ by: 'A' }, { at: 'N', by: 'ME', action: 'resolved', note: 'ok' }] } }), 'resolve patch');
check(actionPatch('resolve', open, { me: 'ME', note: '', now: 'N' }).error === 'Add a line on what was decided.', 'resolve needs a note');
check(eq(actionPatch('withdraw', open, { me: 'ME', note: '', now: 'N' }).patch, { status: 'withdrawn', resolution: null, resolved_by: 'ME', resolved_at: 'N', trail: [{ by: 'A' }, { at: 'N', by: 'ME', action: 'withdrawn', note: null }] }), 'withdraw patch: note optional');
check(statusAfterRelease({ previous_status: 'pending' }) === 'pending' && statusAfterRelease({ previous_status: 'on_hold' }) === 'in_progress' && statusAfterRelease({}) === 'in_progress', 'release: previous status, never back onto hold');
check(actionHelp('push', { level: 4 }).includes('step 4 of 4') && actionHelp('push', { level: 1 }).includes('step 2 of 4'), 'push help names the next step');

const r = (o, a) => cardRights(e(o), { me: 'A', canWrite: true, isAdmin: false, ...a });
check(r({}).canAct && !r({}).canWithdraw && r({}).withMe, 'holder: can act, cannot withdraw');
check(!r({ assigned_to: 'X', raised_by: 'A' }).canAct && r({ assigned_to: 'X', raised_by: 'A' }).canWithdraw, 'raiser: can withdraw only');
check(!r({ assigned_to: 'X', raised_by: 'Y' }).canAct && !r({ assigned_to: 'X', raised_by: 'Y' }).canWithdraw, 'bystander: nothing');
check(r({ assigned_to: 'X', raised_by: 'Y' }, { isAdmin: true }).canAct && r({ assigned_to: 'X', raised_by: 'Y' }, { isAdmin: true }).canWithdraw, 'admin: both');
check(!r({}, { canWrite: false }).canAct && !r({ raised_by: 'A' }, { canWrite: false }).canWithdraw, 'view-only: nothing');
check(!r({ status: 'resolved' }).canAct && !r({ status: 'resolved' }).open, 'closed: nothing');

process.exit(bad ? 1 : 0);
