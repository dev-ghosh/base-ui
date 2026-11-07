'use client';

import { useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '../../../store/useStore.js';
import { useAccess } from '../../../hooks/useAccess.js';
import { todayISO } from '../../../lib/queue.js';
import TagFilterBar from '../../../components/TagFilterBar.jsx';
import { useTaskActions } from '../../tasks/hooks/useTaskActions.js';
import { useTaskForm } from '../../tasks/hooks/useTaskForm.js';
import { useScope } from '../hooks/useScope.js';
import { WorkToolbar } from '../WorkToolbar.jsx';
import { useBoardFilters } from './hooks/useBoardFilters.js';
import { useBulk } from './hooks/useBulk.js';
import { activeFilterCount, filterOptions, filterTasks, sanitizeFilters } from './model.js';
import BoardFilters from './BoardFilters.jsx';
import BoardView from './BoardView.jsx';
import HierarchyView from './HierarchyView.jsx';
import BulkBar from './BulkBar.jsx';

/**
 * The two legacy task surfaces over one pipeline: scope (Mine / Team / Everyone from the Work frame),
 * then the filter row (search params, params.js), then the database's ordering. `view` picks how the
 * same list is drawn: 'board' (status columns) or 'hierarchy' (folded groups).
 *
 * Everything the old module kept in `state` is URL or component state here: filters in the query
 * string, the Filters fold, drag, bulk selection and group folds in the components, the closed rail
 * and group folds also in localStorage under the old keys.
 */
export default function TaskSurface({ view }) {
  const router = useRouter();
  const { scope, me, fellBack } = useScope();
  const tasks = useStore((s) => s.tasks);
  const people = useStore((s) => s.people);       // the assignee options follow the people list
  const workstreams = useStore((s) => s.workstreams);
  const entityLinks = useStore((s) => s.entityLinks);
  const actionRows = useStore((s) => s.actions);
  const { canWrite, loaded } = useAccess();
  const readOnly = loaded && !canWrite;
  const actions = useTaskActions();
  const form = useTaskForm();
  const bulk = useBulk();
  const { filters: urlFilters, search, update, clear } = useBoardFilters();

  const options = useMemo(() => filterOptions(tasks), [tasks, people]);   // eslint-disable-line react-hooks/exhaustive-deps
  const filters = useMemo(() => sanitizeFilters(urlFilters, options), [urlFilters, options]);

  // "Today" is part of the inputs: the key changes at local midnight, so the date filters, overdue
  // colours and the week of the rail recompute instead of keeping yesterday's answer.
  const dayKey = todayISO();
  const list = useMemo(
    () => filterTasks(tasks, filters, { scope, me, now: new Date() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, filters, scope, me, dayKey],
  );
  const visibleIds = useMemo(() => list.map((t) => t.id), [list]);

  const openTask = useCallback((id) => router.push(`/work/tasks/${id}`), [router]);
  const ctx = useMemo(() => ({
    me,
    scope,
    readOnly,
    bulk,
    now: new Date(),
    openTask,
    editTask: (id) => form.openEdit(id),
    setStatus: actions.setStatus,
    setWorkstreamStatus: actions.setWorkstreamStatus,
    clearFilters: clear,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [me, scope, readOnly, bulk, openTask, form, actions, clear, dayKey]);

  return (
    <>
      <WorkToolbar>
        <BoardFilters
          view={view} filters={filters} options={options} activeCount={activeFilterCount(filters)} update={update}
          search={search} bulkOn={bulk.mode} onBulk={bulk.toggleMode}
        />
      </WorkToolbar>
      {fellBack ? (
        <div className="mx-empty">
          Your sign-in is not linked to a person yet, so Mine is not available. Showing Everyone. An admin can fix that under Account → Manage access.
        </div>
      ) : null}
      <TagFilterBar
        tags={filters.tags}
        onRemove={(tag) => update((f) => ({ tags: f.tags.filter((t) => t !== tag) }))}
        onClear={() => update({ tags: [] })}
      />
      <div className="twrap" id="tf-classic" style={{ background: 'var(--bg)' }}>
        <div className="kb-board" id="kb-board">
          {view === 'hierarchy'
            ? <HierarchyView list={list} ctx={ctx} workstreams={workstreams} entityLinks={entityLinks} actions={actionRows} />
            : <BoardView list={list} ctx={ctx} />}
        </div>
      </div>
      {bulk.mode ? <BulkBar bulk={bulk} visibleIds={visibleIds} /> : null}
    </>
  );
}
