'use client';

import { useEffect, useRef, useState } from 'react';
import { OTP_LENGTH, verifyEmailCode, verifySignInLink } from '@/lib/auth.js';

const ERR_STYLE = { fontSize: '.75rem', color: 'var(--hot)', minHeight: '1.1em', marginBottom: 10 };

/**
 * The "Check your inbox" pane (#auth-sent): type the emailed code, or paste the
 * sign-in link when the email only carries a link.
 *
 * One email, two ways in. The code is the good one: it is inert text, so no
 * prefetcher can consume it and it is redeemed in whichever app you typed it
 * into. The link route stays available, collapsed, with the warning that
 * tapping it burns it.
 */
export default function EmailCodeForm({ email, onBack, onSignedIn }) {
  const [code, setCode] = useState('');
  const [link, setLink] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const codeRef = useRef(null);

  useEffect(() => { codeRef.current?.focus(); }, []);

  /**
   * Sign in with whichever the email supplied: a code, or the sign-in link
   * pasted verbatim. The link path is what works against Supabase's stock email
   * template, which prints no code at all.
   */
  async function submit(codeValue, linkValue) {
    const digits = codeValue.replace(/\D/g, '');
    const pasted = linkValue.trim();
    setErr('');
    if (!digits && !pasted) {
      setErr('Enter the 6-digit code, or paste the sign-in link.');
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      // A pasted link is unambiguous, so it wins over a half-typed code.
      const session = pasted ? await verifySignInLink(pasted)
                             : await verifyEmailCode(email, digits);
      // Never leave a live credential sitting in the DOM.
      setCode('');
      setLink('');
      onSignedIn(session);
    } catch (e) {
      setErr(e.message);
      // Clear only the field that was actually used. Wiping a pasted link would
      // force the user back to Mail to copy it again.
      if (!pasted) {
        setCode('');
        codeRef.current?.focus();
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  // Strip non-digits as the user types, and submit once a full code has arrived.
  // OTP_LENGTH is measured from this project's GoTrue, not assumed. Auto-submit
  // is the only thing keyed to the exact value: verifyEmailCode() accepts a
  // range, so a server-side change costs one extra tap, not a dead login screen.
  function onCodeChange(e) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
    setCode(digits);
    setErr('');
    // Not while a link is also pasted: submit() prefers the link and would
    // ignore the code just typed.
    if (digits.length === OTP_LENGTH && !link.trim()) submit(digits, link);
  }

  return (
    <div id="auth-sent" style={{ padding: '4px 0' }}>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: '2rem', marginBottom: 8 }}>📬</div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Check your inbox</div>
        <p style={{ fontSize: '.78rem', color: 'var(--txm)' }}>Enter the code from the email.</p>
      </div>

      {/* maxlength is deliberately looser than the code this project issues
          (8 digits, measured; see OTP_LENGTH in lib/auth.js). A hard 6 used to
          silently truncate every real code. */}
      <input
        className="fi" id="auth-code" type="text" inputMode="numeric" maxLength={10}
        autoComplete="one-time-code" autoCorrect="off" spellCheck={false} placeholder="00000000"
        ref={codeRef}
        style={{
          textAlign: 'center', letterSpacing: '.4em', fontFamily: 'var(--font-mono)',
          fontSize: '1.3rem', padding: 12, marginBottom: 14,
        }}
        value={code}
        onChange={onCodeChange}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(code, link); }}
      />

      <details style={{ marginBottom: 14 }}>
        <summary style={{ fontSize: '.75rem', color: 'var(--txm)', cursor: 'pointer' }}>
          The email only shows a “Log In” link
        </summary>
        <p style={{ fontSize: '.75rem', color: 'var(--txd)', margin: '10px 0 8px' }}>
          <strong>Press and hold</strong> the link → <strong>Copy Link</strong> → paste below.
          Don't tap it: tapping uses the link up, and so does any mail app that
          previews links before you do.
        </p>
        <textarea
          className="fta" id="auth-link" placeholder="https://…supabase.co/auth/v1/verify?token=…"
          autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
          style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', minHeight: 70 }}
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
      </details>

      <div id="auth-code-err" style={ERR_STYLE}>{err}</div>
      <button
        className="btn b-pr" id="auth-code-btn" style={{ width: '100%' }}
        disabled={busy} onClick={() => submit(code, link)}
      >Sign in</button>
      <button
        className="btn b-gh" style={{ width: '100%', marginTop: 8, fontSize: '.78rem' }}
        onClick={onBack}
      >Use a different email</button>
    </div>
  );
}
