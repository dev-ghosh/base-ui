// Backend configuration. Port of rie-dashboard2/js/config.js.
//
// Differences from the old file (rulings, spec C5/C13):
//  - values come from NEXT_PUBLIC_SB_URL / NEXT_PUBLIC_SB_KEY, with NO hard-coded
//    fallback. They are written as literal `process.env.NEXT_PUBLIC_X` accesses so
//    Next inlines them into the browser bundle.
//  - importing this module never throws; the functions that need a value throw a
//    clear Error naming the variable, so tests can set the env before using it.
//  - localStorage is reached through getStorage() (resolved per call), so the
//    module runs in plain Node and in SSR.

export const SB_URL = process.env.NEXT_PUBLIC_SB_URL;
export const SB_KEY = process.env.NEXT_PUBLIC_SB_KEY;

/** Supabase project URL. Throws if NEXT_PUBLIC_SB_URL is not set. */
export function sbUrl() {
  const v = process.env.NEXT_PUBLIC_SB_URL;
  if (!v) throw new Error('Missing environment variable NEXT_PUBLIC_SB_URL (see .env.example).');
  return v;
}

/** Public anon key. Throws if NEXT_PUBLIC_SB_KEY is not set. */
export function sbKey() {
  const v = process.env.NEXT_PUBLIC_SB_KEY;
  if (!v) throw new Error('Missing environment variable NEXT_PUBLIC_SB_KEY (see .env.example).');
  return v;
}

/** The Storage the session lives in, or null where there is none (SSR, bare Node). */
export function getStorage() {
  return globalThis.localStorage ?? null;
}

export const SESSION_KEY = 'rie_session';
const REFRESH_WINDOW_MS = 5 * 60 * 1000;

// Returns headers for every Supabase REST call.
// If the stored JWT is within REFRESH_WINDOW_MS of expiry, attempts a silent
// refresh before returning. Falls back to the anon key only when no session
// exists at all, never silently downgrades an authenticated user.
export async function getHeaders() {
  const key = sbKey();
  let token = key;
  try {
    const raw = getStorage()?.getItem(SESSION_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s.accessToken) {
        const now = Date.now();
        const expiringSoon = s.expiresAt && now > s.expiresAt - REFRESH_WINDOW_MS;
        if (expiringSoon && s.refreshToken) {
          const { refreshSession } = await import('./auth.js');
          const refreshed = await refreshSession();
          token = refreshed?.accessToken || s.accessToken;
        } else {
          token = s.accessToken;
        }
      }
    }
  } catch { /* ignore */ }
  return {
    'Content-Type': 'application/json',
    'apikey': key,
    'Authorization': 'Bearer ' + token,
    'Prefer': 'return=representation',
  };
}
