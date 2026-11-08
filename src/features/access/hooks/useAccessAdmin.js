'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { store } from '../../../store/store.js';
import { setStatus } from '../../../lib/status.js';
import {
  accessMessages, allowedUserPath, fetchAccessData, nextCompanies, nextExtras, proposePersonCode,
  validateNewPerson, writeAccess,
} from '../../../lib/access-admin.js';

/**
 * The Access admin's data and writes (old Access page in rie-dashboard2/js/access.js).
 *
 *   people       the v_rie_access rows (active first), each {email, display_name, role, active,
 *                task_scope, extra_access, person_code, companies, last_sign_in_at}
 *   companies    the company vocabulary (rie_companies), read at runtime
 *   loading, error
 *   add(email, {name, role, scope}) -> '' or the message to show under the form
 *   setRole(email, role), setScope(email, scope), toggleExtra(email, kind), setPerson(email, code),
 *   toggleCompany(email, company), toggleActive(email, active)   -> each writes, then re-reads
 *   refresh()
 *
 * Every write goes to PostgREST under the caller's JWT (RLS lets only an admin through). A failed write
 * is reported in the status bar with the database's own words, and the list is re-read so the control
 * goes back to where the database says it is.
 */
export function useAccessAdmin() {
  const [people, setPeople] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const rows = useRef([]);
  const cos = useRef([]);
  const alive = useRef(true);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchAccessData();
      rows.current = data.rows;
      cos.current = data.companies;
      if (data.people) store.setState({ people: data.people });
      if (!alive.current) return;
      setPeople(data.rows);
      setCompanies(data.companies);
      setError('');
    } catch (e) {
      if (alive.current) setError(e?.message || String(e));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // One write: PATCH a person's row, say what happened, re-read.
  const patch = useCallback(async (email, body, okMessage) => {
    try {
      await writeAccess('PATCH', allowedUserPath(email), body);
      setStatus('online', okMessage);
      await refresh();
    } catch (e) {
      setStatus('error', e.message);
      await refresh();
    }
  }, [refresh]);

  const add = useCallback(async (emailRaw, { name: nameRaw = '', role, scope = 'assigned' } = {}) => {
    const email = (emailRaw || '').trim().toLowerCase();
    const name = (nameRaw || '').trim();
    const invalid = validateNewPerson({ email, name, scope }, rows.current);
    if (invalid) return invalid;
    try {
      // Every person who can own a task needs a people row: entities.owner_code is a foreign key to
      // it, and the picker in the task form reads it. Made here, in the same action, so "added but
      // cannot be assigned" cannot happen.
      let person_code = null;
      if (name) {
        person_code = proposePersonCode(name, email, store.getState().people);
        await writeAccess('POST', 'people', { code: person_code, display_name: name, is_internal: true });
        store.setState((s) => ({ people: [...(s.people || []), { code: person_code, display_name: name, is_internal: true }] }));
      }
      await writeAccess('POST', 'rie_allowed_users', {
        email,
        display_name: name || email.split('@')[0],
        role: role || (scope === 'assigned' ? 'member' : 'viewer'),
        task_scope: scope,
        person_code,
        active: true,
      });
      setStatus('online', accessMessages.added(email, scope, name));
      await refresh();
      return '';
    } catch (e) {
      return e.message;
    }
  }, [refresh]);

  const setScope = useCallback(async (email, task_scope) => {
    const row = rows.current.find((r) => r.email === email);
    if (task_scope === 'assigned' && row && !row.person_code) {
      setStatus('error', accessMessages.needPerson);
      return;
    }
    await patch(email, { task_scope }, accessMessages.scope(email, task_scope));
  }, [patch]);

  const toggleExtra = useCallback(async (email, kind) => {
    const row = rows.current.find((r) => r.email === email);
    if (!row) return;
    const next = nextExtras(row.extra_access, kind);
    await patch(email, { extra_access: next }, accessMessages.extras(email, next));
  }, [patch]);

  /** Which person this sign-in IS, for "mine" on Today and for assigned scope. */
  const setPerson = useCallback(async (email, person_code) => {
    await patch(email, { person_code: person_code || null }, accessMessages.person(email, person_code));
  }, [patch]);

  const setRole = useCallback(async (email, role) => {
    await patch(email, { role }, accessMessages.role(email, role));
  }, [patch]);

  const toggleCompany = useCallback(async (email, company) => {
    const row = rows.current.find((r) => r.email === email);
    if (!row) return;
    const r = nextCompanies(row.companies, cos.current, company);
    if (r.error) { setStatus('error', r.error); return; }
    await patch(email, { companies: r.value }, accessMessages.companies(email, r.value));
  }, [patch]);

  const toggleActive = useCallback(async (email, active) => {
    await patch(email, { active }, accessMessages.active(email, active));
  }, [patch]);

  return useMemo(() => ({
    people, companies, loading, error, refresh, add, setRole, setScope, toggleExtra, setPerson, toggleCompany, toggleActive,
  }), [people, companies, loading, error, refresh, add, setRole, setScope, toggleExtra, setPerson, toggleCompany, toggleActive]);
}
