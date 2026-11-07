'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../../store/useStore.js';
import { useRegistry } from '../../../hooks/useRegistry.js';
import { useTheme } from '../../../hooks/useTheme.js';
import { ensureRegistry } from '../../../lib/registry.js';
import { useScope } from '../hooks/useScope.js';
import { useMatrixFilters } from './hooks/useMatrixFilters.js';
import { createModel, LIVE_PRESET } from './model.js';
import { DEFAULT_PIVOT, DEFAULT_TAB } from './params.js';
import FilterBar from './FilterBar.jsx';
import MatrixKpis from './MatrixKpis.jsx';
import MatrixGrid, { Tip } from './MatrixGrid.jsx';
import DrillPanel from './DrillPanel.jsx';

/**
 * Work > Matrix: the company x function grid (RIE v2 two-level filter model), its filter bar
 * and KPI row, and the drill slide-over. Port of js/matrix.js; the whole state is the URL
 * (`?scope=` from the Work frame, the filters and drill params from params.js).
 *
 * The grid is `task_functions` (the lazy registry, shared with the task form) x companies LEFT
 * JOIN the tasks: nothing about companies, functions or people is written in this code.
 */
export default function MatrixPage() {
  const reg = useRegistry();
  const tasks = useStore((s) => s.tasks);
  useStore((s) => s.people);                       // owner names re-render with the people list
  const { scope, me, fellBack } = useScope();
  const { theme } = useTheme();
  const { filters, update } = useMatrixFilters();

  // Absent while the registry is on its way; a hard error only once it has answered with nothing.
  const [settled, setSettled] = useState(reg.ready);
  useEffect(() => {
    let live = true;
    ensureRegistry().then(() => { if (live) setSettled(true); });
    return () => { live = false; };
  }, []);

  // "Today" is part of the inputs: the day key changes at midnight (UTC, as the old code's today()),
  // so the next render recomputes overdue / due-this-week instead of keeping yesterday's answer.
  const dayKey = new Date().toISOString().slice(0, 10);
  const model = useMemo(
    () => createModel({ registry: reg.rows, tasks, filters, scope, me, now: new Date() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reg.rows, tasks, filters, scope, me, dayKey],
  );
  // A stale company or function in the URL (the registry no longer has it) is ignored (spec 7.13).
  const drill = model.validDrill(filters.drill);

  const [tip, setTip] = useState(null);
  const triggerRef = useRef(null);
  const lastView = useRef({ tab: DEFAULT_TAB, pivot: DEFAULT_PIVOT });
  if (drill) lastView.current = { tab: filters.tab, pivot: filters.pivot };

  const openDrill = useCallback((company, func, kind = 'cell', trigger = null) => {
    setTip(null);
    triggerRef.current = trigger || (typeof document !== 'undefined' ? document.activeElement : null);
    // The tab and axis last used carry over to the next drill, as they did in the old module state.
    update({ drill: { company, func, kind }, tab: lastView.current.tab, pivot: lastView.current.pivot });
  }, [update]);
  const closeDrill = useCallback(() => update({ drill: null }), [update]);
  const showTip = useCallback((t) => setTip(drill ? null : t), [drill]);
  const reset = useCallback(() => {
    update({ statuses: [...LIVE_PRESET], owner: '', priority: '', q: '', overdueOnly: false, reviewOnly: false });
  }, [update]);

  if (reg.error || (settled && !reg.ready)) {
    return (
      <div className="mx-wrap" id="mx-root">
        <div className="mx-hard-error">
          <strong>task_functions unavailable, run the v2 migration</strong>
          {reg.error ? <div>{reg.error}</div> : null}
        </div>
      </div>
    );
  }
  if (!reg.ready) return <div className="mx-wrap" id="mx-root"></div>;

  return (
    <div className="mx-wrap" id="mx-root">
      {fellBack ? (
        <div className="mx-empty">
          Your sign-in is not linked to a person yet, so Mine is not available. Showing Everyone. An admin can fix that under Account → Manage access.
        </div>
      ) : null}
      <FilterBar model={model} filters={filters} scope={scope} theme={theme} update={update} />
      <MatrixKpis model={model} onDrill={openDrill} />
      <MatrixGrid model={model} theme={theme} onDrill={openDrill} onTip={showTip} onReset={reset} />
      <Tip tip={tip} model={model} theme={theme} />
      <DrillPanel
        model={model} drill={drill} tab={filters.tab} pivot={filters.pivot} theme={theme} statuses={filters.statuses}
        onClose={closeDrill} onTab={(tab) => update({ tab })} onPivot={(pivot) => update({ pivot })} triggerRef={triggerRef}
      />
    </div>
  );
}
