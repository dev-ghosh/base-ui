'use client';

import { useMemo } from 'react';
import { useStore } from '../../../store/useStore.js';
import { PAGE_SIZE, filterContacts, filterOptions, paginate, sortContacts } from '../model.js';
import { useContactFilters } from './useContactFilters.js';

/**
 * { contacts, page, pageSize, total, hasMore, filtered, options, filters, update, ... }
 *
 * `contacts` is the window of rows on screen: the filtered, sorted list cut to `page * pageSize` rows
 * (the old "Show more" grows the window rather than turning a page). `total` is how many contacts match
 * the filters. A project / category / location in the URL that no contact has is ignored, as the old
 * <select> fell back to "All" then. Contacts are loaded and kept current by the data loader and
 * realtime; nothing is fetched here.
 */
export function useContacts() {
  const all = useStore((s) => s.contacts);
  const tasks = useStore((s) => s.tasks);       // the computed tags (Has Tasks) read them
  const f = useContactFilters();
  const { filters } = f;

  const options = useMemo(() => filterOptions(all), [all]);
  const effective = useMemo(() => ({
    ...filters,
    project: options.projects.includes(filters.project) ? filters.project : '',
    category: options.categories.includes(filters.category) ? filters.category : '',
    location: options.locations.includes(filters.location) ? filters.location : '',
  }), [filters, options]);

  const filtered = useMemo(
    () => sortContacts(filterContacts(all, effective, { tasks, now: new Date() }), effective.sort),
    [all, tasks, effective],
  );
  const { rows, page, pageSize, total, hasMore, shown } = useMemo(
    () => paginate(filtered, filters.page, PAGE_SIZE), [filtered, filters.page],
  );

  return { ...f, filters: effective, contacts: rows, page, pageSize, total, shown, hasMore, filtered, options };
}
