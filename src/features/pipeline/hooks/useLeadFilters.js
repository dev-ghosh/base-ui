'use client';

import { useCallback, useMemo, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { mergeLeadParams, parseLeadParams } from '../model.js';

/**
 * The Pipeline's filter row, held in the URL (see model.js): search, type, owner, show closed, and the
 * table's sort.
 *
 *   filters            parsed from the search params on every change of the URL
 *   update(patch)      replace the filter params (a partial filters object, or (current) => partial);
 *                      every other param is kept. Changes use replace: the filters are a view, not a place
 *                      to go back to.
 *
 * Two updates in the same tick compose: each starts from the URL the previous one asked for.
 */
export function useLeadFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const search = params?.toString() ?? '';
  const filters = useMemo(() => parseLeadParams(search), [search]);

  const latest = useRef(search);
  latest.current = search;

  const update = useCallback((patch) => {
    const current = parseLeadParams(latest.current);
    const next = { ...current, ...(typeof patch === 'function' ? patch(current) : patch) };
    const qs = mergeLeadParams(latest.current, next);
    latest.current = qs;
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, pathname]);

  return { filters, search, update };
}
