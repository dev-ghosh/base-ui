// Team: the directory as cards and as a table (sub-view routes, filters as search params), the
// empty / missing / error states, the employee dialog with the person's open work (each row opens
// the task view), admin-only add / edit / delete / import with the exact payloads, and the people
// who may not write. The real team-actions / rest.js run; only fetch is stubbed. Expected values
// are worked out by hand from rie-dashboard2/js/team.js.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor, screen, within } from '@testing-library/react';

process.env.NEXT_PUBLIC_SB_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SB_KEY = 'anon-key-123';

vi.mock('next/navigation', async () => {
  const base = (await import('./helpers/fake-router.js')).navigationMock;
  return {
    ...base,
    useSelectedLayoutSegment: () => base.usePathname().split('/')[2] ?? null,
  };
});
vi.mock('next/link', async () => (await import('./helpers/fake-router.js')).linkMock);

import TeamLayout from '@/app/(app)/team/layout.jsx';
import CardsPage from '@/app/(app)/team/cards/page.jsx';
import TeamIndex from '@/app/(app)/team/page.jsx';
import { store } from '@/store/store.js';
import { getStatus } from '@/lib/status.js';
import { saveEmployee } from '@/lib/team-actions.js';
import { seed, makeTask, stubFetch, okResponse, failResponse, todayISO } from './helpers/fixtures.js';
import { history, resetNav, currentUrl } from './helpers/fake-router.js';

const READ_ONLY = 'You have view-only access to BASE, so this change was not saved.';
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const ADMIN = { person_code: 'ME1', can_write: true, is_admin: true, email: 'me@x.test' };
const EDITOR = { person_code: 'ME1', can_write: true, is_admin: false };
const VIEWER = { person_code: 'ME1', can_write: false, is_admin: false };

const emp = (o = {}) => ({
  id: 1, full_name: 'Asha Rao', designation: 'Designer', department: 'Design', company: 'Acme', status: 'active',
  employment_type: 'full_time', work_email: 'asha@x.test', phone: '99', location: 'Pune', person_code: null, manager_code: null,
  joined_on: null, birthday: null, exited_on: null, ...o,
});
const EMPS = [
  emp({ id: 1, person_code: 'ME1', manager_code: 'OT1' }),
  emp({ id: 2, full_name: 'Ben Cole', designation: 'Engineer', department: 'Engineering', company: 'Beta', status: 'on_leave', work_email: 'ben@x.test', phone: '', location: '', person_code: 'OT1' }),
  emp({ id: 3, full_name: 'Cy Dunn', designation: '', department: 'Engineering', company: 'Acme', status: 'exited', work_email: null, phone: null, location: null }),
];

function setup({ url = '/team/cards', employees = EMPS, access = EDITOR, tasks = [], handler, loaded = true, ...rest } = {}) {
  seed({ employees, teamLoaded: loaded, tasks, access, ...rest });
  resetNav(url);
  localStorage.clear();
  return stubFetch(handler);
}
const mount = () => render(<TeamLayout><CardsPage /></TeamLayout>);
const names = () => $$('.emp .emp-id b, #team-body tbody .cell-main').map((e) => e.textContent);
const bodyOf = (calls, method, part) => calls.find((c) => c.method === method && c.url.includes(part))?.body;

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-10T12:00:00')); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('states', () => {
  it('shows the empty state with an empty directory (non-admin: nobody added yet, no import button)', () => {
    setup({ employees: [] });
    mount();
    expect(screen.getByText('No employees yet')).toBeTruthy();
    expect(screen.getByText('Nobody has been added yet.')).toBeTruthy();
    expect(screen.queryByText('Import from people')).toBeNull();
    expect(screen.queryByText('Add employee')).toBeNull();
  });

  it('offers an admin the import and the add button on an empty directory', () => {
    setup({ employees: [], access: ADMIN });
    mount();
    expect(screen.getByText('Add the first one, or import everyone who already has a sign-in.')).toBeTruthy();
    expect(screen.getAllByText('Import from people')).toHaveLength(2);   // header + empty card
    expect(screen.getByText('Add employee')).toBeTruthy();
  });

  it('loads on first use: "Loading team…", then the directory (one GET)', async () => {
    const net = setup({ loaded: false, employees: [], handler: (url) => (url.includes('/employees?') ? okResponse(EMPS) : undefined) });
    mount();
    expect(screen.getByText('Loading team…')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Asha Rao')).toBeTruthy());
    const gets = net.calls().filter((c) => c.url.includes('/rest/v1/employees'));
    expect(gets).toHaveLength(1);
    expect(gets[0].url).toContain('order=full_name.asc&limit=1000');
    expect(store.getState().teamLoaded).toBe(true);
  });

  it('says the migration is missing on a 404', async () => {
    setup({ loaded: false, employees: [], handler: () => failResponse('', 404) });
    mount();
    await waitFor(() => expect(screen.getByText('The team directory is not set up yet')).toBeTruthy());
    expect(screen.getByText('An admin needs to apply the database migration 20261011_expenses_team.sql, then refresh.')).toBeTruthy();
  });

  it('shows another failure with Try again, which loads again', async () => {
    let fail = true;
    setup({ loaded: false, employees: [], handler: (url) => (url.includes('/employees?') ? (fail ? failResponse('x', 500) : okResponse(EMPS)) : undefined) });
    mount();
    await waitFor(() => expect(screen.getByText('Could not load the team')).toBeTruthy());
    expect(screen.getByText('GET employees failed: 500')).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByText('Try again'));
    await waitFor(() => expect(screen.getByText('Asha Rao')).toBeTruthy());
  });

  it('is emptied on sign-out (the lists of one person never reach the next)', async () => {
    setup();
    const { onSessionEnded } = await import('@/lib/user-data.js');
    onSessionEnded();
    const s = store.getState();
    expect(s.employees).toEqual([]);
    expect(s.teamLoaded).toBe(false);
    expect(s.expenses).toEqual([]);
    expect(s.cards).toEqual([]);
  });
});

describe('cards and table', () => {
  it('lists the active people by default (status Active is the default filter), with the stat tiles', () => {
    setup();
    mount();
    expect(names()).toEqual(['Asha Rao']);
    const tiles = $$('.stat').map((t) => [$('.stat-l', t).textContent, $('.stat-v', t).textContent, $('.stat-s', t).textContent]);
    expect(tiles).toEqual([
      ['Headcount', '1', '3 on record'],
      ['Departments', '2', 'Design, Engineering'],
      ['On leave / notice', '1', 'right now'],
      ['Overdue across the team', '0', 'open tasks past their date'],
    ]);
  });

  it('"Any status" shows everyone; the choice is in the URL as status=any', () => {
    setup();
    mount();
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: '' } });
    expect(currentUrl()).toBe('/team/cards?status=any');
    expect(names()).toEqual(['Asha Rao', 'Ben Cole', 'Cy Dunn']);
  });

  it('reads department, company and status from the URL', () => {
    setup({ url: '/team/cards?status=any&dept=Engineering&company=Acme' });
    mount();
    expect(names()).toEqual(['Cy Dunn']);
    expect(screen.getByLabelText('Department').value).toBe('Engineering');
  });

  it('says nobody matches, and hides the company filter when no one has a company', () => {
    setup({ url: '/team/cards?q=zzz' });
    mount();
    expect(screen.getByText('Nobody matches')).toBeTruthy();
    cleanup();
    setup({ employees: EMPS.map((e) => ({ ...e, company: null })) });
    mount();
    expect(screen.queryByLabelText('Company')).toBeNull();
  });

  it('filters as you type and writes q= after a pause', async () => {
    setup({ url: '/team/cards?status=any' });
    mount();
    fireEvent.change(screen.getByLabelText('Search the team'), { target: { value: 'ben' } });
    expect(names()).toEqual(['Ben Cole']);
    await waitFor(() => expect(currentUrl()).toBe('/team/cards?q=ben&status=any'));
  });

  it('shows each person\'s work: counts, overdue and due this week; "Not linked to a sign-in" without a code', () => {
    const tasks = [
      makeTask({ id: 't1', ownerCode: 'ME1', nextFollowUp: todayISO(-3) }),
      makeTask({ id: 't2', ownerCode: 'ME1', nextFollowUp: todayISO(2) }),
      makeTask({ id: 't3', ownerCode: 'ME1', status: 'Completed', nextFollowUp: todayISO(-9) }),
    ];
    setup({ url: '/team/cards?status=any', tasks });
    mount();
    const cards = $$('.emp');
    expect(cards[0].querySelector('.emp-work').textContent).toBe('2 open · 1 overdue · 1 due this week');
    expect(cards[2].querySelector('.emp-work').textContent).toBe('Not linked to a sign-in');
    expect($$('.stat-v')[3].textContent).toBe('1');
  });

  it('the Table button goes to /team/table keeping the filters, and remembers the choice (rie_team_view)', () => {
    setup({ url: '/team/cards?status=any&dept=Engineering' });
    mount();
    expect(localStorage.getItem('rie_team_view')).toBe('grid');
    fireEvent.click(screen.getByText('Table'));
    expect(history.at(-1)).toEqual({ kind: 'push', href: '/team/table?dept=Engineering&status=any' });
  });

  it('draws the table at /team/table, with Reports to by name and the Table button on', () => {
    setup({ url: '/team/table?status=any' });
    mount();
    expect($$('thead th').map((t) => t.textContent)).toEqual(['Name', 'Role', 'Department', 'Reports to', 'Work', 'Contact', 'Status']);
    const row = $$('tbody tr')[0];
    expect(within(row).getByText('Olive Other')).toBeTruthy();       // manager_code OT1 -> display name
    expect($$('tbody tr')).toHaveLength(3);
    expect($('.seg button.on').textContent).toBe('Table');
    expect(localStorage.getItem('rie_team_view')).toBe('table');
  });

  it('/team goes to the Cards view, or to the Table when that was the last choice', () => {
    setup({ url: '/team' });
    render(<TeamIndex />);
    expect(history.at(-1)).toEqual({ kind: 'replace', href: '/team/cards' });
    cleanup();
    setup({ url: '/team' });
    localStorage.setItem('rie_team_view', 'table');
    render(<TeamIndex />);
    expect(history.at(-1)).toEqual({ kind: 'replace', href: '/team/table' });
  });

  it('draws nothing at /team itself (only the index page forwards)', () => {
    setup({ url: '/team' });
    const { container } = render(<TeamLayout><div>child</div></TeamLayout>);
    expect(container.textContent).toBe('child');
  });
});

describe('the employee dialog', () => {
  const openAsha = () => fireEvent.click($$('.emp')[0]);

  it('shows the details, the direct reports and the open work, due soonest first', () => {
    const tasks = [
      makeTask({ id: 'late', task: 'Late one', ownerCode: 'ME1', nextFollowUp: todayISO(-2), priority: 'P1' }),
      makeTask({ id: 'nodate', task: 'No date', ownerCode: 'ME1', nextFollowUp: '', priority: '' }),
      makeTask({ id: 'soon', task: 'Soon', ownerCode: 'ME1', nextFollowUp: todayISO(3), priority: '' }),
    ];
    setup({ tasks, employees: [...EMPS, emp({ id: 4, full_name: 'Dee Ford', manager_code: 'ME1' })] });
    mount();
    openAsha();
    const dlg = $('#mo-dyn');
    expect(dlg.classList.contains('open')).toBe(true);
    expect($('.mti', dlg).textContent).toBe('Asha Rao');
    const kv = Object.fromEntries($$('.kv', dlg).map((k) => [k.firstChild.textContent, k.lastChild.textContent]));
    expect(kv['Work e-mail']).toBe('asha@x.test');
    expect(kv['Reports to']).toBe('Olive Other');
    expect(kv['Direct reports']).toBe('Dee Ford');
    expect(kv['Linked sign-in']).toBe('Me Myself');
    expect(kv.Joined).toBe('—');
    expect(kv.Birthday).toBe('—');
    expect($('.emp-work-sec .priv-h', dlg).textContent).toBe('Open work 3 open · 1 overdue');
    expect($$('.emp-task', dlg).map((b) => b.textContent)).toEqual(['Late one' + fmt(-2) + ' · P1', 'Soon' + fmt(3), 'No dateNo date']);
    expect($('.emp-task-m.emp-od', dlg)).toBeTruthy();
    // an editor sees no personal block and no Edit button
    expect($('#emp-priv')).toBeNull();
    expect(within(dlg).queryByText('Edit')).toBeNull();
  });

  function fmt(offset) {
    const d = new Date(`${todayISO(offset)}T00:00:00`);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : '2-digit' });
  }

  it('a task row closes the dialog and opens the task view at /work/tasks/[id]', () => {
    setup({ tasks: [makeTask({ id: 'abc-1', task: 'Do it', ownerCode: 'ME1' })] });
    mount();
    openAsha();
    fireEvent.click($('.emp-task'));
    expect(history.at(-1)).toEqual({ kind: 'push', href: '/work/tasks/abc-1' });
    expect($('#mo-dyn')).toBeNull();
  });

  it('says so when nothing is open, and shows no work block at all for an unlinked person', () => {
    setup({ url: '/team/cards?status=any' });
    mount();
    openAsha();
    expect(screen.getByText('Nothing open right now.')).toBeTruthy();
    fireEvent.click(screen.getByText('Close'));
    fireEvent.click($$('.emp')[2]);
    expect($('.emp-work-sec')).toBeNull();
  });

  it('shows an admin the personal block, read from employee_private', async () => {
    const net = setup({
      access: ADMIN,
      handler: (url) => (url.includes('/employee_private') ? okResponse([{ personal_email: 'asha@home.test', emergency_name: 'Mum', notes: 'Likes tea' }]) : undefined),
    });
    mount();
    openAsha();
    expect($('#emp-priv').textContent).toContain('Loading…');
    await waitFor(() => expect(screen.getByText('asha@home.test')).toBeTruthy());
    expect(screen.getByText('Likes tea')).toBeTruthy();
    expect(net.calls().find((c) => c.url.includes('/employee_private'))?.url).toContain('employee_id=eq.1');
    expect(screen.getByText('Edit')).toBeTruthy();
  });

  it('keeps "Loading…" and adds the reason when the personal block cannot be read', async () => {
    setup({ access: ADMIN, handler: (url) => (url.includes('/employee_private') ? failResponse('x', 500) : undefined) });
    mount();
    openAsha();
    await waitFor(() => expect(screen.getByText('Could not load: GET employee_private failed: 500')).toBeTruthy());
    expect($('#emp-priv').textContent).toContain('Loading…');
  });
});

describe('admin writes', () => {
  const fill = (id, value) => fireEvent.change(document.getElementById(id), { target: { value } });

  it('adds an employee: POST employees, then the private row, with the old payloads', async () => {
    const row = { id: 77, full_name: 'Dee Ford', status: 'active' };
    const net = setup({
      access: ADMIN, employees: [],
      handler: (url, init) => {
        if (url.includes('/rest/v1/employees') && init.method === 'POST') return okResponse([row]);
        if (url.includes('employee_private')) return okResponse([]);
        return undefined;
      },
    });
    mount();
    fireEvent.click(screen.getByText('Add employee', { selector: 'header button' }));
    const dlg = await waitFor(() => { const d = $('#mo-dyn.open'); expect(d).toBeTruthy(); return d; });
    expect($('.mti', dlg).textContent).toBe('Add employee');
    fireEvent.click(within(dlg).getByText('Add employee', { selector: '.mf button' }));
    expect($('#emp-err').textContent).toBe('Enter the employee’s name.');
    expect(net.writes()).toHaveLength(0);

    fill('f-full_name', '  Dee Ford ');
    fill('f-department', 'Ops');
    fill('f-notes', 'new joiner');
    fireEvent.click(within(dlg).getByText('Add employee', { selector: '.mf button' }));
    await waitFor(() => expect(net.writes()).toHaveLength(2));
    const [w1, w2] = net.writes();
    expect(w1.method).toBe('POST');
    expect(w1.url).toBe('https://example.supabase.co/rest/v1/employees');
    expect(w1.body).toEqual({
      full_name: 'Dee Ford', designation: null, work_email: null, phone: null, department: 'Ops', company: null,
      employment_type: 'full_time', status: 'active', manager_code: null, person_code: null, location: null,
      joined_on: null, exited_on: null, birthday: null,
    });
    expect(w2.url).toBe('https://example.supabase.co/rest/v1/employee_private?on_conflict=employee_id');
    expect(w2.body).toEqual({
      employee_id: 77, personal_email: null, personal_phone: null, emergency_name: null, emergency_phone: null, address: null, notes: 'new joiner',
    });
    const call = net.fn.mock.calls.find(([u]) => String(u).includes('employee_private'));
    expect(call[1].headers.Prefer).toBe('resolution=merge-duplicates,return=minimal');
    await waitFor(() => expect($('#mo-dyn')).toBeNull());
    expect(store.getState().employees.map((e) => e.full_name)).toEqual(['Dee Ford']);
    expect(getStatus().msg).toBe('Employee added');
  });

  it('edits an employee: PATCH employees?id=eq.N, the dialog opens with the private row filled in', async () => {
    const net = setup({
      access: ADMIN,
      handler: (url, init) => {
        if (url.includes('employee_private') && init.method === 'GET') return okResponse([{ notes: 'old note' }]);
        if (init.method === 'PATCH') return okResponse([{ id: 1, full_name: 'Asha R. Rao' }]);
        return undefined;
      },
    });
    mount();
    fireEvent.click($$('.emp')[0]);
    await waitFor(() => expect(screen.getByText('Edit')).toBeTruthy());
    fireEvent.click(screen.getByText('Edit'));
    await waitFor(() => expect($('.mti').textContent).toBe('Edit Asha Rao'));
    expect(document.getElementById('f-notes').value).toBe('old note');
    expect(document.getElementById('f-full_name').value).toBe('Asha Rao');
    fill('f-full_name', 'Asha R. Rao');
    fireEvent.click(screen.getByText('Save changes'));
    await waitFor(() => expect(net.writes()).toHaveLength(2));
    const patch = net.writes()[0];
    expect(patch.method).toBe('PATCH');
    expect(patch.url).toBe('https://example.supabase.co/rest/v1/employees?id=eq.1');
    expect(patch.body.full_name).toBe('Asha R. Rao');
    expect(patch.body.person_code).toBe('ME1');
    expect(patch.body.manager_code).toBe('OT1');
    await waitFor(() => expect(store.getState().employees[0].full_name).toBe('Asha R. Rao'));
    expect(getStatus().msg).toBe('Employee updated');
  });

  it('a duplicate sign-in link is told in a sentence, and the dialog stays open', async () => {
    setup({
      access: ADMIN, employees: [],
      handler: (url, init) => (init.method === 'POST' ? failResponse('duplicate key value violates unique constraint person_code', 409) : undefined),
    });
    mount();
    fireEvent.click(screen.getByText('Add employee', { selector: 'header button' }));
    await waitFor(() => expect($('#mo-dyn.open')).toBeTruthy());
    fill('f-full_name', 'X');
    fireEvent.click(screen.getByText('Add employee', { selector: '.mf button' }));
    await waitFor(() => expect($('#emp-err').textContent).toBe('That sign-in is already linked to another employee.'));
    expect($('#mo-dyn.open')).toBeTruthy();
  });

  it('the Linked sign-in choices leave out people already linked to someone else', async () => {
    setup({ access: ADMIN });
    mount();
    fireEvent.click(screen.getByText('Add employee', { selector: 'header button' }));
    await waitFor(() => expect($('#mo-dyn.open')).toBeTruthy());
    // ME1 and OT1 are both linked to employees already
    expect($$('#f-person_code option').map((o) => o.textContent)).toEqual(['Not linked']);
    expect($$('#f-manager_code option').map((o) => o.textContent)).toEqual(['No one', 'Me Myself', 'Olive Other']);
  });

  it('deletes after confirming, with the old sentence', async () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    const net = setup({ access: ADMIN, handler: (url, init) => (init.method === 'DELETE' ? okResponse([{ id: 1 }]) : url.includes('employee_private') ? okResponse([]) : undefined) });
    mount();
    fireEvent.click($$('.emp')[0]);
    await waitFor(() => expect(screen.getByText('Edit')).toBeTruthy());
    fireEvent.click(screen.getByText('Edit'));
    await waitFor(() => expect(screen.getByText('Delete')).toBeTruthy());
    fireEvent.click(screen.getByText('Delete'));
    expect(confirm).toHaveBeenCalledWith('Delete Asha Rao? Their personal details are deleted too. To keep a record, set their status to Exited instead.');
    await waitFor(() => expect(net.writes()).toHaveLength(1));
    expect(net.writes()[0].method).toBe('DELETE');
    expect(net.writes()[0].url).toContain('/rest/v1/employees?id=eq.1');
    await waitFor(() => expect(store.getState().employees.map((e) => e.id)).toEqual([2, 3]));
    expect(getStatus().msg).toBe('Employee deleted');
  });

  it('does not delete when the confirmation is declined', async () => {
    vi.stubGlobal('confirm', () => false);
    const net = setup({ access: ADMIN, handler: (url) => (url.includes('employee_private') ? okResponse([]) : undefined) });
    mount();
    fireEvent.click($$('.emp')[0]);
    await waitFor(() => expect(screen.getByText('Edit')).toBeTruthy());
    fireEvent.click(screen.getByText('Edit'));
    await waitFor(() => expect(screen.getByText('Delete')).toBeTruthy());
    fireEvent.click(screen.getByText('Delete'));
    expect(net.writes()).toHaveLength(0);
  });

  it('imports everyone with a sign-in who has no record yet (active e-mail preferred), one POST', async () => {
    const net = setup({
      access: ADMIN, employees: [emp({ id: 1, person_code: 'ME1' })],
      people: [
        { code: 'ME1', display_name: 'Me Myself', is_internal: true },
        { code: 'OT1', display_name: 'Olive Other', is_internal: true },
        { code: 'AU1', display_name: 'An Automation', is_internal: true },
      ],
      handler: (url, init) => {
        if (url.includes('rie_allowed_users')) return okResponse([
          { email: 'old@x.test', person_code: 'OT1', active: false }, { email: 'new@x.test', person_code: 'OT1', active: true },
          { email: 'me@x.test', person_code: 'ME1', active: true },
        ]);
        if (init.method === 'POST') return okResponse([{ id: 5, person_code: 'OT1', full_name: 'Olive Other' }]);
        return undefined;
      },
    });
    mount();
    fireEvent.click(screen.getByText('Import from people'));
    await waitFor(() => expect(net.writes()).toHaveLength(1));
    expect(net.writes()[0].body).toEqual([{ person_code: 'OT1', full_name: 'Olive Other', work_email: 'new@x.test' }]);
    await waitFor(() => expect(getStatus().msg).toBe('Added 1 person. Fill in their details next.'));
    expect(store.getState().employees).toHaveLength(2);
  });

  it('says so when everyone already has a record (no write)', async () => {
    const net = setup({
      access: ADMIN, employees: [emp({ id: 1, person_code: 'ME1' }), emp({ id: 2, person_code: 'OT1' })],
      handler: (url) => (url.includes('rie_allowed_users') ? okResponse([]) : undefined),
    });
    mount();
    fireEvent.click(screen.getByText('Import from people'));
    await waitFor(() => expect(getStatus().msg).toBe('Everyone with a sign-in already has an employee record.'));
    expect(net.writes()).toHaveLength(0);
  });
});

describe('people who may not write', () => {
  it('an editor and a viewer see no admin buttons; no personal data is requested', () => {
    for (const access of [EDITOR, VIEWER]) {
      const net = setup({ access });
      mount();
      expect(screen.queryByText('Add employee')).toBeNull();
      expect(screen.queryByText('Import from people')).toBeNull();
      fireEvent.click($$('.emp')[0]);
      expect(net.calls().filter((c) => c.url.includes('employee_private'))).toHaveLength(0);
      cleanup();
    }
  });

  it('a view-only user\'s write is refused with the view-only sentence, before any request', async () => {
    const net = setup({ access: VIEWER });
    await expect(saveEmployee(null, { full_name: 'X' }, {})).rejects.toThrow(READ_ONLY);
    expect(net.fn).not.toHaveBeenCalled();
  });
});
