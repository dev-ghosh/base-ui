'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Modal from '../../components/Modal.jsx';
import { useModal } from '../../hooks/useModal.js';
import { store } from '../../store/store.js';
import {
  applySavedFilter, deleteSavedFilter, getSavedFilters, globalSmartSearch, saveCurrentFilter,
} from '../../lib/saved-filters.js';

const item = { padding: '6px 8px', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem', background: 'var(--sf2)', marginBottom: 4 };
const heading = { fontWeight: 600, fontSize: '0.75rem', color: 'var(--txd)', margin: '8px 0 4px' };
const sub = { color: 'var(--txd)', fontSize: '0.7rem' };

/**
 * Smart Search & Filter Presets (`mo-smart-search`, opened by the top bar's search pill and Ctrl+K /
 * Cmd+K, which toggles it and focuses the box). Typing two or more characters lists matching tasks and
 * contacts (leads are searched but, as in the old dialog, never listed); a click opens the record's
 * viewer route. Below it, the saved filter presets (see lib/saved-filters.js) and "+ Save Current View
 * Filters". Mounted once in the (app) layout.
 */
export default function SmartSearch() {
  const router = useRouter();
  const { open, show, hide } = useModal('mo-smart-search');
  const [q, setQ] = useState('');
  const [presets, setPresets] = useState([]);
  const input = useRef(null);
  const openRef = useRef(open);
  openRef.current = open;

  // Ctrl+K / Cmd+K toggles the dialog.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (openRef.current) hide();
        else { show(); setTimeout(() => input.current?.focus(), 100); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show, hide]);

  // The presets are read when the dialog opens, and after each change.
  useEffect(() => { if (open) setPresets(getSavedFilters()); }, [open]);

  const s = store.getState();
  const res = q && q.length >= 2 ? globalSmartSearch(q, s) : null;
  const go = (href) => { hide(); router.push(href); };

  const save = () => {
    const name = window.prompt('Enter a name for current filter preset:');
    if (name) { saveCurrentFilter(name); setPresets(getSavedFilters()); }
  };

  return (
    <Modal id="mo-smart-search" open={open} maxWidth={540} title="Smart Search & Filter Presets" onClose={hide}>
      <div style={{ marginBottom: 12 }}>
        <input
          type="text" className="fi" id="smart-search-input" ref={input} value={q}
          placeholder="Search tasks, contacts, leads..." style={{ fontSize: '0.95rem', padding: '10px 14px' }}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div id="smart-search-results" style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 14 }}>
        {res ? (
          res.tasks.length || res.contacts.length ? (
            <>
              {res.tasks.length ? <div style={heading}>TASKS</div> : null}
              {res.tasks.map((t) => (
                <div key={t.id} style={item} onClick={() => go(`/work/tasks/${t.id}`)}>
                  {t.task || 'Task'} <span style={sub}>({t.assignedTo || ''})</span>
                </div>
              ))}
              {res.contacts.length ? <div style={heading}>CONTACTS</div> : null}
              {res.contacts.map((c) => (
                <div key={c.id} style={item} onClick={() => go(`/contacts/people/${c.id}`)}>
                  {c.name || 'Contact'} <span style={sub}>({c.org || ''})</span>
                </div>
              ))}
            </>
          ) : <div style={{ fontSize: '0.8rem', color: 'var(--txd)', padding: 8 }}>No matches found</div>
        ) : null}
      </div>
      <div style={{ borderTop: '1px solid var(--bd)', paddingTop: 10 }}>
        <div style={{ fontWeight: 600, fontSize: '0.75rem', color: 'var(--txm)', marginBottom: 6 }}>Saved Filter Presets</div>
        <div id="saved-filters-list">
          {presets.length ? presets.map((f) => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', fontSize: '.8rem', borderBottom: '1px solid var(--bd)' }}>
              <span style={{ cursor: 'pointer', flex: 1, fontWeight: 500 }} onClick={() => applySavedFilter(f.id)}>🔍 {f.name}</span>
              <button
                type="button" className="btn b-sm b-ol" style={{ padding: '2px 6px', fontSize: '.7rem' }}
                onClick={(e) => { e.stopPropagation(); deleteSavedFilter(f.id); setPresets(getSavedFilters()); }}
              >✕</button>
            </div>
          )) : <div style={{ padding: '8px 12px', fontSize: '.78rem', color: 'var(--txd)' }}>No saved filters yet</div>}
        </div>
      </div>
      <div className="mf" style={{ marginTop: 12 }}>
        <button type="button" className="btn b-ol b-sm" onClick={save}>+ Save Current View Filters</button>
        <button type="button" className="btn b-gh" onClick={hide}>Close</button>
      </div>
    </Modal>
  );
}
