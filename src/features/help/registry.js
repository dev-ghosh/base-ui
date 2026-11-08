// The guide to every tool: one registry, rendered by the Help page. Port of TOOLS / SHORTCUTS / go() in
// rie-dashboard2/js/help.js. Pure data and one pure function, so a Node test can import it.
//
// Each tool's `open` is an action name, resolved by helpTarget() below. The old go() ran
// `switchTabByName(...)` and `later(() => window.x())`; here an action is a route (with search params
// where the old one then poked the screen) or an overlay that exists, never a window function.

export const TOOLS = [
  { group: 'Daily work', id: 'today', name: 'Today', icon: 'sun',
    where: 'Menu → Today',
    what: 'Your ranked queue: decisions waiting on you, your P1 work that is overdue, your other overdue work, then what is due next.',
    steps: ['Press ✓ on a row to mark it done, or → to push it a week.', 'Click a row to open and edit the task.', 'Use the Triage button to clear a long overdue backlog quickly.'],
    keys: 'J / K move · Enter open · D done · 2 push a week', open: 'tab:home' },
  { group: 'Daily work', id: 'triage', name: 'Triage', icon: 'zap',
    where: 'Today → Triage button',
    what: 'Clears an overdue backlog one card at a time. Every outcome is one keystroke and can be undone for ten seconds.',
    steps: ['Open it from the Triage button on Today.', 'Press D for done, 1 / 2 / 3 to push the date, X to drop, S to skip.', 'Made a mistake? Press U within ten seconds.'],
    keys: 'D done · 1 2 3 push · X drop · S skip · U undo', open: 'triage' },
  { group: 'Daily work', id: 'work', name: 'Work', icon: 'grid',
    where: 'Menu → Work',
    what: 'Every task, organised by company and function. Five views of the same data: Matrix, Board, Hierarchy, Initiatives and Decide.',
    steps: ['Pick a view with the buttons at the top.', 'Use the Mine / Team / Everyone switch to choose whose work you see. It starts on Mine.', 'Click any task to edit it.'],
    open: 'tab:tasks' },
  { group: 'Daily work', id: 'matrix', name: 'Matrix view', icon: 'grid',
    where: 'Work → Matrix',
    what: 'A grid of companies against business functions. Each cell counts the work there; the colour shows how much is open or overdue.',
    steps: ['Click a cell to open every task in it.', 'Filter by status, owner or priority above the grid.', 'In the panel that opens, switch between Kanban, List and Pivot.'],
    open: 'surface:matrix' },
  { group: 'Daily work', id: 'board', name: 'Board view', icon: 'columns',
    where: 'Work → Board',
    what: 'A kanban board by status. Drag a card to another column to change its status.',
    steps: ['Drag a card between columns.', 'Closed work is tucked into a rail so the live columns stay readable.', 'Each column shows eight cards, with a “show more” for the rest.'],
    open: 'surface:flat' },
  { group: 'Daily work', id: 'hierarchy', name: 'Hierarchy view', icon: 'tree',
    where: 'Work → Hierarchy',
    what: 'Initiatives, workstreams and the tasks inside them, as folding groups.',
    steps: ['Click a group to fold or unfold it.', 'Use it to see how small tasks add up to a bigger goal.'],
    open: 'surface:hierarchy' },
  { group: 'Daily work', id: 'decide', name: 'Decide', icon: 'check',
    where: 'Work → Decide',
    what: 'Decisions waiting for an answer. This week’s are shown first; the rest are folded away.',
    steps: ['Open a decision and pick an outcome.', 'Defer anything that is not for this week.'],
    open: 'surface:decide' },
  { group: 'Daily work', id: 'bulk', name: 'Bulk edit', icon: 'layers',
    where: 'Work → Bulk edit',
    what: 'Change the status or the owner of many tasks at once.',
    steps: ['Turn on Bulk edit in Work.', 'Tick the tasks you want.', 'Choose a new status or owner and apply.'],
    open: 'bulk' },
  { group: 'Daily work', id: 'new', name: 'New (task, contact, lead, event)', icon: 'plus',
    where: 'Top bar → + New',
    what: 'The one place to create anything.',
    steps: ['Click + New and choose what you are adding.', 'Fill in the form and save. A task needs a company and a function.'],
    open: 'newmenu' },

  { group: 'People & pipeline', id: 'pipeline', name: 'Pipeline', icon: 'funnel',
    where: 'Menu → Pipeline',
    what: 'Applications and ongoing conversations: investors, grants, tenders, pitches. Each moves through stages from Identified to Won, Lost or On Hold.',
    steps: ['Drag a lead between stages, or switch to the table view.', 'Open a lead to log a call, meeting or note.', 'A task can be converted into a lead from its own form.'],
    open: 'tab:leads' },
  { group: 'People & pipeline', id: 'contacts', name: 'Contacts', icon: 'users',
    where: 'Menu → Contacts',
    what: 'Your directory of people, with a warmth score that shows who needs a follow-up.',
    steps: ['Search or filter by project, tier, category and location.', 'Open a person for their history and details.', 'Use the AI actions on a contact to research them or draft a follow-up.'],
    open: 'tab:contacts' },
  { group: 'People & pipeline', id: 'events', name: 'Events', icon: 'calendar',
    where: 'Menu → Events',
    what: 'Events and guest lists, with invitations and RSVPs.',
    steps: ['Add an event, then add guests from your contacts.', 'Send invites and sync replies from the event page.'],
    open: 'tab:events' },

  { group: 'Staying on top', id: 'escalations', name: 'Escalations', icon: 'arrowup',
    where: 'Menu → Escalations',
    what: 'When a task is stuck, hand it to someone who can unblock it. It moves up to four steps, and every step is recorded.',
    steps: ['Click “Escalate a task”, choose the task, the reason and who should handle it.', 'The task is put on hold and the person is alerted, by e-mail too if you leave that on.', 'They resolve it with a decision, or pass it further up. Resolving puts the task back where it was.'],
    open: 'tab:escalations' },
  { group: 'Staying on top', id: 'alerts', name: 'Alerts', icon: 'bell',
    where: 'Top bar → bell',
    what: 'Only things assigned to you: tasks that are overdue or due soon, new tasks given to you, and escalations waiting on you.',
    steps: ['The number on the bell is what you have not read yet.', 'Click an alert to jump straight to it.', 'Choose which alerts also come by e-mail in Profile → Notifications.'],
    open: 'alerts' },
  { group: 'Staying on top', id: 'search', name: 'Smart search', icon: 'search',
    where: 'Top bar → Search, or Ctrl/⌘ + K',
    what: 'Find anything from anywhere, including people, tasks and leads. You can also ask in plain words.',
    steps: ['Press Ctrl+K (⌘K on a Mac).', 'Type a name, or a question like “who did I meet in Mumbai last month”.'],
    keys: 'Ctrl / ⌘ + K', open: 'search' },
  { group: 'Staying on top', id: 'workload', name: 'Team workload', icon: 'gauge',
    where: 'Menu → Team workload',
    what: 'How much open work each person is carrying, as a simple load meter.',
    steps: ['Use it before assigning new work.', 'A person near the top of the meter is a candidate for reassignment.'],
    open: 'workload' },
  { group: 'Staying on top', id: 'activity', name: 'Activity feed', icon: 'pulse',
    where: 'Menu → Activity',
    what: 'A timeline of who changed what: status changes, new owners, comments.',
    steps: ['Scroll back through recent changes.', 'Use it to answer “what happened to this task?”'],
    open: 'activity' },
  { group: 'Staying on top', id: 'analytics', name: 'Analytics', icon: 'chart',
    where: 'Menu → Analytics',
    what: 'Throughput, completion and company-by-company progress, for the whole organisation.',
    steps: ['Read the headline numbers at the top.', 'Scroll for the breakdown by company and function.'],
    open: 'tab:analytics' },

  { group: 'Money & people', id: 'expenses', name: 'Expenses', icon: 'wallet',
    where: 'Menu → Expenses',
    what: 'Every expense, which card paid for it, who spent it, and whether it is approved. Cards show what each one was used for this month.',
    steps: ['Click Add expense: date, amount, category, and the card or other way it was paid.', 'Tap a card to see only what was paid with it. Use the month arrows to go back.', 'Anything you add waits for an admin to approve it. Admins can approve, reject, add cards, and export a CSV.'],
    open: 'tab:expenses' },
  { group: 'Money & people', id: 'team', name: 'Team', icon: 'badge',
    where: 'Menu → Team',
    what: 'The employee directory: role, department, manager, contact details and status. Admins also keep personal and emergency details, visible only to them.',
    steps: ['Search, or filter by department, company and status. Switch between cards and a table.', 'Click a person for their full details.', 'Admins: Add employee, or Import from people to start from everyone who already has a sign-in.'],
    open: 'tab:team' },

  { group: 'You & the system', id: 'profile', name: 'Profile & settings', icon: 'user',
    where: 'Click your name (top right) or Menu → Profile',
    what: 'Your details, which alerts reach your inbox and when, your theme, and your sign-in.',
    steps: ['Add your job title and phone.', 'Turn e-mail alerts on or off per kind, and pick the hour of your daily digest.', 'Send yourself a test e-mail to check it works.'],
    open: 'tab:profile' },
  { group: 'You & the system', id: 'devices', name: 'Sign in another device', icon: 'phone',
    where: 'Profile → Security',
    what: 'Show a QR code on this device and scan it with your phone. No e-mail needed.',
    steps: ['Open Profile → Security → Sign in another device.', 'Scan the code with the other device in BASE within three minutes.'],
    open: 'pair' },
  { group: 'You & the system', id: 'theme', name: 'Themes', icon: 'palette',
    where: 'Top bar → palette button',
    what: 'Dark, Light, and two SPC styles.', steps: ['Pick one; it is remembered on this device.'], open: 'tab:profile' },
  { group: 'You & the system', id: 'export', name: 'Export & sync', icon: 'download',
    where: 'Top bar → your name menu',
    what: 'Download everything to Excel, or force a fresh sync if something looks stale.',
    steps: ['Use Export to Excel for a snapshot.', 'Sync now re-reads everything from the database.'],
    open: 'usermenu' },
  { group: 'You & the system', id: 'access', name: 'Manage access', icon: 'shield', adminOnly: true,
    where: 'Profile → Security (admins only)',
    what: 'Add people, set their role (Admin, Editor, Viewer), which companies they see, and whose tasks they see.',
    steps: ['Add the person’s e-mail and name.', 'Link them to a person so “Mine” and alerts work for them.', 'Choose a role. New people start as Viewers.'],
    open: 'access' },
];

export const SHORTCUTS = [
  ['Ctrl / ⌘ + K', 'Smart search'],
  ['J / K', 'Move through rows on Today'],
  ['Enter', 'Open the focused row'],
  ['D', 'Mark the focused row done'],
  ['2', 'Push the focused row a week'],
  ['Esc', 'Close a window, the menu or the tour'],
  ['[', 'Collapse or expand the menu'],
];

/** Old `switchTabByName(<tab>)` -> the page route (docs/route-inventory.md section 2). */
const TAB_ROUTES = {
  home: '/today', tasks: '/work', leads: '/pipeline', contacts: '/contacts', events: '/events',
  escalations: '/escalations', analytics: '/analytics', expenses: '/expenses', team: '/team',
  profile: '/profile', help: '/help',
};

/** Old `setTaskSurface(<view>)` -> the Work sub-view. `flat` is the Board. */
const SURFACE_ROUTES = {
  matrix: '/work/matrix', flat: '/work/board', hierarchy: '/work/hierarchy',
  initiatives: '/work/initiatives', decide: '/work/decide',
};

/** The overlay ids a Help action can open (they are mounted in the (app) layout). */
export const OVERLAY_IDS = ['mo-smart-search', 'mo-workload', 'mo-activity', 'mo-access'];

/**
 * What a Help action does, as data:
 *   { href }      go to a route (search params included, for what the old action then poked)
 *   { overlay }   open this overlay (an `mo-*` id)
 *   { menu }      open this top-bar menu ('new' | 'user')
 *   { alerts }    open the alerts panel
 *   null          unknown action
 * The old go() chained `later(() => window.openTriage())`, `toggleTaskBulkMode()`, `openPairShare()`:
 * those became `/today/triage`, `/work/board?bulk=1`, `/profile?pair=1`.
 */
export function helpTarget(action) {
  const [kind, arg] = String(action || '').split(':');
  switch (kind) {
    case 'tab': return TAB_ROUTES[arg] ? { href: TAB_ROUTES[arg] } : null;
    case 'surface': return SURFACE_ROUTES[arg] ? { href: SURFACE_ROUTES[arg] } : null;
    case 'triage': return { href: '/today/triage' };
    case 'bulk': return { href: '/work/board?bulk=1' };
    case 'pair': return { href: '/profile?pair=1' };
    case 'alerts': return { alerts: true };
    case 'search': return { overlay: 'mo-smart-search' };
    case 'workload': return { overlay: 'mo-workload' };
    case 'activity': return { overlay: 'mo-activity' };
    case 'access': return { overlay: 'mo-access' };
    case 'newmenu': return { menu: 'new' };
    case 'usermenu': return { menu: 'user' };
    default: return null;
  }
}

/** The tools to list: admin-only ones only for admins, and (when searching) those whose text matches. */
export function visibleTools(query, admin) {
  const q = String(query || '').toLowerCase();
  return TOOLS.filter((t) => (!t.adminOnly || admin)
    && (!q || `${t.name} ${t.what} ${t.where} ${t.steps.join(' ')}`.toLowerCase().includes(q)));
}
