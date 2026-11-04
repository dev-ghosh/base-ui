/* platform.js — the parts of rie-dashboard2/js/platform.js that the sign-in
 * screen needs: "installed app or browser tab" detection, and the installed-app
 * session handoff (exportLoginCode / importLoginCode).
 *
 * NOT ported here (later tasks own them): applyThemeColor, notifyNative,
 * applyDeepLink (replaced by src/lib/legacy-urls.js in Task 6), and
 * registerAppWorker.
 */
import { decodeSession, getSession } from './auth.js';

/* ── standalone detection ─────────────────────────────────────────────────── */

/**
 * iPhone or iPad. iPadOS reports itself as "Macintosh", so the touch-point
 * check is what separates it from a real Mac.
 */
export function isIOS() {
  const nav = globalThis.navigator;
  if (!nav) return false;
  const ua = nav.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua)
    || (ua.includes('Macintosh') && nav.maxTouchPoints > 1);
}

export function isStandalone() {
  const w = globalThis.window;
  if (!w) return false;
  return Boolean(
    (typeof w.matchMedia === 'function' && w.matchMedia('(display-mode: standalone)').matches)
    // iOS Safari predates display-mode and still reports only this.
    || w.navigator?.standalone === true,
  );
}

/** True inside the WKWebView of the native iOS shell. */
export function isNativeShell() {
  return Boolean(globalThis.window?.webkit?.messageHandlers?.rie);
}

/* ── session handoff ──────────────────────────────────────────────────────── */

/*
 * Since iOS 16.4 a home-screen web app gets its own storage partition, separate
 * from Safari's. A magic link tapped in Mail always opens Safari, so the session
 * it establishes lands in the *browser's* localStorage and the installed app
 * never sees it.
 *
 * The code is the JWT pair, base64url-encoded. That makes it exactly as
 * sensitive as the magic link the user just clicked, and it inherits the same
 * expiry: importLoginCode() refuses anything older than HANDOFF_TTL_MS, so a
 * code left on the clipboard goes stale quickly.
 */

const HANDOFF_TTL_MS = 10 * 60 * 1000;

function b64urlEncode(str) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(str)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  const pad = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad + '='.repeat((4 - pad.length % 4) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}

/** Encode the live session as a transferable login code, or null if signed out. */
export function exportLoginCode() {
  const s = getSession();
  if (!s?.accessToken) return null;
  return b64urlEncode(JSON.stringify({
    v: 1, a: s.accessToken, r: s.refreshToken || '', t: Date.now(),
  }));
}

/**
 * Consume a login code produced by exportLoginCode().
 * @returns {object} the stored session
 * @throws  {Error}  with a message safe to show the user
 */
export function importLoginCode(raw) {
  const code = (raw || '').trim().replace(/\s+/g, '');
  if (!code) throw new Error('Paste the login code first.');

  let parsed;
  try { parsed = JSON.parse(b64urlDecode(code)); }
  catch { throw new Error('That does not look like a login code.'); }

  if (parsed.v !== 1 || !parsed.a) throw new Error('Unrecognised login code.');
  if (!parsed.t || Date.now() - parsed.t > HANDOFF_TTL_MS) {
    throw new Error('That login code has expired — send a new magic link.');
  }

  const session = decodeSession(parsed.a, parsed.r);
  if (!session) throw new Error('That login code is not valid.');
  if (session.expiresAt && session.expiresAt < Date.now()) {
    throw new Error('That session has already expired — send a new magic link.');
  }
  return session;
}
