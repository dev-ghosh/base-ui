// Classify (js/classify.js): one card per task missing a company or function, one keystroke to
// pick, optimistic, undo, vocabulary from the registry.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent, within } from '@testing-library/react';

process.env.NEXT_PUBLIC_SB_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SB_KEY = 'anon-key-123';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/today/classify',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(''),
}));

import ClassifyOverlay from '@/features/classify/ClassifyOverlay.jsx';
import { store } from '@/store/store.js';
import { registryStore } from '@/lib/registry.js';
import { getStatus } from '@/lib/status.js';
import { seed, makeTask, stubFetch, failResponse, REGISTRY, ME } from './helpers/fixtures.js';

const READ_ONLY = 'You have view-only access to BASE, so this change was not saved.';
const key = (k, init = {}) => fireEvent.keyDown(document, { key: k, ...init });
const title = () => document.querySelector('.tg-title')?.textContent;
const count = () => document.querySelector('.tg-count')?.textContent;
const task = (id) => store.getState().tasks.find((t) => t.id === id);
const fnButtons = () => [...document.querySelectorAll('.cf-fn')].map((b) => b.textContent);

function seedQueue(extra = {}) {
  seed({
    tasks: [
      makeTask({ id: 'u1', task: 'No function', func: '', company: 'Acme', priority: 'P1', nextFollowUp: '2026-12-01', keyInputs: 'k'.repeat(300) }),
      makeTask({ id: 'u2', task: 'No company either', func: '', company: '', priority: 'P2' }),
      makeTask({ id: 'f1', task: 'Flagged only', funcReview: true, funcReviewNote: 'guessed from the title', priority: 'P1' }),
      makeTask({ id: 'ok', task: 'All good' }),
    ],
    ...extra,
  });
  registryStore.setState({ rows: REGISTRY });
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Classify card', () => {
  it('shows the untagged first, with why, meta and that company\'s functions numbered', () => {
    seedQueue();
    stubFetch();
    render(<ClassifyOverlay onClose={vi.fn()} />);

    expect(count()).toBe('1 of 3');
    expect(title()).toBe('No function');
    expect(document.querySelector('.cf-why').textContent).toBe('No function set');
    expect(document.querySelector('.tg-meta').textContent).toMatch(/^Acme · Me Myself · /);
    expect(document.querySelector('.cf-ctx').textContent).toHaveLength(240);
    expect(fnButtons()).toEqual(['1Ops', '2Sales']);
    expect(document.querySelector('.cf-co')).toBeNull();              // the company is known
    expect(document.querySelector('.tg-hint').textContent).toBe('1-9 pick · S skip · U undo · Esc close');
  });

  it('without a company it offers every company and the union of functions', () => {
    seedQueue();
    stubFetch();
    render(<ClassifyOverlay onClose={vi.fn()} />);
    key('s');
    expect(title()).toBe('No company either');
    expect(document.querySelector('.cf-why').textContent).toBe('No function set');
    expect(document.querySelector('.tg-meta').textContent).toBe('no company · Me Myself · no date');
    expect([...document.querySelectorAll('.cf-co-b')].map((b) => b.textContent)).toEqual(['Acme', 'Beta']);
    expect(fnButtons()).toEqual(['1Ops', '2Sales']);
  });
});

describe('Classify picking', () => {
  it('a number key picks that function: PATCH with func + clear the review flag, next card, store updated', async () => {
    seedQueue();
    const f = stubFetch();
    render(<ClassifyOverlay onClose={vi.fn()} />);

    key('2');

    expect(title()).toBe('No company either');
    await waitFor(() => expect(f.writes()).toHaveLength(1));
    expect(f.writes()[0]).toMatchObject({ method: 'PATCH', body: { func: 'Sales', company: 'Acme', func_review: false, func_review_note: null } });
    expect(f.writes()[0].url).toContain('/entities?id=eq.u1');
    expect(task('u1')).toMatchObject({ func: 'Sales', funcReview: false });
  });

  it('choosing a company first narrows the functions, and the pick writes the company too', async () => {
    seedQueue();
    registryStore.setState({ rows: [...REGISTRY, { company: 'Beta', func: 'Legal', active: true, sort_order: 2 }, { company: 'Beta', func: 'Old', active: false, sort_order: 3 }] });
    const f = stubFetch();
    render(<ClassifyOverlay onClose={vi.fn()} />);
    key('s');                                                         // the card with no company

    fireEvent.click(screen.getByRole('button', { name: 'Beta' }));
    expect(fnButtons()).toEqual(['1Ops', '2Legal']);
    expect(document.querySelector('.cf-co')).toBeNull();

    key('2');
    await waitFor(() => expect(f.writes()).toHaveLength(1));
    expect(f.writes()[0].body).toEqual({ func: 'Legal', company: 'Beta', func_review: false, func_review_note: null });
    expect(task('u2')).toMatchObject({ company: 'Beta', func: 'Legal' });
  });

  it('a number beyond the list does nothing; 0 is the tenth', async () => {
    seedQueue();
    const f = stubFetch();
    render(<ClassifyOverlay onClose={vi.fn()} />);
    key('9');
    key('0');
    expect(title()).toBe('No function');
    expect(f.fn).not.toHaveBeenCalled();
  });

  it('clicking a function button picks it', async () => {
    seedQueue();
    const f = stubFetch();
    render(<ClassifyOverlay onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Sales/ }));
    await waitFor(() => expect(f.writes()).toHaveLength(1));
    expect(f.writes()[0].body.func).toBe('Sales');
  });

  it('S / ArrowRight / "Skip this one" skip without writing', () => {
    seedQueue();
    const f = stubFetch();
    render(<ClassifyOverlay onClose={vi.fn()} />);
    key('s');
    key('ArrowRight');
    expect(title()).toBe('Flagged only');
    expect(document.querySelector('.cf-why').textContent).toBe('guessed from the title');
    expect(f.fn).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Skip this one' }));
    expect(document.querySelector('.tg-done h2').textContent).toBe('3 classified');
  });

  it('U undoes the last pick: previous values sent, card back', async () => {
    seedQueue();
    const f = stubFetch();
    render(<ClassifyOverlay onClose={vi.fn()} />);
    key('1');
    await waitFor(() => expect(f.writes()).toHaveLength(1));
    expect(task('u1').func).toBe('Ops');

    key('u');
    expect(title()).toBe('No function');
    await waitFor(() => expect(f.writes()).toHaveLength(2));
    expect(f.writes()[1].body).toEqual({ func: null, company: 'Acme', func_review: false });
    await waitFor(() => expect(task('u1').func).toBe(''));
  });

  it('a failed write rolls the task back and says which one', async () => {
    seedQueue();
    stubFetch(async () => failResponse('nope'));
    render(<ClassifyOverlay onClose={vi.fn()} />);
    key('1');
    await waitFor(() => expect(getStatus().kind).toBe('error'));
    expect(getStatus().msg).toMatch(/^Could not classify "No function": /);
    await waitFor(() => expect(title()).toBe('No function'));
    expect(task('u1').func).toBe('');
  });

  it('a view-only user: the guard sentence and no fetch', async () => {
    seedQueue({ access: { person_code: ME, can_write: false } });
    registryStore.setState({ rows: REGISTRY });
    const f = stubFetch();
    render(<ClassifyOverlay onClose={vi.fn()} />);
    key('1');
    await waitFor(() => expect(getStatus().kind).toBe('error'));
    expect(getStatus().msg).toContain(READ_ONLY);
    expect(f.fn).not.toHaveBeenCalled();
  });
});

describe('Classify end states', () => {
  it('empty queue: "Nothing to classify"', () => {
    seed({ tasks: [makeTask()] });
    registryStore.setState({ rows: REGISTRY });
    stubFetch();
    render(<ClassifyOverlay onClose={vi.fn()} />);
    expect(document.querySelector('.tg-done h2').textContent).toBe('Nothing to classify');
    expect(document.querySelector('.tg-done p').textContent).toBe('Every open task has a company and a function.');
  });

  it('Escape and Done close; the backdrop closes cleanly too', () => {
    seedQueue();
    stubFetch();
    const onClose = vi.fn();
    const { container } = render(<ClassifyOverlay onClose={onClose} />);
    key('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(container.querySelector('.mo'));
    expect(onClose).toHaveBeenCalledTimes(2);
    key('s'); key('s'); key('s');
    fireEvent.click(within(document.querySelector('.tg-done')).getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
