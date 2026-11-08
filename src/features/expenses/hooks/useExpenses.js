'use client';

import { useEffect, useMemo } from 'react';
import { useStore } from '../../../store/useStore.js';
import { loadExpenses } from '../../../lib/expense-actions.js';

/**
 * { cards, expenses, loaded, error, reload() }: the finance rows, loaded when the Expenses screen
 * first uses them (not at boot) and kept in the store. `error` is null, 'missing' (the migration has
 * not been applied) or the message of a failed load; `reload()` is the "Try again" button.
 */
export function useExpenses() {
  const cards = useStore((s) => s.cards);
  const expenses = useStore((s) => s.expenses);
  const loaded = useStore((s) => s.expensesLoaded);
  const error = useStore((s) => s.expError);

  useEffect(() => {
    if (!loaded && !error) loadExpenses();
  }, [loaded, error]);

  return useMemo(() => ({ cards, expenses, loaded, error, reload: () => loadExpenses(true) }), [cards, expenses, loaded, error]);
}
