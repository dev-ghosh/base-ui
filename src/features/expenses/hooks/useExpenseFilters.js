'use client';

import { useCallback, useMemo, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { mergeExpenseParams, parseExpenseParams } from '../model.js';

/**
 * The Expenses filters, held in the URL (see model.js): month, card, category, person, status.
 *
 *   filters        parsed from the search params on every change of the URL
 *   update(patch)  replace the filter params; every other param is kept. Uses replace: the filters
 *                  are a view, not a place to go back to. Two updates in one tick compose.
 */
export function useExpenseFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const search = params?.toString() ?? '';
  const filters = useMemo(() => parseExpenseParams(search), [search]);

  const latest = useRef(search);
  latest.current = search;

  const update = useCallback((patch) => {
    const current = parseExpenseParams(latest.current);
    const next = { ...current, ...(typeof patch === 'function' ? patch(current) : patch) };
    const qs = mergeExpenseParams(latest.current, next);
    latest.current = qs;
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, pathname]);

  return { filters, search, update };
}
