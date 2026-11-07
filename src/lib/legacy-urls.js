// Old URLs keep working (spec C8/R17, docs/route-inventory.md section 2 + ruling 12.4).
//
// The old app was one page steered by `?tab=<panel>` and, for the Work matrix, a
// `#mx?<filters>` hash. A hash never reaches the server, so this runs in the
// browser: the (app) layout calls it once on mount with location.search and
// location.hash and replaces the URL when it answers with a path.
//
// Pure and Node-importable (no DOM, no framework) so the table test can run it.

// Old `?tab=` value -> new route. Aliases (today, work, pipeline) and the panels
// the old deep-link list did not accept (decide, hr-automation) are included per
// ruling 12.4. Index routes such as /pipeline and /contacts redirect on to their
// default sub-view; Work and Analytics are sent straight to theirs (12.4).
const TAB_ROUTES = {
  home: '/today',
  today: '/today',
  tasks: '/work/matrix',
  work: '/work/matrix',
  initiatives: '/work/initiatives',
  decide: '/work/decide',
  leads: '/pipeline',
  pipeline: '/pipeline',
  contacts: '/contacts',
  events: '/events',
  analytics: '/analytics/overview',
  escalations: '/escalations',
  profile: '/profile',
  help: '/help',
  expenses: '/expenses',
  team: '/team',
  'hr-automation': '/hr-automation',
};

const FALLBACK = '/today';
const MATRIX = '/work/matrix';

/**
 * @param {string} [search] location.search, with or without the leading "?"
 * @param {string} [hash]   location.hash, with its leading "#"
 * @returns {string|null} the new path (with search params) to replace the URL
 *   with, or null when the URL holds nothing legacy
 */
export function resolveLegacyUrl(search = '', hash = '') {
  // `#mx?<qs>` (matrix.js writeHash) becomes search params on the matrix. The
  // query is carried over verbatim: unknown or stale keys are ignored by the
  // matrix itself (readHash), never an error.
  const h = String(hash || '');
  if (h === '#mx' || h.startsWith('#mx?')) {
    const qs = h.slice(4);
    return qs ? `${MATRIX}?${qs}` : MATRIX;
  }

  const raw = new URLSearchParams(search || '').get('tab');
  if (!raw) return null;                     // absent or empty: nothing to do (as applyDeepLink)
  return Object.hasOwn(TAB_ROUTES, raw) ? TAB_ROUTES[raw] : FALLBACK;
}
