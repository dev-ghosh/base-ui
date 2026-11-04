'use client';

import { useEffect, useRef, useState } from 'react';
import { importLoginCode } from '@/lib/platform.js';

/**
 * Receiving end of the installed-app handoff (#auth-paste): paste the login
 * code copied from a browser that is already signed in.
 */
export default function LoginCodePaste({ onBack, onSignedIn }) {
  const [value, setValue] = useState('');
  const [err, setErr] = useState('');
  const boxRef = useRef(null);

  useEffect(() => { boxRef.current?.focus(); }, []);

  function submit() {
    setErr('');
    try {
      const session = importLoginCode(value);
      setValue('');          // don't leave a bearer token in the DOM
      onSignedIn(session);
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div id="auth-paste">
      <p style={{ fontSize: '.82rem', color: 'var(--txm)', marginBottom: 12 }}>
        Sign in on Safari first, then tap <strong>Copy login code</strong> there and paste it here.
      </p>
      <textarea
        className="fta" id="paste-code" placeholder="Paste the login code…" autoComplete="off"
        autoCapitalize="off" autoCorrect="off" spellCheck={false}
        ref={boxRef}
        style={{ fontFamily: 'var(--font-mono)', fontSize: '.72rem', minHeight: 90, marginBottom: 8 }}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <div id="paste-err" style={{ fontSize: '.75rem', color: 'var(--hot)', minHeight: '1.1em', marginBottom: 10 }}>{err}</div>
      <button className="btn b-pr" style={{ width: '100%' }} onClick={submit}>Sign in</button>
      <button
        className="btn b-gh" style={{ width: '100%', marginTop: 8, fontSize: '.78rem' }}
        onClick={onBack}
      >Back</button>
    </div>
  );
}
