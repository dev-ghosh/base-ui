'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '@/hooks/useSession.js';
import { resetAccess } from '@/lib/access.js';
import { sendMagicLink } from '@/lib/auth.js';
import { canScan } from '@/lib/devicepair.js';
import { isIOS, isNativeShell, isStandalone } from '@/lib/platform.js';
import EmailCodeForm from './EmailCodeForm.jsx';
import LoginCodePaste from './LoginCodePaste.jsx';
import { PairCodeEntry, PairScan } from './PairScan.jsx';

// The text for ?error=<key>, set by the root callback page (src/app/page.jsx).
// Unknown keys show nothing.
const URL_ERRORS = {
  link: 'That sign-in link could not be used. Send yourself a new sign-in code below.',
  pair: 'That pairing code is wrong, used, or expired. Show a new QR code.',
};

const ERR_STYLE = { fontSize: '.75rem', color: 'var(--hot)', minHeight: '1.1em', marginBottom: 12 };

/**
 * /login: the old #mo-user sign-in modal as a page. Same markup, copy and
 * classes; it is rendered open (`.mo.open`) so the same `.mb` box sits centred
 * over the page background exactly as the modal did. For signed-out users only:
 * with a stored session it sends you to /today.
 */
export default function LoginForm() {
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (status === 'signedIn') router.replace('/today');
  }, [status, router]);

  // 'loading' is the server render and the first client render. Showing nothing
  // for that one tick avoids flashing the form at someone about to be redirected.
  if (status !== 'signedOut') return null;
  // A fresh sign-in must ask rie_my_access again, never reuse a previous user's rights.
  return <SignInModal onSignedIn={() => { resetAccess(); router.replace('/today'); }} />;
}

function SignInModal({ onSignedIn }) {
  const params = useSearchParams();
  // 'form' | 'sent' | 'scan' | 'paircode' | 'paste'
  const [pane, setPane] = useState('form');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [pairError, setPairError] = useState('');

  // Mounted only after the session check, i.e. on the client, so reading
  // window-dependent platform state in the initialiser is safe.
  const [env] = useState(() => {
    const installed = isStandalone() || isNativeShell();
    return { scan: canScan(), installed, pairFirst: installed || isIOS() };
  });

  const urlError = URL_ERRORS[params.get('error')] || '';
  const formMessage = message || urlError;

  async function send() {
    if (busy) return;
    const value = email.trim();
    if (!value) { setMessage('Enter your email address'); return; }
    setBusy(true);
    setMessage('');
    try {
      await sendMagicLink(value);
      setEmail(value);
      setPane('sent');
    } catch (e) {
      setMessage('Could not send code: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  function backToForm() {
    setMessage('');
    setPane('form');
  }

  function openCodeEntry() {
    setPairError('');
    setPane('paircode');
  }

  return (
    <div className="mo open" id="mo-user">
      <div className="mb" style={{ maxWidth: 380 }}>
        <div className="mh">
          <div className="mti">Sign in to BASE</div>
        </div>

        {pane === 'form' && (
          <div id="auth-form">
            {formMessage && (
              <div role="alert" id="auth-form-err" style={ERR_STYLE}>{formMessage}</div>
            )}
            {/* Two independent routes in. Pairing is the one that cannot be broken by
                a mail prefetcher or by iOS's storage partitioning, so on the installed
                app and iOS it is promoted to the top with .pair-first. */}
            <div className={'auth-choices' + (env.pairFirst ? ' pair-first' : '')} id="auth-choices">

              <div className="ac-email">
                <div className="msl" style={{ marginBottom: 8 }}>Sign in by email</div>
                <p style={{ fontSize: '.8rem', color: 'var(--txm)', marginBottom: 12 }}>
                  We'll email you a numeric code. No password.
                </p>
                <input
                  className="fi" id="auth-email" type="email" placeholder="you@example.com"
                  autoComplete="email" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                  style={{ marginBottom: 10 }}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
                />
                <button
                  className="btn b-pr" id="auth-send-btn" onClick={send} disabled={busy}
                  style={{ width: '100%' }}
                >Email me a sign-in code</button>
              </div>

              <div className="ac-sep">or</div>

              <div className="ac-pair">
                <div className="msl" style={{ marginBottom: 8 }}>Use a device you're already on</div>
                <p style={{ fontSize: '.8rem', color: 'var(--txm)', marginBottom: 12 }}>
                  On your other device open <strong>Account → Sign in another device</strong>. Then scan the QR code it
                  shows.
                </p>
                {/* Absent where getUserMedia is unavailable (no camera, or an insecure
                    context), so the button never opens a dead end. */}
                {env.scan && (
                  <button
                    className="btn b-pr" id="auth-scan-btn"
                    style={{ width: '100%', marginBottom: 8 }}
                    onClick={() => setPane('scan')}
                  >📷 Scan the QR code</button>
                )}
                <button
                  className="btn b-gh" style={{ width: '100%', fontSize: '.78rem' }}
                  onClick={openCodeEntry}
                >Type the pairing code instead</button>
              </div>

            </div>

            {/* Only in the installed app, where a magic link cannot reach us directly.
                Superseded by pairing; kept because a browser session that predates it
                can still be carried over. */}
            {env.installed && (
              <div id="auth-alt" style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--bd)' }}>
                <button
                  className="btn b-gh" style={{ width: '100%', fontSize: '.75rem' }}
                  onClick={() => setPane('paste')}
                >Paste a login code from my browser</button>
              </div>
            )}
          </div>
        )}

        {pane === 'sent' && (
          <EmailCodeForm email={email} onBack={backToForm} onSignedIn={onSignedIn} />
        )}

        {pane === 'scan' && (
          <PairScan
            onCodeEntry={openCodeEntry}
            onRefused={(msg) => { setPairError(msg); setPane('paircode'); }}
            onBack={backToForm}
            onSignedIn={onSignedIn}
          />
        )}

        {pane === 'paircode' && (
          <PairCodeEntry initialError={pairError} onBack={backToForm} onSignedIn={onSignedIn} />
        )}

        {pane === 'paste' && (
          <LoginCodePaste onBack={backToForm} onSignedIn={onSignedIn} />
        )}
      </div>
    </div>
  );
}
