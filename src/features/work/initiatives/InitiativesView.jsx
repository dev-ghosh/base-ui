'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '../../../store/useStore.js';
import { personName } from '../../../lib/mappers.js';
import { fmtD } from '../../../lib/format.js';
import { safeGet } from '../../../lib/rest.js';
import { SCOPE_LABEL, entityInScope, mineSet } from '../../../lib/scope.js';
import { useScope } from '../hooks/useScope.js';
import { HEALTH_COLOR, HEALTH_LABEL, groupInitiatives, healthExplain } from './model.js';

const FELL_BACK = 'Your sign-in is not linked to a person yet, so Mine is not available. Showing Everyone. An admin can fix that under Account → Manage access.';

function Card({ x, me, onOpen }) {
  const { i, share } = x;
  const hc = HEALTH_COLOR[i.health] || 'var(--txd)';
  const hl = HEALTH_LABEL[i.health] || i.health;
  const owner = i.ownerCode ? (personName(i.ownerCode) || i.ownerCode) : 'Unowned';
  return (
    <button type="button" className={'ih-card' + (i.ownerCode === me ? ' ih-mine' : '')} onClick={() => onOpen(i.id)}>
      <div className="ih-t">{i.title}</div>
      <div className="ih-h">
        <i style={{ background: hc }}></i><span style={{ color: hc }}>{hl}</span>
        <span className="ih-why">{healthExplain(i)}</span>
      </div>
      <div className="ih-m">
        <span>{i.activeChildren} active</span>
        {/* Overdue counts are neutral unless one of them is my P1: red is for fire. */}
        {i.overdueChildren > 0 ? <span className={share.fire ? 'ih-fire' : ''}>{i.overdueChildren} overdue</span> : null}
        {i.nextFollowUp ? <span>next {fmtD(i.nextFollowUp)}</span> : null}
        <span className="ih-o">{owner}</span>
        {share.mine ? <span className="ih-share">{share.mine} of yours{share.dueSoon ? ` · ${share.dueSoon} due this week` : ''}</span> : null}
      </div>
    </button>
  );
}

const th = { padding: '3px 6px', fontSize: '.68rem', color: 'var(--txd)', fontWeight: 600, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '.04em' };
const td = { padding: '3px 6px', fontSize: '.72rem', color: 'var(--tx)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

function SignalPanel({ label, rows, cols }) {
  const header = (
    <div style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--txm)', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
      <span>{label}</span>
      <span style={{ color: 'var(--txd)', fontWeight: 400 }}>{rows.length} rows</span>
    </div>
  );
  if (!rows.length) {
    return (
      <div style={{ background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 'var(--rs)', padding: '10px 12px' }}>
        {header}<div style={{ color: 'var(--gr)', fontSize: '.75rem' }}>None ✓</div>
      </div>
    );
  }
  return (
    <div style={{ background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 'var(--rs)', padding: '10px 12px', overflowX: 'auto' }}>
      {header}
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr>{cols.map((c) => <th key={c} style={th}>{c.replace(/_/g, ' ')}</th>)}</tr></thead>
        <tbody>
          {rows.slice(0, 8).map((r, n) => (
            <tr key={n}>{cols.map((c) => <td key={c} style={td} title={String(r[c] ?? '')}>{String(r[c] ?? '—')}</td>)}</tr>
          ))}
        </tbody>
      </table>
      {rows.length > 8 ? <div style={{ fontSize: '.68rem', color: 'var(--txd)', marginTop: 4 }}>+{rows.length - 8} more</div> : null}
    </div>
  );
}

/** Diagnostic signals: collapsed by default, loaded the first time it is opened (loadSignals). */
function Signals() {
  const [state, setState] = useState({ phase: 'idle' });
  const onToggle = async (e) => {
    if (!e.currentTarget.open || state.phase === 'loading' || state.phase === 'ready') return;
    setState({ phase: 'loading' });
    try {
      const [stale, cluster, aging, wrap] = await Promise.all([
        safeGet('v_signal_staleness', 'limit=15'),
        safeGet('v_signal_sibling_cluster', 'limit=15'),
        safeGet('v_signal_action_aging', 'limit=15'),
        safeGet('v_signal_task_wrap', 'limit=15'),
      ]);
      setState({ phase: 'ready', stale, cluster, aging, wrap });
    } catch (err) {
      setState({ phase: 'error', message: err.message });
    }
  };
  const muted = { color: 'var(--txd)', fontSize: '.78rem', paddingTop: 4 };
  return (
    <details onToggle={onToggle} style={{ border: '1px solid var(--bd)', borderRadius: 'var(--r)', padding: 0, marginTop: 20 }}>
      <summary style={{ cursor: 'pointer', fontSize: '.88rem', fontWeight: 700, color: 'var(--txm)', padding: '10px 14px', userSelect: 'none', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>▶</span>
        <span>Diagnostic signals</span>
        <span style={{ fontWeight: 400, fontSize: '.73rem', color: 'var(--txd)' }}>(staleness · clusters · aging actions · wrap candidates)</span>
      </summary>
      <div id="signals-body" style={{ padding: '0 14px 14px' }}>
        {state.phase === 'idle' ? <div style={muted}>Expand to load…</div> : null}
        {state.phase === 'loading' ? <div style={muted}>Loading…</div> : null}
        {state.phase === 'error' ? <div style={{ ...muted, color: 'var(--hot)' }}>Error: {state.message}</div> : null}
        {state.phase === 'ready' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14, paddingTop: 10 }}>
            <SignalPanel label="⏸ Staleness (idle 14d+)" rows={state.stale} cols={['title', 'status', 'owner_code', 'days_idle']} />
            <SignalPanel label="Sibling clusters" rows={state.cluster} cols={['canonical_topic', 'orphan_count', 'front_code']} />
            <SignalPanel label="Aging actions (7d+)" rows={state.aging} cols={['title', 'status', 'owner_code', 'days_open']} />
            <SignalPanel label="Wrap candidates" rows={state.wrap} cols={['title', 'child_count', 'front_code']} />
          </div>
        ) : null}
      </div>
    </details>
  );
}

/**
 * Work > Initiatives (renderInitiativesTab): initiatives only, as cards in three groups by attention
 * needed (decisions live in Decide). Scope: an initiative is mine when I own it or it holds one of my
 * tasks. A card opens the initiative viewer route.
 */
export default function InitiativesView() {
  const router = useRouter();
  const { scope, me, fellBack } = useScope();
  const initiatives = useStore((s) => s.initiatives);
  const tasks = useStore((s) => s.tasks);
  const links = useStore((s) => s.entityLinks);
  useStore((s) => s.people);                      // owner names re-render with the people list

  const view = useMemo(() => {
    const mineIds = mineSet(tasks, links, me);
    const all = initiatives.filter((e) => entityInScope(e, scope, me, mineIds));
    return { all, ...groupInitiatives(all, { tasks, links, me, now: new Date() }) };
  }, [initiatives, tasks, links, me, scope]);
  const open = useCallback((id) => router.push(`/work/initiatives/${id}`), [router]);

  const { all, groups, shut } = view;
  return (
    <div className="tp active" id="tab-initiatives">
      <div className="ih-wrap">
        <div className="ih-top">
          <h2>Initiatives</h2>
          <span className="ih-n">{view.open.length} open{shut.length ? ` · ${shut.length} closed` : ''}</span>
        </div>
        {fellBack ? <div className="mx-empty">{FELL_BACK}</div> : null}
        {!all.length ? (
          <div className="empty" style={{ padding: '20px 0' }}>
            {SCOPE_LABEL[scope] === 'Mine'
              ? 'None of the initiatives holds a task of yours yet. The rest are under Team.'
              : 'No initiatives yet. Promote a workstream to start one.'}
          </div>
        ) : null}
        {groups.filter((g) => g.items.length).map((g) => (
          <section key={g.key} className={`ih-g ih-${g.key}`}>
            <div className="ih-gh"><h3>{g.title}</h3><span>{g.items.length}</span>{g.blurb ? <p>{g.blurb}</p> : null}</div>
            <div className="ih-cards">{g.items.map((x) => <Card key={x.i.id} x={x} me={me} onOpen={open} />)}</div>
          </section>
        ))}
        {shut.length ? (
          <details className="ih-closed"><summary>+ {shut.length} closed</summary>
            <div className="ih-cards">{shut.map((x) => <Card key={x.i.id} x={x} me={me} onOpen={open} />)}</div>
          </details>
        ) : null}
        <Signals />
      </div>
    </div>
  );
}
