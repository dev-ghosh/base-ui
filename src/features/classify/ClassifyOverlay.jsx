'use client';

import { useEffect } from 'react';
import Modal from '../../components/Modal.jsx';
import { useRegistry } from '../../hooks/useRegistry.js';
import { fmtD } from '../../lib/format.js';
import { classifyReason, funcsFor, keyToIndex } from '../../lib/classify.js';
import { useClassify } from './hooks/useClassify.js';

/**
 * Classify (js/classify.js + #mo-classify): put a company and a function on work that has
 * neither. Same shape as Triage: one card, one keystroke, no dialogs. The vocabulary comes
 * from the task_functions registry at runtime, never a list in code. Number keys pick by
 * position: 1-9 then 0 for the tenth; past that the mouse is fine.
 */
export default function ClassifyOverlay({ onClose }) {
  const c = useClassify();
  const { rows, companies } = useRegistry();
  const { pick, undo, skip, setCompany, current: t } = c;

  const funcs = t ? funcsFor(t, rows) : [];
  const company = t?.company || null;

  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') { onClose(); return; }
      if (k === 'u') { e.preventDefault(); undo(); return; }
      if (k === 's' || k === 'arrowright') { e.preventDefault(); skip(); return; }
      if (/^[0-9]$/.test(k) && t) {
        const f = funcs[keyToIndex(k)];
        if (f) { e.preventDefault(); pick(f, company); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, undo, skip, pick, t, funcs, company]);

  return (
    <Modal id="mo-classify" open title="Classify" className="tg-shell" onClose={onClose}>
      <div id="classify-body">
        {c.finished ? (
          <div className="tg-done">
            <div className="tg-done-mark">✓</div>
            <h2>{c.total ? `${c.total} classified` : 'Nothing to classify'}</h2>
            <p>{c.total
              ? 'Every one of these is now on the Matrix where it belongs.'
              : 'Every open task has a company and a function.'}</p>
            <button type="button" className="btn b-pr" onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            <div className="tg-prog"><div className="tg-prog-fill" style={{ width: `${(c.index / c.total) * 100}%` }} /></div>
            <div className="tg-count">{c.index + 1} of {c.total}</div>

            <div className="tg-card">
              <div className="cf-why">{classifyReason(t)}</div>
              <h2 className="tg-title">{t.task || 'Untitled'}</h2>
              <div className="tg-meta">{[company || 'no company', t.assignedTo || 'unowned',
                t.nextFollowUp ? fmtD(t.nextFollowUp) : 'no date'].join(' · ')}</div>
              {t.actionItem ? <div className="tg-action">{t.actionItem}</div> : null}
              {t.keyInputs ? <div className="cf-ctx">{t.keyInputs.slice(0, 240)}</div> : null}
            </div>

            {!company ? (
              <div className="cf-co">
                <span className="cf-co-l">Company</span>
                {companies.map((co) => (
                  <button type="button" className="cf-co-b" key={co} onClick={() => setCompany(co)}>{co}</button>
                ))}
              </div>
            ) : null}

            <div className="cf-fns">
              {funcs.map((f, i) => (
                <button type="button" className="cf-fn" key={f} onClick={() => pick(f, company || '')}>
                  {i < 10 ? <b>{i === 9 ? 0 : i + 1}</b> : <b></b>}{f}
                </button>
              ))}
            </div>

            <div className="tg-foot">
              {c.canUndo ? <button type="button" className="tg-undo" onClick={undo}>↩ Undo</button> : <span></span>}
              <span className="tg-hint">1-9 pick · S skip · U undo · Esc close</span>
            </div>
            <button type="button" className="btn b-gh" style={{ width: '100%', marginTop: 8, fontSize: '.78rem' }} onClick={skip}>Skip this one</button>
          </>
        )}
      </div>
    </Modal>
  );
}
