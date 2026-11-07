'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon } from '../../../components/Icon.jsx';
import { dueCls, dueLabel, fmtD } from '../../../lib/format.js';
import { isMine } from '../../../lib/scope.js';
import { KB_SHOW, MUTED_STATUSES, STATUS_OPTIONS, groupHierarchy, groupInfo } from './model.js';

const OPEN_KEY = 'rie_hier_open';
const readOpen = () => {
  try { return JSON.parse(localStorage.getItem(OPEN_KEY) || '{}') || {}; } catch { return {}; }
};

const STATUS_STYLES = {
  Pending: 'var(--txm)', 'In Progress': 'var(--ac2)', Completed: 'var(--gr)', 'On Hold': 'var(--warm)', Dropped: 'var(--hot)',
};
const statusColor = (s) => ({ color: STATUS_STYLES[s] || 'var(--txm)' });

const smallBtn = { fontSize: '.68rem', padding: '3px 8px' };

/** One task row (renderHTask) with its status select, due date, priority, owner and any actions under it. */
function HTask({ t, ctx, actionsOf }) {
  const { me, bulk } = ctx;
  const dc = dueCls(t.nextFollowUp);
  const muted = MUTED_STATUSES.has(t.status);
  const late = dc === 'due-ov' && !muted;
  // Same colour rule as the Board: red only for P1 + overdue + mine.
  const fire = late && t.priority === 'P1' && isMine(t, me);
  const dueColor = muted ? 'var(--txd)' : fire ? 'var(--hot)' : late || dc === 'due-to' ? 'var(--warm)' : 'var(--txm)';
  const prColor = fire ? 'var(--hot)' : t.priority === 'P1' ? 'var(--warm)' : 'var(--txd)';
  const actions = actionsOf(t.id);
  return (
    <div className="ht">
      <div className="ht-r">
        {bulk.mode ? (
          <input
            type="checkbox" className="kb-sel" aria-label={'Select ' + (t.task || 'Untitled')}
            checked={bulk.selected.has(t.id)} onChange={() => bulk.toggle(t.id)}
          />
        ) : null}
        <button type="button" className="ch-title ht-t" onClick={() => ctx.openTask(t.id)}>{t.task || 'Untitled'}</button>
        <select
          className="ch-status" title="Change status" aria-label={'Status of ' + (t.task || 'Untitled')} value={t.status}
          onChange={(e) => ctx.setStatus(t.id, e.target.value)}
        >
          {STATUS_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <span className="ht-d" style={{ color: dueColor }}>{dueLabel(t.nextFollowUp, muted)}</span>
        {t.priority ? <span className="ht-p" style={{ color: prColor }}>{t.priority}</span> : null}
        {t.assignedTo ? <span className="ht-o">{t.assignedTo.split(',')[0].trim()}</span> : null}
        <button type="button" className="kb-act-btn" title="Edit" aria-label="Edit" onClick={() => ctx.editTask(t.id)}>
          <Icon name="pencil" size={14} />
        </button>
      </div>
      {actions.length ? (
        <div className="ht-a">
          {actions.map((a) => (
            <div className="ht-ar" key={a.id}>
              <span className="ht-ai"><Icon name="zap" size={13} /></span>
              <span style={{ flex: 1 }}>{a.task || 'Untitled action'}</span>
              <span style={statusColor(a.status)}>{a.status}</span>
              <button type="button" className="kb-act-btn" title="Edit" aria-label="Edit" onClick={() => ctx.editTask(a.id)}>
                <Icon name="pencil" size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * One folded group (hGroup): a <details> whose header says what a closed group needs to be judged
 * without opening it. It starts open only if it holds an open task of mine due within a week (or
 * late); the choice is remembered per group. Closed tasks sit behind "+ N done".
 */
function HGroup({ group, ctx, open, onToggle, expanded, onMore, actionsOf, icon, dashed, extra }) {
  const info = groupInfo(group, { me: ctx.me, now: ctx.now });
  const { live, done, next, fire, total, pct } = info;
  const key = group.key;
  const showAll = expanded.has(key);
  return (
    <details className={'hg' + (dashed ? ' hg-dashed' : '')} open={open}>
      <summary className="hg-h" onClick={(e) => { e.preventDefault(); onToggle(key, !open); }}>
        <span className="hg-i">{icon}</span>
        <span className="hg-t">{group.title}</span>
        <span className="hg-m">{live.length} open{next ? ` · next ${fmtD(next)}` : ''}</span>
        {fire ? <span className="hg-fire">P1 overdue</span> : null}
        {total ? <span className="hg-bar" title={`${pct}% done`}><i style={{ width: pct + '%' }} /></span> : null}
        {extra ? <span className="hg-x" onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) e.preventDefault(); }}>{extra}</span> : null}
      </summary>
      <div className="hg-b">
        {live.length
          ? (showAll ? live : live.slice(0, KB_SHOW)).map((t) => <HTask key={t.id} t={t} ctx={ctx} actionsOf={actionsOf} />)
          : <div className="kb-empty">Nothing open</div>}
        {live.length > KB_SHOW && !showAll ? (
          <button type="button" className="kb-more" onClick={() => onMore(key)}>{live.length - KB_SHOW} more</button>
        ) : null}
        {done.length ? (
          <details className="hg-done">
            <summary>+ {done.length} done</summary>
            {done.map((t) => <HTask key={t.id} t={t} ctx={ctx} actionsOf={actionsOf} />)}
          </details>
        ) : null}
      </div>
    </details>
  );
}

/**
 * Work > Hierarchy: the tasks grouped by workstream, then by their first tag, then Unfiled. Groups with
 * open work first (soonest due at the top), groups with nothing open folded into one line at the bottom.
 */
export default function HierarchyView({ list, ctx, workstreams, entityLinks, actions }) {
  const [openMap, setOpenMap] = useState(readOpen);
  const [expanded, setExpanded] = useState(() => new Set());

  const groups = useMemo(() => groupHierarchy(list, { entityLinks, workstreams }), [list, entityLinks, workstreams]);
  const actionsOf = useMemo(() => {
    const parentToChildren = new Map();
    entityLinks.forEach(({ parentId, childId }) => {
      const k = String(parentId);
      if (!parentToChildren.has(k)) parentToChildren.set(k, []);
      parentToChildren.get(k).push(String(childId));
    });
    return (taskId) => (parentToChildren.get(String(taskId)) || [])
      .map((cid) => actions.find((a) => String(a.id) === cid)).filter(Boolean);
  }, [entityLinks, actions]);

  // Persist from the click: the state to come is the opposite of what is showing.
  const onToggle = (key, open) => {
    setOpenMap((m) => {
      const next = { ...m, [key]: !!open };
      try { localStorage.setItem(OPEN_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  const onMore = (key) => setExpanded((s) => new Set(s).add(key));

  const render = (g) => {
    const info = groupInfo(g, { me: ctx.me, now: ctx.now });
    let icon, dashed = false, extra = null, defaultOpen = info.wantsOpen;
    if (g.kind === 'ws') {
      const ws = g.ws;
      icon = <Icon name="layers" size={15} />;
      extra = (
        <>
          <select
            className="ch-status" style={statusColor(ws.status)} aria-label={'Workstream status of ' + g.title} value={ws.status}
            onChange={(e) => ctx.setWorkstreamStatus(ws.id, e.target.value)}
          >
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <Link className="btn b-ol" style={smallBtn} href={`/work/initiatives/${ws.id}`} aria-label={'Open ' + g.title}>↗</Link>
        </>
      );
    } else if (g.kind === 'tag') {
      icon = <Icon name="tag" size={15} />; dashed = true; defaultOpen = false;
    } else {
      // "Uncategorized" reads as a failing; "Unfiled" reads as a chore, and the chore has a button.
      icon = <Icon name="note" size={15} />; dashed = true; defaultOpen = false;
      extra = <Link className="btn b-ol" style={smallBtn} href="/today/classify">Classify</Link>;
    }
    const open = g.key in openMap ? openMap[g.key] : defaultOpen;
    return (
      <HGroup
        key={g.key} group={g} ctx={ctx} open={open} onToggle={onToggle} expanded={expanded} onMore={onMore}
        actionsOf={actionsOf} icon={icon} dashed={dashed} extra={extra}
      />
    );
  };

  const empty = !groups.live.length && !groups.done.length;
  return (
    <div className="hier">
      {groups.live.map(render)}
      {groups.done.length ? (
        <details className="hg hg-dashed hg-alldone">
          <summary className="hg-h">
            <span className="hg-i">✓</span>
            <span className="hg-t">{groups.done.length} {groups.done.length === 1 ? 'group' : 'groups'} with nothing open</span>
          </summary>
          <div className="hg-b">{groups.done.map(render)}</div>
        </details>
      ) : null}
      {empty ? (
        <div className="kb-empty" style={{ padding: 40 }}>
          {ctx.scope === 'mine'
            ? 'Nothing of yours here. The team’s work is under Team.'
            : <>Nothing matches. <a href="#" onClick={(e) => { e.preventDefault(); ctx.clearFilters(); }}>Clear the filters</a> to see everything.</>}
        </div>
      ) : null}
    </div>
  );
}
