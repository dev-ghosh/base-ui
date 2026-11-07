// The task writes: optimistic update -> REST -> rollback + error status on failure
// (the old "Write flow"), the viewer-role guard, and saveTask's rules.
// The real rest.js runs; only fetch is stubbed, so "no fetch" is a real assertion.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

process.env.NEXT_PUBLIC_SB_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SB_KEY = 'anon-key-123';

import { useTaskActions } from '@/features/tasks/hooks/useTaskActions.js';
import { store } from '@/store/store.js';
import { getStatus } from '@/lib/status.js';
import { registryStore } from '@/lib/registry.js';
import { addDaysISO, nextMondayISO } from '@/lib/today.js';
import { seed, makeTask, stubFetch, okResponse, failResponse, REGISTRY, ME } from './helpers/fixtures.js';

const actions = () => renderHook(() => useTaskActions()).result.current;
const task = (id) => store.getState().tasks.find((t) => t.id === id);
const READ_ONLY = 'You have view-only access to BASE, so this change was not saved.';

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('markDone / pushWeek / pushDays (Today and Triage writes)', () => {
  it('markDone updates the store first, then PATCHes entities with status completed once', async () => {
    seed({ tasks: [makeTask({ id: 't1', nextFollowUp: '2026-01-01' })] });
    let release;
    const gate = new Promise((r) => { release = r; });
    const f = stubFetch(async () => { await gate; });

    const p = actions().markDone('t1');
    expect(task('t1').status).toBe('Completed');            // optimistic: before the request resolved
    release();
    expect(await p).toBe(true);

    expect(f.writes()).toHaveLength(1);
    expect(f.writes()[0]).toMatchObject({ method: 'PATCH', body: { status: 'completed' } });
    expect(f.writes()[0].url).toContain('/rest/v1/entities?id=eq.t1');
    expect(getStatus()).toMatchObject({ kind: 'online', msg: 'Marked done' });
  });

  it('markDone puts the task back and says so out loud when the write fails', async () => {
    seed({ tasks: [makeTask({ id: 't1' })] });
    stubFetch(async () => failResponse('server said no'));

    expect(await actions().markDone('t1')).toBe(false);

    expect(task('t1').status).toBe('Pending');
    expect(getStatus().kind).toBe('error');
    expect(getStatus().msg).toMatch(/^Could not update that task: /);
    expect(getStatus().msg).toContain('server said no');
  });

  it('pushWeek sets next_follow_up to next Monday (ISO) and says "Pushed to next week"', async () => {
    seed({ tasks: [makeTask({ id: 't1', nextFollowUp: '2026-01-01' })] });
    const f = stubFetch();

    await actions().pushWeek('t1');

    expect(f.writes()[0].body).toEqual({ next_follow_up: nextMondayISO() });
    expect(task('t1').nextFollowUp).toBe(nextMondayISO());
    expect(getStatus().msg).toBe('Pushed to next week');
  });

  it('pushWeek rolls the date back on failure', async () => {
    seed({ tasks: [makeTask({ id: 't1', nextFollowUp: '2026-01-01' })] });
    stubFetch(async () => failResponse());
    await actions().pushWeek('t1');
    expect(task('t1').nextFollowUp).toBe('2026-01-01');
    expect(getStatus().kind).toBe('error');
  });

  it('pushDays(id, n) pushes n calendar days from today', async () => {
    seed({ tasks: [makeTask({ id: 't1', nextFollowUp: '2026-01-01' })] });
    const f = stubFetch();
    await actions().pushDays('t1', 3);
    expect(f.writes()[0].body).toEqual({ next_follow_up: addDaysISO(3) });
    expect(task('t1').nextFollowUp).toBe(addDaysISO(3));
  });

  it('an unknown task id does nothing and sends nothing', async () => {
    seed({ tasks: [makeTask({ id: 't1' })] });
    const f = stubFetch();
    expect(await actions().markDone('nope')).toBe(false);
    expect(f.fn).not.toHaveBeenCalled();
  });

  it('ids are compared as strings', async () => {
    seed({ tasks: [makeTask({ id: '42' })] });
    const f = stubFetch();
    expect(await actions().markDone(42)).toBe(true);
    expect(f.writes()).toHaveLength(1);
  });

  it('a view-only user: the guard sentence is the error, no request is made, the task is untouched', async () => {
    seed({ tasks: [makeTask({ id: 't1' })], access: { person_code: ME, can_write: false } });
    const f = stubFetch();

    expect(await actions().markDone('t1')).toBe(false);

    expect(f.fn).not.toHaveBeenCalled();
    expect(task('t1').status).toBe('Pending');
    expect(getStatus().kind).toBe('error');
    expect(getStatus().msg).toContain(READ_ONLY);
  });
});

describe('setStatus (the viewer\'s Mark done / Reopen, hSetStatus)', () => {
  it('moves the task, writes status + updated_by + updated_at, and reports it', async () => {
    seed({ tasks: [makeTask({ id: 't1' })] });
    const f = stubFetch();

    await actions().setStatus('t1', 'In Progress');

    const patch = f.writes().find((w) => w.url.includes('/entities?id=eq.t1'));
    expect(patch.method).toBe('PATCH');
    expect(patch.body).toMatchObject({ status: 'in_progress', updated_by: 'Me Myself' });
    expect(typeof patch.body.updated_at).toBe('string');
    expect(task('t1').status).toBe('In Progress');
    expect(task('t1').v3Status).toBe('in_progress');
    expect(getStatus()).toMatchObject({ kind: 'online', msg: 'Moved to In Progress' });
    expect(f.writes().some((w) => w.url.includes('/entity_events'))).toBe(true);   // the audit row
  });

  it('does nothing when the status is already that', async () => {
    seed({ tasks: [makeTask({ id: 't1', status: 'Completed' })] });
    const f = stubFetch();
    await actions().setStatus('t1', 'Completed');
    expect(f.fn).not.toHaveBeenCalled();
  });

  it('reverts and reports "Update failed" when the write fails', async () => {
    seed({ tasks: [makeTask({ id: 't1' })] });
    stubFetch(async () => failResponse('nope'));
    await actions().setStatus('t1', 'Completed');
    expect(task('t1').status).toBe('Pending');
    expect(getStatus().kind).toBe('error');
    expect(getStatus().msg).toMatch(/^Update failed: /);
  });
});

describe('saveTask', () => {
  const data = (o = {}) => ({
    id: null, leadId: null, task: 'New thing', project: '', frontCode: null, category: '', status: 'Pending',
    contactName: '', contactOrg: '', contactId: null, contactNames: [], contactIds: [],
    nextFollowUp: '2026-12-01', lastMtg: null, startDate: null, endDate: null, actionItem: '', keyInputs: '',
    assignedTo: 'Me Myself', ownerCode: ME, coOwnerCodes: [], priority: 'P2', recurrenceRule: '',
    company: 'Acme', func: 'Ops', tags: [], ...o,
  });

  it('rejects a new task without func, with the old message, and sends nothing', async () => {
    seed();
    registryStore.setState({ rows: REGISTRY });
    const f = stubFetch();
    await expect(actions().saveTask(data({ func: '' }))).rejects.toThrow('Company and Function are both required on a new task');
    expect(f.fn).not.toHaveBeenCalled();
  });

  it('rejects a task without a name', async () => {
    seed();
    const f = stubFetch();
    await expect(actions().saveTask(data({ task: '' }))).rejects.toThrow('Task name is required');
    expect(f.fn).not.toHaveBeenCalled();
  });

  it('an assigned-scope user cannot create a task owned by someone else', async () => {
    seed({ access: { person_code: ME, can_write: true, task_scope: 'assigned' } });
    registryStore.setState({ rows: REGISTRY });
    stubFetch();
    await expect(actions().saveTask(data({ ownerCode: 'OT1' }))).rejects.toThrow(/only create tasks assigned to yourself/);
  });

  it('creates a task: INSERT with func and created_by, co-owner rows, store updated', async () => {
    seed();
    registryStore.setState({ rows: REGISTRY });
    const f = stubFetch(async (url, init) => {
      if (init.method === 'POST' && url.includes('/rest/v1/entities')) {
        return okResponse([{ id: 'new1', tier: 'task', title: 'New thing', status: 'pending', owner_code: ME, company: 'Acme', func: 'Ops', next_follow_up: '2026-12-01' }]);
      }
    });

    const res = await actions().saveTask(data({ coOwnerCodes: ['OT1'] }));

    const insert = f.writes().find((w) => w.method === 'POST' && w.url.includes('/rest/v1/entities'));
    expect(insert.body).toMatchObject({ title: 'New thing', func: 'Ops', company: 'Acme', owner_code: ME, status: 'pending', created_by: 'Me Myself' });
    const owners = f.writes().find((w) => w.url.includes('/entity_owners'));
    expect(owners.body).toEqual([{ entity_id: 'new1', person_code: 'OT1', role: 'owner', added_by: 'Me Myself' }]);
    expect(res).toMatchObject({ id: 'new1', created: true });
    expect(task('new1')).toMatchObject({ task: 'New thing', func: 'Ops' });
    expect(store.getState().coOwners.get('new1')).toEqual(['OT1']);
    expect(getStatus()).toMatchObject({ kind: 'online', msg: 'Task saved' });
  });

  it('a lead\'s task carries lead_id', async () => {
    seed();
    registryStore.setState({ rows: REGISTRY });
    const f = stubFetch(async (url, init) => (init.method === 'POST' && url.includes('/rest/v1/entities') ? okResponse([{ id: 'n2', tier: 'task' }]) : undefined));
    await actions().saveTask(data({ leadId: 77 }));
    expect(f.writes().find((w) => w.url.includes('/rest/v1/entities')).body.lead_id).toBe(77);
  });

  it('edits a task: PATCH, co-owner diff (add + soft-remove), local merge, status-change event', async () => {
    seed({ tasks: [makeTask({ id: 'ed1', ownerCode: ME, coOwnerCodes: ['OT1'], status: 'Pending' })], coOwners: new Map([['ed1', ['OT1']]]) });
    registryStore.setState({ rows: REGISTRY });
    const f = stubFetch();

    const res = await actions().saveTask(data({ id: 'ed1', task: 'Renamed', status: 'On Hold', coOwnerCodes: ['AA9'] }));

    const w = f.writes();
    const patch = w.find((x) => x.url.includes('/entities?id=eq.ed1'));
    expect(patch.method).toBe('PATCH');
    expect(patch.body).toMatchObject({ title: 'Renamed', status: 'on_hold' });
    expect(w.find((x) => x.url.includes('/entity_owners') && x.method === 'POST').body[0]).toMatchObject({ person_code: 'AA9' });
    const removal = w.find((x) => x.url.includes('/entity_owners') && x.method === 'PATCH');
    expect(removal.url).toContain('entity_id=eq.ed1&person_code=eq.OT1&removed_at=is.null');
    expect(removal.body.removed_at).toEqual(expect.any(String));
    expect(res).toMatchObject({ id: 'ed1', created: false });
    expect(task('ed1')).toMatchObject({ task: 'Renamed', status: 'On Hold', v3Status: 'on_hold' });
    expect(store.getState().coOwners.get('ed1')).toEqual(['AA9']);
    const ev = w.find((x) => x.url.includes('/entity_events'));
    expect(ev.body).toMatchObject({ event_type: 'status_changed', field_name: 'status', old_value: 'Pending', new_value: 'On Hold' });
  });

  it('a failed write reports "Save failed: …" and resolves null', async () => {
    seed();
    registryStore.setState({ rows: REGISTRY });
    stubFetch(async () => failResponse('constraint'));
    expect(await actions().saveTask(data())).toBeNull();
    expect(getStatus().kind).toBe('error');
    expect(getStatus().msg).toMatch(/^Save failed: /);
  });

  it('a view-only user: no fetch, the guard sentence', async () => {
    seed({ access: { person_code: ME, can_write: false } });
    registryStore.setState({ rows: REGISTRY });
    const f = stubFetch();
    expect(await actions().saveTask(data())).toBeNull();
    expect(f.fn).not.toHaveBeenCalled();
    expect(getStatus().msg).toContain(READ_ONLY);
  });
});

describe('deleteTask', () => {
  it('deletes the entity and removes it from the store', async () => {
    seed({ tasks: [makeTask({ id: 'd1' }), makeTask({ id: 'd2' })], coOwners: new Map([['d1', ['OT1']]]) });
    const f = stubFetch();
    expect(await actions().deleteTask('d1')).toBe(true);
    const del = f.writes()[0];
    expect(del.method).toBe('DELETE');
    expect(del.url).toContain('/entities?id=eq.d1');
    expect(store.getState().tasks.map((t) => t.id)).toEqual(['d2']);
    expect(store.getState().coOwners.has('d1')).toBe(false);
    expect(getStatus().msg).toBe('Task deleted');
  });

  it('explains a foreign-key refusal and keeps the task', async () => {
    seed({ tasks: [makeTask({ id: 'd1' })] });
    stubFetch(async () => failResponse('23503 foreign key violation'));
    expect(await actions().deleteTask('d1')).toBe(false);
    expect(store.getState().tasks).toHaveLength(1);
    expect(getStatus().msg).toBe('This task is linked to task history or a daily opening move, so it cannot be deleted. Mark it Dropped instead.');
  });

  it('explains an RLS refusal', async () => {
    seed({ tasks: [makeTask({ id: 'd1' })] });
    stubFetch(async () => okResponse([]));            // PostgREST answers an RLS-refused DELETE with an empty list
    expect(await actions().deleteTask('d1')).toBe(false);
    expect(store.getState().tasks).toHaveLength(1);
    expect(getStatus().msg).toBe('Only an admin can delete tasks.');
  });
});
