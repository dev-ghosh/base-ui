'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Icon } from './Icon.jsx';
import { useAccess } from '../hooks/useAccess.js';
import { useTheme } from '../hooks/useTheme.js';
import { identityOf } from '../lib/identity.js';
import { titleForPath } from '../lib/nav.js';
import { sidebarStore, toggleMenu } from '../lib/sidebar.js';
import { THEMES } from '../lib/theme.js';

// Buttons whose features are built in later tasks. They exist so the bar looks and
// tabs as before; each is a named no-op until its task replaces it.
// TODO(Task 11): smart search overlay (mo-smart-search, Ctrl+K), with saved-filters.js
function openSmartSearch() {}
// TODO(Task 7): syncNow(): re-read access and data and redraw, without a reload
function syncNow() {}
// TODO(Task 13): alerts panel (openAlertsPanel), with the unread badge on #notif-btn
function openAlertsPanel() {}
// TODO(Task 8): openAddTask()
function openAddTask() {}
// TODO(Task 11): openAddContact()
function openAddContact() {}
// TODO(Task 10): openAddLead()
function openAddLead() {}
// TODO(Task 12): openAddEvent()
function openAddEvent() {}
// TODO(Task 11): exportToExcel() (lazy-loads SheetJS)
function exportToExcel() {}

/**
 * The top bar (`header.topbar` in the old index.html): menu button, page title, search
 * pill, sync, theme menu, alerts, New menu and the account menu. At most one of the
 * three menus is open at a time; Esc and a click outside `.menu-wrap` close it.
 *
 * Identity comes in as props because sign-out must go through the one useSession()
 * the layout owns.
 */
export default function Header({ session, onSignOut }) {
  const pathname = usePathname();
  const router = useRouter();
  const { access } = useAccess();
  const { theme, setTheme } = useTheme();
  const { open: sideOpen } = useSyncExternalStore(sidebarStore.subscribe, sidebarStore.getState, sidebarStore.getState);
  const [menu, setMenu] = useState(null);   // null | 'theme' | 'new' | 'user'
  const me = identityOf(session, access);

  const toggle = (name) => setMenu((m) => (m === name ? null : name));
  const cls = (name, extra) => 'menu menu-r' + (extra ? ' ' + extra : '') + (menu === name ? ' open' : '');
  const go = (href) => { setMenu(null); router.push(href); };

  // A menu left open under a new screen is the classic version of this bug.
  useEffect(() => { setMenu(null); }, [pathname]);

  useEffect(() => {
    const onClick = (e) => { if (!e.target.closest?.('.menu-wrap')) setMenu(null); };
    const onKey = (e) => { if (e.key === 'Escape') setMenu(null); };   // the drawer's own Esc lives in lib/sidebar.js
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <header className="topbar">
      <button
        type="button"
        className="burger"
        id="menu-btn"
        onClick={toggleMenu}
        aria-label={sideOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={String(sideOpen)}
        aria-controls="side"
      >
        <i></i><i></i><i></i>
      </button>
      <h1 className="page-title" id="page-title">{titleForPath(pathname)}</h1>

      <div className="topbar-right">
        <button type="button" className="search-pill" id="search-btn" onClick={openSmartSearch} title="Search (Ctrl+K)">
          <span data-icon="search" data-size="16"><Icon name="search" size={16} /></span><span className="sp-t">Search</span><kbd>Ctrl K</kbd>
        </button>

        {/* Sync: re-read access and data and redraw this page, without a browser reload. */}
        <button type="button" className="icon-round" id="sync-btn" onClick={syncNow} aria-label="Sync now" title="Sync: get the latest without reloading">
          <span data-icon="refresh" data-size="19"><Icon name="refresh" size={19} /></span>
        </button>

        <div className="menu-wrap">
          <button type="button" className="icon-round" id="theme-btn" onClick={() => toggle('theme')} aria-label="Change theme" aria-haspopup="menu" title="Theme">
            <span data-icon="palette" data-size="19"><Icon name="palette" size={19} /></span>
          </button>
          <div className={cls('theme')} id="theme-menu" role="menu">
            <div className="menu-sep" style={{ borderTop: 0, marginTop: 0 }}>Theme</div>
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="menuitem"
                className={'menu-theme' + (theme === t.id ? ' on' : '')}
                data-theme-opt={t.id}
                onClick={() => { setMenu(null); setTheme(t.id); }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <button type="button" className="icon-round" id="notif-btn" onClick={openAlertsPanel} aria-label="Alerts" aria-haspopup="dialog" aria-expanded="false" title="Alerts for you">
          <span data-icon="bell" data-size="19"><Icon name="bell" size={19} /></span>
          <span className="dot-badge" data-badge="alerts" hidden></span>
        </button>

        <div className="menu-wrap">
          <button type="button" className="btn b-pr new-btn" id="new-btn" onClick={() => toggle('new')}>
            <span data-icon="plus" data-size="16"><Icon name="plus" size={16} /></span><span className="sp-t">New</span>
          </button>
          <div className={cls('new')} id="new-menu">
            <button type="button" onClick={() => { setMenu(null); openAddTask(); }}>Task</button>
            <button type="button" onClick={() => { setMenu(null); openAddContact(); }}>Contact</button>
            <button type="button" onClick={() => { setMenu(null); openAddLead(); }}>Lead</button>
            <button type="button" onClick={() => { setMenu(null); openAddEvent(); }}>Event</button>
          </div>
        </div>

        <div className="menu-wrap">
          <button type="button" className="user-chip" id="user-chip" onClick={() => toggle('user')} aria-haspopup="menu" aria-expanded={String(menu === 'user')} title="Account">
            <span className="user-av" id="user-av">{me.initials}</span>
            <span className="sp-t" id="user-name">{me.chipName}</span>
          </button>
          <div className={cls('user', 'um')} id="user-menu" role="menu">
            <div className="um-head">
              <div className="um-name" id="user-name-lg">{me.name}</div>
              <div className="um-mail" id="user-email">{me.email}</div>
              <div className="ax-role-line" id="profile-role">{me.roleLine}</div>
            </div>
            <button type="button" role="menuitem" onClick={() => go('/profile')}>Profile &amp; settings</button>
            <button type="button" role="menuitem" onClick={() => go('/profile/notifications')}>Notification settings</button>
            <button type="button" role="menuitem" onClick={() => go('/help')}>Help &amp; tools</button>
            <div className="menu-sep">Data</div>
            <button type="button" role="menuitem" onClick={() => { setMenu(null); syncNow(); }}>Sync now</button>
            <button type="button" role="menuitem" onClick={() => { setMenu(null); exportToExcel(); }}>Export to Excel</button>
            <div className="menu-sep"></div>
            <button type="button" role="menuitem" className="um-out" onClick={() => { setMenu(null); onSignOut(); }}>Sign out</button>
          </div>
        </div>
      </div>
    </header>
  );
}
