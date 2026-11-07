'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Modal from '../../../components/Modal.jsx';
import { Icon } from '../../../components/Icon.jsx';
import { useStore } from '../../../store/useStore.js';
import { fmtD } from '../../../lib/format.js';
import { useInitiativeDrill } from './hooks/useInitiativeDrill.js';
import {
  LIFECYCLE, OUTCOMES, PRIORITY_COLOR, SC_NEXT_STATUS, SC_STATUS_COLOR, SC_STATUS_LABEL, STATUS_OPTIONS, TIER_ICON, isClosed,
} from './model.js';

const secLabel = { fontSize: '.8rem', fontWeight: 600, color: 'var(--txm)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' };
const tierIcon = (t) => (TIER_ICON[t] ? <Icon name={TIER_ICON[t]} size={14} /> : '•');
const statusLabel = (v) => v.replace('_', ' ');

/* ── lifecycle and meta ───────────────────────────────────────────────────── */

function Lifecycle({ e, drill, onClose }) {
  const cur = isClosed(e.status) ? 'completed' : (e.status || 'in_progress');
  const at = LIFECYCLE.findIndex((s) => s.id === cur);
  return (
    <>
      <div className="lc">
        {LIFECYCLE.map((s, i) => (
          <span key={s.id} style={{ display: 'contents' }}>
            {i > 0 ? <span className="lc-line"></span> : null}
            <button
              type="button" className={'lc-step' + (i === at ? ' on' : '') + (i < at ? ' done' : '')}
              title={i === at ? 'Current stage' : `Move to ${s.label}`}
              onClick={() => (s.id === 'completed' ? onClose() : drill.setField(e.id, 'status', s.id))}
            >
              <span className="lc-dot"></span>{s.label}
            </button>
          </span>
        ))}
      </div>
      {isClosed(e.status) ? (
        <div className="lc-out">
          <strong>{OUTCOMES.find((o) => o.id === e.outcome)?.label || 'Closed'}</strong>
          {e.closed_at ? <span className="lc-when">{fmtD(String(e.closed_at).slice(0, 10))}</span> : null}
          {e.outcome_summary ? <div className="lc-sum">{e.outcome_summary}</div> : null}
          {!e.outcome ? <div className="lc-sum lc-warn">Closed without an outcome recorded.</div> : null}
          <button type="button" className="mx-btn" onClick={() => drill.setField(e.id, 'status', 'in_progress')}>Reopen</button>
        </div>
      ) : null}
    </>
  );
}

/** The owner vocabulary is public.people. No fallback list: if people has not loaded, the only honest
 *  options are "Unowned" and the current value. */
function OwnerOptions({ current }) {
  const all = useStore((s) => s.people);
  const people = all.filter((p) => p.code && !p.archived_at);
  const list = people.length ? people : (current ? [{ code: current, display_name: current }] : []);
  return (
    <>
      <option value="">Unowned</option>
      {list.map((p) => <option key={p.code} value={p.code}>{p.display_name || p.code}</option>)}
    </>
  );
}

function Meta({ e, drill, onCloseBox }) {
  return (
    <>
      {e.tier === 'initiative' ? <Lifecycle e={e} drill={drill} onClose={onCloseBox} /> : null}
      <div className="ent-meta">
        <div className="ent-row">
          <span className="ent-tier">{tierIcon(e.tier)} {e.tier}</span>
          <label className="ent-f">Status
            <select value={e.status || ''} onChange={(ev) => drill.setField(e.id, 'status', ev.target.value)}>
              {STATUS_OPTIONS.map((v) => <option key={v} value={v}>{statusLabel(v)}</option>)}
            </select>
          </label>
          <label className="ent-f">Priority
            <select value={e.priority || ''} onChange={(ev) => drill.setField(e.id, 'priority', ev.target.value)}>
              <option value="">—</option>
              {['P1', 'P2', 'P3'].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label className="ent-f">Owner
            <select value={e.owner_code || ''} onChange={(ev) => drill.setField(e.id, 'owner_code', ev.target.value)}>
              <OwnerOptions current={e.owner_code} />
            </select>
          </label>
          <label className="ent-f">Next follow-up
            <input type="date" value={e.next_follow_up || ''} onChange={(ev) => drill.setField(e.id, 'next_follow_up', ev.target.value)} />
          </label>
          {e.front_code ? <span className="ent-ro">Front <strong>{e.front_code}</strong></span> : null}
        </div>
        {e.intent ? <div className="ent-intent">{e.intent}</div> : null}
      </div>
    </>
  );
}

/** "How did this end?" (openCloseInitiative / closeInitiative). Stays until the write lands. */
function CloseBox({ drill, onDone }) {
  const [outcome, setOutcome] = useState('');
  const [summary, setSummary] = useState('');
  return (
    <div className="lc-close">
      <div className="lc-close-h">How did this end?</div>
      <div className="lc-outs">
        {OUTCOMES.map((o) => (
          <button key={o.id} type="button" className={'lc-out-btn' + (outcome === o.id ? ' on' : '')} title={o.blurb} onClick={() => setOutcome(o.id)}>{o.label}</button>
        ))}
      </div>
      <textarea
        className="fta" id="lc-summary" value={summary} onChange={(ev) => setSummary(ev.target.value)}
        placeholder="What happened, in a sentence. This is what someone reads in six months."
      />
      <div className="lc-close-f">
        <button type="button" className="btn b-pr" onClick={async () => { if (await drill.close(outcome, summary)) onDone(); }}>Close initiative</button>
        <button type="button" className="btn b-gh" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}

/* ── success definition ───────────────────────────────────────────────────── */

const critInput = { flex: 1, padding: '5px 8px', background: 'var(--bg)', border: '1px solid var(--bd)', borderRadius: 'var(--rs)', color: 'var(--tx)', fontSize: '.78rem', fontFamily: 'inherit' };
const critBtn = { fontSize: '.7rem', background: 'transparent', border: '1px solid var(--bd)', borderRadius: 'var(--rs)', cursor: 'pointer' };

/** A text field that commits on blur (the old `onchange`), and follows the entity if a write is rolled back. */
function CommitInput({ value, onCommit, ...rest }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return <input type="text" value={v} onChange={(ev) => setV(ev.target.value)} onBlur={() => { if (v !== value) onCommit(v); }} {...rest} />;
}

function CriterionRow({ c, idx, drill }) {
  const status = c.status || 'unknown';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'var(--sf2)', border: '1px solid var(--bd)', borderRadius: 'var(--rs)' }}>
      <CommitInput placeholder="Metric" value={c.metric || ''} style={critInput} onCommit={(v) => drill.editCriterion(idx, { metric: v })} />
      <CommitInput placeholder="Target" value={c.target || ''} style={critInput} onCommit={(v) => drill.editCriterion(idx, { target: v })} />
      <button
        type="button" title="Cycle status" style={{ ...critBtn, padding: '4px 10px', color: SC_STATUS_COLOR[status], whiteSpace: 'nowrap' }}
        onClick={() => drill.editCriterion(idx, { status: SC_NEXT_STATUS[status] })}
      >{SC_STATUS_LABEL[status]}</button>
      <button type="button" title="Remove" style={{ ...critBtn, padding: '4px 8px', color: 'var(--hot)' }} onClick={() => drill.removeCriterion(idx)}>✕</button>
    </div>
  );
}

function SuccessDefinition({ e, drill }) {
  const criteria = Array.isArray(e.success_criteria) ? e.success_criteria : [];
  const outcome = e.outcome_definition || '';
  const [text, setText] = useState(outcome);
  useEffect(() => setText(outcome), [outcome]);
  return (
    <div style={{ background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 'var(--rs)', padding: '14px 16px' }}>
      <div style={secLabel}>What does success look like?</div>
      <textarea
        placeholder={`Describe what success looks like for this ${e.tier || 'item'}…`} value={text}
        onChange={(ev) => setText(ev.target.value)} onBlur={() => drill.saveOutcomeDefinition(text)}
        style={{ width: '100%', minHeight: 64, padding: '8px 10px', background: 'var(--sf2)', border: '1px solid var(--bd)', borderRadius: 'var(--rs)', color: 'var(--tx)', fontSize: '.82rem', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 6 }}>
        <div style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Success criteria</div>
        <button type="button" className="btn b-ol" style={{ fontSize: '.72rem', padding: '4px 10px' }} onClick={drill.addCriterion}>+ Add criterion</button>
      </div>
      <div id="sd-criteria-list">
        {criteria.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {criteria.map((c, i) => <CriterionRow key={i} c={c} idx={i} drill={drill} />)}
          </div>
        ) : (
          <div style={{ fontSize: '.78rem', color: 'var(--txd)', fontStyle: 'italic' }}>No criteria yet. Add one to define what &quot;done&quot; looks like.</div>
        )}
      </div>
    </div>
  );
}

/* ── children, lineage, audit ─────────────────────────────────────────────── */

function ChildRow({ c, drill, openIt }) {
  return (
    <div className={'ch-row' + (isClosed(c.status) ? ' ch-done' : '')}>
      <span className="ch-icon">{tierIcon(c.tier)}</span>
      <button type="button" className="ch-title" onClick={() => openIt(c)} title="Open">{c.title || 'Untitled'}</button>
      {c.priority ? <span className="ch-pr" style={{ color: PRIORITY_COLOR[c.priority] || 'var(--txd)' }}>{c.priority}</span> : null}
      {c.next_follow_up ? <span className="ch-date">{fmtD(c.next_follow_up)}</span> : null}
      <select className="ch-status" value={c.status || ''} onChange={(ev) => drill.setField(c.id, 'status', ev.target.value)} title="Change status">
        {STATUS_OPTIONS.map((v) => <option key={v} value={v}>{statusLabel(v)}</option>)}
      </select>
    </div>
  );
}

/** Children of an initiative. A task opens the task viewer; a workstream opens its own panel. */
function Children({ items, drill, openIt }) {
  if (!items.length) return <div className="empty">Nothing linked to this yet</div>;
  const open = items.filter((c) => !isClosed(c.status));
  const done = items.filter((c) => isClosed(c.status));
  return (
    <>
      {open.map((c) => <ChildRow key={c.id} c={c} drill={drill} openIt={openIt} />)}
      {done.length ? (
        <details className="ch-done-wrap"><summary>{done.length} closed</summary>
          {done.map((c) => <ChildRow key={c.id} c={c} drill={drill} openIt={openIt} />)}
        </details>
      ) : null}
    </>
  );
}

function Lineage({ lineage }) {
  return (
    <div style={{ borderLeft: '2px solid var(--bd)', paddingLeft: 14 }}>
      {lineage.map((l) => (
        <div key={l.id} style={{ marginBottom: 10, position: 'relative' }}>
          <div style={{ position: 'absolute', left: -19, top: 4, width: 8, height: 8, borderRadius: '50%', background: 'var(--ac)' }}></div>
          <div style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--ac2)' }}>{l.event}</div>
          <div style={{ fontSize: '.74rem', color: 'var(--txm)' }}>{l.sourceTierAtEvent} → {l.derivedTierAtEvent}</div>
          {l.reason ? <div style={{ fontSize: '.74rem', color: 'var(--txd)' }}>{l.reason}</div> : null}
          <div style={{ fontSize: '.7rem', color: 'var(--txd)' }}>{fmtD(l.createdAt)} · {l.createdBy}</div>
        </div>
      ))}
    </div>
  );
}

function AuditLog({ audits }) {
  if (!audits.length) return <div className="empty">No audit events yet</div>;
  return audits.slice(0, 15).map((a) => (
    <div key={a.id} style={{ display: 'flex', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--bd2)' }}>
      <span style={{ fontSize: '.7rem', color: 'var(--txd)', whiteSpace: 'nowrap', minWidth: 80 }}>{fmtD(a.createdAt)}</span>
      <span style={{ fontSize: '.75rem', fontWeight: 500, color: 'var(--ac2)' }}>{a.eventType}</span>
      {a.fieldName ? <span style={{ fontSize: '.74rem', color: 'var(--txm)' }}>{a.fieldName}:</span> : null}
      {a.oldValue ? <span style={{ fontSize: '.74rem', color: 'var(--hot)', textDecoration: 'line-through' }}>{a.oldValue}</span> : null}
      {a.newValue ? <span style={{ fontSize: '.74rem', color: 'var(--gr)' }}>{a.newValue}</span> : null}
      {a.notes ? <span style={{ fontSize: '.74rem', color: 'var(--txm)' }}>{a.notes}</span> : null}
      <span style={{ fontSize: '.7rem', color: 'var(--txd)', marginLeft: 'auto' }}>{a.actor}</span>
    </div>
  ));
}

/* ── the viewer ───────────────────────────────────────────────────────────── */

/**
 * The initiative / workstream drill (mo-entity-det, openInitiativeDrill): lifecycle, status / priority /
 * owner / follow-up controls, success definition, children, lineage and the audit log.
 * `framed` renders it inside the page frame (a direct visit to /work/initiatives/<id>); otherwise it is
 * the modal over whatever page opened it. An id with no visible row shows a message inside the frame.
 */
export default function InitiativeViewer({ id, framed = false, onClose }) {
  const router = useRouter();
  const drill = useInitiativeDrill(id);
  const [closing, setClosing] = useState(false);
  useEffect(() => setClosing(false), [id]);
  const { phase, entity, children, audits, lineage } = drill;

  const openIt = (c) => router.push(c.tier === 'task' ? `/work/tasks/${c.id}` : `/work/initiatives/${c.id}`);
  const title = phase === 'loading' ? 'Loading…' : (entity?.title || 'Entity Detail');

  let body;
  if (phase === 'loading') {
    body = <div style={{ padding: 20, textAlign: 'center', color: 'var(--txm)' }}>Loading…</div>;
  } else if (phase === 'error') {
    body = <div style={{ color: 'var(--hot)', padding: 16 }}>Error loading entity: {drill.error}</div>;
  } else if (!entity) {
    body = (
      <div className="empty" style={{ padding: '20px 16px' }}>
        Not found. It may have been deleted, or it is not one you can see.<br /><span style={{ color: 'var(--txd)' }}>{String(id)}</span>
      </div>
    );
  } else {
    body = (
      <>
        {closing ? <CloseBox drill={drill} onDone={() => setClosing(false)} /> : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Meta e={entity} drill={drill} onCloseBox={() => setClosing(true)} />
          <SuccessDefinition e={entity} drill={drill} />
          <div>
            <div style={secLabel}>Children &mdash; {children.filter((c) => !isClosed(c.status)).length} open of {children.length}</div>
            <Children items={children} drill={drill} openIt={openIt} />
          </div>
          {lineage.length ? (
            <div>
              <div style={secLabel}>Lineage</div>
              <Lineage lineage={lineage} />
            </div>
          ) : null}
          <div>
            <div style={secLabel}>Audit Log</div>
            <AuditLog audits={audits} />
          </div>
        </div>
      </>
    );
  }

  const scroll = { fontSize: '.83rem', lineHeight: 1.7, maxHeight: '70vh', overflowY: 'auto' };
  const foot = <div className="mf"><button type="button" className="btn b-gh" onClick={onClose}>Close</button></div>;

  if (framed) {
    return (
      <div className="tp active">
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>
          <div className="mb mb-lg" style={{ maxWidth: 700, margin: '0 auto' }}>
            <div className="mh">
              <div className="mti" id="entity-det-title">{title}</div>
              <button type="button" className="mx" onClick={onClose} aria-label="Close">✕</button>
            </div>
            <div id="entity-det-body" style={scroll}>{body}</div>
            {foot}
          </div>
        </div>
      </div>
    );
  }
  return (
    <Modal id="mo-entity-det" open wide maxWidth={700} title={title} onClose={onClose}>
      <div id="entity-det-body" style={scroll}>{body}</div>
      {foot}
    </Modal>
  );
}

