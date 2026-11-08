'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '../../store/useStore.js';
import { useAlertState } from '../../hooks/useAlerts.js';
import {
  alertsUi, closeAlertsPanel, markAlertRead, markAllNotificationsRead, myCode, setAlertFilter,
} from './alerts.js';
import { GROUPS } from './model.js';

const useUi = (key) => useSyncExternalStore(alertsUi.subscribe, () => alertsUi.getState()[key], () => alertsUi.getState()[key]);

/**
 * The alerts slide-over from the bell (`#alerts-panel` + `#alerts-scrim`): only what is assigned to the
 * signed-in person. An overlay (component state), not a route. Mounted once in the (app) layout.
 *  - Esc closes it (the old shell keydown).
 *  - An item marks itself read, closes the panel and opens the task, or the Escalations page.
 */
export default function AlertsPanel() {
  const router = useRouter();
  const open = useUi('open');
  const filter = useUi('filter');
  const me = useStore((s) => myCode(s));
  const { alerts, read, unread } = useAlertState(me);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeAlertsPanel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const shown = filter === 'unread' ? alerts.filter((a) => !read.has(a.key)) : alerts;

  const openAlert = (key) => {
    const a = markAlertRead(key);
    if (!a) return;
    closeAlertsPanel();
    if (a.go.type === 'esc') router.push('/escalations');
    else router.push(`/work/tasks/${encodeURIComponent(String(a.go.id))}`);
  };

  let body;
  if (!me) {
    body = (
      <div className="empty-state sm"><div className="empty-ic">i</div>
        <h2>Your sign-in is not linked to a person</h2>
        <p>Alerts follow the work assigned to you. Ask an admin to link your sign-in to your name in Manage access.</p></div>
    );
  } else if (!shown.length) {
    body = (
      <div className="empty-state sm"><div className="empty-ic">✓</div>
        <h2>{filter === 'unread' ? 'You are all caught up' : 'Nothing needs you right now'}</h2>
        <p>Alerts appear when something is assigned to you, becomes overdue, or is escalated to you.</p></div>
    );
  } else {
    body = GROUPS.map(([kind, label]) => {
      const items = shown.filter((a) => a.kind === kind);
      if (!items.length) return null;
      return (
        <section className="al-group" key={kind}>
          <h3>{label}<b>{items.length}</b></h3>
          {items.map((a) => (
            <button
              type="button"
              key={a.key}
              className={`al-item${read.has(a.key) ? ' read' : ''}${a.urgent ? ' urgent' : ''} k-${a.kind}`}
              onClick={() => openAlert(a.key)}
            >
              <i className="al-dot"></i>
              <span className="al-main"><span className="al-title">{a.title}</span><span className="al-sub">{a.sub}</span></span>
            </button>
          ))}
        </section>
      );
    });
  }

  return (
    <>
      <div className={'al-scrim' + (open ? ' open' : '')} id="alerts-scrim" onClick={closeAlertsPanel}></div>
      <aside className={'al-panel' + (open ? ' open' : '')} id="alerts-panel" role="dialog" aria-label="Your alerts" aria-modal="false">
        <div className="al-head">
          <div>
            <h2>Alerts</h2>
            <p>Only what is assigned to you</p>
          </div>
          <button type="button" className="icon-round" onClick={closeAlertsPanel} aria-label="Close alerts">✕</button>
        </div>
        <div className="al-tools">
          <div className="seg sm" id="alerts-seg">
            {me ? (
              <>
                <button type="button" className={filter === 'all' ? 'on' : ''} onClick={() => setAlertFilter('all')}>All<b>{alerts.length}</b></button>
                <button type="button" className={filter === 'unread' ? 'on' : ''} onClick={() => setAlertFilter('unread')}>Unread<b>{unread}</b></button>
              </>
            ) : null}
          </div>
          <button type="button" className="btn b-gh b-sm" id="alerts-readall" onClick={() => markAllNotificationsRead()} hidden={!me || unread === 0}>Mark all read</button>
        </div>
        <div className="al-body" id="alerts-body">{body}</div>
        <div className="al-foot">
          <button type="button" className="btn b-gh b-sm" onClick={() => { closeAlertsPanel(); router.push('/profile/notifications'); }}>E-mail &amp; alert settings</button>
        </div>
      </aside>
    </>
  );
}
