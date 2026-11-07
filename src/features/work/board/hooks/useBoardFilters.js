'use client';

import { useCallback, useMemo, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { defaultBoardFilters, mergeBoardParams, parseBoardParams } from '../params.js';

/**
 * The Board / Hierarchy filter state, held in the URL (see params.js).
 *
 *   filters            parsed from the search params on every change of the URL
 *   search             the current query string (no `?`), for links that carry it to the other surface
 *   update(patch)      replace the filter params (a partial filters object, or (current) => partial);
 *                      every other param (the Work `scope`) is kept. Changes use replace: the filters
 *                      are a view, not a place to go back to.
 *   clear()            back to the defaults (clearTaskFilters); scope is kept
 *
 * Two updates in the same tick compose: each starts from the URL the previous one asked for.
 */
export function useBoardFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const search = params?.toString() ?? '';
  const filters = useMemo(() => parseBoardParams(search), [search]);

  const latest = useRef(search);
  latest.current = search;

  const write = useCallback((next) => {
    const qs = mergeBoardParams(latest.current, next);
    latest.current = qs;
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, pathname]);

  const update = useCallback((patch) => {
    const current = parseBoardParams(latest.current);
    write({ ...current, ...(typeof patch === 'function' ? patch(current) : patch) });
  }, [write]);

  const clear = useCallback(() => write(defaultBoardFilters()), [write]);

  return { filters, search, update, clear };
}
