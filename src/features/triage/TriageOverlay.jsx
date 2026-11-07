'use client';

import { useEffect } from 'react';
import Modal from '../../components/Modal.jsx';
import { fmtD } from '../../lib/format.js';
import { useTriage } from './hooks/useTriage.js';

const KEYS = { d: 'done', x: 'drop', 1: 'tomorrow', 2: 'nextWeek', 3: 'nextMonth' };

/**
 * Triage (js/triage.js + #mo-triage): clear an overdue backlog that is too big to work.
 * One task on screen, every outcome one keystroke, writes optimistic, no confirmation
 * dialogs (undo is the safety net), queue snapshotted on open. The backdrop does not
 * close it: Triage owns the keyboard while it is open.
 *
 * `onClose` decides where closing goes (back over /today when intercepted, to /today on a
 * direct visit).
 */
export default function TriageOverlay({ scope = 'mine', onClose }) {
  const t = useTriage(scope);
  const { act, undo, skip } = t;

  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') { onClose(); return; }
      if (k === 'u') { e.preventDefault(); undo(); return; }
      if (k === 's' || k === 'arrowright') { e.preventDefault(); skip(); return; }
      if (Object.hasOwn(KEYS, k)) { e.preventDefault(); act(KEYS[k]); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [act, undo, skip, onClose]);

  const task = t.current;
  const meta = task ? [task.company, task.func, task.contact_name].filter(Boolean).join(' · ') : '';

  return (
    <Modal id="mo-triage" open title="Triage" dismissible={false} className="tg-shell" onClose={onClose}>
      <div id="triage-body">
        {t.finished ? (
          <div className="tg-done">
            <div className="tg-done-mark">✓</div>
            <h2>{t.total ? `${t.total} cleared` : 'Nothing overdue'}</h2>
            <p>{t.total ? 'That backlog is now decided, not just visible.' : 'Nothing to triage right now.'}</p>
            <button type="button" className="btn b-pr" onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            <div className="tg-prog"><div className="tg-prog-fill" style={{ width: `${(t.index / t.total) * 100}%` }} /></div>
            <div className="tg-count">{t.index + 1} of {t.total}</div>

            <div className="tg-card">
              <div className="tg-late">{task.days_overdue}d late{task.priority === 'P1' ? ' · P1' : ''}</div>
              <h2 className="tg-title">{task.title || 'Untitled'}</h2>
              {meta ? <div className="tg-meta">{meta}</div> : null}
              {task.action_item ? <div className="tg-action">{task.action_item}</div> : null}
              <div className="tg-was">Was due {fmtD(task.due_date)}</div>
            </div>

            <div className="tg-acts">
              <button type="button" className="tg-btn tg-done-btn" onClick={() => act('done')}><b>D</b> Done</button>
              <button type="button" className="tg-btn" onClick={() => act('tomorrow')}><b>1</b> Tomorrow</button>
              <button type="button" className="tg-btn" onClick={() => act('nextWeek')}><b>2</b> Next week</button>
              <button type="button" className="tg-btn" onClick={() => act('nextMonth')}><b>3</b> Next month</button>
              <button type="button" className="tg-btn tg-drop" onClick={() => act('drop')}><b>X</b> Drop</button>
              <button type="button" className="tg-btn tg-skip" onClick={skip}><b>S</b> Skip</button>
            </div>

            <div className="tg-foot">
              {t.canUndo ? <button type="button" className="tg-undo" onClick={undo}>↩ Undo</button> : <span></span>}
              <span className="tg-hint">D done · 1/2/3 push · X drop · S skip · U undo · Esc close</span>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
