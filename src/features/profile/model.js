// Pure parts of the Profile screen: the four sections and how they map to route segments, the
// remembered section (`rie_profile_tab`, same key and values as the old app), and the access summary.
// Port of SECTIONS / setProfileSection / profileSection / securitySection in rie-dashboard2/js/profile.js.
import { EXTRAS, ROLES, SCOPES } from '../../lib/access.js';

export const PROFILE_TAB_KEY = 'rie_profile_tab';

/**
 * `key` is the old section id (what `rie_profile_tab` holds), `segment` the route segment
 * (/profile/<segment>; the first one is `general`, not `profile`, ruling in route-inventory 12.1),
 * `label` the tab text (still "Profile").
 */
export const SECTIONS = [
  { key: 'profile', segment: 'general', label: 'Profile' },
  { key: 'notifications', segment: 'notifications', label: 'Notifications' },
  { key: 'appearance', segment: 'appearance', label: 'Appearance' },
  { key: 'security', segment: 'security', label: 'Security' },
];

export const DEFAULT_SEGMENT = SECTIONS[0].segment;

export const isProfileSegment = (s) => SECTIONS.some((x) => x.segment === s);

/** The segment for a stored value (old section id or a segment name); the default for anything else. */
export function segmentOfStored(v) {
  const s = SECTIONS.find((x) => x.key === v || x.segment === v);
  return s ? s.segment : DEFAULT_SEGMENT;
}

/** The value `rie_profile_tab` holds for a segment (the old section id, so the old app reads it too). */
export const storedOfSegment = (segment) => SECTIONS.find((x) => x.segment === segment)?.key ?? SECTIONS[0].key;

export function readStoredSegment(storage = globalThis.localStorage) {
  try { return segmentOfStored(storage?.getItem(PROFILE_TAB_KEY)); } catch { return DEFAULT_SEGMENT; }
}

export function rememberSegment(segment, storage = globalThis.localStorage) {
  try { storage?.setItem(PROFILE_TAB_KEY, storedOfSegment(segment)); } catch { /* ignore */ }
}

/** "5 Nov, 03:30 pm" style time of the security row ('—' when there is none). */
export function formatExpiry(exp) {
  return exp ? new Date(exp).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
}

/** What "Your access" shows, from the rie_my_access() row. */
export function accessSummary(access) {
  const a = access || {};
  const role = ROLES.find((r) => r.value === a.role) || null;
  const scope = SCOPES.find((s) => s.value === a.task_scope) || null;
  const extras = (a.extra_access || []).map((v) => EXTRAS.find((e) => e.value === v)?.label || v);
  const companies = a.companies && a.companies.length ? a.companies : null;   // null = "All companies"
  return { role, scope, extras, companies };
}
