'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Header, ReadOnlyBanner, Sidebar, Splash, StatusBar } from '@/components';
import { useAccess } from '@/hooks/useAccess.js';
import { useSession } from '@/hooks/useSession.js';
import { resetAccess } from '@/lib/access.js';
import { resolveLegacyUrl } from '@/lib/legacy-urls.js';
import { hideSplash, showSplash } from '@/lib/splash.js';
import { applyThemeColor } from '@/lib/theme.js';

/**
 * The frame around every signed-in screen: session gate, sidebar, top bar, status bar,
 * read-only banner, the page, and the @modal slot (record viewers as intercepting routes).
 *
 *  - Signed out -> /login. The shell is not rendered, so nothing signed-in flashes.
 *  - Legacy URLs (`?tab=`, `#mx?`) are converted once, on the first signed-in render.
 *    This is client-side because a hash never reaches the server (hence no middleware).
 *    The root page forwards the query (`/?tab=work` -> `/today?tab=work`), so the app
 *    can land on any route with a legacy URL still in the address bar.
 *  - Access (`rie_my_access`) is requested once per sign-in and mirrored to <html> as
 *    `ro` / `is-admin` (useAccess).
 */
export default function AppLayout({ children, modal }) {
  const router = useRouter();
  const { status, session, signOut } = useSession();
  useAccess();
  const legacyChecked = useRef(false);

  // The splash covers the page until the session is known (and, once a later task loads
  // data, until the data is in). Re-sync the status-bar colour with the theme the early
  // script chose, as the old boot did through setTheme().
  useEffect(() => {
    showSplash('Initialising…');
    applyThemeColor();
  }, []);

  useEffect(() => {
    if (status === 'signedOut') {
      resetAccess();                     // the next sign-in asks again; never reuse this user's rights
      router.replace('/login');
    } else if (status === 'signedIn') {
      hideSplash();
      if (!legacyChecked.current) {
        legacyChecked.current = true;
        const target = resolveLegacyUrl(window.location.search, window.location.hash);
        if (target) router.replace(target);
      }
    }
  }, [status, router]);

  if (status !== 'signedIn') return <Splash />;   // reading storage, or on the way to /login

  return (
    <div className="app" id="app">
      <Splash />
      <Sidebar session={session} />
      <div className="main" id="main">
        <Header session={session} onSignOut={signOut} />
        <StatusBar />
        <ReadOnlyBanner />
        {children}
      </div>
      {modal}
    </div>
  );
}
