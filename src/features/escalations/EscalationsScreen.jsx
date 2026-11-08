'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '../../store/useStore.js';
import { setReportsTo } from '../../lib/escalation-actions.js';
import { internalPeople, personName } from '../../lib/mappers.js';
import { openEscalateModal, openEscAction } from './escalate-state.js';
import { useEscalations } from './hooks/useEscalations.js';
import {
  EMPTY, LEVEL_NAME, MAX_LEVEL, TRAIL_VERB, VIEWS, ago, cardRights, recipientsOf,
} from './model.js';

/** "Step 2 of 4: Escalated", four little bars. */
function StepDots({ level }) {
  return (
    <span className="es-steps" title={`Step ${level} of ${MAX_LEVEL}: ${LEVEL_NAME[level]}`}>
      {Array.from({ length: MAX_LEVEL }, (_, i) => <i key={i} className={i < level ? 'on' : ''}></i>)}
      <b>{LEVEL_NAME[level] || ''}</b>
    </span>
  );
}

/** The history: newest hop first. */
function Trail({ e }) {
  const trail = e.trail || [];
  return (
    <details className="es-trail">
      <summary>History ({trail.length})</summary>
      <ul>
        {trail.slice().reverse().map((t, i) => (
          <li key={i}>
            <span>{ago(t.at)}</span>
            <div>
              <strong>{personName(t.by)}</strong> {TRAIL_VERB[t.action] || t.action}
              {t.to ? <> <strong>{personName(t.to)}</strong></> : null}
              {t.note ? <em>{t.note}</em> : null}
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Card({ e, rights, onOpenTask }) {
  const { open, withMe, canAct, canWithdraw } = rights;
  const task = useStore((s) => s.tasks.find((t) => String(t.id) === String(e.entity_id)));
  return (
    <article className={`es-card${open ? '' : ' closed'}${withMe ? ' mine' : ''}`}>
      <div className="es-top">
        {open ? <StepDots level={e.level} /> : <span className={`es-done ${e.status}`}>{e.status === 'resolved' ? 'Resolved' : 'Withdrawn'}</span>}
        <span className="es-when">{ago(e.created_at)}</span>
      </div>
      <h3 className="es-title">
        <a href="#" onClick={(ev) => { ev.preventDefault(); if (task) onOpenTask(task.id); }}>{e.task_title}</a>
      </h3>
      <div className="es-route">
        <span>{personName(e.raised_by)}</span>
        <svg viewBox="0 0 16 16" width="14" height="14"><path d="M3 8h9M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span className="es-to">{personName(e.assigned_to)}{withMe ? ' (you)' : ''}</span>
      </div>
      <p className="es-reason">{e.reason}</p>
      {e.notes ? <p className="es-notes">{e.notes}</p> : null}
      {e.resolution ? <p className="es-resolution"><strong>{e.status === 'resolved' ? 'Decision' : 'Note'}:</strong> {e.resolution}</p> : null}
      <Trail e={e} />
      {open && (canAct || canWithdraw) ? (
        <div className="es-actions">
          {canWithdraw && !canAct ? <button type="button" className="btn b-sm b-ol" onClick={() => openEscAction('withdraw', e.id)}>Withdraw</button> : null}
          {canAct && e.level < MAX_LEVEL ? <button type="button" className="btn b-sm b-ol" onClick={() => openEscAction('push', e.id)}>Escalate further</button> : null}
          {canAct ? <button type="button" className="btn b-sm b-pr" onClick={() => openEscAction('resolve', e.id)}>Resolve</button> : null}
        </div>
      ) : null}
    </article>
  );
}

/** Admins only: who each person escalates to by default. */
function ReportingLines() {
  useStore((s) => s.people);
  const [rev, setRev] = useState(0);   // a refused change re-draws the selects so they show what is stored again
  const people = internalPeople();
  return (
    <section className="es-lines">
      <h2>Reporting lines</h2>
      <p>Who each person escalates to by default. Leave blank and the form suggests an admin instead.</p>
      <div className="es-lines-grid">
        {people.map((p) => (
          <label key={p.code}><span>{p.display_name || p.code}</span>
            <select
              key={`${p.code}:${p.reports_to || ''}:${rev}`}
              className="fsel2"
              defaultValue={p.reports_to || ''}
              onChange={async (ev) => { if (!(await setReportsTo(p.code, ev.target.value))) setRev((n) => n + 1); }}
            >
              <option value="">No default</option>
              {recipientsOf(people, [p.code]).map((q) => <option key={q.code} value={q.code}>{q.display_name || q.code}</option>)}
            </select>
          </label>
        ))}
      </div>
    </section>
  );
}

/**
 * The Escalations page (the old #escalations-root): header, the four sub-views as tabs (route segments),
 * the cards of the chosen view and, for admins, the reporting lines. `view` is the segment
 * (/escalations/<view>), so the address says which tab is on.
 */
export default function EscalationsScreen({ view }) {
  const router = useRouter();
  const { error, loaded, me, canWrite, isAdmin, reload, waiting, raised, open, closed } = useEscalations();
  useStore((s) => s.people);   // names follow the people list
  useStore((s) => s.tasks);    // the card's title link needs the task

  if (error === 'missing') {
    return (
      <div className="pg-wrap"><div className="empty-state"><div className="empty-ic">!</div>
        <h2>Escalations are not set up yet</h2>
        <p>The database table is missing. An admin needs to apply the latest migration (<code>20261010_escalations_profiles_alerts.sql</code>), then refresh this page.</p></div></div>
    );
  }
  if (error) {
    return (
      <div className="pg-wrap"><div className="empty-state"><div className="empty-ic">!</div>
        <h2>Could not load escalations</h2><p>{error}</p>
        <button type="button" className="btn b-pr" onClick={() => reload()}>Try again</button></div></div>
    );
  }
  if (!loaded) return <div className="pg-wrap"><p className="fhint">Loading…</p></div>;

  const lists = { waiting, raised, open, closed };
  const shown = lists[view] || open;
  const empty = EMPTY[view] || EMPTY.open;
  const counts = { waiting: waiting.length, raised: raised.length, open: open.length, closed: closed.length };
  const rightsOf = (e) => cardRights(e, { me, canWrite, isAdmin });

  return (
    <div className="pg-wrap">
      <header className="pg-head">
        <div>
          <h1>Escalations</h1>
          <p>When a task is stuck, hand it to someone who can unblock it. Up to {MAX_LEVEL} steps, every one recorded.</p>
        </div>
        {canWrite ? <button type="button" className="btn b-pr" onClick={() => openEscalateModal()}>Escalate a task</button> : null}
      </header>
      <div className="seg" role="tablist">
        {VIEWS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => router.push(`/escalations/${k}`)}>
            {label}<b>{counts[k]}</b>
          </button>
        ))}
      </div>
      {shown.length
        ? <div className="es-list">{shown.map((e) => <Card key={e.id} e={e} rights={rightsOf(e)} onOpenTask={(id) => router.push(`/work/tasks/${encodeURIComponent(String(id))}`)} />)}</div>
        : <div className="empty-state"><div className="empty-ic">✓</div><h2>{empty[0]}</h2><p>{empty[1]}</p></div>}
      {isAdmin ? <ReportingLines /> : null}
    </div>
  );
}
