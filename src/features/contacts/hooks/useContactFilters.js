'use client';

import { useCallback, useMemo, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { mergeContactParams, nextSort, parseContactParams } from '../model.js';

/**
 * Contacts' filters, sort and window, held in the URL (see model.js): q, proj, cat, loc, prio, at, tg,
 * sort, dir, page.
 *
 *   filters             parsed from the search params on every change of the URL
 *   update(patch)       replace the filter params (a partial filters object, or (current) => partial). Any
 *                       change other than `page` itself starts the window over (page 1), as the old applyF
 *                       did when its filter signature changed. Uses replace: filters are a view, not a place.
 *   toggleTag(tag)      add or remove one tag of the tag filter
 *   clearTags()
 *   sortBy(col)         a column header click: same column flips, a new one starts ascending
 *   showMore()          grow the window by one page
 *   hrefFor(path)       `path` with the current query string (for the Table / Cards switch)
 *
 * Two updates in the same tick compose: each starts from the URL the previous one asked for.
 */
export function useContactFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const search = params?.toString() ?? '';
  const filters = useMemo(() => parseContactParams(search), [search]);

  const latest = useRef(search);
  latest.current = search;

  const update = useCallback((patch) => {
    const current = parseContactParams(latest.current);
    const change = typeof patch === 'function' ? patch(current) : patch;
    const next = { ...current, ...change };
    if (!('page' in change)) next.page = 1;
    const qs = mergeContactParams(latest.current, next);
    latest.current = qs;
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, pathname]);

  const toggleTag = useCallback((tag) => update((f) => ({
    tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag],
  })), [update]);
  const clearTags = useCallback(() => update({ tags: [] }), [update]);
  const sortBy = useCallback((col) => update((f) => ({ sort: nextSort(f.sort, col) })), [update]);
  const showMore = useCallback(() => update((f) => ({ page: f.page + 1 })), [update]);
  const hrefFor = useCallback((path) => (search ? `${path}?${search}` : path), [search]);

  return { filters, search, update, toggleTag, clearTags, sortBy, showMore, hrefFor };
}
