// Analytics as routes: /analytics goes to a tab (the last one used, else overview), the four tabs are
// links with aria-current, the filters are search params, and every number opens the tasks behind it
// in the shared dialog. Expected numbers come from tests/fixtures/analytics.expected.json (the OLD
// computeAnalytics output on tests/fixtures/analytics.state.json); only the screen is under test here.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, within } from '@testing-library/react';

vi.mock('next/navigation', async () => {
  const base = (await import('./helpers/fake-router.js')).navigationMock;
  return {
    ...base,
    useSelectedLayoutSegment: () => base.usePathname().split('/')[2] ?? null,
  };
});
vi.mock('next/link', async () => (await import('./helpers/fake-router.js')).linkMock);
const exportSpy = vi.fn();
vi.mock('@/lib/export-excel.js', () => ({ exportToExcel: (...a) => exportSpy(...a) }));

import AnalyticsLayout from '@/app/(app)/analytics/layout.jsx';
import AnalyticsIndex from '@/app/(app)/analytics/page.jsx';
import OverviewPage from '@/app/(app)/analytics/overview/page.jsx';
import input from './fixtures/analytics.state.json';
import expected from './fixtures/analytics.expected.json';
import { seed } from './helpers/fixtures.js';
import { history, resetNav, currentUrl } from './helpers/fake-router.js';

const DEFAULT = expected.cases.find((c) => c.name === 'default');

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function setup({ url = '/analytics/overview', loaded = true, tasks = input.tasks, leads = input.leads, escalations = input.escalations } = {}) {
  seed({ tasks, leads, escalations, dataLoaded: loaded });
  resetNav(url);
  localStorage.clear();
}
const mount = () => render(<AnalyticsLayout><OverviewPage /></AnalyticsLayout>);
const kpi = (label) => $$('.shd-kpi').find((k) => $('.shd-kpi-l', k).textContent === label);

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(input.now)); exportSpy.mockClear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('/analytics', () => {
  it('goes to /analytics/overview', () => {
    setup({ url: '/analytics' });
    render(<AnalyticsIndex />);
    expect(history.at(-1)).toEqual({ kind: 'replace', href: '/analytics/overview' });
  });

  it('goes to the tab last used (rie_an_tab); unknown values mean overview; filters are kept', () => {
    setup({ url: '/analytics' });
    localStorage.setItem('rie_an_tab', 'areas');
    render(<AnalyticsIndex />);
    expect(history.at(-1).href).toBe('/analytics/areas');
    cleanup();
    setup({ url: '/analytics?range=7' });
    localStorage.setItem('rie_an_tab', 'nonsense');
    render(<AnalyticsIndex />);
    expect(history.at(-1).href).toBe('/analytics/overview?range=7');
  });

  it('draws nothing at /analytics itself (only the index page forwards)', () => {
    setup({ url: '/analytics' });
    const { container } = render(<AnalyticsLayout><div>child</div></AnalyticsLayout>);
    expect(container.textContent).toBe('child');
  });
});

describe('the tabs', () => {
  it('are four links named Overview, People, Companies & functions, Pipeline', () => {
    setup();
    mount();
    const tabs = $$('.shd-tabs a[role="tab"]');
    expect(tabs.map((a) => a.firstChild.textContent.trim())).toEqual(['Overview', 'People', 'Companies & functions', 'Pipeline']);
    expect(tabs.map((a) => a.getAttribute('href'))).toEqual(['/analytics/overview', '/analytics/people', '/analytics/areas', '/analytics/pipeline']);
  });

  it.each([['overview', 0], ['people', 1], ['areas', 2], ['pipeline', 3]])('/analytics/%s marks only its own tab current', (seg, i) => {
    setup({ url: `/analytics/${seg}` });
    mount();
    const tabs = $$('.shd-tabs a[role="tab"]');
    tabs.forEach((a, j) => {
      expect(a.getAttribute('aria-current')).toBe(j === i ? 'page' : null);
      expect(a.getAttribute('aria-selected')).toBe(String(j === i));
      expect(a.classList.contains('on')).toBe(j === i);
    });
  });

  it('show the people count and the open-lead count as badges', () => {
    setup();
    mount();
    const tabs = $$('.shd-tabs a[role="tab"]');
    expect($('.shd-count', tabs[1]).textContent).toBe(String(DEFAULT.result.byPerson.length));
    expect($('.shd-count', tabs[3]).textContent).toBe(String(DEFAULT.result.leadOpen.length));
    expect($('.shd-count', tabs[0])).toBeNull();
    expect($('.shd-count', tabs[2])).toBeNull();
  });

  it('keep the filters in their links, and remember the tab clicked', () => {
    setup({ url: '/analytics/overview?range=7&company=Acme' });
    mount();
    const people = $$('.shd-tabs a[role="tab"]')[1];
    expect(people.getAttribute('href')).toBe('/analytics/people?range=7&company=Acme');
    fireEvent.click(people);
    expect(currentUrl()).toBe('/analytics/people?range=7&company=Acme');
    expect(localStorage.getItem('rie_an_tab')).toBe('people');
  });
});

describe('the overview', () => {
  it('shows the old numbers from the old function', () => {
    setup();
    mount();
    const r = DEFAULT.result;
    expect($('.shd-h1').textContent).toBe('Company overview');
    expect($('.shd-kpi-v', kpi('Open now')).textContent).toBe(String(r.open.length));
    expect($('.shd-kpi-v', kpi('Overdue')).textContent).toBe(String(r.overdue.length));
    expect($('.shd-kpi-v', kpi('Due this week')).textContent).toBe(String(r.week.length));
    expect($('.shd-kpi-v', kpi('Completed')).textContent).toBe(String(r.done.length));
    expect($('.shd-kpi-v', kpi('New tasks')).textContent).toBe(String(r.created.length));
    expect($('.shd-kpi-v', kpi('No movement')).textContent).toBe(String(r.stale.length));
    expect($('.shd-kpi-s', kpi('Open now')).textContent).toBe(`${r.p1.length} P1 · ${r.statusMix.inProgress} in progress`);
    expect($('.shd-kpi-s', kpi('Overdue')).textContent).toBe('23% of open work');
    expect(kpi('Overdue').classList.contains('warn')).toBe(true);
    // 10 now vs 4 before; 3 done vs 1 before
    expect($('.shd-kpi-s', kpi('New tasks')).textContent).toBe('+150% vs previous period');
    expect($('.shd-kpi-s', kpi('Completed')).textContent).toBe('+200% vs previous period');
    const bars = $$('.shd-chart-col');
    expect(bars).toHaveLength(8);
    expect($('.shd-tip', bars[6]).textContent).toContain(`Created${r.flow[6].created}`);
    expect($$('.shd-chart-y span').map((s) => s.textContent)).toEqual(['4', '3', '2', '1', '0']);
  });

  it('lists the tasks needing attention, P1 first, and opens a task view from a row', () => {
    setup();
    mount();
    const rows = $$('.shd-card', $('.shd-grid.g-7-5')).at(-1).querySelectorAll('.shd-item');
    expect([...rows].map((r) => $('.shd-item-t', r).textContent)).toEqual(['Overdue P1 older', 'Overdue P1 shared', 'Overdue P2']);
    fireEvent.click(rows[0]);
    expect(history.at(-1)).toEqual({ kind: 'push', href: '/work/tasks/t03' });
  });

  it('says so when nothing is overdue or done', () => {
    setup({ tasks: [] });
    mount();
    expect(screen.getByText('Nothing overdue.')).toBeTruthy();
    expect(screen.getByText('Nothing completed in this period yet.')).toBeTruthy();
    expect($('.shd-kpi-s', kpi('Overdue')).textContent).toBe('nothing open');
  });

  it('shows Loading… until the data has loaded', () => {
    setup({ loaded: false });
    mount();
    expect(screen.getByText('Loading…')).toBeTruthy();
    expect($('.shd-h1')).toBeNull();
  });

  it('Export runs the Excel export', () => {
    setup();
    mount();
    fireEvent.click(screen.getByText('Export'));
    expect(exportSpy).toHaveBeenCalledTimes(1);
  });
});

describe('the filters are search params', () => {
  it('the period buttons write range (30 is the default and is not written)', () => {
    setup();
    mount();
    fireEvent.click(screen.getByText('7 days'));
    expect(history.at(-1)).toEqual({ kind: 'replace', href: '/analytics/overview?range=7' });
    expect($$('.shd-seg button.on').map((b) => b.textContent)).toEqual(['7 days']);
    fireEvent.click(screen.getByText('30 days'));
    expect(currentUrl()).toBe('/analytics/overview');
    fireEvent.click(screen.getByText('All time'));
    expect(currentUrl()).toBe('/analytics/overview?range=ALL');
    expect($('.shd-kpi-s', kpi('New tasks')).textContent).toBe('all time');
  });

  it('the company and person selects write company and person, and the numbers follow', () => {
    setup();
    mount();
    const companies = within($('select[aria-label="Company"]')).getAllByRole('option').map((o) => o.textContent);
    expect(companies).toEqual(['All companies', ...DEFAULT.result.availableCompanies]);
    expect(within($('select[aria-label="Person"]')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Everyone', ...DEFAULT.result.availablePeople]);
    fireEvent.change($('select[aria-label="Company"]'), { target: { value: 'Acme' } });
    expect(currentUrl()).toBe('/analytics/overview?company=Acme');
    const acme = expected.cases.find((c) => c.name === 'companyAcme').result;
    expect($('.shd-kpi-v', kpi('Open now')).textContent).toBe(String(acme.open.length));
    fireEvent.change($('select[aria-label="Person"]'), { target: { value: 'Asha Rao' } });
    expect(currentUrl()).toBe('/analytics/overview?company=Acme&person=Asha+Rao');
  });

  it('the Reset button appears with any filter and clears them all (other params stay)', () => {
    setup({ url: '/analytics/overview?range=90&person=Ben+Cole&x=1' });
    mount();
    fireEvent.click(screen.getByText('Reset'));
    expect(currentUrl()).toBe('/analytics/overview?x=1');
    expect(screen.queryByText('Reset')).toBeNull();
  });

  it('a range that is not one of the four is the default', () => {
    setup({ url: '/analytics/overview?range=999' });
    mount();
    expect($$('.shd-seg button.on').map((b) => b.textContent)).toEqual(['30 days']);
    expect(screen.queryByText('Reset')).toBeNull();
  });
});

describe('every number opens the tasks behind it', () => {
  it('a counter opens the dialog with the due-soonest-first list; a row closes it and opens the task', () => {
    setup();
    mount();
    fireEvent.click(kpi('Overdue'));
    const dlg = $('#mo-dyn');
    expect(dlg.classList.contains('open')).toBe(true);
    expect($('.mti', dlg).textContent).toBe(DEFAULT.drills.overdue.title);
    const ids = $$('.shd-item', dlg).map((r) => $('.shd-item-t', r).textContent);
    expect(ids).toHaveLength(DEFAULT.drills.overdue.ids.length);
    expect(ids[0]).toBe('Overdue P2');                       // 2026-10-25 first
    fireEvent.click($$('.shd-item', dlg)[0]);
    expect(history.at(-1)).toEqual({ kind: 'push', href: `/work/tasks/${DEFAULT.drills.overdue.ids[0]}` });
    expect($('#mo-dyn.open')).toBeNull();
  });

  it('the Close button closes it; an empty list says so', () => {
    setup({ tasks: [] });
    mount();
    fireEvent.click(kpi('Open now'));
    expect(screen.getByText('Nothing here for the current filters.')).toBeTruthy();
    fireEvent.click(within($('#mo-dyn')).getByText('Close'));
    expect($('#mo-dyn.open')).toBeNull();
  });

  it('View all appears past six rows', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ ...input.tasks[1], id: 'o' + i, task: 'Late ' + i, nextFollowUp: '2026-10-0' + (i + 1) }));
    setup({ tasks: many });
    mount();
    fireEvent.click(screen.getByText('View all 8'));
    expect($('.mti', $('#mo-dyn')).textContent).toBe('Needs attention · 8');
  });

  it('a person row on the People tab opens their open tasks', () => {
    setup({ url: '/analytics/people' });
    render(<AnalyticsLayout><div /></AnalyticsLayout>);
    const rows = $$('.shd-table tbody tr');
    expect(rows.map((r) => $('.shd-who span:last-child', r).textContent)).toEqual(DEFAULT.result.byPerson.map(([n]) => n));
    fireEvent.click(rows[0]);
    expect($('.mti', $('#mo-dyn')).textContent).toBe(DEFAULT.drills['person:Asha Rao'].title);
  });

  it('a company row on the Companies & functions tab opens that company', () => {
    setup({ url: '/analytics/areas' });
    render(<AnalyticsLayout><div /></AnalyticsLayout>);
    expect(screen.getByText('By company')).toBeTruthy();
    expect(screen.getByText('By function')).toBeTruthy();
    const first = $$('.shd-row')[0];
    fireEvent.click(first);
    const [name] = DEFAULT.result.byCompany[0];
    expect($('.mti', $('#mo-dyn')).textContent).toBe(DEFAULT.drills['company:' + name].title);
  });
});

describe('the pipeline tab', () => {
  it('shows the leads, stages and escalations, and goes to the Pipeline and Escalations pages', () => {
    setup({ url: '/analytics/pipeline' });
    render(<AnalyticsLayout><div /></AnalyticsLayout>);
    const r = DEFAULT.result;
    const tiles = $$('.shd-kpi');
    expect(tiles.map((t) => $('.shd-kpi-l', t).textContent)).toEqual(['Open leads', 'Won', 'Lost', 'Open escalations']);
    expect($('.shd-kpi-v', tiles[0]).textContent).toBe(String(r.leadOpen.length));
    expect($('.shd-kpi-s', tiles[0]).textContent).toBe('₹3,50,000');
    expect($('.shd-kpi-v', tiles[3]).textContent).toBe('2');
    expect($$('.shd-row.static .shd-row-n').map((e) => e.textContent)).toEqual(['Contacted', 'Proposal']);
    expect($$('.shd-row.static .shd-row-v')[0].textContent).toBe('2 leads · ₹3,50,000');
    expect($$('.shd-row.static .shd-row-v')[1].textContent).toBe('1 lead');
    fireEvent.click(screen.getByText('Open Pipeline'));
    expect(history.at(-1)).toEqual({ kind: 'push', href: '/pipeline' });
  });

  it('the escalations tile goes to the Escalations page', () => {
    setup({ url: '/analytics/pipeline' });
    render(<AnalyticsLayout><div /></AnalyticsLayout>);
    fireEvent.click($$('.shd-kpi')[3]);
    expect(history.at(-1)).toEqual({ kind: 'push', href: '/escalations' });
  });

  it('says "no value recorded" and "No open leads."', () => {
    setup({ url: '/analytics/pipeline', leads: [], escalations: [] });
    render(<AnalyticsLayout><div /></AnalyticsLayout>);
    expect($('.shd-kpi-s', $$('.shd-kpi')[0]).textContent).toBe('no value recorded');
    expect(screen.getByText('No open leads.')).toBeTruthy();
  });
});
