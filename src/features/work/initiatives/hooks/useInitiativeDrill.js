'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { store } from '../../../../store/store.js';
import { safeGet, sbUpdate } from '../../../../lib/rest.js';
import { setStatus } from '../../../../lib/status.js';
import { writeEntityEvent } from '../../../../lib/entity-events.js';
import { rowToEntityEvent, rowToLineage } from '../../../../lib/mappers.js';
import { HEARTBEAT_KEY, sortChildren } from '../model.js';

const sameId = (a, b) => String(a) === String(b);
const who = () => store.getState().currentUser || 'unknown';

/** Mirror a changed column onto the heartbeat row the Initiatives list is built from. */
function patchList(id, field, value) {
  const k = HEARTBEAT_KEY[field];
  if (!k) return;
  store.setState((s) => ({ initiatives: s.initiatives.map((i) => (sameId(i.id, id) ? { ...i, [k]: value ?? '' } : i)) }));
}

/**
 * The initiative drill (openInitiativeDrill + its writes in js/entities.js), as a hook.
 *
 * Data is read straight from REST each time the viewer opens (children, audit events, lineage and the
 * entity row itself; raw snake_case rows, as the old drill used). Every inline control writes through
 * the old Write flow: the drill (and the Initiatives list) change first, then PATCH entities, and on
 * failure the previous values are put back and the error goes to the status bar. A view-only user's
 * PATCH throws the "view-only" sentence before any fetch. After a write that landed, the drill is
 * reloaded quietly so the lifecycle, audit log and children show what actually landed.
 *
 * phase: 'loading' | 'ready' | 'error'. `entity` is null on 'ready' when no such row is visible.
 */
export function useInitiativeDrill(id) {
  const [data, setData] = useState({ phase: 'loading', error: '', entity: null, children: [], audits: [], lineage: [] });
  const ref = useRef(data);
  ref.current = data;
  const seq = useRef(0);

  const load = useCallback(async (quiet) => {
    const my = ++seq.current;
    if (!quiet) setData({ phase: 'loading', error: '', entity: null, children: [], audits: [], lineage: [] });
    try {
      const [childRows, auditRows, lineageRows] = await Promise.all([
        safeGet('entity_links', `parent_id=eq.${id}&link_type=eq.contains&select=child_id,entities!entity_links_child_id_fkey(id,tier,title,status,priority,owner_code,next_follow_up)`),
        safeGet('entity_events', `entity_id=eq.${id}&order=created_at.desc&limit=30`),
        safeGet('entity_lineage', `source_id=eq.${id}&order=created_at.desc`),
      ]);
      const entityRows = await safeGet('entities', `id=eq.${id}`);
      if (my !== seq.current) return;
      const children = childRows
        .map((row) => row.entities || row['entities!entity_links_child_id_fkey'] || null)
        .filter(Boolean);
      setData({
        phase: 'ready',
        error: '',
        entity: entityRows[0] || null,
        children: sortChildren(children),
        audits: auditRows.map(rowToEntityEvent),
        lineage: lineageRows.map(rowToLineage),
      });
    } catch (e) {
      if (my === seq.current) setData((d) => ({ ...d, phase: 'error', error: e.message }));
    }
  }, [id]);

  useEffect(() => {
    load(false);
    return () => { seq.current += 1; };
  }, [load]);

  /** Change fields on the entity itself or on one of its children (optimistic). */
  const patchLocal = (targetId, fields) => setData((d) => ({
    ...d,
    entity: d.entity && sameId(d.entity.id, targetId) ? { ...d.entity, ...fields } : d.entity,
    children: d.children.map((c) => (sameId(c.id, targetId) ? { ...c, ...fields } : c)),
  }));
  const current = (targetId) => {
    const d = ref.current;
    return (d.entity && sameId(d.entity.id, targetId) ? d.entity : null) || d.children.find((c) => sameId(c.id, targetId)) || null;
  };

  /** One write path for every inline control (setEntityField). */
  const setField = useCallback(async (targetId, field, value) => {
    const next = value === '' ? null : value;
    const row = current(targetId);
    const prev = row ? row[field] ?? null : null;
    const listRow = store.getState().initiatives.find((i) => sameId(i.id, targetId));
    const prevList = listRow ? listRow[HEARTBEAT_KEY[field]] : undefined;
    patchLocal(targetId, { [field]: next });
    patchList(targetId, field, next);
    try {
      setStatus('syncing', 'Saving…');
      await sbUpdate('entities', targetId, { [field]: next });
      writeEntityEvent(targetId, field === 'status' ? 'status_changed' : 'field_changed', {
        fieldName: field, newValue: String(value), notes: 'Initiative panel',
      }).catch(() => {});
      setStatus('online', 'Saved');
      await load(true);
      return true;
    } catch (e) {
      patchLocal(targetId, { [field]: prev });
      if (prevList !== undefined) patchList(targetId, field, prevList);
      setStatus('error', 'Could not save: ' + e.message);
      return false;
    }
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Closing asks the question the status alone cannot answer: did it work? */
  const close = useCallback(async (outcome, summary) => {
    if (!outcome) { setStatus('error', 'Pick an outcome first — that is the point of closing.'); return false; }
    const text = (summary || '').trim();
    const status = outcome === 'dropped' ? 'dropped' : 'completed';
    const e0 = ref.current.entity;
    const prev = e0 ? { status: e0.status, outcome: e0.outcome ?? null, outcome_summary: e0.outcome_summary ?? null } : {};
    const listRow = store.getState().initiatives.find((i) => sameId(i.id, id));
    const prevList = listRow?.status;
    patchLocal(id, { status, outcome, outcome_summary: text || null });
    patchList(id, 'status', status);
    try {
      setStatus('syncing', 'Closing…');
      // entities_autoclose stamps closed_at server-side for completed/dropped.
      await sbUpdate('entities', id, { status, outcome, outcome_summary: text || null });
      writeEntityEvent(id, 'closed', { newValue: outcome, notes: text }).catch(() => {});
      setStatus('online', 'Closed');
      await load(true);
      return true;
    } catch (e) {
      patchLocal(id, prev);
      if (prevList !== undefined) patchList(id, 'status', prevList);
      setStatus('error', 'Could not close: ' + e.message);
      return false;
    }
  }, [id, load]); // eslint-disable-line react-hooks/exhaustive-deps

  /** success_criteria is one jsonb array: every edit writes the whole array. */
  const saveCriteria = useCallback(async (nextCriteria) => {
    const prev = ref.current.entity?.success_criteria;
    patchLocal(id, { success_criteria: nextCriteria });
    setStatus('syncing', 'Saving criteria…');
    try {
      await sbUpdate('entities', id, { success_criteria: nextCriteria, updated_by: who(), updated_at: new Date().toISOString() });
      writeEntityEvent(id, 'success_criteria_updated', { notes: `${nextCriteria.length} criteria` }).catch(() => {});
      setStatus('online', 'Criteria saved');
      return true;
    } catch (e) {
      patchLocal(id, { success_criteria: prev });
      setStatus('error', 'Save failed: ' + e.message);
      return false;
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const criteria = () => (Array.isArray(ref.current.entity?.success_criteria) ? ref.current.entity.success_criteria : []);
  const addCriterion = () => saveCriteria([...criteria(), { metric: '', target: '', status: 'unknown' }]);
  const removeCriterion = (idx) => saveCriteria(criteria().filter((_, i) => i !== idx));
  const editCriterion = (idx, patch) => saveCriteria(criteria().map((c, i) => (i === idx ? { ...c, ...patch } : c)));

  const saveOutcomeDefinition = useCallback(async (value) => {
    const prev = ref.current.entity?.outcome_definition || '';
    if ((value || '') === prev) return true;
    patchLocal(id, { outcome_definition: value });
    setStatus('syncing', 'Saving success definition…');
    try {
      await sbUpdate('entities', id, { outcome_definition: value || null, updated_by: who(), updated_at: new Date().toISOString() });
      writeEntityEvent(id, 'updated', { fieldName: 'outcome_definition', oldValue: prev, newValue: value }).catch(() => {});
      setStatus('online', 'Success definition saved');
      return true;
    } catch (e) {
      patchLocal(id, { outcome_definition: prev });
      setStatus('error', 'Save failed: ' + e.message);
      return false;
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ...data, setField, close, addCriterion, removeCriterion, editCriterion, saveOutcomeDefinition };
}
