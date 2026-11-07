// Sidebar structure, page titles and the active-item rule.
// Ported from rie-dashboard2: `aside#side` in index.html, `NAV_FOR` and `TITLES` in js/shell.js.
// Pure data and functions, no DOM and no framework, so a Node test can import it.
//
// `nav` is the old `data-nav` value. It is kept because shell.css keys off it
// (`.nv[data-nav="team"]` is hidden for task-scoped people) and because it is the
// stable id of a destination. `href` is the route it now opens (docs/route-inventory.md).
// Index routes (/work, /pipeline, ...) are the sidebar destinations; each redirects
// to its default sub-view.

export const NAV_SECTIONS = [
  {
    title: 'Operate',
    items: [
      { nav: 'home', label: 'Today', icon: 'sun', href: '/today' },
      { nav: 'tasks', label: 'Work', icon: 'grid', href: '/work' },
      { nav: 'leads', label: 'Pipeline', icon: 'funnel', href: '/pipeline' },
      { nav: 'escalations', label: 'Escalations', icon: 'arrowup', href: '/escalations', badge: 'escalations' },
    ],
  },
  {
    title: 'Insight',
    items: [
      { nav: 'analytics', label: 'Analytics', icon: 'chart', href: '/analytics' },
      // Overlays, not pages: they open mo-workload / mo-activity (a later task builds them).
      { label: 'Team workload', icon: 'gauge', overlay: 'workload' },
      { label: 'Activity', icon: 'pulse', overlay: 'activity' },
    ],
  },
  {
    title: 'Finance',
    items: [{ nav: 'expenses', label: 'Expenses', icon: 'wallet', href: '/expenses' }],
  },
  {
    title: 'Automation',
    items: [{ nav: 'hr-automation', label: 'HR automation', icon: 'refresh', href: '/hr-automation' }],
  },
  {
    title: 'People',
    items: [
      { nav: 'team', label: 'Team', icon: 'badge', href: '/team' },
      { nav: 'contacts', label: 'Contacts', icon: 'users', href: '/contacts' },
      { nav: 'events', label: 'Events', icon: 'calendar', href: '/events' },
    ],
  },
];

/** Admins only (html.is-admin). Opens the Access overlay (built in a later task). */
export const ADMIN_ITEM = { label: 'Manage access', icon: 'shield', overlay: 'access', section: 'Admin' };

/** The sidebar footer: Help, then the user button (Profile). */
export const FOOT_ITEMS = [
  { nav: 'help', label: 'Help & tools', icon: 'help', href: '/help' },
];
export const PROFILE_ITEM = { nav: 'profile', label: 'Profile & settings', href: '/profile' };

export const NAV_KEYS = [
  ...NAV_SECTIONS.flatMap((s) => s.items.filter((i) => i.nav).map((i) => i.nav)),
  ...FOOT_ITEMS.map((i) => i.nav),
  PROFILE_ITEM.nav,
];

// First path segment -> the sidebar item that is lit and the page title. A view
// that is not a top-level destination keeps its parent lit (NAV_FOR.initiatives = 'tasks'):
// everything under /work (initiatives, decide, task viewer) is Work.
const BY_SEGMENT = {
  today: ['home', 'Today'],
  work: ['tasks', 'Work'],
  pipeline: ['leads', 'Pipeline'],
  escalations: ['escalations', 'Escalations'],
  expenses: ['expenses', 'Expenses'],
  team: ['team', 'Team'],
  analytics: ['analytics', 'Analytics'],
  contacts: ['contacts', 'Contacts'],
  events: ['events', 'Events'],
  'hr-automation': ['hr-automation', 'HR automation'],
  profile: ['profile', 'Profile & settings'],
  help: ['help', 'Help & tools'],
};

const entryFor = (pathname) => {
  const seg = String(pathname || '').split('?')[0].split('/').filter(Boolean)[0];
  return seg && Object.hasOwn(BY_SEGMENT, seg) ? BY_SEGMENT[seg] : null;
};

/** The `nav` key of the sidebar item to light for a pathname, or null. */
export const navKeyForPath = (pathname) => entryFor(pathname)?.[0] ?? null;

/** The top-bar page title for a pathname ('' when unknown, as the old TITLES lookup). */
export const titleForPath = (pathname) => entryFor(pathname)?.[1] ?? '';
