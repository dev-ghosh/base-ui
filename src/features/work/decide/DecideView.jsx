'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useStore } from '../../../store/useStore.js';
import { setStatus } from '../../../lib/status.js';
import { todayISO } from '../../../lib/queue.js';
import { mineSet } from '../../../lib/scope.js';
import {
  OUTCOMES, STEP, ageWords, decideCounts, decideDefer, decideResolve, decideSweep, decideSweepUndo,
  headline, loadDecisions, metaLine, partition,
} from '../../../lib/decide.js';
import { useScope } from '../hooks/useScope.js';
import CleanupQueue from './CleanupQueue.jsx';

const FELL_BACK = 'Your sign-in is not linked to a person yet, so Mine is not available. Showing Everyone. An admin can fix that under Account → Manage access.';

function Card({ d, open, onToggle, draft, setDraft, today }) {
  const id = String(d.id);
  const text = headline(d);
  return (
    <article className={'dq-card' + (open ? ' open' : '')}>
      <button type="button" className="dq-head" onClick={onToggle} aria-expanded={open}>
        <span className="dq-q">{text}</span>
        <span className="dq-meta">{metaLine(d) || (d.signal_code || '').replace(/_/g, ' ').toLowerCase()}</span>
        <span className="dq-age" title={`${d.age_days} days`}>{ageWords(d.age_days)}</span>
      </button>
      {open ? (
        <div className="dq-body">
          {d.question && d.question.length > text.length ? <div className="dq-full">{d.question}</div> : null}
          {d.recommended_action ? (
            <div className="dq-rec"><span className="dq-rec-l">Suggested</span>{d.recommended_action}</div>
          ) : null}
          <div className="dq-sig">{d.signal_code}{d.confidence != null ? ` · confidence ${Math.round(Number(d.confidence) * 100)}%` : ''}</div>

          <label className="dq-note-l" htmlFor={`dq-note-${id}`}>What did you decide, and why?</label>
          <textarea
            className="fta" id={`dq-note-${id}`} value={draft.note}
            onChange={(e) => setDraft({ note: e.target.value })}
            placeholder="One or two sentences. This is what someone reads in six months."
          />

          <div className="dq-acts">
            {OUTCOMES.map((o) => (
              <button
                key={o.id} type="button" className={`dq-btn dq-${o.id}`} title={o.blurb}
                onClick={async () => {
                  const r = await decideResolve(d.id, o.id, draft.note);
                  if (r === 'invalid') document.getElementById(`dq-note-${id}`)?.focus();
                }}
              >{o.label}</button>
            ))}
            <span className="dq-later">
              <input
                type="date" id={`dq-when-${id}`} min={today} title="Come back to it on" value={draft.when}
                onChange={(e) => setDraft({ when: e.target.value })}
              />
              <button
                type="button" className="dq-btn dq-defer"
                onClick={async () => {
                  const r = await decideDefer(d.id, draft.when);
                  if (r === 'invalid') document.getElementById(`dq-when-${id}`)?.focus();
                }}
              >Not now</button>
            </span>
          </div>
        </div>
      ) : null}
    </article>
  );
}

/**
 * Work > Decide (js/decide.js): the decision queue as something you can work. `kind` is the route
 * segment (business | system); the queue is the first five ("This week") and the rest folded under
 * "Later", revealed five at a time. Scope filters through the same id set as Initiatives.
 */
export default function DecideView({ kind }) {
  const { scope, me, urlScope, fellBack } = useScope();
  const rows = useStore((s) => s.decideRows);
  const loaded = useStore((s) => s.decideLoaded);
  const sweep = useStore((s) => s.decideSweep);
  const cleanups = useStore((s) => s.cleanups);
  const tasks = useStore((s) => s.tasks);
  const links = useStore((s) => s.entityLinks);
  const mineIds = useMemo(() => mineSet(tasks, links, me), [tasks, links, me]);

  const [expanded, setExpanded] = useState(() => new Set());
  const [laterShown, setLaterShown] = useState(STEP);
  const [drafts, setDrafts] = useState({});
  const [sweepWhen, setSweepWhen] = useState('');
  const [sweepNote, setSweepNote] = useState('');
  const [loadError, setLoadError] = useState('');
  
  const load = async () => {
    try { setLoadError(''); await loadDecisions(); }
    catch (e) { setLoadError(e.message); setStatus('error', 'Could not load decisions: ' + e.message); }
  };
  // As the old renderDecideView: an empty list is fetched again on every visit.
  useEffect(() => {
    if (rows.length === 0) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = decideCounts(rows, scope, mineIds);
  const { list, week, later } = partition(rows, kind, scope, mineIds);
  const shown = later.slice(0, laterShown);
  const today = todayISO();
  const href = (k) => `/work/decide/${k}${urlScope ? `?scope=${urlScope}` : ''}`;
  const draftOf = (id) => drafts[String(id)] || { note: '', when: '' };
  const toggle = (id) => setExpanded((s) => {
    const n = new Set(s);
    if (n.has(String(id))) n.delete(String(id)); else n.add(String(id));
    return n;
  });
  const card = (d) => (
    <Card
      key={d.id} d={d} open={expanded.has(String(d.id))} onToggle={() => toggle(d.id)} today={today}
      draft={draftOf(d.id)}
      setDraft={(p) => setDrafts((m) => ({ ...m, [String(d.id)]: { ...draftOf(d.id), ...p } }))}
    />
  );

  return (
    <div className="tp active" id="tab-decide">
      <div id="decide-root">
        {!loaded && !rows.length ? <div className="dq-load">{loadError ? `Could not load decisions: ${loadError}` : 'Loading…'}</div> : (
          <div className="dq-wrap">
            <div className="dq-top">
              <h1>Decide</h1>
              <p className="dq-lede">Questions the system cannot answer for you. Resolving one means writing down what you decided.</p>
            </div>

            {fellBack ? <div className="mx-empty">{FELL_BACK}</div> : null}

            <div className="dq-tabs">
              <Link href={href('business')} className={kind === 'business' ? 'on' : ''} aria-current={kind === 'business' ? 'page' : undefined}>
                Business <b>{counts.business}</b></Link>
              <Link href={href('system')} className={kind === 'system' ? 'on' : ''} aria-current={kind === 'system' ? 'page' : undefined}>
                BASE health <b>{counts.system}</b></Link>
              <button type="button" className="dq-refresh" onClick={load} title="Reload">↻</button>
            </div>

            {kind === 'system' ? (
              <p className="dq-note-sys">BASE reporting on itself: telemetry, data hygiene, its own instruments. Worth reading, not business decisions.</p>
            ) : null}

            {sweep.length ? (
              <div className="dq-undo">{sweep.length} deferred. <button type="button" onClick={decideSweepUndo}>Put them back</button></div>
            ) : null}

            {list.length ? (
              <>
                <h2 className="dq-h">This week <span>{week.length}</span></h2>
                <div className="dq-list">{week.map(card)}</div>
                {later.length ? (
                  <details className="dq-later" open={laterShown > STEP || undefined}>
                    <summary>Later <span>{later.length}</span></summary>
                    <div className="dq-sweep">
                      <span>Push all {later.length} to</span>
                      <input type="date" id="dq-sweep-when" min={today} value={sweepWhen} onChange={(e) => setSweepWhen(e.target.value)} />
                      <input type="text" id="dq-sweep-note" placeholder="why (optional)" value={sweepNote} onChange={(e) => setSweepNote(e.target.value)} />
                      <button type="button" className="dq-btn dq-defer" onClick={() => decideSweep(later, sweepWhen, sweepNote)}>Sweep</button>
                    </div>
                    <div className="dq-list">{shown.map(card)}</div>
                    {later.length > shown.length ? (
                      <button type="button" className="kb-more" onClick={() => setLaterShown((n) => n + STEP)}>{later.length - shown.length} more</button>
                    ) : null}
                  </details>
                ) : null}
              </>
            ) : (
              <div className="dq-empty">
                <div className="dq-empty-m">✓</div>
                <p>Nothing pending in this stream.</p>
              </div>
            )}

            {kind === 'system' && cleanups.length ? (
              <>
                <h2 className="dq-h" style={{ marginTop: 28 }}>Possible duplicates <span>{cleanups.length}</span></h2>
                <CleanupQueue cleanups={cleanups} />
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
