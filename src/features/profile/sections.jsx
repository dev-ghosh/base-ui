'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccess } from '../../hooks/useAccess.js';
import { useSignOut } from '../../hooks/useSignOut.jsx';
import { useTheme } from '../../hooks/useTheme.js';
import { getSession } from '../../lib/auth.js';
import { openAccess } from '../../lib/access-admin.js';
import { exportToExcel } from '../../lib/export-excel.js';
import { identityOf } from '../../lib/identity.js';
import { syncData } from '../../lib/load-data.js';
import { personName } from '../../lib/mappers.js';
import { openMo } from '../../lib/modals.js';
import { KINDS, DIGEST_FREQUENCIES, TONES, hourLabel, prefsEmail, sendTestEmail, setPref, setPrefText } from '../../lib/prefs.js';
import { THEMES } from '../../lib/theme.js';
import { startTour } from '../help/tour.js';
import { accessSummary, formatExpiry } from './model.js';
import { usePrefs, useAvatarColour } from './hooks/usePrefs.js';

/** One settings row: label (with an optional hint) on the left, the control on the right. */
function Row({ label, hint, children }) {
  return (
    <div className="pf-row">
      <div className="pf-l"><span>{label}</span>{hint ? <small>{hint}</small> : null}</div>
      <div className="pf-v">{children}</div>
    </div>
  );
}

/** The `.sw` switch. */
function Toggle({ on, disabled = false, onChange, label }) {
  return (
    <label className={'sw' + (disabled ? ' off' : '')}>
      <input type="checkbox" checked={!!on} disabled={disabled} aria-label={label} onChange={(e) => onChange(e.target.checked)} /><i></i>
    </label>
  );
}

/** Profile: who they are in BASE, and what an admin (not they) controls. */
export function GeneralSection({ session }) {
  const { access } = useAccess();
  const { prefs: p, loaded } = usePrefs();
  const colour = useAvatarColour();
  const me = identityOf(session, access);
  const { role, scope, extras, companies } = accessSummary(access);
  // The text fields keep what is typed (the old inputs were not re-rendered while typing); they are
  // remounted once the saved values have arrived.
  const k = loaded ? 'loaded' : 'wait';
  return (
    <>
      <section className="pf-card">
        <h2>Your details</h2>
        <div className="pf-hero">
          <div className="user-av xl" aria-hidden="true" style={{ background: colour }}>{me.initials}</div>
          <div>
            <div className="pf-name">{access?.display_name || session?.displayName || ''}</div>
            <div className="pf-sub">{prefsEmail()}</div>
            {role ? <span className={`chip role r-${role.value}`}>{role.label}</span> : null}
          </div>
        </div>
        <Row label="Avatar colour">
          <div className="tones">
            {Object.entries(TONES).map(([key, c]) => (
              <button
                key={key} type="button" className={'tone' + (p.avatar_tone === key ? ' on' : '')} style={{ background: c }}
                aria-label={key} aria-pressed={p.avatar_tone === key} onClick={() => setPref('avatar_tone', key)}
              />
            ))}
          </div>
        </Row>
        <Row label="Job title">
          <input key={'jt' + k} className="fi" defaultValue={p.job_title || ''} maxLength={80} placeholder="e.g. Head of Operations" onChange={(e) => setPrefText('job_title', e.target.value)} />
        </Row>
        <Row label="Phone">
          <input key={'ph' + k} className="fi" type="tel" defaultValue={p.phone || ''} maxLength={30} placeholder="+91…" onChange={(e) => setPrefText('phone', e.target.value)} />
        </Row>
      </section>
      <section className="pf-card">
        <h2>Your access</h2>
        <p className="pf-note">Set by an admin. If something here is wrong, ask them to change it in Manage access.</p>
        <Row label="Name">{access?.display_name || '—'}</Row>
        <Row label="Role">{role ? <>{role.label}<small className="blk">{role.blurb}</small></> : '—'}</Row>
        <Row label="Linked to" hint={access?.person_code ? '' : 'Until an admin links you, “Mine” and your alerts stay empty.'}>
          {access?.person_code ? personName(access.person_code) : <span className="warn-t">Not linked to a person yet</span>}
        </Row>
        <Row label="Companies">
          <div className="chips">
            {companies ? companies.map((c) => <span key={c} className="chip">{c}</span>) : <span className="chip">All companies</span>}
          </div>
        </Row>
        <Row label="Tasks you see">{scope ? <>{scope.label}<small className="blk">{scope.blurb}</small></> : '—'}</Row>
        {scope?.value === 'assigned' ? (
          <Row label="Also open to you">
            {extras.length ? <div className="chips">{extras.map((x) => <span key={x} className="chip">{x}</span>)}</div> : 'Nothing extra'}
          </Row>
        ) : null}
      </section>
    </>
  );
}

/** Notifications: what the bell shows, and the e-mail choices. */
export function NotificationsSection() {
  const { prefs: p, remote } = usePrefs();
  const on = p.email_enabled;
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');
  const testOnce = useRef(false);

  const sendTest = async () => {
    if (testOnce.current) return;
    testOnce.current = true;
    setSending(true);
    setMsg('Sending…');
    const r = await sendTestEmail();
    setMsg(r.message);
    setSending(false);
    testOnce.current = false;
  };

  return (
    <>
      <section className="pf-card">
        <h2>In BASE</h2>
        <p className="pf-note">The bell shows only what is assigned to you: your overdue and upcoming tasks, new tasks given to you, and escalations waiting on you. It never shows other people’s work.</p>
      </section>
      <section className="pf-card">
        <h2>By e-mail</h2>
        {remote === false ? <div className="pf-banner">E-mail alerts need the latest database update. Your choices are saved on this device until an admin applies it.</div> : null}
        <Row label="Send me e-mail alerts" hint={`To ${prefsEmail()}`}>
          <Toggle on={on} label="Send me e-mail alerts" onChange={(v) => setPref('email_enabled', v)} />
        </Row>
        <div className={on ? '' : 'dim'}>
          {KINDS.map(([key, label, hint]) => (
            <Row key={key} label={label} hint={hint}>
              <Toggle on={p[key]} disabled={!on} label={label} onChange={(v) => setPref(key, v)} />
            </Row>
          ))}
          <Row label="Daily summary" hint="One e-mail with everything that needs you. Nothing is sent if there is nothing to say.">
            <select className="fi sel" value={p.digest_frequency} disabled={!on} aria-label="Daily summary" onChange={(e) => setPref('digest_frequency', e.target.value)}>
              {DIGEST_FREQUENCIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Row>
          {p.digest_frequency !== 'off' ? (
            <Row label="Send it at" hint="India time.">
              <select className="fi sel" value={Number(p.digest_hour)} disabled={!on} aria-label="Send it at" onChange={(e) => setPref('digest_hour', e.target.value)}>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
              </select>
            </Row>
          ) : null}
        </div>
        <div className="pf-actions">
          <button type="button" className="btn b-ol" id="pf-test" disabled={!on || sending} onClick={sendTest}>Send me a test e-mail</button>
          <span className="pf-hint" id="pf-test-msg" role="status">{msg}</span>
        </div>
      </section>
    </>
  );
}

/** Appearance: the theme (remembered on this device). */
export function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  return (
    <section className="pf-card">
      <h2>Theme</h2>
      <p className="pf-note">Remembered on this device.</p>
      <div className="theme-grid">
        {THEMES.map((t) => (
          <button
            key={t.id} type="button" className={'theme-card' + (theme === t.id ? ' on' : '')}
            data-theme-preview={t.id} aria-pressed={theme === t.id} onClick={() => setTheme(t.id)}
          >
            <span className="swatch"><i></i><i></i><i></i></span>
            <span className="tn">{t.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Security: sign-in, another device, data, help, sign out. */
export function SecuritySection() {
  const router = useRouter();
  const signOut = useSignOut();
  const exp = getSession()?.expiresAt;
  const { isAdmin } = useAccess();
  return (
    <>
      <section className="pf-card">
        <h2>Sign-in</h2>
        <Row label="Signed in as">{prefsEmail()}</Row>
        <Row label="This session refreshes before" hint="You stay signed in while you use BASE.">{formatExpiry(exp)}</Row>
        <Row label="Another device" hint="Scan it from BASE on your phone. No e-mail needed, valid for three minutes.">
          <button type="button" className="btn b-ol" onClick={() => openMo('mo-pair')}>Show QR code</button>
        </Row>
        {isAdmin ? (
          <Row label="People & access" hint="Add people, set roles, companies and what each person sees.">
            <button type="button" className="btn b-ol" onClick={() => openAccess()}>Manage access</button>
          </Row>
        ) : null}
      </section>
      <section className="pf-card">
        <h2>Data</h2>
        <Row label="Export"><button type="button" className="btn b-ol" onClick={() => exportToExcel()}>Export to Excel</button></Row>
        <Row label="Refresh" hint="Re-reads everything from the database.">
          <button type="button" className="btn b-ol" onClick={() => syncData()}>Sync now</button>
        </Row>
      </section>
      <section className="pf-card">
        <h2>Help</h2>
        <Row label="Guided tour"><button type="button" className="btn b-ol" onClick={() => startTour(true)}>Replay the tour</button></Row>
        <Row label="Every tool explained"><button type="button" className="btn b-ol" onClick={() => router.push('/help')}>Open Help &amp; tools</button></Row>
      </section>
      <section className="pf-card danger">
        <button type="button" className="btn b-dn" onClick={() => signOut()}>Sign out</button>
      </section>
    </>
  );
}
