'use client';

import { useMemo } from 'react';
import { useStore } from '../../../store/useStore.js';
import { peopleNames } from '../../../lib/mappers.js';
import { isClosedStage } from '../model.js';
import { useLeadFilters } from './useLeadFilters.js';
import { useLeads } from './useLeads.js';

/**
 * What the toolbar, the Kanban and the table share: the filters from the URL, the owner options, the
 * filtered leads (also grouped by stage) and the count behind the "Closed (n)" button. An owner in the
 * URL that nobody on the list has is ignored (the old <select> fell back to "All Owners" then).
 */
export function usePipelineList() {
  const { filters: urlFilters, search, update } = useLeadFilters();
  const all = useStore((s) => s.leads);
  const people = useStore((s) => s.people);       // the owner options follow the people list
  const owners = useMemo(
    () => peopleNames(all.map((l) => l.assignedTo)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, people],
  );
  const at = owners.includes(urlFilters.at) ? urlFilters.at : '';
  const filters = useMemo(() => ({ ...urlFilters, at }), [urlFilters, at]);
  const { leads, byStage } = useLeads(filters);
  const nClosed = useMemo(() => all.filter((l) => isClosedStage(l.stage)).length, [all]);
  return { filters, search, update, owners, leads, byStage, nClosed };
}
