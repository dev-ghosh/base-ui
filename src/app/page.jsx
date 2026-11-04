'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { decodeSession, getSession, parseAuthCallback, scheduleAutoRefresh } from '@/lib/auth.js';
import { claimPairing, takePairFromUrl } from '@/lib/devicepair.js';
import { looksLikeAccessToken } from '@/lib/signin-callback.js';

// The site root is the ONLY place that handles what a sign-in leaves in the URL
// hash (spec C13; the hash never reaches the server, and the Supabase Redirect
// URLs allowlist is frozen at the root):
//
//   #pair=<12 chars>                          QR pairing (also the phone Camera app)
//   #access_token=...&refresh_token=...       magic-link return
//
// It completes sign-in, clears the hash with history.replaceState, and replaces
// to the landing route. Order matches the old boot(): a pairing code beats
// everything (it is single-use and expires in three minutes), then the
// magic-link callback, then an existing session. Any other hash is ignored.
export default function RootPage() {
  const router = useRouter();
  // React StrictMode runs effects twice in development. A pairing code is
  // single-use and the hash is already consumed by the first run, so the second
  // run must not start another sign-in (it would see no hash and no session yet
  // and wrongly send the user to /login).
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const landing = '/today' + window.location.search;   // keeps a legacy ?tab= for the shell to resolve

    async function run() {
      // 1. QR pairing
      const pairCode = takePairFromUrl();
      if (pairCode) {
        try {
          await claimPairing(pairCode);          // stores rie_session, arms the refresh timer
          router.replace(landing);
        } catch {
          // Stale or already-used code: say why on the sign-in screen instead of
          // dead-ending (or, if this device is already signed in, carry on).
          router.replace(getSession() ? landing : '/login?error=pair');
        }
        return;
      }

      // 2. Magic-link return
      const callback = parseAuthCallback();
      if (callback) {
        const url = window.location.pathname + window.location.search;
        if (looksLikeAccessToken(callback.accessToken)) {
          const session = decodeSession(callback.accessToken, callback.refreshToken);
          window.history.replaceState(null, '', url);
          if (session) {
            scheduleAutoRefresh();
            router.replace(landing);
            return;
          }
        } else {
          window.history.replaceState(null, '', url);
        }
        router.replace('/login?error=link');
        return;
      }

      // 2b. A failed magic-link return: Supabase redirects an expired or already
      //     used link to /#error=access_denied&error_code=otp_expired&... with no
      //     token. Say so on the sign-in screen (plan Review Focus 1); a user who
      //     is already signed in just carries on.
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      if (hashParams.has('error') || hashParams.has('error_code')) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        router.replace(getSession() ? landing : '/login?error=link');
        return;
      }

      // 3. Nothing to complete: an existing session goes in, anyone else signs in.
      router.replace(getSession() ? landing : '/login');
    }

    // An unexpected throw must never leave a blank page.
    run().catch(() => { router.replace('/login'); });
  }, [router]);

  return <main aria-busy="true" />;
}
