'use client';

import { useCallback } from 'react';

/**
 * Keyboard on the queue (onTodayRowKey). Tab reaches each row natively (they are
 * focusable); these are the shortcuts that make a laptop pass fast: Enter opens, D marks
 * done, 2 pushes a week, J/K walk the list.
 *
 * `containerRef` is the element holding the rows (the old #today-body): J/K walk every
 * `.td-row` in it, decision and team rows included, in document order.
 *
 * Returns onKeyDown(event, id) for a row.
 */
export function useTodayKeys({ containerRef, onOpen, onDone, onPushWeek }) {
  return useCallback((e, id) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const rows = [...(containerRef.current?.querySelectorAll('.td-row') ?? [])];
    const i = rows.indexOf(e.currentTarget);
    const key = e.key.toLowerCase();

    if (key === 'enter' || key === ' ') { e.preventDefault(); onOpen(id); return; }
    if (key === 'd') { e.preventDefault(); onDone(id); return; }
    if (key === '2') { e.preventDefault(); onPushWeek(id); return; }
    if (key === 'j' || key === 'arrowdown') { e.preventDefault(); rows[i + 1]?.focus(); return; }
    if (key === 'k' || key === 'arrowup') { e.preventDefault(); rows[i - 1]?.focus(); }
  }, [containerRef, onOpen, onDone, onPushWeek]);
}
