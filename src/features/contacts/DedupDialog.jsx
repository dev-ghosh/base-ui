'use client';

import { dedupFields } from './model.js';

const td = { padding: '5px 8px', fontSize: '.78rem', maxWidth: 160, wordBreak: 'break-word' };

/** The reason findDuplicate gives, as text with the bold values. */
function Reason({ reason }) {
  if (reason.kind === 'email') return <>Email match: <strong>{reason.value}</strong></>;
  if (reason.kind === 'phone') return <>Phone match: <strong>{reason.value}</strong></>;
  return <>Name + org match: <strong>{reason.name}</strong> at <strong>{reason.org}</strong></>;
}

/**
 * The body and footer of the "Possible duplicate found" dialog (`#mo-dedup`, showDedupModal). `pending`
 * is { data, dup } (the form's data and what findDuplicate found). Several same-name contacts list as
 * pick-one rows and there is no "Update Existing" button; one match shows the field table.
 */
export default function DedupDialog({ pending, onPatch, onInsert, onCancel }) {
  const { data, dup } = pending;
  const c = dup.match;
  return (
    <>
      <div id="dedup-body" style={{ fontSize: '.82rem', color: 'var(--tx)', lineHeight: 1.7, marginBottom: 4 }}>
        {dup.ambiguous ? (
          <>
            <p style={{ marginBottom: 10 }}>Multiple contacts match the name <strong>{data.name}</strong>. Which one did you mean?</p>
            {dup.ambiguous.map((x) => (
              <div
                key={x.id}
                className="dedup-pick"
                style={{ margin: '8px 0', padding: '8px 12px', background: 'var(--sf2)', border: '1px solid var(--bd)', borderRadius: 'var(--rs)', cursor: 'pointer', transition: 'background .12s' }}
                onMouseOver={(e) => { e.currentTarget.style.background = 'var(--sf3)'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'var(--sf2)'; }}
                onClick={() => onPatch(x.id)}
              >
                <strong>{x.name}</strong> · {x.org || '—'} ·{' '}
                <span style={{ color: 'var(--txm)', fontSize: '.75rem' }}>{x.email || x.phone || 'no contact info'}</span>
                <span style={{ float: 'right', fontSize: '.72rem', color: 'var(--ac2)' }}>Click to update →</span>
              </div>
            ))}
            <p style={{ marginTop: 12, color: 'var(--txm)', fontSize: '.77rem' }}>Or use <em>Save as New</em> to create a separate record.</p>
          </>
        ) : (
          <>
            <p style={{ marginBottom: 10 }}><Reason reason={dup.reason} /> — an existing contact looks like a match:</p>
            <div style={{ overflowX: 'auto', marginBottom: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup><col style={{ width: 110 }} /><col style={{ width: 'calc(50% - 55px)' }} /><col style={{ width: 'calc(50% - 55px)' }} /></colgroup>
                <thead>
                  <tr style={{ background: 'var(--sf2)' }}>
                    <th style={{ padding: '5px 8px', textAlign: 'left', fontSize: '.72rem', color: 'var(--txm)' }}>Field</th>
                    <th style={{ padding: '5px 8px', textAlign: 'left', fontSize: '.72rem', color: 'var(--txm)' }}>Existing</th>
                    <th style={{ padding: '5px 8px', textAlign: 'left', fontSize: '.72rem', color: 'var(--ac2)' }}>Incoming (new)</th>
                  </tr>
                </thead>
                <tbody>
                  {dedupFields(c, data).map((r) => (
                    <tr key={r.label} style={{ borderBottom: '1px solid var(--bd)' }}>
                      <td style={{ padding: '5px 8px', color: 'var(--txm)', fontSize: '.75rem', whiteSpace: 'nowrap' }}>{r.label}</td>
                      <td style={td}>{r.existing || '—'}</td>
                      <td style={{ ...td, ...(r.diff ? { color: 'var(--ac2)', fontWeight: 600 } : { color: 'var(--txm)' }) }}>{r.incoming || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ color: 'var(--txm)', fontSize: '.77rem' }}>
              <strong>Update Existing</strong> — patches highlighted fields into the matched contact.<br />
              <strong>Save as New</strong> — creates a separate record anyway.
            </p>
          </>
        )}
      </div>
      <div className="mf">
        <button type="button" className="btn b-pr" id="dedup-patch-btn" style={dup.ambiguous ? { display: 'none' } : undefined} onClick={() => onPatch(c?.id)}>Update Existing</button>
        <button type="button" className="btn b-ol" id="dedup-insert-btn" onClick={onInsert}>Save as New</button>
        <button type="button" className="btn b-gh" onClick={onCancel}>Cancel</button>
      </div>
    </>
  );
}
