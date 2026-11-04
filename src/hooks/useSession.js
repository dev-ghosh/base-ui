'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSession, scheduleAutoRefresh, signOut as authSignOut } from '@/lib/auth.js';

/**
 * The signed-in user, read from localStorage (the JWT lives there, so the
 * server has nothing to render with).
 *
 *   status  'loading'   first render, before storage has been read (also what
 *                       the server renders, so hydration always matches)
 *           'signedOut' getSession() returned null: nothing usable is stored
 *           'signedIn'  getSession() returned a session
 *
 * R14: getSession()/refreshSession() keep the OLD behaviour. A stored session is
 * auto-extended and a refused refresh KEEPS it, so "signed out" means exactly
 * "no stored session", never "the token looked old" or "a refresh was refused".
 * A session the backend really rejects surfaces as an auth error on the first
 * request (rest.js), not here.
 *
 * Signing in is not this hook's job: the login forms and the root callback page
 * write the session through lib/auth.js and navigate away.
 */
export function useSession() {
  const [state, setState] = useState({ status: 'loading', session: null });

  useEffect(() => {
    const session = getSession();
    if (session) {
      scheduleAutoRefresh();
      setState({ status: 'signedIn', session });
    } else {
      setState({ status: 'signedOut', session: null });
    }
  }, []);

  const signOut = useCallback(async () => {
    await authSignOut();
    setState({ status: 'signedOut', session: null });
  }, []);

  return useMemo(() => ({ ...state, signOut }), [state, signOut]);
}
