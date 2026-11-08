'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '../../components/Icon.jsx';
import { Dialog } from '../../components/ui.jsx';
import { RANGES, TABS, drillView } from '../../lib/analytics.js';
import { exportToExcel } from '../../lib/export-excel.js';
import { ANALYTICS_TAB_KEY, isFiltered, periodLabel as periodOf } from './model.js';
import { TaskItem } from './blocks.jsx';
import { AreasTab, OverviewTab, PeopleTab, PipelineTab } from './tabs.jsx';
import { useAnalytics } from './hooks/useAnalytics.js';
import { useAnalyticsFilters } from './hooks/useAnalyticsFilters.js';

/** The page frame: `.tp.page` with the old ids. */
function Frame({ children }) {
  return <div className="tp page active" id="tab-analytics"><div id="analytics-fullpage-content">{children}</div></div>;
}

/** Remember the tab, as the old analyticsTab() did (the index route reads it back). */
function rememberTab(key) {
  try { localStorage.setItem(ANALYTICS_TAB_KEY, key); } catch { /* storage unavailable */ }
}

const taskPath = (id) => `/work/tasks/${encodeURIComponent(String(id))}`;

/**
 * The company overview (old tab-analytics). The tab is a route segment (`tab`), the period / company /
 * person filters are search params, the drill-down (every number opens the tasks behind it) is the
 * shared dialog (#mo-dyn) held in component state.
 */
export default function AnalyticsScreen({ tab }) {
  const router = useRouter();
  const { filters, search, update, reset } = useAnalyticsFilters();
  const { data: d, loaded, updatedAt } = useAnalytics(filters);
  const [drillKey, setDrillKey] = useState(null);

  if (!loaded) {
    return <Frame><div className="pg-wrap"><div className="empty-state sm"><p>Loading…</p></div></div></Frame>;
  }

  const periodLabel = periodOf(filters.range);
  const time = updatedAt ? updatedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
  const counts = { overview: '', people: d.byPerson.length, areas: '', pipeline: d.leadOpen.length };
  const drill = (key) => setDrillKey(key);
  const openTask = (id) => router.push(taskPath(id));
  const view = drillKey ? drillView(d, drillKey) : null;
  const closeDrill = () => setDrillKey(null);

  const body = tab === 'people' ? <PeopleTab d={d} drill={drill} />
    : tab === 'areas' ? <AreasTab d={d} drill={drill} />
      : tab === 'pipeline' ? <PipelineTab d={d} periodLabel={periodLabel} go={(path) => router.push(path)} />
        : <OverviewTab d={d} periodLabel={periodLabel} drill={drill} openTask={openTask} />;

  return (
    <Frame>
      <div className="pg-wrap wide shd">
        <header className="shd-head">
          <div><h1 className="shd-h1">Company overview</h1><p className="shd-muted">What is moving, what is stuck and who is carrying it. Click any number for the tasks behind it.</p></div>
          <div className="shd-head-a">
            <span className="shd-updated"><Icon name="refresh" size={13} /> Updated {time}</span>
            <button type="button" className="shd-btn outline" onClick={() => exportToExcel()}><Icon name="download" size={14} /> Export</button>
          </div>
        </header>

        <div className="shd-bar">
          <div className="shd-tabs" role="tablist">
            {TABS.map(([k, l]) => (
              <Link
                key={k} role="tab" href={`/analytics/${k}${search ? `?${search}` : ''}`}
                aria-selected={tab === k} aria-current={tab === k ? 'page' : undefined} className={tab === k ? 'on' : ''}
                onClick={() => rememberTab(k)}
              >
                {l}{counts[k] ? <> <span className="shd-count">{counts[k]}</span></> : null}
              </Link>
            ))}
          </div>
          <div className="shd-filters">
            <div className="shd-seg" role="group" aria-label="Period">
              {RANGES.map(([v, l]) => <button type="button" key={v} className={filters.range === v ? 'on' : ''} onClick={() => update({ range: v })}>{l}</button>)}
            </div>
            <select className="shd-select" value={filters.company} onChange={(e) => update({ company: e.target.value })} aria-label="Company">
              <option value="ALL">All companies</option>
              {d.availableCompanies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="shd-select" value={filters.person} onChange={(e) => update({ person: e.target.value })} aria-label="Person">
              <option value="ALL">Everyone</option>
              {d.availablePeople.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            {isFiltered(filters) ? <button type="button" className="shd-btn ghost" onClick={reset}>Reset</button> : null}
          </div>
        </div>

        <div role="tabpanel">{body}</div>
      </div>

      {view ? (
        <Dialog
          open wide title={view.title} onClose={closeDrill} contentKey={drillKey}
          footer={<button type="button" className="btn b-gh" onClick={closeDrill}>Close</button>}
        >
          {view.rows.length ? (
            <>
              <div className="shd shd-list">
                {view.rows.map((t) => <TaskItem key={t.id} task={t} onOpen={(id) => { closeDrill(); openTask(id); }} />)}
              </div>
              {view.truncated ? <p className="shd-muted">Showing the first 300.</p> : null}
            </>
          ) : <div className="shd shd-empty"><p>Nothing here for the current filters.</p></div>}
        </Dialog>
      ) : null}
    </Frame>
  );
}
