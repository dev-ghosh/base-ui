'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { STATUSES, PIVOT_AXES, PANEL_TRANSITION_MS } from './model.js';
import DrillBody from './DrillTabs.jsx';
import { useTaskForm } from '../../tasks/hooks/useTaskForm.js';
import { matrixActions } from '../../../lib/matrix-actions.js';

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * The drill: a right slide-over over a scrim, NOT a route change (spec 7.7 / ruling 12.2). A page
 * swap would destroy the cell-to-cell comparison context the matrix exists to provide. It is
 * driven by the search params (`drill`, `tab`, `pivot` in the filters) and stays mounted for the
 * length of its slide-out so closing animates as it did.
 *
 *   drill     null | { company, func, kind }   (already validated against the registry)
 *   onClose   drop the drill params
 *   onTab / onPivot   write t= / pv=
 *   triggerRef   the element that opened it; focus returns there on close (spec 7.12)
 */
export default function DrillPanel({ model, drill, tab, pivot, theme, statuses, onClose, onTab, onPivot, triggerRef }) {
  const router = useRouter();
  const { confirmDelete } = useTaskForm();

  const [mounted, setMounted] = useState(Boolean(drill));
  const [on, setOn] = useState(false);
  const panelRef = useRef(null);
  const titleRef = useRef(null);
  const lastDrill = useRef(drill);
  if (drill) lastDrill.current = drill;
  const view = drill ?? lastDrill.current;

  const [expanded, setExpanded] = useState(() => new Set());
  const [sort, setSort] = useState({ col: 'nextFollowUp', dir: 1 });

  // Slide in / out. Reading offsetWidth forces a reflow so the transition has a start state;
  // requestAnimationFrame is NOT used (Chrome throttles it in a hidden tab, which would leave
  // the panel mounted but permanently translated off-screen).
  useLayoutEffect(() => {
    if (drill) {
      if (!mounted) { setMounted(true); return undefined; }
      void panelRef.current?.offsetWidth;
      setOn(true);
      return undefined;
    }
    setOn(false);
    if (!mounted) return undefined;
    const t = setTimeout(() => setMounted(false), reducedMotion() ? 0 : PANEL_TRANSITION_MS);
    return () => clearTimeout(t);
  }, [drill, mounted]);

  const open = Boolean(drill);

  // Focus moves to the title once the panel is up...
  const focused = useRef(false);
  useEffect(() => {
    if (!open) { focused.current = false; return; }
    if (mounted && !focused.current) { focused.current = true; titleRef.current?.focus(); }
  }, [open, mounted]);

  // ...and back to the cell that opened it when it closes (spec 7.12).
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) {
      setExpanded(new Set());
      const trigger = triggerRef.current;
      if (trigger && trigger.isConnected) trigger.focus();
      triggerRef.current = null;
    }
    wasOpen.current = open;
  }, [open, triggerRef]);

  // Escape closes; Tab is trapped inside the panel while it is open (spec 7.12).
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const f = [...panel.querySelectorAll('a[href],button:not([disabled]),select,input,textarea,[tabindex]:not([tabindex="-1"])')]
        .filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const actions = useMemo(() => ({
    ...matrixActions,
    openTask: (id) => router.push(`/work/tasks/${id}`),
    deleteTask: (id) => confirmDelete(id),
  }), [router, confirmDelete]);

  const toggleCard = (id) => setExpanded((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const onSort = (col) => setSort((cur) => (cur.col === col ? { col, dir: -cur.dir } : { col, dir: 1 }));

  if (!mounted || !view || typeof document === 'undefined') return null;

  const rows = model.drillTasks(view);
  const def = view.func ? model.definitionOf(view.func) : '';

  return createPortal(
    <>
      <div id="mx-scrim" className={on ? 'on' : ''} onClick={onClose}></div>
      <div id="mx-panel" ref={panelRef} className={on ? 'on' : ''} role="dialog" aria-modal="true" aria-labelledby="mx-panel-title">
        <div id="mx-panel-head">
          <div className="mx-ph-top">
            <h2 id="mx-panel-title" ref={titleRef} tabIndex={-1}>{model.scopeTitle(view)}</h2>
            <button type="button" className="mx-close" onClick={onClose} aria-label="Close">&times;</button>
          </div>
          <div className="mx-ph-sub">
            <span>{rows.length} {rows.length === 1 ? 'task' : 'tasks'}</span>
            <span className="crit">{rows.filter(model.isOverdue).length} overdue</span>
            <span className="warn">{rows.filter((t) => t.priority === 'P1').length} P1</span>
            <span className="muted">all statuses</span>
          </div>
          {def ? <div className="mx-ph-def">{def}</div> : null}
          {statuses.length < STATUSES.length ? (
            <div className="mx-ph-note">The grid behind this is filtered to {statuses.join(', ')}. This panel shows everything in the cell, so a task you change status on moves column instead of disappearing.</div>
          ) : null}
          <div className="mx-tabs">
            <button type="button" className={tab === 'board' ? 'on' : ''} onClick={() => onTab('board')}>Kanban</button>
            <button type="button" className={tab === 'list' ? 'on' : ''} onClick={() => onTab('list')}>List</button>
            <button type="button" className={tab === 'pivot' ? 'on' : ''} onClick={() => onTab('pivot')}>Pivot</button>
            {tab === 'pivot' ? (
              <select className="mx-sel" aria-label="Pivot axis" value={pivot} onChange={(e) => onPivot(e.target.value)}>
                {PIVOT_AXES.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
              </select>
            ) : null}
          </div>
        </div>
        <div id="mx-panel-body">
          <DrillBody
            model={model} rows={rows} drill={view} tab={tab} pivot={pivot} theme={theme}
            expanded={expanded} onToggle={toggleCard} sort={sort} onSort={onSort} actions={actions} onList={() => onTab('list')}
          />
        </div>
      </div>
    </>,
    document.body,
  );
}
