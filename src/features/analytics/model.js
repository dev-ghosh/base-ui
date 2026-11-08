/* model.js — the Analytics screen's small pure pieces: the filters as URL search params (spec C7
 * rule 4: the old `f` was module state), the remembered tab, and the number formatting.
 * No store, no DOM: plain Node can import it. */
import { DEFAULT_FILTERS, RANGES, TABS } from '../../lib/analytics.js';

/** The old localStorage key for the last tab; unknown values fall back to 'overview'. */
export const ANALYTICS_TAB_KEY = 'rie_an_tab';

export const TAB_KEYS = TABS.map(([k]) => k);

/** A stored or typed tab name that is one of the four, else 'overview'. */
export const tabOrDefault = (v) => (TAB_KEYS.includes(v) ? v : 'overview');

const KEYS = ['range', 'company', 'person'];
const toParams = (s) => (s instanceof URLSearchParams ? s : new URLSearchParams(s || ''));

/** { range, company, person } from the search params. A range that is not one of the four is the default. */
export function parseAnalyticsParams(search) {
  const p = toParams(search);
  const range = p.get('range');
  return {
    range: RANGES.some(([v]) => v === range) ? range : DEFAULT_FILTERS.range,
    company: p.get('company') || DEFAULT_FILTERS.company,
    person: p.get('person') || DEFAULT_FILTERS.person,
  };
}

/** Only what differs from the defaults is written. */
export function serializeAnalyticsParams(f) {
  const p = new URLSearchParams();
  if (f.range && f.range !== DEFAULT_FILTERS.range) p.set('range', f.range);
  if (f.company && f.company !== DEFAULT_FILTERS.company) p.set('company', f.company);
  if (f.person && f.person !== DEFAULT_FILTERS.person) p.set('person', f.person);
  return p.toString();
}

/** The current search string with the filter params replaced by `f`'s; other params are kept. */
export function mergeAnalyticsParams(currentSearch, f) {
  const next = new URLSearchParams();
  for (const [key, value] of toParams(currentSearch)) if (!KEYS.includes(key)) next.append(key, value);
  for (const [key, value] of new URLSearchParams(serializeAnalyticsParams(f))) next.append(key, value);
  return next.toString();
}

/** The Reset button shows once any filter differs from the default. */
export const isFiltered = (f) => f.company !== DEFAULT_FILTERS.company || f.person !== DEFAULT_FILTERS.person || f.range !== DEFAULT_FILTERS.range;

export const periodLabel = (range) => (range === 'ALL' ? 'all time' : `last ${range} days`);

export const money = (n) => (n ? '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '');
export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

/** "vs previous period" line: null when there is no previous period (range ALL), else { cls, text }. */
export function deltaInfo(now, prev) {
  if (prev == null) return null;
  if (!prev) return now ? { cls: 'up', text: 'new vs previous period' } : { cls: '', text: 'same as previous period' };
  const d = Math.round(((now - prev) / prev) * 100);
  if (!d) return { cls: '', text: 'same as previous period' };
  return { cls: d > 0 ? 'up' : 'down', text: `${d > 0 ? '+' : ''}${d}% vs previous period` };
}

/** The flow chart's y-axis: the top value (a multiple of 4, at least 4) and the five tick labels. */
export function chartScale(flow) {
  const max = Math.max(1, ...flow.flatMap((w) => [w.created, w.completed]));
  const top = Math.max(4, Math.ceil(max / 4) * 4);
  return { top, ticks: [top, (top * 3) / 4, top / 2, top / 4, 0].map((t) => Math.round(t)) };
}
