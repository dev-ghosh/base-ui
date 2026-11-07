'use client';

import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon.jsx';
import { fmtD } from '../../lib/format.js';
import { rowToLeadHistory } from '../../lib/mappers.js';
import { getLeadHistory } from '../../lib/rest.js';
import { TOUCHPOINT_TYPES, tpIconName } from './model.js';
import { useLeadActions } from './hooks/useLeadActions.js';

/**
 * The "Touchpoints" block of the lead viewer: the log form (type, what happened, an optional next
 * follow-up date, Log) and the timeline from lead_history, newest first. Logging writes the entry (and
 * the follow-up date, when one is given) and then reloads the timeline; the form clears only when it worked.
 */
export default function TouchpointLog({ leadId }) {
  const { addTouchpoint } = useLeadActions();
  const [type, setType] = useState('note');
  const [notes, setNotes] = useState('');
  const [next, setNext] = useState('');
  const [rows, setRows] = useState(null);          // null = loading, { error }, or a list
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const list = (await getLeadHistory(leadId)).map(rowToLeadHistory);
        if (live) setRows(list);                   // a viewer that moved on to another lead is ignored
      } catch (e) {
        if (live) setRows({ error: e.message });
      }
    })();
    return () => { live = false; };
  }, [leadId, reload]);

  const log = async () => {
    if (await addTouchpoint(leadId, { type, notes, next })) {
      setType('note'); setNotes(''); setNext('');
      setReload((n) => n + 1);
    }
  };

  return (
    <div style={{ borderTop: '1px solid var(--bd)', paddingTop: 12 }}>
      <div style={{ fontWeight: 700, fontSize: '.82rem', marginBottom: 8 }}>Touchpoints</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        <select className="fsel2" id="ldet-tp-type" aria-label="Touchpoint type" style={{ width: 120, flex: 'none' }} value={type} onChange={(e) => setType(e.target.value)}>
          {TOUCHPOINT_TYPES.filter((t) => t.type !== 'stage').map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
        </select>
        <input
          className="fi" id="ldet-tp-notes" placeholder="What happened? (call notes, outcome, ask…)" style={{ flex: 1, minWidth: 180 }}
          value={notes} onChange={(e) => setNotes(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') log(); }}
        />
        <input
          type="date" className="fi" id="ldet-tp-next" title="Optionally set the next follow-up date" aria-label="Next follow-up"
          style={{ width: 135, flex: 'none' }} value={next} onChange={(e) => setNext(e.target.value)}
        />
        <button type="button" className="btn b-pr" style={{ fontSize: '.75rem' }} onClick={log}>Log</button>
      </div>
      <div id="ldet-timeline" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows === null ? <div style={{ fontSize: '.74rem', color: 'var(--txd)' }}>Loading history…</div>
          : !Array.isArray(rows) ? <div style={{ fontSize: '.74rem', color: 'var(--hot)' }}>Could not load history: {rows.error}</div>
          : rows.length ? rows.map((h) => (
            <div key={h.id} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '7px 10px', background: 'var(--sf2)', borderRadius: 'var(--rs)' }}>
              <span className="tp-ic"><Icon name={tpIconName(h.type)} size={15} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.78rem', whiteSpace: 'pre-wrap' }}>{h.notes}</div>
                <div style={{ fontSize: '.66rem', color: 'var(--txd)', marginTop: 2 }}>
                  {h.type} · {fmtD(h.createdAt?.slice(0, 10))}{h.createdBy ? ' · ' + h.createdBy : ''}
                </div>
              </div>
            </div>
          )) : <div style={{ fontSize: '.74rem', color: 'var(--txd)' }}>No touchpoints logged yet.</div>}
      </div>
    </div>
  );
}
