'use client';

import { Suspense } from 'react';
import ExpensesScreen from '@/features/expenses/ExpensesScreen.jsx';

/**
 * /expenses: one page. The month and the filters (card, category, person, status) are search params,
 * which needs a Suspense boundary so the rest of the tree can still be prerendered; the expense form
 * and the cards manager are component state.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <ExpensesScreen />
    </Suspense>
  );
}
