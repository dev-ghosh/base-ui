'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Header, ReadOnlyBanner, Sidebar, Splash, StatusBar } from '@/components';
import { useAccess, useAccessMode } from '@/hooks/useAccess.js';
import { useDataLoader } from '@/hooks/useDataLoader.js';
import { useRealtime } from '@/hooks/useRealtime.js';
import { useSession } from '@/hooks/useSession.js';
import ActivityModal from '@/features/activity/ActivityModal.jsx';
import TourOverlay from '@/features/help/TourOverlay.jsx';
import { ContactFormProvider } from '@/features/contacts/ContactFormProvider.jsx';
import { LeadFormProvider } from '@/features/pipeline/LeadFormProvider.jsx';
import SmartSearch from '@/features/search/SmartSearch.jsx';
import { TaskFormProvider } from '@/features/tasks/TaskFormProvider.jsx';
import WorkloadModal from '@/features/workload/WorkloadModal.jsx';
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
 *    `ro` / `is-admin` / `scoped` (useAccessMode). No chrome renders until it has
 *    answered (or failed).
 */
export default function AppLayout({ children, modal }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, session, signOut } = useSession();
  const { loaded: accessLoaded } = useAccess();
  useAccessMode();
  const legacyChecked = useRef(false);

  // The splash covers the page until the session is known AND rie_my_access() has
  // answered (or failed, which fails closed to read-only), as the old completeSignIn
  // awaited loadMyAccess() before anything rendered: a viewer must never see a write
  // control flash, nor a non-admin the Admin item. Once a later task loads data, the
  // splash also waits for it.
  useEffect(() => { showSplash('Initialising…'); }, []);

  // Keep the status-bar colour in step with the theme the early script chose, on mount
  // and on every route change (the old boot ran setTheme() and switchTab() re-ran it).
  useEffect(() => { applyThemeColor(); }, [pathname]);

  useEffect(() => {
    if (status === 'signedOut') {
      resetAccess();                     // the next sign-in asks again; never reuse this user's rights
      router.replace('/login');
    } else if (status === 'signedIn') {
      if (!legacyChecked.current) {
        legacyChecked.current = true;
        const target = resolveLegacyUrl(window.location.search, window.location.hash);
        if (target) router.replace(target);
      }
    }
  }, [status, router]);

  // Data and live updates start once the user is signed in and access is known, and stop
  // (realtime) / restart (data) with the next sign-in. The splash does not wait for the data.
  useDataLoader(status === 'signedIn');
  useRealtime(status === 'signedIn');

  const ready = status === 'signedIn' && accessLoaded;
  useEffect(() => { if (ready) hideSplash(); }, [ready]);

  if (!ready) return <Splash />;   // reading storage, waiting for access, or on the way to /login

  // TaskFormProvider holds the task form (#mo-tf) once for the whole shell: the header's
  // New > Task, the task viewer's Edit and the lead screens all open it. LeadFormProvider does the same for the lead form (#mo-lf)
  // and ContactFormProvider for the contact form (#mo-cf), its duplicate dialog and the delete confirmation.
  return (
    <TaskFormProvider>
      <LeadFormProvider>
       <ContactFormProvider>
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
          <SmartSearch />
          {/* Sidebar overlays: Team workload (mo-workload) and Activity (mo-activity). */}
          <WorkloadModal />
          <ActivityModal />
          {/* The guided tour (started from Help and Profile > Security). */}
          <TourOverlay />
        </div>
       </ContactFormProvider>
      </LeadFormProvider>
    </TaskFormProvider>
  );
}
