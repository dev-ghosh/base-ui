'use client';

import { Fragment, useEffect, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Icon } from './Icon.jsx';
import { useAccess } from '../hooks/useAccess.js';
import NavBadge from '../features/escalations/NavBadge.jsx';
import { useAvatarColour } from '../features/profile/hooks/usePrefs.js';
import { openAccess } from '../lib/access-admin.js';
import { identityOf } from '../lib/identity.js';
import { openMo } from '../lib/modals.js';
import { ADMIN_ITEM, FOOT_ITEMS, NAV_SECTIONS, PROFILE_ITEM, navKeyForPath } from '../lib/nav.js';
import { closeSidebarIfMobile, initSidebar, sidebarStore } from '../lib/sidebar.js';

// Overlays the sidebar opens. They are not pages (docs/route-inventory.md section 9). Team workload,
// Activity and Manage access are modals mounted in the (app) layout (features/workload, features/activity,
// features/access); Manage access is admins only (openAccess refuses anyone else).
const openWorkloadPanel = () => openMo('mo-workload');
const openActivityPanel = () => openMo('mo-activity');
const OVERLAYS = { workload: openWorkloadPanel, activity: openActivityPanel, access: openAccess };

/**
 * The side menu (`aside#side` in the old index.html). A fixed part of the layout on
 * wide screens (folds to an icon rail), a drawer on phones. Behaviour: lib/sidebar.js.
 * Items are buttons, as before, so shell.css applies unchanged.
 */
export default function Sidebar({ session }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAdmin, access } = useAccess();
  const { open, wide, opening } = useSyncExternalStore(sidebarStore.subscribe, sidebarStore.getState, sidebarStore.getState);
  const active = navKeyForPath(pathname);
  const me = identityOf(session, access);
  const avatarColour = useAvatarColour();

  useEffect(() => initSidebar(), []);
  // Every panel change closes the drawer (setActiveNav in the old shell.js).
  useEffect(() => { closeSidebarIfMobile(); }, [pathname]);

  let i = 0;   // --i: position among the .nv items, for the staggered entrance
  const go = (href) => { closeSidebarIfMobile(); router.push(href); };
  const overlay = (key) => { closeSidebarIfMobile(); OVERLAYS[key](); };

  const item = (it) => {
    const on = it.nav != null && it.nav === active;
    return (
      <button
        key={it.label}
        type="button"
        className={'nv' + (on ? ' active' : '')}
        data-nav={it.nav}
        aria-current={on ? 'page' : undefined}
        title={it.label}
        style={{ '--i': i++ }}
        onClick={() => (it.href ? go(it.href) : overlay(it.overlay))}
      >
        <span className="nv-ic" data-icon={it.icon}><Icon name={it.icon} /></span>
        <span className="nv-t">{it.label}</span>
        {it.badge && <NavBadge kind={it.badge} />}
      </button>
    );
  };

  const profileOn = active === PROFILE_ITEM.nav;

  return (
    <>
      <aside
        className={'side' + (opening ? ' opening' : '')}
        id="side"
        aria-label="Main navigation"
        aria-hidden={String(!open && !wide)}
      >
        <div className="side-head">
          <div className="side-mark">B</div>
          <div className="side-brand">BASE</div>
        </div>

        <nav className="side-nav">
          {NAV_SECTIONS.map((sec) => (
            <Fragment key={sec.title}>
              <div className="side-sec">{sec.title}</div>
              {sec.items.map(item)}
            </Fragment>
          ))}

          {/* Admins only (html.is-admin, from rie_my_access). RLS enforces admin-only writes regardless. */}
          {isAdmin && (
            <>
              <div className="side-sec nv-admin">{ADMIN_ITEM.section}</div>
              <button
                type="button"
                className="nv nv-admin"
                title={ADMIN_ITEM.label}
                style={{ '--i': i++ }}
                onClick={() => overlay(ADMIN_ITEM.overlay)}
              >
                <span className="nv-ic" data-icon={ADMIN_ITEM.icon}><Icon name={ADMIN_ITEM.icon} /></span>
                <span className="nv-t">{ADMIN_ITEM.label}</span>
              </button>
            </>
          )}
        </nav>

        <div className="side-foot">
          {FOOT_ITEMS.map(item)}
          <button
            type="button"
            className={'side-user' + (profileOn ? ' active' : '')}
            data-nav={PROFILE_ITEM.nav}
            aria-current={profileOn ? 'page' : undefined}
            title={PROFILE_ITEM.label}
            onClick={() => go(PROFILE_ITEM.href)}
          >
            <span className="user-av" id="user-av-side" style={{ background: avatarColour }}>{me.initials}</span>
            <span className="nv-t side-user-t"><b id="user-name-side">{me.name}</b><small id="user-role-side">{me.roleLabel}</small></span>
          </button>
        </div>
      </aside>
      <div className="side-scrim" id="side-scrim" onClick={closeSidebarIfMobile}></div>
    </>
  );
}
