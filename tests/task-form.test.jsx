// The task form (mo-tf): opened from several places through useTaskForm(), validations of the
// old saveTask, create / edit / delete, assignees and contacts, "come back to the viewer".
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent, within } from '@testing-library/react';

process.env.NEXT_PUBLIC_SB_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SB_KEY = 'anon-key-123';

const nav = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), path: '/work/matrix' }));
vi.mock('next/navigation', () => ({
  useRouter: () => nav,
  usePathname: () => nav.path,
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(''),
}));

import { TaskFormProvider } from '@/features/tasks/TaskFormProvider.jsx';
import { useTaskForm } from '@/features/tasks/hooks/useTaskForm.js';
import { Header } from '@/components';
import { store } from '@/store/store.js';
import { getStatus } from '@/lib/status.js';
import { registryStore } from '@/lib/registry.js';
import { seed, makeTask, stubFetch, okResponse, failResponse, REGISTRY, ME } from './helpers/fixtures.js';

const html = document.documentElement;

function Opener({ prefill }) {
  const f = useTaskForm();
  return (
    <div>
      <button onClick={() => f.openAdd(prefill)}>open-add</button>
      <button onClick={() => f.openEdit('t1')}>open-edit</button>
      <button onClick={() => f.openEdit('t1', { fromViewer: true })}>open-edit-from-viewer</button>
      <span data-testid="open">{String(f.open)}</span>
    </div>
  );
}
const mount = (props = {}) => render(<TaskFormProvider><Opener {...props} /></TaskFormProvider>);
const $ = (sel) => document.querySelector(sel);
const formOpen = () => $('#mo-tf')?.classList.contains('open') ?? false;
const setVal = (sel, value) => fireEvent.change($(sel), { target: { value } });
const save = () => fireEvent.click(within($('#mo-tf')).getByRole('button', { name: 'Save' }));
const optionTexts = (sel) => [...$(sel).options].map((o) => o.textContent);

const CONTACTS = [
  { id: 1, name: 'Cy Contact', org: 'Cy Org', email: 'cy@example.com', category: 'Client' },
  { id: 2, name: 'Di Other', org: '', email: '', category: '' },
];

function seedForm(extra = {}) {
  seed({
    tasks: [makeTask({
      id: 't1', task: 'Existing task', legacyTaskId: 55, company: 'Acme', func: 'Ops', status: 'On Hold', priority: 'P3',
      nextFollowUp: '2026-12-01', ownerCode: ME, coOwnerCodes: ['OT1'], assignedTo: 'Me Myself, Olive Other', tags: ['a', 'b'],
      actionItem: 'Do it', recurrenceRule: 'weekly', frontCode: 'F1', contactName: 'Cy Contact', contactOrg: 'Cy Org',
    })],
    contacts: CONTACTS,
    fronts: [{ code: 'F1', name: 'Front One' }],
    coOwners: new Map([['t1', ['OT1']]]),
    ...extra,
  });
  registryStore.setState({ rows: REGISTRY });
}

beforeEach(() => { vi.clearAllMocks(); nav.path = '/work/matrix'; html.classList.remove('is-admin', 'ro'); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); html.classList.remove('is-admin', 'ro'); });

describe('opening', () => {
  it('openAdd shows an empty "Add Task" form with the old fields and no Escalate / Delete', () => {
    seedForm();
    stubFetch();
    mount();
    expect(formOpen()).toBe(false);
    fireEvent.click(screen.getByText('open-add'));

    expect(formOpen()).toBe(true);
    expect(screen.getByTestId('open').textContent).toBe('true');
    expect($('#mo-tf .mti').textContent).toBe('Add Task');
    expect($('#tf-task-name').value).toBe('');
    expect($('#tf-status-f').value).toBe('Pending');
    expect(optionTexts('#tf-company')).toEqual(['— Select —', 'Acme', 'Beta']);
    expect(optionTexts('#tf-func')).toEqual(['— Select —']);
    expect(optionTexts('#tf-proj-f')).toEqual(['— None —', 'Front One']);
    expect(optionTexts('#tf-priority')).toEqual(['—', 'P1 (Highest)', 'P2', 'P3 (Lowest)']);
    expect(optionTexts('#tf-recurrence')).toEqual(['— None —', 'Daily', 'Weekly', 'Bi-weekly', 'Monthly', 'Quarterly']);
    expect(within($('#mo-tf')).queryByRole('button', { name: 'Escalate…' })).toBeNull();
    expect(within($('#mo-tf')).queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('loads the registry when the form opens and none is loaded yet', async () => {
    seedForm();
    registryStore.setState({ rows: [] });
    stubFetch(async (url) => (url.includes('/task_functions') ? okResponse(REGISTRY) : undefined));
    mount();
    fireEvent.click(screen.getByText('open-add'));
    await waitFor(() => expect(optionTexts('#tf-company')).toEqual(['— Select —', 'Acme', 'Beta']));
  });

  it('openEdit fills the fields from the task and offers Escalate (Delete only for admins)', () => {
    seedForm();
    stubFetch();
    mount();
    fireEvent.click(screen.getByText('open-edit'));

    expect($('#mo-tf .mti').textContent).toBe('Edit Task #55');
    expect($('#tf-task-name').value).toBe('Existing task');
    expect($('#tf-status-f').value).toBe('On Hold');
    expect($('#tf-company').value).toBe('Acme');
    expect($('#tf-func').value).toBe('Ops');
    expect($('#tf-proj-f').value).toBe('F1');
    expect($('#tf-priority').value).toBe('P3');
    expect($('#tf-followup').value).toBe('2026-12-01');
    expect($('#tf-action').value).toBe('Do it');
    expect($('#tf-recurrence').value).toBe('weekly');
    expect($('#tf-tags').value).toBe('a, b');
    expect($('#tf-assigned-label').textContent).toBe('Me Myself, Olive Other');
    expect($('#tf-contacts-label').textContent).toBe('Cy Contact');
    expect(within($('#mo-tf')).getByRole('button', { name: 'Escalate…' })).toBeTruthy();
    expect(within($('#mo-tf')).queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('an admin sees Delete on an existing task', () => {
    seedForm({ access: { person_code: ME, can_write: true, is_admin: true } });
    stubFetch();
    mount();
    fireEvent.click(screen.getByText('open-edit'));
    expect(within($('#mo-tf')).getByRole('button', { name: 'Delete' })).toBeTruthy();
  });

  it('the contacts and tags attached to the entity are loaded when editing', async () => {
    seedForm({ tasks: [makeTask({ id: 't1', task: 'Existing task', legacyTaskId: 55, contactName: '', tags: [] })] });
    stubFetch(async (url) => {
      if (url.includes('/entity_contacts')) return okResponse([{ contact_id: 1 }, { contact_id: 2 }]);
      if (url.includes('/entity_tags')) return okResponse([{ tag: 'x' }, { tag: 'y' }]);
    });
    mount();
    fireEvent.click(screen.getByText('open-edit'));
    await waitFor(() => expect($('#tf-contacts-label').textContent).toBe('Cy Contact, Di Other'));
    expect($('#tf-tags').value).toBe('x, y');
  });

  it('openAdd(prefill) fills a title, name, follow-up and the lead', async () => {
    seedForm();
    const f = stubFetch(async (url, init) => (init.method === 'POST' && url.includes('/rest/v1/entities') ? okResponse([{ id: 'n1', tier: 'task' }]) : undefined));
    mount({ prefill: { title: 'Add Task — Big lead', task: 'Call them', nextFollowUp: '2026-12-24', leadId: 9, contactIds: [1], contactNames: ['Cy Contact'] } });
    fireEvent.click(screen.getByText('open-add'));
    expect($('#mo-tf .mti').textContent).toBe('Add Task — Big lead');
    expect($('#tf-task-name').value).toBe('Call them');
    expect($('#tf-followup').value).toBe('2026-12-24');
    expect($('#tf-contacts-label').textContent).toBe('Cy Contact');
    setVal('#tf-company', 'Acme'); setVal('#tf-func', 'Ops');
    save();
    await waitFor(() => expect(f.writes().some((w) => w.method === 'POST' && w.url.includes('/rest/v1/entities'))).toBe(true));
    expect(f.writes().find((w) => w.url.includes('/rest/v1/entities')).body.lead_id).toBe(9);
  });
});

describe('validation (the old saveTask, before it closes the form)', () => {
  it('a name is required: status error, the form stays open, nothing is sent', () => {
    seedForm();
    const f = stubFetch();
    mount();
    fireEvent.click(screen.getByText('open-add'));
    save();
    expect(getStatus()).toMatchObject({ kind: 'error', msg: 'Task name is required' });
    expect(formOpen()).toBe(true);
    expect(f.writes()).toHaveLength(0);
  });

  it('a new task needs a company and a function', () => {
    seedForm();
    const f = stubFetch();
    mount();
    fireEvent.click(screen.getByText('open-add'));
    setVal('#tf-task-name', 'Something');
    save();
    expect(getStatus()).toMatchObject({ kind: 'error', msg: 'Company and Function are both required on a new task' });
    expect(formOpen()).toBe(true);
    setVal('#tf-company', 'Acme');
    save();
    expect(getStatus().msg).toBe('Company and Function are both required on a new task');
    expect(f.writes()).toHaveLength(0);
  });

  it('an assigned-scope user starts as owner and cannot save a task owned by someone else', () => {
    seedForm({ access: { person_code: ME, can_write: true, task_scope: 'assigned' } });
    const f = stubFetch();
    mount();
    fireEvent.click(screen.getByText('open-add'));
    expect($('#tf-assigned-label').textContent).toBe('Me Myself');
    setVal('#tf-task-name', 'Mine');
    setVal('#tf-company', 'Acme'); setVal('#tf-func', 'Ops');
    // swap the assignee to someone else
    fireEvent.click($('#tf-assigned-btn'));
    fireEvent.click(within($('#tf-assigned-drop')).getByLabelText('Me Myself'));
    fireEvent.click(within($('#tf-assigned-drop')).getByLabelText('Olive Other'));
    save();
    expect(getStatus().msg).toBe('You can only create tasks assigned to yourself. Add yourself as an assignee and try again.');
    expect(formOpen()).toBe(true);
    expect(f.writes()).toHaveLength(0);
  });

  it('the function list follows the company, and changing the company clears the function', () => {
    seedForm();
    stubFetch();
    mount();
    fireEvent.click(screen.getByText('open-add'));
    setVal('#tf-company', 'Acme');
    expect(optionTexts('#tf-func')).toEqual(['— Select —', 'Ops', 'Sales']);
    setVal('#tf-func', 'Sales');
    expect($('#tf-func').value).toBe('Sales');
    setVal('#tf-company', 'Beta');
    expect(optionTexts('#tf-func')).toEqual(['— Select —', 'Ops']);
    expect($('#tf-func').value).toBe('');
  });
});

describe('saving', () => {
  it('creating: the form closes at once, then POST entities with func, owner and co-owner rows', async () => {
    seedForm();
    let release;
    const gate = new Promise((r) => { release = r; });
    const f = stubFetch(async (url, init) => {
      if (init.method === 'POST' && url.includes('/rest/v1/entities')) {
        await gate;
        return okResponse([{ id: 'new1', tier: 'task', title: 'Brand new', status: 'pending', owner_code: ME, company: 'Acme', func: 'Ops' }]);
      }
    });
    mount();
    fireEvent.click(screen.getByText('open-add'));
    setVal('#tf-task-name', '  Brand new  ');
    setVal('#tf-company', 'Acme'); setVal('#tf-func', 'Ops');
    setVal('#tf-priority', 'P1');
    setVal('#tf-followup', '2026-12-10');
    fireEvent.click($('#tf-assigned-btn'));
    fireEvent.click(within($('#tf-assigned-drop')).getByLabelText('Me Myself'));
    fireEvent.click(within($('#tf-assigned-drop')).getByLabelText('Olive Other'));
    expect($('#tf-assigned-label').textContent).toBe('Me Myself, Olive Other');
    expect(within($('#tf-assigned-drop')).getByText('(owner)')).toBeTruthy();

    save();

    expect(formOpen()).toBe(false);                                  // closed before the write resolved
    release();
    await waitFor(() => expect(getStatus()).toMatchObject({ kind: 'online', msg: 'Task saved' }));
    const insert = f.writes().find((w) => w.method === 'POST' && w.url.includes('/rest/v1/entities'));
    expect(insert.body).toMatchObject({
      title: 'Brand new', owner_code: ME, company: 'Acme', func: 'Ops', priority: 'P1', next_follow_up: '2026-12-10', status: 'pending',
    });
    expect(f.writes().find((w) => w.url.includes('/entity_owners')).body).toEqual([{ entity_id: 'new1', person_code: 'OT1', role: 'owner', added_by: 'Me Myself' }]);
    expect(store.getState().tasks.some((t) => t.id === 'new1')).toBe(true);
  });

  it('editing: PATCH the entity and update the list; no navigation unless it came from the viewer', async () => {
    seedForm();
    const f = stubFetch();
    mount();
    fireEvent.click(screen.getByText('open-edit'));
    setVal('#tf-task-name', 'Renamed');
    setVal('#tf-status-f', 'Completed');
    save();
    expect(formOpen()).toBe(false);
    await waitFor(() => expect(getStatus().msg).toBe('Task saved'));
    const patch = f.writes().find((w) => w.method === 'PATCH' && w.url.includes('/entities?id=eq.t1'));
    expect(patch.body).toMatchObject({ title: 'Renamed', status: 'completed', company: 'Acme', func: 'Ops' });
    expect(store.getState().tasks.find((t) => t.id === 't1')).toMatchObject({ task: 'Renamed', status: 'Completed' });
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('after saving from the viewer\'s Edit it reopens the viewer (viewAfterSave)', async () => {
    seedForm();
    stubFetch();
    mount();
    fireEvent.click(screen.getByText('open-edit-from-viewer'));
    setVal('#tf-task-name', 'Changed in viewer flow');
    save();
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/work/tasks/t1'));
  });

  it('a failed save does not reopen the viewer and reports it', async () => {
    seedForm();
    stubFetch(async () => failResponse('constraint'));
    mount();
    fireEvent.click(screen.getByText('open-edit-from-viewer'));
    save();
    await waitFor(() => expect(getStatus().kind).toBe('error'));
    expect(getStatus().msg).toMatch(/^Save failed: /);
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('contacts: search, pick, and the first one becomes the primary contact', async () => {
    seedForm();
    const f = stubFetch();
    mount();
    fireEvent.click(screen.getByText('open-edit'));
    fireEvent.click($('#tf-contacts-btn'));
    expect($('#tf-contacts-drop').style.display).toBe('block');
    fireEvent.change($('#tf-contacts-search'), { target: { value: 'di o' } });
    expect(within($('#tf-contacts-options')).queryByText('Cy Contact')).toBeNull();
    fireEvent.click(within($('#tf-contacts-options')).getByLabelText(/Di Other/));
    expect($('#tf-contacts-label').textContent).toBe('Cy Contact, Di Other');
    fireEvent.click(screen.getByText('Clear', { selector: '#tf-contacts-drop span' }));
    expect($('#tf-contacts-label').textContent).toBe('+ Pick contacts');
    fireEvent.click(within($('#tf-contacts-options')).getByLabelText(/Di Other/));
    fireEvent.change($('#tf-contacts-search'), { target: { value: '' } });
    save();
    await waitFor(() => expect(f.writes().some((w) => w.method === 'PATCH' && w.url.includes('/entities?id=eq.t1'))).toBe(true));
    expect(f.writes().find((w) => w.url.includes('/entities?id=eq.t1')).body.extra).toMatchObject({ legacy_contact_name: 'Di Other', legacy_pk: '2' });
  });

  it('a dropdown closes on a click outside it', () => {
    seedForm();
    stubFetch();
    mount();
    fireEvent.click(screen.getByText('open-add'));
    fireEvent.click($('#tf-assigned-btn'));
    expect($('#tf-assigned-drop').style.display).toBe('block');
    fireEvent.click($('#tf-task-name'));
    expect($('#tf-assigned-drop').style.display).toBe('none');
  });
});

describe('closing, escalating, deleting', () => {
  it('Cancel, ✕ and the backdrop close it without writing', () => {
    seedForm();
    const f = stubFetch();
    mount();
    for (const close of [
      () => fireEvent.click(within($('#mo-tf')).getByRole('button', { name: 'Cancel' })),
      () => fireEvent.click($('#mo-tf .mx')),
      () => fireEvent.click($('#mo-tf')),
    ]) {
      fireEvent.click(screen.getByText('open-add'));
      expect(formOpen()).toBe(true);
      close();
      expect(formOpen()).toBe(false);
    }
    expect(f.writes()).toHaveLength(0);
  });

  it('Delete (admin) asks first, then deletes and closes the form', async () => {
    seedForm({ access: { person_code: ME, can_write: true, is_admin: true } });
    const f = stubFetch();
    mount();
    fireEvent.click(screen.getByText('open-edit'));
    fireEvent.click(within($('#mo-tf')).getByRole('button', { name: 'Delete' }));

    expect($('#mo-del').classList.contains('open')).toBe(true);
    expect($('#mo-del').textContent).toContain('You are about to permanently delete:');
    expect($('#mo-del').textContent).toContain('Existing task');
    expect($('#mo-del').textContent).toContain('This cannot be undone.');
    expect(f.writes()).toHaveLength(0);                                       // nothing yet

    fireEvent.click(within($('#mo-del')).getByRole('button', { name: 'Delete permanently' }));
    await waitFor(() => expect(getStatus().msg).toBe('Task deleted'));
    expect(f.writes()[0].method).toBe('DELETE');
    expect(store.getState().tasks).toHaveLength(0);
    expect(formOpen()).toBe(false);
    expect($('#mo-del').classList.contains('open')).toBe(false);
  });

  it('cancelling the delete confirmation deletes nothing', () => {
    seedForm({ access: { person_code: ME, can_write: true, is_admin: true } });
    const f = stubFetch();
    mount();
    fireEvent.click(screen.getByText('open-edit'));
    fireEvent.click(within($('#mo-tf')).getByRole('button', { name: 'Delete' }));
    fireEvent.click(within($('#mo-del')).getByRole('button', { name: 'Cancel' }));
    expect($('#mo-del').classList.contains('open')).toBe(false);
    expect(f.writes()).toHaveLength(0);
    expect(formOpen()).toBe(true);
  });
});

describe('opened from the header\'s New menu', () => {
  it('New > Task opens the same form (no no-op left behind)', () => {
    seedForm();
    stubFetch();
    render(
      <TaskFormProvider>
        <Header session={{ displayName: 'Pat Example', email: 'pat@example.com' }} onSignOut={() => {}} />
      </TaskFormProvider>,
    );
    expect(formOpen()).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /New/ }));
    fireEvent.click(within($('#new-menu')).getByRole('button', { name: 'Task' }));
    expect(formOpen()).toBe(true);
    expect($('#mo-tf .mti').textContent).toBe('Add Task');
  });
});
