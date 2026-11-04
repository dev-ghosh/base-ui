// Guard for the magic-link return at the site root (spec C13).
//
// The old app fed whatever followed `#access_token=` straight into
// decodeSession(), which happily stores a session for ANY string (it falls back
// to a placeholder identity when the token has no readable payload). The root
// page now checks the token looks like a JWT first, so a garbage fragment goes
// to /login?error=link instead of leaving a bogus `rie_session` behind.

/**
 * True when `token` has the shape of a Supabase access token: three non-empty
 * dot-separated segments whose middle segment is base64url JSON describing an
 * object. This is a shape check, not signature verification; the backend
 * verifies the token on the first request.
 */
export function looksLikeAccessToken(token) {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((p) => !p)) return false;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const payload = JSON.parse(json);
    return payload !== null && typeof payload === 'object' && !Array.isArray(payload);
  } catch {
    return false;
  }
}
