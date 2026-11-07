'use client';

import { useCallback, useMemo, useState } from 'react';
import { toggleAllIds, toggleId } from '../model.js';

/**
 * The bulk-select state of the contact list (state.bulkSelected). `visibleIds` are the ids of the rows
 * on screen: "select all" works on those only, so a contact filtered out or still behind "Show more"
 * is never swept up by it. A selection made earlier stays selected when the filters change (as before).
 *
 *   selected          Set of ids
 *   size
 *   isSelected(id)
 *   toggle(id)
 *   toggleAll()       all visible selected -> unselect them; otherwise select them all
 *   allVisible        every visible row is selected (and there is at least one)
 *   clear()
 */
export function useBulkSelection(visibleIds) {
  const [selected, setSelected] = useState(() => new Set());
  const toggle = useCallback((id) => setSelected((s) => toggleId(s, id)), []);
  const toggleAll = useCallback(() => setSelected((s) => toggleAllIds(s, visibleIds)), [visibleIds]);
  const clear = useCallback(() => setSelected(new Set()), []);
  const isSelected = useCallback((id) => selected.has(id), [selected]);
  const allVisible = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  return useMemo(
    () => ({ selected, size: selected.size, isSelected, toggle, toggleAll, allVisible, clear }),
    [selected, isSelected, toggle, toggleAll, allVisible, clear],
  );
}
