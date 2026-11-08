'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { openMo } from '../../lib/modals.js';
import { AppearanceSection, GeneralSection, NotificationsSection, SecuritySection } from './sections.jsx';
import { SECTIONS, rememberSegment } from './model.js';
import { useSavedFlag } from './hooks/usePrefs.js';

const BODIES = {
  general: GeneralSection,
  notifications: NotificationsSection,
  appearance: AppearanceSection,
  security: SecuritySection,
};

/**
 * Profile & settings (old #tab-profile): the person's own page. The four sections are route segments
 * (/profile/general, /notifications, /appearance, /security); the one shown is remembered in the old
 * localStorage key `rie_profile_tab`. `?pair=1` opens the "Sign in another device" overlay (what Help's
 * "Open Sign in another device" used to do with openPairShare()) and is then removed from the address.
 */
export default function ProfileScreen({ segment, session }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { msg, show } = useSavedFlag();
  const Body = BODIES[segment] || GeneralSection;
  const wantsPair = params.get('pair') === '1';

  useEffect(() => { rememberSegment(segment); }, [segment]);

  useEffect(() => {
    if (!wantsPair) return;
    openMo('mo-pair');
    const rest = new URLSearchParams(params.toString());
    rest.delete('pair');
    const qs = rest.toString();
    router.replace(pathname + (qs ? '?' + qs : ''));
  }, [wantsPair, params, pathname, router]);

  return (
    <div className="tp active" id="tab-profile">
      <div id="profile-root">
        <div className="pg-wrap narrow">
          <header className="pg-head">
            <div><h1>Profile &amp; settings</h1><p>Your details, alerts and how BASE looks for you.</p></div>
            <span className={'saved-flag' + (show ? ' show' : '')} id="pf-saved" role="status">{msg}</span>
          </header>
          <div className="pf-layout">
            <nav className="pf-nav" aria-label="Settings sections">
              {SECTIONS.map((s) => (
                <button
                  key={s.segment} type="button" className={segment === s.segment ? 'on' : ''}
                  aria-current={segment === s.segment} onClick={() => router.push('/profile/' + s.segment)}
                >{s.label}</button>
              ))}
            </nav>
            <div className="pf-main"><Body session={session} /></div>
          </div>
        </div>
      </div>
    </div>
  );
}
