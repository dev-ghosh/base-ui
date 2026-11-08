'use client';

import { createContext, useContext } from 'react';
import { signOut as authSignOut } from '../lib/auth.js';
import { resetAccess } from '../lib/access.js';

const SignOutContext = createContext(null);

/**
 * The shell's sign-out (the one that owns the session state, so the layout notices and goes to
 * /login), for screens that offer it: the Profile > Security "Sign out" button.
 */
export function SignOutProvider({ signOut, children }) {
  return <SignOutContext.Provider value={signOut}>{children}</SignOutContext.Provider>;
}

/** The sign-out function. Without a shell around (a screen rendered alone) it ends the session itself. */
export function useSignOut() {
  return useContext(SignOutContext) ?? (async () => { await authSignOut(); resetAccess(); });
}
