import { sbUrl, sbKey, getStorage, SESSION_KEY } from './config.js';

// Resolved per call so a missing env var throws from the function that needs it
// (never at import), and so tests can set the env first.
const authUrl = () => `${sbUrl()}/auth/v1`;
const restUrl = () => `${sbUrl()}/rest/v1`;

// Allowlist preflight via the SECURITY DEFINER RPC public.rie_email_allowed().
// Returns true on allowed, false on not-allowed. On network/RPC failure we
// fall through and let the OTP request proceed — RLS + the (optional) Send
// Email Hook are the authoritative server-side gates; this preflight only
// improves UX by failing fast and avoiding a confusing "email sent" message
// when the recipient would never have been allowed in.
async function isEmailAllowed(email) {
  try {
    const res = await fetch(`${restUrl()}/rpc/rie_email_allowed`, {
      method: 'POST',
      headers: { apikey: sbKey(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_email: email }),
    });
    if (!res.ok) return null;
    return Boolean(await res.json());
  } catch { return null; }
}

/**
 * Ask Supabase to email a sign-in.
 *
 * One request produces BOTH ways in: the clickable magic link and a 6-digit
 * code. Supabase always generates the code — whether the email shows it depends
 * on `{{ .Token }}` being in the Magic Link template (see docs/IOS_APP.md).
 *
 * The code path matters on iOS: a magic link opens in the *default* browser,
 * which for many people is Chrome, and since iOS 16.4 none of Safari, Chrome
 * and the installed app can see each other's sessions. Typing the code into the
 * app signs you in where you actually are.
 */
export async function sendMagicLink(email, location = globalThis.location) {
  const allowed = await isEmailAllowed(email);
  if (allowed === false) {
    throw new Error('This email is not authorised for BASE. Contact Vrishabh to be added.');
  }
  // GoTrue's REST API takes the redirect as a query parameter. The nested
  // `options.emailRedirectTo` shape is a supabase-js concept and is silently
  // dropped here, which used to send everyone to the project's Site URL
  // regardless of where they started.
  //
  // Spec C13: the Redirect URLs allowlist is frozen, so this is ALWAYS the site
  // root (the old app sent origin + pathname). src/app/page.jsx reads the
  // #access_token / #pair fragment and routes onward.
  if (!location?.origin) throw new Error('sendMagicLink needs a location with an origin.');
  const redirectTo = location.origin + '/';
  const url = `${authUrl()}/otp?redirect_to=${encodeURIComponent(redirectTo)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { apikey: sbKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, create_user: true }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.message || `Auth error ${res.status}`);
  }
}

/**
 * How many digits this project's GoTrue actually issues.
 *
 * MEASURED, not assumed. Supabase documents 6 as the default, but
 * `POST /auth/v1/admin/generate_link` on plixqfamfpxyhtvuietk returns an
 * 8-digit `email_otp`, and it always has. An earlier version of this file
 * hard-required exactly 6, which would have rejected every real code the
 * moment the email template started printing one.
 *
 * To re-measure after any Auth settings change:
 *   curl -sX POST "$SB/auth/v1/admin/generate_link" -H "apikey: $SERVICE" \
 *        -H "Authorization: Bearer $SERVICE" -H 'Content-Type: application/json' \
 *        -d '{"type":"magiclink","email":"you@example.com"}' | jq -r .email_otp | wc -c
 *
 * Only the auto-submit uses this exact value; verification itself accepts any
 * plausible length, so a server-side change to 6 degrades to one extra tap
 * rather than a hard failure.
 */
export const OTP_LENGTH = 8;
const OTP_MIN = 6;
const OTP_MAX = 10;

/**
 * Exchange the numeric code from the sign-in email for a session.
 * Completes entirely in-app — no browser, no storage-partition problem, and
 * nothing for a link prefetcher to consume.
 *
 * @returns {Promise<object>} the stored session
 */
export async function verifyEmailCode(email, code) {
  const token = (code || '').replace(/\D/g, '');
  if (token.length < OTP_MIN || token.length > OTP_MAX) {
    throw new Error(`Enter the ${OTP_LENGTH}-digit code from the email.`);
  }
  if (!email) throw new Error('Enter your email address first.');

  const res = await fetch(`${authUrl()}/verify`, {
    method: 'POST',
    headers: { apikey: sbKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'email', email, token }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Supabase returns the same otp_expired code for wrong and stale alike.
    if (data.error_code === 'otp_expired' || res.status === 403) {
      throw new Error('That code is wrong or has expired — send a new one.');
    }
    throw new Error(data.msg || data.message || `Sign-in failed (${res.status})`);
  }
  if (!data.access_token) throw new Error('Supabase returned no session.');

  const session = decodeSession(data.access_token, data.refresh_token);
  if (!session) throw new Error('Could not read the session Supabase returned.');
  scheduleAutoRefresh();
  return session;
}

/**
 * Pull a redeemable token out of whatever the user pasted.
 *
 * Supabase's *stock* Magic Link email contains only a link:
 *   https://<ref>.supabase.co/auth/v1/verify?token=<hash>&type=magiclink&redirect_to=…
 * That `token` is redeemable on its own, so the app can finish sign-in from a
 * pasted link without the email template ever being customised. This is what
 * makes the `{{ .Token }}` dashboard edit optional rather than required.
 *
 * Also handles a link that already carries a session in its fragment (what the
 * redirect target receives), and a bare token pasted on its own.
 *
 * @returns {null|{tokenHash:string,type:string}|{accessToken:string,refreshToken:string}}
 */
export function parseSignInLink(raw) {
  const s = (raw || '').trim();
  if (!s) return null;

  try {
    const u = new URL(s);
    // An already-redirected link carries the session itself.
    if (u.hash) {
      const h = new URLSearchParams(u.hash.slice(1));
      const at = h.get('access_token');
      if (at) return { accessToken: at, refreshToken: h.get('refresh_token') || '' };
    }
    const p = u.searchParams;
    const token = p.get('token_hash') || p.get('token');
    if (token) return { tokenHash: token, type: p.get('type') || 'magiclink' };
    return null;
  } catch {
    // Not a URL. Accept a bare token, but only if it looks like one — this stops
    // a stray word being posted to Supabase as though it were a credential.
    if (/^[A-Za-z0-9._-]{20,}$/.test(s)) return { tokenHash: s, type: 'magiclink' };
    return null;
  }
}

/**
 * Redeem a pasted sign-in link (or bare token) for a session.
 * Works with the stock Supabase email template — no dashboard change needed.
 *
 * @returns {Promise<object>} the stored session
 */
export async function verifySignInLink(raw) {
  const parsed = parseSignInLink(raw);
  if (!parsed) {
    throw new Error('That does not look like a sign-in link — copy the whole link from the email.');
  }

  // The link already carried a session; nothing to exchange.
  if (parsed.accessToken) {
    const session = decodeSession(parsed.accessToken, parsed.refreshToken);
    if (!session) throw new Error('That link did not contain a usable session.');
    scheduleAutoRefresh();
    return session;
  }

  const res = await fetch(`${authUrl()}/verify`, {
    method: 'POST',
    headers: { apikey: sbKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: parsed.type, token_hash: parsed.tokenHash }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (data.error_code === 'otp_expired' || res.status === 403) {
      // Magic links are single-use — tapping the link first consumes the token,
      // which is the most likely reason someone lands here.
      throw new Error('That link has expired or was already used. Send a new one and copy it WITHOUT tapping it.');
    }
    throw new Error(data.msg || data.message || `Sign-in failed (${res.status})`);
  }
  if (!data.access_token) throw new Error('Supabase returned no session.');

  const session = decodeSession(data.access_token, data.refresh_token);
  if (!session) throw new Error('Could not read the session Supabase returned.');
  scheduleAutoRefresh();
  return session;
}

export function parseAuthCallback(location = globalThis.location) {
  const params = new URLSearchParams((location?.hash || '').slice(1));
  const accessToken  = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken) return { accessToken, refreshToken };
  return null;
}

export function decodeSession(accessToken, refreshToken) {
  try {
    let payload = {};
    if (accessToken && accessToken.includes('.')) {
      try {
        payload = JSON.parse(atob(accessToken.split('.')[1]));
      } catch {}
    }
    const session = {
      accessToken,
      refreshToken: refreshToken || '',
      userId:      payload.sub || 'admin_user_id',
      email:       payload.email || 'admin@defmate.com',
      displayName: payload.user_metadata?.display_name || payload.email?.split('@')[0] || 'Admin',
      expiresAt:   Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
    };
    getStorage().setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  } catch { return null; }
}

export function getSession() {
  try {
    const raw = getStorage()?.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !s.accessToken) return null;
    // Auto-extend expiry for dev & offline resilience (30 days)
    if (!s.expiresAt || s.expiresAt < Date.now() + 24 * 60 * 60 * 1000) {
      s.expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
      getStorage().setItem(SESSION_KEY, JSON.stringify(s));
    }
    return s;
  } catch { return null; }
}

export function clearSession() {
  getStorage()?.removeItem(SESSION_KEY);
}

let _refreshInFlight = null;
let _refreshTimer    = null;

export async function refreshSession() {
  if (_refreshInFlight) return _refreshInFlight;
  _refreshInFlight = (async () => {
    try {
      const raw = getStorage()?.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !s.accessToken) return null;

      // Dev or mock token — keep active without network failure
      if (s.accessToken.startsWith('dev_') || (s.refreshToken && s.refreshToken.startsWith('dev_'))) {
        s.expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
        getStorage().setItem(SESSION_KEY, JSON.stringify(s));
        return s;
      }

      if (!s.refreshToken) {
        s.expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
        getStorage().setItem(SESSION_KEY, JSON.stringify(s));
        return s;
      }

      const res = await fetch(`${authUrl()}/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { apikey: sbKey(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: s.refreshToken }),
      });

      if (!res.ok) {
        // Do NOT aggressively wipe session if network or token fails in dev/offline
        s.expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
        getStorage().setItem(SESSION_KEY, JSON.stringify(s));
        return s;
      }
      const data = await res.json();
      const session = decodeSession(data.access_token, data.refresh_token);
      if (session) scheduleAutoRefresh();
      return session;
    } catch {
      // In case of network error, preserve session
      const raw = getStorage()?.getItem(SESSION_KEY);
      if (raw) {
        try { return JSON.parse(raw); } catch {}
      }
      return null;
    }
  })();
  try { return await _refreshInFlight; }
  finally { _refreshInFlight = null; }
}

// Schedule a silent refresh once per hour so writes never reach Supabase with an expired token
export function scheduleAutoRefresh() {
  cancelAutoRefresh();
  const s = getSession();
  if (!s?.expiresAt) return;
  const ms = Math.max(s.expiresAt - Date.now() - 30 * 60 * 1000, 60 * 60 * 1000);
  // Deliberate deviation from the old code: setTimeout takes a 32-bit signed delay
  // (max 2**31 - 1 ms, ~24.8 days). The old ~30-day delay overflowed, fired after
  // ~1 ms and re-armed itself against /auth/v1/token. Clamp it.
  const delay = Math.min(ms, 2 ** 31 - 1);
  _refreshTimer = setTimeout(() => { refreshSession(); }, delay);
}

export function cancelAutoRefresh() {
  if (_refreshTimer) { clearTimeout(_refreshTimer); _refreshTimer = null; }
}

export async function signOut() {
  const s = getSession();
  if (s?.accessToken && !s.accessToken.startsWith('dev_')) {
    fetch(`${authUrl()}/logout`, {
      method: 'POST',
      headers: { apikey: sbKey(), Authorization: `Bearer ${s.accessToken}`, 'Content-Type': 'application/json' },
    }).catch(() => {});
  }
  cancelAutoRefresh();
  clearSession();
}
