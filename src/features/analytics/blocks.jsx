'use client';

import { Icon } from '../../components/Icon.jsx';
import { fmtD } from '../../lib/format.js';
import { OPEN, isP1, peopleOf } from '../../lib/analytics.js';
import { todayISO } from '../../lib/queue.js';
import { initialsOf, toneFor } from '../../lib/ui-format.js';
import { chartScale, deltaInfo } from './model.js';

/* The shadcn-style building blocks of the old analytics.js (card, badge, kpi, progress, avatar,
 * task row, bar chart), as JSX. Class names are the old ones (css/shell.css, `.shd`). */

/** Badge: default | secondary | destructive | outline | warning | success */
export const Badge = ({ text, variant = 'secondary' }) => <span className={`shd-badge ${variant}`}>{String(text)}</span>;

export function Card({ title, desc = '', action = null, cls = '', children }) {
  return (
    <section className={`shd-card ${cls}`}>
      <header className="shd-card-h">
        <div><h3 className="shd-card-t">{title}</h3>{desc ? <p className="shd-card-d">{desc}</p> : null}</div>
        {action}
      </header>
      <div className="shd-card-c">{children}</div>
    </section>
  );
}

/** "+12% vs previous period" and its relatives, or nothing when there is no previous period. */
export function Delta({ now, prev }) {
  const d = deltaInfo(now, prev);
  return d ? <span className={`shd-delta${d.cls ? ' ' + d.cls : ''}`}>{d.text}</span> : null;
}

/** A counter that opens the tasks behind it (`onOpen`), or a static tile when there is none. */
export function Kpi({ label, value, sub, icon, tone = '', onOpen = null, title, staticTile = false }) {
  const inner = (
    <>
      <span className="shd-kpi-h"><span className="shd-kpi-l">{label}</span><span className="shd-kpi-i"><Icon name={icon} size={16} /></span></span>
      <span className="shd-kpi-v">{value}</span>
      <span className="shd-kpi-s">{sub}</span>
    </>
  );
  if (staticTile) return <div className={`shd-card shd-kpi static ${tone}`}>{inner}</div>;
  return <button type="button" className={`shd-card shd-kpi ${tone}`} onClick={onOpen} title={title}>{inner}</button>;
}

export const Progress = ({ value, tone = '' }) => (
  <span className={`shd-progress ${tone}`}><i style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></span>
);

export const Avatar = ({ name }) => <span className="shd-avatar" style={{ background: toneFor(name) }}>{initialsOf(name)}</span>;

/** One task as a row; clicking it opens the task view. */
export function TaskItem({ task: t, onOpen }) {
  const late = t.nextFollowUp && t.nextFollowUp < todayISO() && OPEN.has(t.status);
  const when = t.status === 'Completed' ? `Done ${fmtD(t.closedAt || t.updatedAt)}` : (t.nextFollowUp ? fmtD(t.nextFollowUp) : 'No date');
  return (
    <button type="button" className="shd-item" onClick={() => onOpen(t.id)}>
      <span className="shd-item-main">
        <span className="shd-item-t">{t.task || 'Untitled'}</span>
        <span className="shd-item-s">{peopleOf(t).join(', ')}{t.company ? ' · ' + t.company : ''}{t.func ? ' · ' + t.func : ''}</span>
      </span>
      <span className="shd-item-r">{isP1(t) ? <Badge text="P1" variant="destructive" /> : null}<Badge text={when} variant={late ? 'warning' : 'outline'} /></span>
    </button>
  );
}

/** Created vs completed per week, the last 8 weeks: bars, grid, y-axis, tooltip on hover or focus. */
export function BarChart({ flow }) {
  const { top, ticks } = chartScale(flow);
  const h = (v) => (v / top) * 100;
  return (
    <>
      <div className="shd-chart" role="img" aria-label="Tasks created and completed per week, last 8 weeks">
        <div className="shd-chart-y">{ticks.map((t, i) => <span key={i}>{t}</span>)}</div>
        <div className="shd-chart-plot">
          <div className="shd-chart-grid">{ticks.map((_, i) => <i key={i} />)}</div>
          <div className="shd-chart-bars">
            {flow.map((w, i) => (
              <div className="shd-chart-col" tabIndex={0} key={i}>
                <div className="shd-chart-pair"><i className="c" style={{ height: `${h(w.created)}%` }} /><i className="d" style={{ height: `${h(w.completed)}%` }} /></div>
                <span className="shd-chart-x">{w.label}</span>
                <span className="shd-tip">
                  <b>Week of {w.label}</b>
                  <span><i className="c" />Created<b>{w.created}</b></span>
                  <span><i className="d" />Completed<b>{w.completed}</b></span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="shd-legend"><span><i className="c" />Created</span><span><i className="d" />Completed</span></div>
    </>
  );
}
