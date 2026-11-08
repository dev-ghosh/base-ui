// Access admin overlay (mo-access): the admin-only sidebar item "Manage access" opens it; list of people
// with role / scope / extras / person / companies controls; add a person; every write matches the old
// payloads; a non-admin gets no item and cannot open it. The real rest layer runs; only fetch is stubbed.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, act, within, waitFor } from '@testing-library/react';

process.env.NEXT_PUBLIC_SB_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SB_KEY = 'anon-key-123';

vi.mock('next/navigation', async () => (await import('./helpers/fake-router.js')).navigationMock);
vi.mock('next/link', async () => (await import('./helpers/fake-router.js')).linkMock);

import { Sidebar } from '@/components';
import AccessModal from '@/features/access/AccessModal.jsx';
import { useAccessAdmin } from '@/features/access/hooks/useAccessAdmin.js';
import { openAccess } from '@/lib/access-admin.js';
import { isMoOpen, openMo } from '@/lib/modals.js';
import { getStatus } from '@/lib/status.js';
import { store } from '@/store/store.js';
import { seed, stubFetch, okResponse, failResponse, makeTask } from './helpers/fixtures.js';
import { history, resetNav } from './helpers/fake-router.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const SESSION = { email: 'a@x.test', displayName: 'Ada Admin' };
const BASE = 'https://example.supabase.co/rest/v1/';

const ME = { email: 'a@x.test', display_name: 'Ada Admin', role: 'admin', active: true, task_scope: 'all', extra_access: [], person_code: 'ME1', companies: null, last_sign_in_at: new Date().toISOString() };
const BOB = { email: 'bob@x.test', display_name: 'Bob', role: 'member', active: true, task_scope: 'assigned', extra_access: ['leads'], person_code: 'OT1', companies: ['Acme'], last_sign_in_at: null };
const CAT = { email: 'cat@x.test', display_name: 'Cat', role: 'viewer', active: false, task_scope: 'all', extra_access: [], person_code: null, companies: null, last_sign_in_at: null };
const ZED = { email: 'zed@x.test', display_name: 'Zed', role: 'member', active: true, task_scope: 'all', extra_access: [], person_code: null, companies: null, last_sign_in_at: null };

let data;
const handler = (url, init) => {
  const path = url.replace(BASE, '');
  if (init.method === 'GET' || init.method === 'POST' && path.startsWith('rpc/')) {
    if (path.startsWith('v_rie_access')) return okResponse(data.rows);
    if (path === 'rpc/rie_companies') return okResponse(data.companies);
    if (path.startsWith('people')) return okResponse(data.people);
  }
  return undefined;
};
const stub = (extra) => stubFetch((url, init) => extra?.(url, init) ?? handler(url, init));

const ADMIN_ACCESS = { email: 'a@x.test', display_name: 'Ada Admin', role: 'admin', can_write: true, is_admin: true, person_code: 'ME1' };
function mount({ access = ADMIN_ACCESS, rows = [ME, BOB, CAT], tasks = [] } = {}) {
  data = { rows, companies: [{ company: 'Acme' }, { company: 'Beta' }], people: [{ code: 'ME1', display_name: 'Ada Admin', is_internal: true }, { code: 'OT1', display_name: 'Olive Other', is_internal: true }] };
  seed({ access, tasks });
  resetNav('/today');
  window.matchMedia = vi.fn((q) => ({ matches: q.includes('min-width: 1024px'), media: q, addEventListener() {}, removeEventListener() {} }));
  return render(<><Sidebar session={SESSION} /><AccessModal /></>);
}
const openFromSidebar = async () => {
  await act(async () => { fireEvent.click($$('#side .nv').find((b) => $('.nv-t', b).textContent === 'Manage access')); });
  await waitFor(() => expect($('#access-body .ax-loading')).toBeNull());
};
const rowOf = (email) => $$('.ax-row').find((r) => $('.ax-mail', r).textContent === email);
const writes = (f) => f.writes().filter((w) => !w.url.includes('/rpc/'));   // rie_companies is a POST too
const patches = (f) => writes(f).filter((w) => w.method === 'PATCH');
const click = async (el) => { await act(async () => { fireEvent.click(el); }); };

beforeEach(() => { localStorage.setItem('rie_session', JSON.stringify({ accessToken: 'jwt', userId: 'u1' })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('who can open it', () => {
  it('the sidebar has the admin section and the "Manage access" item for an admin, and clicking it opens the overlay (not a route)', async () => {
    stub();
    mount();
    expect($('#side .side-sec.nv-admin').textContent).toBe('Admin');
    expect($('#mo-access').className).not.toContain('open');
    await openFromSidebar();
    expect($('#mo-access').className).toContain('open');
    expect($('#mo-access .mti').textContent).toBe('Access');
    expect($('#mo-access .ax-lede').textContent).toContain('Everyone here signs in with their email address.');
    expect(history).toEqual([]);
  });

  it('a non-admin has no such item, and openAccess() refuses them', async () => {
    const f = stub();
    mount({ access: { ...ADMIN_ACCESS, role: 'member', is_admin: false } });
    expect($$('#side .nv').some((b) => $('.nv-t', b).textContent === 'Manage access')).toBe(false);
    expect($('#side .nv-admin')).toBeNull();
    expect(openAccess()).toBe(false);
    expect(isMoOpen('mo-access')).toBe(false);
    expect(f.calls()).toHaveLength(0);
  });

  it('even if the overlay is forced open, a non-admin sees only the sentence and nothing is read', async () => {
    const f = stub();
    mount({ access: { ...ADMIN_ACCESS, role: 'viewer', is_admin: false } });
    act(() => openMo('mo-access'));
    expect($('#mo-access .ax-hint').textContent).toBe('Only an admin can change who has access. You are signed in as Viewer.');
    expect($('#access-body')).toBeNull();
    expect(f.calls().filter((c) => c.url.includes('rie_allowed') || c.url.includes('v_rie_access'))).toHaveLength(0);
  });

  it('closes with the ✕ and the backdrop', async () => {
    stub();
    mount();
    await openFromSidebar();
    await click($('#mo-access .mx'));
    expect(isMoOpen('mo-access')).toBe(false);
    await openFromSidebar();
    await click($('#mo-access'));
    expect(isMoOpen('mo-access')).toBe(false);
  });
});

describe('the list', () => {
  it('reads v_rie_access, rie_companies and people when it opens, and says Loading… meanwhile', async () => {
    const f = stub();
    mount();
    act(() => { openAccess(); });
    expect($('#access-body .ax-loading').textContent).toBe('Loading…');
    await waitFor(() => expect($('.ax-list')).not.toBeNull());
    const paths = f.calls().map((c) => c.url.replace(BASE, ''));
    expect(paths).toContain('v_rie_access?order=active.desc,role.asc,display_name.asc');
    expect(paths).toContain('rpc/rie_companies');
    expect(paths).toContain('people?archived_at=is.null&order=code.asc');
  });

  it('counts the people, lists the revoked ones apart, and marks the signed-in row', async () => {
    stub();
    mount();
    await openFromSidebar();
    expect($$('.msl').map((e) => e.textContent)).toEqual(['Give someone access', '2 people with access', 'Revoked']);
    expect($$('.ax-list')[0].querySelectorAll('.ax-row')).toHaveLength(2);
    expect($$('.ax-list')[1].querySelectorAll('.ax-row')).toHaveLength(1);
    expect(rowOf('cat@x.test').className).toContain('off');
    expect($('.ax-seen', rowOf('cat@x.test')).textContent).toBe('Access revoked');
    expect($('.ax-seen', rowOf('bob@x.test')).textContent).toBe('Never signed in');
    expect($('.ax-seen', rowOf('a@x.test')).textContent).toBe('Seen today');
    expect($('.ax-you', rowOf('a@x.test')).textContent).toBe('you');
    expect($('.ax-av', rowOf('bob@x.test')).textContent).toBe('B');
    expect($('.ax-legend').textContent).toContain('Admin Can change what they see, and can manage who else has access.');
    expect($('.ax-legend').textContent).toContain('Assigned only Sees only tasks assigned to them');
    expect($('.ax-legend-note').textContent).toContain('Revoking someone does not delete anything they created.');
  });

  it('locks your own row and the last admin; the others are editable', async () => {
    stub();
    mount();
    await openFromSidebar();
    const me = rowOf('a@x.test');
    expect($$('.ax-roles:not(.ax-scopes) button', me).every((b) => b.disabled)).toBe(true);
    expect($('.ax-roles button', me).title).toBe('You cannot change your own role');
    expect($('.ax-locked', me).title).toBe('You cannot change your own role');
    expect($('.ax-revoke', me)).toBeNull();
    expect($$('.ax-scopes button, .ax-co', me).every((b) => b.disabled)).toBe(true);
    expect($('.ax-person', me).disabled).toBe(true);
    expect($('.ax-co', me).title).toBe('You cannot change your own access');
    const bob = rowOf('bob@x.test');
    expect($$('.ax-roles:not(.ax-scopes) button', bob).map((b) => b.disabled)).toEqual([false, false, false]);
    expect($$('.ax-roles:not(.ax-scopes) button', bob).map((b) => b.className.includes('on'))).toEqual([false, true, false]);
    expect($('.ax-revoke', bob)).not.toBeNull();
    expect($('.ax-restore', rowOf('cat@x.test'))).not.toBeNull();
  });

  it('another admin can be revoked, but the only admin cannot: "BASE must keep at least one admin"', async () => {
    stub();
    mount({ rows: [{ ...ME, email: 'zed@x.test', display_name: 'Zed' }, { ...ME, email: 'a@x.test' }] });
    await openFromSidebar();
    expect($('.ax-revoke', rowOf('zed@x.test'))).not.toBeNull();
    cleanup();
    stub();
    mount({ rows: [{ ...ME, email: 'zed@x.test', display_name: 'Zed' }, { ...BOB }], access: { ...ADMIN_ACCESS, email: 'a@x.test' } });
    await openFromSidebar();
    const zed = rowOf('zed@x.test');
    expect($('.ax-locked', zed).title).toBe('BASE must keep at least one admin');
    expect($('.ax-roles button', zed).title).toBe('BASE must keep at least one admin');
    expect($('.ax-roles button', zed).disabled).toBe(true);
  });

  it('shows scope, the extras of an assigned-only person, the person picker (from the data) and the open count', async () => {
    stub();
    mount({ tasks: [makeTask({ ownerCode: 'OT1' }), makeTask({ ownerCode: 'ME1', coOwnerCodes: ['OT1'] }), makeTask({ ownerCode: 'OT1', status: 'Completed' })] });
    await openFromSidebar();
    const bob = rowOf('bob@x.test');
    expect($$('.ax-scopes button', bob).map((b) => b.textContent)).toEqual(['All tasks', 'Assigned only']);
    expect($$('.ax-scopes button', bob).map((b) => b.className.includes('on'))).toEqual([false, true]);
    expect($$('.ax-co', bob).filter((b) => ['Contacts', 'Leads', 'Events'].includes(b.textContent)).map((b) => `${b.textContent}:${b.className.includes('on')}`)).toEqual(['Contacts:false', 'Leads:true', 'Events:false']);
    expect($('.ax-person', bob).value).toBe('OT1');
    expect($$('.ax-person option', bob).map((o) => o.textContent)).toEqual(['nobody', 'Ada Admin', 'Olive Other']);
    expect($('.ax-count', bob).textContent).toBe('2 open');
    expect($('.ax-count', rowOf('cat@x.test'))).toBeNull();            // not linked: no count
    expect($$('.ax-cos-label', rowOf('a@x.test')).map((l) => l.textContent)).toEqual(['Sees', 'as', 'Companies']);   // all-scope: no "plus"
  });

  it('shows the companies from the data: only the person\'s on, "all" when unrestricted', async () => {
    stub();
    mount();
    await openFromSidebar();
    const co = (row) => $$('.ax-cos:not(.ax-scope-row) .ax-co', row).map((b) => `${b.textContent}:${b.className.includes('on')}`);
    expect(co(rowOf('bob@x.test'))).toEqual(['Acme:true', 'Beta:false']);
    expect(co(rowOf('cat@x.test'))).toEqual(['Acme:true', 'Beta:true']);
    expect($('.ax-co-all', rowOf('cat@x.test')).textContent).toBe('all');
    expect($('.ax-co-all', rowOf('bob@x.test'))).toBeNull();
    expect($$('.ax-cos:not(.ax-scope-row) .ax-co', rowOf('bob@x.test'))[1].title).toBe('Show Beta');
    expect($$('.ax-cos:not(.ax-scope-row) .ax-co', rowOf('bob@x.test'))[0].title).toBe('Hide Acme from Bob');
  });
});

describe('writes: same requests as the old Access page', () => {
  it('role: PATCH rie_allowed_users?email=eq.<email> {role}, then re-reads and says so', async () => {
    const f = stub();
    mount();
    await openFromSidebar();
    f.fn.mockClear();
    await click(within(rowOf('bob@x.test')).getByRole('button', { name: 'Viewer' }));
    const p = patches(f);
    expect(p).toHaveLength(1);
    expect(p[0].url).toBe(BASE + 'rie_allowed_users?email=eq.bob%40x.test');
    expect(p[0].body).toEqual({ role: 'viewer' });
    expect(getStatus().msg).toBe('bob@x.test is now Viewer');
    expect(f.calls().some((c) => c.url.includes('v_rie_access'))).toBe(true);          // re-read
  });

  it('revoke and restore: {active}', async () => {
    const f = stub();
    mount();
    await openFromSidebar();
    await click($('.ax-revoke', rowOf('bob@x.test')));
    expect(patches(f)[0].body).toEqual({ active: false });
    expect(getStatus().msg).toBe('bob@x.test can no longer sign in');
    await click($('.ax-restore', rowOf('cat@x.test')));
    expect(patches(f)[1].url).toBe(BASE + 'rie_allowed_users?email=eq.cat%40x.test');
    expect(patches(f)[1].body).toEqual({ active: true });
    expect(getStatus().msg).toBe('cat@x.test restored');
  });

  it('scope: {task_scope}; to "assigned" is refused without a linked person (no request)', async () => {
    const f = stub();
    mount({ rows: [ME, { ...BOB, task_scope: 'all' }, { ...ZED }] });
    await openFromSidebar();
    await click(within(rowOf('bob@x.test')).getByRole('button', { name: 'Assigned only' }));
    expect(patches(f)[0].body).toEqual({ task_scope: 'assigned' });
    expect(getStatus().msg).toBe('bob@x.test now sees assigned only');
    f.fn.mockClear();
    await click(within(rowOf('zed@x.test')).getByRole('button', { name: 'Assigned only' }));
    expect(patches(f)).toHaveLength(0);
    expect(getStatus()).toMatchObject({ kind: 'error', msg: 'Bind this sign-in to a person first (the "as" selector), or nothing would be visible to them.' });
  });

  it('extras: the whole new list is sent', async () => {
    const f = stub();
    mount();
    await openFromSidebar();
    const bob = rowOf('bob@x.test');
    await click(within(bob).getByRole('button', { name: 'Events' }));
    expect(patches(f)[0].body).toEqual({ extra_access: ['leads', 'events'] });
    expect(getStatus().msg).toBe('bob@x.test can also see leads, events');
    await click(within(rowOf('bob@x.test')).getByRole('button', { name: 'Leads' }));
    expect(patches(f)[1].body).toEqual({ extra_access: [] });
    expect(getStatus().msg).toBe('bob@x.test sees only their tasks');
  });

  it('person: {person_code}, null for "nobody"', async () => {
    const f = stub();
    mount();
    await openFromSidebar();
    await act(async () => { fireEvent.change($('.ax-person', rowOf('bob@x.test')), { target: { value: 'ME1' } }); });
    expect(patches(f)[0].body).toEqual({ person_code: 'ME1' });
    expect(getStatus().msg).toBe('bob@x.test is ME1');
    await act(async () => { fireEvent.change($('.ax-person', rowOf('bob@x.test')), { target: { value: '' } }); });
    expect(patches(f)[1].body).toEqual({ person_code: null });
    expect(getStatus().msg).toBe('bob@x.test is not linked to a person');
  });

  it('companies: from "all" an array; the last one back on is null; hiding the last is refused', async () => {
    const f = stub();
    mount();
    await openFromSidebar();
    const coBtn = (email, c) => $$('.ax-cos:not(.ax-scope-row) .ax-co', rowOf(email)).find((b) => b.textContent === c);
    await click(coBtn('cat@x.test', 'Beta'));                           // all -> hide Beta
    expect(patches(f)[0].url).toBe(BASE + 'rie_allowed_users?email=eq.cat%40x.test');
    expect(patches(f)[0].body).toEqual({ companies: ['Acme'] });
    expect(getStatus().msg).toBe('cat@x.test can see Acme');
    await click(coBtn('bob@x.test', 'Beta'));                           // [Acme] + Beta = everything -> null
    expect(patches(f)[1].body).toEqual({ companies: null });
    expect(getStatus().msg).toBe('bob@x.test can see all companies');
    f.fn.mockClear();
    await click(coBtn('bob@x.test', 'Acme'));                           // bob still has [Acme] in the stale data? no: re-read gave the stub's rows
    expect(patches(f).length + (getStatus().kind === 'error' ? 1 : 0)).toBeGreaterThan(0);
  });

  it('a refused write shows the database\'s own words and puts the control back', async () => {
    const f = stub((url, init) => (init.method === 'PATCH' ? failResponse(JSON.stringify({ message: 'Cannot demote the last admin' }), 400) : undefined));
    mount();
    await openFromSidebar();
    await click(within(rowOf('bob@x.test')).getByRole('button', { name: 'Admin' }));
    expect(getStatus()).toMatchObject({ kind: 'error', msg: 'Cannot demote the last admin' });
    expect($$('.ax-roles:not(.ax-scopes) button', rowOf('bob@x.test')).map((b) => b.className.includes('on'))).toEqual([false, true, false]);
    expect(f.calls().filter((c) => c.url.includes('v_rie_access')).length).toBeGreaterThan(1);   // re-read after the failure
  });
});

describe('Give someone access', () => {
  const fill = (email, name) => {
    fireEvent.change($('#ax-email'), { target: { value: email } });
    fireEvent.change($('#ax-name'), { target: { value: name } });
  };
  const add = async () => { await click(within($('.ax-add')).getByRole('button', { name: 'Add' })); };

  it('starts as Editor / Assigned only, with the old hint', async () => {
    stub();
    mount();
    await openFromSidebar();
    expect($('#ax-email').placeholder).toBe('name@company.com');
    expect($('#ax-name').placeholder).toBe('Name (shown on tasks)');
    expect($('#ax-role').value).toBe('member');
    expect($('#ax-scope').value).toBe('assigned');
    expect($$('#ax-role option').map((o) => o.textContent)).toEqual(['Admin', 'Editor', 'Viewer']);
    expect($('.ax-hint').textContent).toContain('New people start as Editor seeing assigned tasks only');
  });

  it('checks the entry first: address, duplicate, name for assigned scope. Nothing is sent', async () => {
    const f = stub();
    mount();
    await openFromSidebar();
    f.fn.mockClear();
    fill('not-an-email', 'N'); await add();
    expect($('#ax-err').textContent).toBe('That does not look like an email address.');
    fill('BOB@x.test', 'N'); await add();
    expect($('#ax-err').textContent).toBe('That address already has access. Change their role below instead.');
    fill('new@x.test', ''); await add();
    expect($('#ax-err').textContent).toBe('A name is needed so tasks can be assigned to them.');
    expect(writes(f)).toHaveLength(0);
  });

  it('creates the people row, then the allowed-user row, and clears the form', async () => {
    const f = stub();
    mount();
    await openFromSidebar();
    fill('  New.Person@X.test ', 'Olive Two');
    await add();
    const w = writes(f);
    expect(w).toHaveLength(2);
    expect(w[0].url).toBe(BASE + 'people');
    expect(w[0].method).toBe('POST');
    expect(w[0].body).toEqual({ code: 'OLIVE', display_name: 'Olive Two', is_internal: true });
    expect(w[1].url).toBe(BASE + 'rie_allowed_users');
    expect(w[1].body).toEqual({ email: 'new.person@x.test', display_name: 'Olive Two', role: 'member', task_scope: 'assigned', person_code: 'OLIVE', active: true });
    expect(getStatus().msg).toBe('new.person@x.test can sign in and will see tasks assigned to Olive Two');
    expect($('#ax-email').value).toBe('');
    expect($('#ax-name').value).toBe('');
    expect($('#ax-err').textContent).toBe('');
  });

  it('a taken code gets a number; all-scope without a name makes no people row and uses the e-mail name', async () => {
    const f = stub();
    mount();
    await openFromSidebar();
    store.setState((s) => ({ people: [...s.people, { code: 'OLIVE', display_name: 'Olive' }] }));
    fill('o2@x.test', 'Olive Again'); await add();
    expect(writes(f)[0].body.code).toBe('OLIVE2');
    f.fn.mockClear();
    fireEvent.change($('#ax-scope'), { target: { value: 'all' } });
    fireEvent.change($('#ax-role'), { target: { value: 'viewer' } });
    fill('plain@x.test', ''); await add();
    const w = writes(f);
    expect(w).toHaveLength(1);
    expect(w[0].url).toBe(BASE + 'rie_allowed_users');
    expect(w[0].body).toEqual({ email: 'plain@x.test', display_name: 'plain', role: 'viewer', task_scope: 'all', person_code: null, active: true });
    expect(getStatus().msg).toBe('plain@x.test can now sign in');
  });

  it('Enter in the address box adds; a refused add shows the reason under the form', async () => {
    const f = stub((url, init) => (init.method === 'POST' && url.endsWith('/rie_allowed_users') ? failResponse(JSON.stringify({ message: 'duplicate key' }), 409) : undefined));
    mount();
    await openFromSidebar();
    fill('e@x.test', 'Eve');
    await act(async () => { fireEvent.keyDown($('#ax-email'), { key: 'Enter' }); });
    expect(writes(f)).toHaveLength(2);
    expect($('#ax-err').textContent).toBe('duplicate key');
    expect($('#ax-email').value).toBe('e@x.test');               // not cleared on failure
  });
});

describe('useAccessAdmin()', () => {
  function Probe({ out }) { out.api = useAccessAdmin(); return null; }
  it('exposes people, companies and the write functions the brief names', async () => {
    stub();
    data = { rows: [ME, BOB], companies: [{ company: 'Acme' }], people: [] };
    seed({ access: ADMIN_ACCESS });
    const out = {};
    render(<Probe out={out} />);
    await waitFor(() => expect(out.api.loading).toBe(false));
    expect(out.api.people.map((p) => p.email)).toEqual(['a@x.test', 'bob@x.test']);
    expect(out.api.companies).toEqual(['Acme']);
    for (const k of ['add', 'setRole', 'setScope', 'toggleExtra', 'setPerson', 'toggleCompany', 'toggleActive', 'refresh']) expect(typeof out.api[k], k).toBe('function');
  });

  it('a non-admin\'s writes are refused with no request', async () => {
    const f = stub();
    data = { rows: [ME, BOB], companies: [], people: [] };
    seed({ access: { ...ADMIN_ACCESS, role: 'member', is_admin: false } });
    const out = {};
    render(<Probe out={out} />);
    await waitFor(() => expect(out.api.loading).toBe(false));
    await act(async () => { await out.api.setRole('bob@x.test', 'admin'); });
    expect(patches(f)).toHaveLength(0);
    expect(getStatus()).toMatchObject({ kind: 'error', msg: 'Only an admin can change who has access.' });
    let msg;
    await act(async () => { msg = await out.api.add('x@y.test', { name: 'X' }); });
    expect(msg).toBe('Only an admin can change who has access.');
    expect(writes(f)).toHaveLength(0);
  });
});
