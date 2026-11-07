'use client';

import { useMemo } from 'react';
import { useStore } from '../../../store/useStore.js';
import { filterLeads, groupByStage } from '../model.js';

/**
 * { leads, byStage }: the leads in the store, and the same leads grouped by stage (every stage is a key,
 * in Identified, Applied/Contacted, In Conversation, On Hold, Won, Lost order). With `filters`
 * ({ q, type, at }) both are the filtered list. Leads are loaded and kept current by the data loader and
 * realtime; nothing is fetched here.
 */
export function useLeads(filters) {
  const all = useStore((s) => s.leads);
  const q = filters?.q;
  const type = filters?.type;
  const at = filters?.at;
  const leads = useMemo(
    () => (q || type || at ? filterLeads(all, { q, type, at }) : all),
    [all, q, type, at],
  );
  const byStage = useMemo(() => groupByStage(leads), [leads]);
  return { leads, byStage };
}
