// Work > Decide (js/decide.js): /work/decide goes to business; business and system are route segments;
// "This week" is the first five and the rest folds under Later; every write (Decided, Declined, Not now,
// Sweep, Put them back, and the duplicates' Resolve / Leave alone) is optimistic with rollback and is
// blocked for viewer-role users before any request.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

process.env.NEXT_PUBLIC_SB_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SB_KEY = 'anon-key-123';

vi.mock('next/navigation', async () => (await import('./helpers/fake-router.js')).navigationMock);
vi.mock('next/link', async () => (await import('./helpers/fake-router.js')).linkMock);

import DecideIndex from '@/app/(app)/work/decide/page.jsx';
import BusinessPage from '@/app/(app)/work/decide/business/page.jsx';
import SystemPage from '@/app/(app)/work/decide/system/page.jsx';
import { store } from '@/store/store.js';
import { getStatus } from '@/lib/status.js';
import { seed, makeTask, stubFetch, okResponse, failResponse, ME } from './helpers/fixtures.js';
import { history, redirects, resetNav, setUrl } from './helpers/fake-router.js';

const row = (n, o = {}) => ({
  id: 'd' + n, entity_id: null, kind: 'business', signal_code: 'SOME_SIGNAL', question: `Question number ${n}`, recommended_action: 'Do the thing',
  confidence: 0.8, age_days: n, raised_at: '2026-10-01T09:00:00Z', entity_title: '', company: 'Acme', func: 'Ops', resolution_notes: null, ...o,
});
const business = (n) => Array.from({ length: n }, (_, i) => row(i + 1));

function seedDecide(rows, extra = {}) {
  seed({
    tasks: [makeTask({ id: 't1', ownerCode: ME }), makeTask({ id: 't2', ownerCode: 'OT1' })],
    decideRows: rows, decideLoaded: true,
    decisions: rows.map((r) => ({ id: r.id })),
    ...extra,
  });
}
const heads = () => [...document.querySelectorAll('.dq-head .dq-q')].map((n) => n.textContent);
const open = (q) => fireEvent.click(screen.getByText(q).closest('.dq-head'));
const note = (id, text) => fireEvent.change(document.getElementById(`dq-note-${id}`), { target: { value: text } });
const patches = (f) => f.writes().filter((w) => w.method === 'PATCH');
const deferred = () => { let res; const p = new Promise((r) => { res = r; }); return [p, res]; };

beforeEach(() => { localStorage.clear(); resetNav('/work/decide/business?scope=everyone'); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('routes and segments', () => {
  it('/work/decide redirects to business', () => {
    DecideIndex();
    expect(redirects).toEqual(['/work/decide/business']);
  });

  it('business and system are segments: two links with counts, the lit one is aria-current, ?scope= rides along', () => {
    seedDecide([...business(3), row(9, { kind: 'system' })]);
    setUrl('/work/decide/business?scope=everyone');
    render(<BusinessPage />);
    const tabs = document.querySelector('.dq-tabs');
    const links = within(tabs).getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual(['Business 3', 'BASE health 1']);
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/work/decide/business?scope=everyone', '/work/decide/system?scope=everyone']);
    expect(links[0].getAttribute('aria-current')).toBe('page');
    expect(links[0].className).toBe('on');
    expect(links[1].getAttribute('aria-current')).toBeNull();
    expect(heads()).toEqual(['Question number 1', 'Question number 2', 'Question number 3']);
    fireEvent.click(links[1]);
    expect(history.at(-1).href).toBe('/work/decide/system?scope=everyone');
  });

  it('the system stream shows only system decisions, its note and the possible duplicates', () => {
    seedDecide([...business(2), row(9, { kind: 'system', question: 'Telemetry is late' })], {
      cleanups: [{ id: 'c1', entityAId: 'a1', entityBId: 'b1', similarityScore: 0.91, sharedKeywords: ['alpha', 'beta'], sameFront: true, sameOwner: false, confidence: 'high', recommendedAction: 'merge' }],
    });
    render(<SystemPage />);
    expect(heads()).toEqual(['Telemetry is late']);
    expect(screen.getByText(/BASE reporting on itself/)).toBeTruthy();
    expect(document.querySelector('.dq-h[style]').textContent).toBe('Possible duplicates 1');
    expect(screen.getByText('91% similar')).toBeTruthy();
    expect(screen.getByText('high confidence')).toBeTruthy();
    expect(screen.getByText('same front')).toBeTruthy();
    expect(screen.queryByText('same owner')).toBeNull();
    expect(screen.getByText('Keywords: alpha, beta')).toBeTruthy();
    expect(screen.getByRole('button', { name: '✓ Resolve: merge' })).toBeTruthy();
  });

  it('the business stream has no duplicates section', () => {
    seedDecide(business(1), { cleanups: [{ id: 'c1', entityAId: 'a', entityBId: 'b', similarityScore: 0.9, confidence: 'low' }] });
    render(<BusinessPage />);
    expect(screen.queryByText(/Possible duplicates/)).toBeNull();
  });
});

describe('this week and later', () => {
  it('shows the first five as "This week" and folds the rest under Later, five more at a time', () => {
    seedDecide(business(14));
    render(<BusinessPage />);
    expect(document.querySelector('.dq-h').textContent).toBe('This week 5');
    const later = document.querySelector('details.dq-later');
    expect(later.open).toBe(false);
    expect(later.querySelector('summary').textContent).toBe('Later 9');
    expect(document.querySelectorAll('.dq-list')[0].querySelectorAll('.dq-card').length).toBe(5);
    expect(later.querySelectorAll('.dq-card').length).toBe(5);                    // five revealed
    const more = screen.getByRole('button', { name: '4 more' });
    fireEvent.click(more);
    expect(later.querySelectorAll('.dq-card').length).toBe(9);
    expect(screen.queryByRole('button', { name: /more$/ })).toBeNull();
    expect(later.open).toBe(true);
  });

  it('age is words in neutral ink (no red old-age class), and an empty stream says so', () => {
    seedDecide([row(1, { age_days: 0 }), row(2, { age_days: 400 })]);
    const { unmount } = render(<BusinessPage />);
    expect([...document.querySelectorAll('.dq-age')].map((n) => n.textContent)).toEqual(['today', '1y']);
    expect(document.querySelector('.dq-old, .dq-mid')).toBeNull();
    unmount();
    seedDecide([]);
    render(<BusinessPage />);
    expect(screen.getByText('Nothing pending in this stream.')).toBeTruthy();
  });

  it('a card opens to the full question, the suggestion, the signal and the note box', () => {
    seedDecide([row(1, { question: 'SERVICE DOWN — should we escalate the outage to the vendor and the customer success team?', signal_code: 'OUTAGE', confidence: 0.64 })]);
    render(<BusinessPage />);
    expect(heads()).toEqual(['should we escalate the outage to the vendor and the customer success team?']);
    fireEvent.click(document.querySelector('.dq-head'));
    expect(document.querySelector('.dq-card').classList.contains('open')).toBe(true);
    expect(document.querySelector('.dq-full').textContent).toMatch(/^SERVICE DOWN/);
    expect(document.querySelector('.dq-rec').textContent).toBe('SuggestedDo the thing');
    expect(document.querySelector('.dq-sig').textContent).toBe('OUTAGE · confidence 64%');
    expect(screen.getByText('What did you decide, and why?')).toBeTruthy();
    expect([...document.querySelectorAll('.dq-acts .dq-btn')].map((b) => b.textContent)).toEqual(['Decided', 'Declined', 'Not now']);
  });

  it('scope: Mine keeps decisions about my work and those with no entity; Team the rest', () => {
    const rows = [row(1, { entity_id: 't1' }), row(2, { entity_id: 't2' }), row(3, { entity_id: null })];
    seedDecide(rows);
    setUrl('/work/decide/business?scope=mine');
    const { unmount } = render(<BusinessPage />);
    expect(heads()).toEqual(['Question number 1', 'Question number 3']);
    expect(document.querySelector('.dq-tabs a.on b').textContent).toBe('2');
    unmount();
    setUrl('/work/decide/business?scope=team');
    render(<BusinessPage />);
    expect(heads()).toEqual(['Question number 2', 'Question number 3']);
  });

  it('loads the queue itself when the store has none', async () => {
    seed({});
    const f = stubFetch((url) => (url.includes('/v_decision_queue') ? okResponse(business(2)) : undefined));
    render(<BusinessPage />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    await waitFor(() => expect(heads().length).toBe(2));
    expect(f.calls()[0].url).toContain('/v_decision_queue?order=age_days.asc');
  });
});

describe('resolving (optimistic, rollback, viewers blocked)', () => {
  it('Decided needs a written note first: no request, a sentence in the status bar', async () => {
    seedDecide(business(2));
    const f = stubFetch();
    render(<BusinessPage />);
    open('Question number 1');
    note('d1', 'ok');
    fireEvent.click(screen.getByRole('button', { name: 'Decided' }));
    expect(getStatus()).toMatchObject({ kind: 'error', msg: 'Write what was decided. That sentence is the point of this queue.' });
    expect(f.calls()).toEqual([]);
    expect(heads().length).toBe(2);
    await waitFor(() => expect(document.activeElement.id).toBe('dq-note-d1'));
  });

  it('Decided removes the card at once, PATCHes decision_queue, and keeps it gone', async () => {
    seedDecide(business(2));
    const [gate, release] = deferred();
    const f = stubFetch((url, init) => (init.method === 'PATCH' ? gate : undefined));
    render(<BusinessPage />);
    open('Question number 1');
    note('d1', 'Go ahead with it');
    fireEvent.click(screen.getByRole('button', { name: 'Decided' }));
    expect(heads()).toEqual(['Question number 2']);                               // before the request answers
    expect(store.getState().decisions.map((d) => d.id)).toEqual(['d2']);          // Today's count follows
    await waitFor(() => expect(patches(f).length).toBe(1));
    expect(patches(f)[0].url).toContain('/decision_queue?id=eq.d1');
    expect(patches(f)[0].body).toMatchObject({ status: 'approved', resolved_by: 'Me Myself', resolution_notes: 'Go ahead with it' });
    expect(patches(f)[0].body.resolved_at).toBeTruthy();
    release(okResponse([{}]));
    await waitFor(() => expect(getStatus().msg).toBe('Decided'));
    expect(heads()).toEqual(['Question number 2']);
  });

  it('Declined writes status rejected; a failure puts the card back with its note and reports it', async () => {
    seedDecide(business(2));
    const f = stubFetch((url, init) => (init.method === 'PATCH' ? failResponse('boom') : undefined));
    render(<BusinessPage />);
    open('Question number 1');
    note('d1', 'Not doing this');
    fireEvent.click(screen.getByRole('button', { name: 'Declined' }));
    await waitFor(() => expect(getStatus().kind).toBe('error'));
    expect(getStatus().msg).toMatch(/^Could not record that: /);
    expect(patches(f)[0].body.status).toBe('rejected');
    expect(heads()).toEqual(['Question number 1', 'Question number 2']);
    expect(store.getState().decisions.map((d) => d.id)).toEqual(['d1', 'd2']);
    expect(document.getElementById('dq-note-d1').value).toBe('Not doing this');
  });

  it('Not now needs a date; with one it defers (raised_at + resolution note) and the card goes', async () => {
    seedDecide(business(2));
    const f = stubFetch();
    render(<BusinessPage />);
    open('Question number 1');
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(getStatus().msg).toBe('Pick a date to come back to it.');
    expect(f.calls()).toEqual([]);
    fireEvent.change(document.getElementById('dq-when-d1'), { target: { value: '2099-03-04' } });
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(heads()).toEqual(['Question number 2']);
    await waitFor(() => expect(patches(f).length).toBe(1));
    expect(patches(f)[0].body).toEqual({ raised_at: new Date('2099-03-04T09:00:00').toISOString(), resolution_notes: 'Deferred to 2099-03-04 by Me Myself' });
    await waitFor(() => expect(getStatus().msg).toMatch(/^Back on /));
  });

  it('a viewer-role user gets the view-only sentence, the card stays, and nothing is sent', async () => {
    seedDecide(business(2), { access: { person_code: ME, can_write: false } });
    const f = stubFetch();
    render(<BusinessPage />);
    open('Question number 1');
    note('d1', 'Looks fine to me');
    fireEvent.click(screen.getByRole('button', { name: 'Decided' }));
    await waitFor(() => expect(getStatus().kind).toBe('error'));
    expect(getStatus().msg).toContain('You have view-only access to BASE, so this change was not saved.');
    expect(heads()).toEqual(['Question number 1', 'Question number 2']);
    fireEvent.change(document.getElementById('dq-when-d1'), { target: { value: '2099-03-04' } });
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(getStatus().msg).toContain('view-only'));
    expect(heads().length).toBe(2);
    expect(f.calls()).toEqual([]);
  });

  it('Sweep pushes all of Later to one date with one note, then Put them back restores the old dates', async () => {
    seedDecide(business(8));
    const f = stubFetch((url) => (url.includes('/v_decision_queue') ? okResponse(business(8)) : undefined));
    render(<BusinessPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Sweep' }));
    expect(getStatus().msg).toBe('Pick the date to come back to these.');
    fireEvent.change(document.getElementById('dq-sweep-when'), { target: { value: '2099-01-02' } });
    fireEvent.change(document.getElementById('dq-sweep-note'), { target: { value: 'after the audit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sweep' }));
    expect(document.querySelector('details.dq-later')).toBeNull();                // Later is empty at once
    await waitFor(() => expect(patches(f).length).toBe(3));
    expect(patches(f).map((p) => p.url.split('id=eq.')[1])).toEqual(['d6', 'd7', 'd8']);
    expect(patches(f)[0].body.resolution_notes).toBe('Deferred to 2099-01-02 by Me Myself: after the audit');
    await waitFor(() => expect(getStatus().msg).toMatch(/^3 back on /));
    const undo = await screen.findByRole('button', { name: 'Put them back' });
    expect(undo.parentElement.textContent).toBe('3 deferred. Put them back');
    fireEvent.click(undo);
    await waitFor(() => expect(getStatus().msg).toBe('3 back in the queue'));
    expect(patches(f).slice(3).map((p) => p.body)).toEqual(Array(3).fill({ raised_at: '2026-10-01T09:00:00Z', resolution_notes: null }));
    await waitFor(() => expect(document.querySelector('details.dq-later summary').textContent).toBe('Later 3'));
    expect(screen.queryByRole('button', { name: 'Put them back' })).toBeNull();
  });

  it('a Sweep that fails part-way stops there, says how far, and the rest come back', async () => {
    seedDecide(business(8));
    let n = 0;
    const f = stubFetch((url, init) => (init.method === 'PATCH' ? (++n === 2 ? failResponse('down') : okResponse([{}])) : undefined));
    render(<BusinessPage />);
    fireEvent.change(document.getElementById('dq-sweep-when'), { target: { value: '2099-01-02' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sweep' }));
    await waitFor(() => expect(getStatus().kind).toBe('error'));
    expect(getStatus().msg).toMatch(/^Deferred 1 of 3, then: /);
    expect(patches(f).length).toBe(2);                                            // stopped at the first failure
    expect(heads().length).toBe(7);   // d6 gone, d7 and d8 back
    expect(document.querySelector('details.dq-later summary').textContent).toBe('Later 2');
    expect(screen.getByRole('button', { name: 'Put them back' }).parentElement.textContent).toBe('1 deferred. Put them back');
  });

  it('a viewer cannot sweep either: the rows come back and no request goes out', async () => {
    seedDecide(business(7), { access: { person_code: ME, can_write: false } });
    const f = stubFetch();
    render(<BusinessPage />);
    fireEvent.change(document.getElementById('dq-sweep-when'), { target: { value: '2099-01-02' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sweep' }));
    await waitFor(() => expect(getStatus().kind).toBe('error'));
    expect(getStatus().msg).toContain('view-only');
    expect(document.querySelector('details.dq-later summary').textContent).toBe('Later 2');
    expect(f.calls()).toEqual([]);
  });
});

describe('the duplicates queue', () => {
  const cleanup1 = { id: 'c1', entityAId: 'a1', entityBId: 'b1', similarityScore: 0.5, sharedKeywords: [], confidence: 'low', recommendedAction: '' };
  const cleanup2 = { ...cleanup1, id: 'c2', recommendedAction: 'merge' };

  it('Resolve is optimistic and writes the recommended action; Leave alone writes rejected', async () => {
    seedDecide([], { cleanups: [cleanup1, cleanup2] });
    resetNav('/work/decide/system?scope=everyone');
    const f = stubFetch();
    render(<SystemPage />);
    expect(screen.getAllByText('Recommended:')[0].textContent).toContain('review');     // none given: "review"
    fireEvent.click(screen.getAllByRole('button', { name: /^✓ Resolve: / })[0]);
    expect(store.getState().cleanups.map((c) => c.id)).toEqual(['c2']);
    await waitFor(() => expect(patches(f).length).toBe(1));
    expect(patches(f)[0].url).toContain('/cleanup_queue?id=eq.c1');
    expect(patches(f)[0].body).toMatchObject({ status: 'approved', resolved_by: 'Me Myself', resolution_notes: 'merge' });
    fireEvent.click(screen.getByRole('button', { name: 'Leave alone' }));
    await waitFor(() => expect(patches(f).length).toBe(2));
    expect(patches(f)[1].body).toMatchObject({ status: 'rejected', resolution_notes: 'leave_alone' });
    await waitFor(() => expect(getStatus().msg).toBe('Cleanup resolved'));
    expect(screen.queryByText(/Possible duplicates/)).toBeNull();
  });

  it('a failed Resolve puts the pair back; a viewer is blocked with no request', async () => {
    seedDecide([], { cleanups: [cleanup2] });
    const f = stubFetch((url, init) => (init.method === 'PATCH' ? failResponse('boom') : undefined));
    render(<SystemPage />);
    fireEvent.click(screen.getByRole('button', { name: '✓ Resolve: merge' }));
    await waitFor(() => expect(getStatus().kind).toBe('error'));
    expect(getStatus().msg).toMatch(/^Cleanup resolve failed: /);
    expect(store.getState().cleanups.map((c) => c.id)).toEqual(['c2']);
    cleanup();
    seedDecide([], { cleanups: [cleanup2], access: { person_code: ME, can_write: false } });
    const g = stubFetch();
    render(<SystemPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Leave alone' }));
    await waitFor(() => expect(getStatus().msg).toContain('view-only'));
    expect(store.getState().cleanups.length).toBe(1);
    expect(g.writes()).toEqual([]);
    expect(f.writes().length).toBe(1);
  });

  it('View A / View B open the initiative viewer for each side', () => {
    seedDecide([], { cleanups: [cleanup2] });
    render(<SystemPage />);
    fireEvent.click(screen.getByRole('button', { name: 'View A' }));
    expect(history.at(-1)).toEqual({ kind: 'push', href: '/work/initiatives/a1' });
    fireEvent.click(screen.getByRole('button', { name: 'View B' }));
    expect(history.at(-1)).toEqual({ kind: 'push', href: '/work/initiatives/b1' });
  });
});
