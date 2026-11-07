// Name, initials and role line shown in the sidebar, top bar and account menu.
// Port of paintIdentity()/applySession() in rie-dashboard2/js/app.js and initials()
// in js/profile.js. The avatar colour tone comes from user_prefs (Profile task).
import { roleFor } from './access.js';

export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/**
 * @param {object|null} session  from useSession()
 * @param {object|null} access   rie_my_access() row
 */
export function identityOf(session, access) {
  // Top bar chip: the session's name. Sidebar and menu header: the access row's name
  // once it is known (applySession ran before rie_my_access resolved, paintIdentity after).
  const name = access?.display_name || session?.displayName || '—';
  const role = roleFor(access);
  return {
    chipName: session?.displayName || '—',
    name,
    initials: initials(access?.display_name || session?.displayName || '?'),
    email: session?.email || '—',
    roleLabel: role ? role.label : '',
    roleLine: role ? `${role.label} · ${role.blurb}` : '',
  };
}
