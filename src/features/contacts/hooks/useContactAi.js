'use client';

import { useMemo } from 'react';
import { callEdgeFunction } from '../../../lib/edge.js';
import { store } from '../../../store/store.js';
import { setStatus } from '../../../lib/status.js';
import {
  ENRICH_FN, FOLLOWUP_FN, NL_SEARCH_FN, enrichPayload, followupPayload, nlSearchMessage, nlSearchPayload,
} from '../ai.js';

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

/**
 * { nlSearch(query), enrich(id), suggestFollowup(id) }: the Claude edge functions, with the status-bar
 * lines the old code wrote. Each resolves with the function's answer, or null when there was nothing to
 * ask or the call failed (the failure is in the status bar). Nothing is saved: the callers decide.
 * The old UI no longer has buttons for these (see ai.js), so no component uses the hook yet.
 */
export function useContactAi() {
  return useMemo(() => ({
    async nlSearch(query) {
      if (!query) return null;
      setStatus('syncing', 'Searching with Claude…');
      try {
        const result = await callEdgeFunction(NL_SEARCH_FN, nlSearchPayload(query));
        setStatus('online', nlSearchMessage(query, result));
        return result;
      } catch (e) { setStatus('error', 'AI Search failed: ' + e.message); return null; }
    },
    async enrich(id) {
      const c = store.getState().contacts.find((x) => sameId(x.id, id));
      if (!c) return null;
      setStatus('syncing', 'Enriching contact with Claude…');
      try {
        const result = await callEdgeFunction(ENRICH_FN, enrichPayload(c));
        setStatus('online', 'Enrichment ready');
        return result;
      } catch (e) { setStatus('error', 'Enrichment failed: ' + e.message); return null; }
    },
    async suggestFollowup(id) {
      setStatus('syncing', 'Asking Claude for follow-up suggestion…');
      try {
        const result = await callEdgeFunction(FOLLOWUP_FN, followupPayload(id));
        setStatus('online', 'Suggestion ready');
        return result;
      } catch (e) { setStatus('error', 'Suggestion failed: ' + e.message); return null; }
    },
  }), []);
}
