'use client';

import { useEffect, useRef, useState } from 'react';
import { claimPairing, cleanPairCode, formatPairCode, startScanner } from '@/lib/devicepair.js';

const ERR_STYLE = { fontSize: '.75rem', color: 'var(--hot)', minHeight: '1.1em' };

/**
 * Receiving end of device pairing, part 1 (#auth-scan): the camera viewfinder
 * on the device being signed in.
 *
 *  onSignedIn(session)  a scanned code was claimed
 *  onRefused(message)   a scanned code was refused; the parent drops to typed entry
 *  onCodeEntry()        "Type the code instead"
 *  onBack()
 *
 * The camera is released on every way out of this pane (iOS keeps the camera
 * light on and the device awake if the tracks are left open).
 */
export function PairScan({ onSignedIn, onRefused, onCodeEntry, onBack }) {
  const videoRef = useRef(null);
  const [hint, setHint] = useState(true);
  const [err, setErr] = useState('');
  const latest = useRef({ onSignedIn, onRefused });
  latest.current = { onSignedIn, onRefused };

  useEffect(() => {
    let cancelled = false;
    let stop = null;

    async function redeem(code) {
      try {
        const session = await claimPairing(code);
        if (!cancelled) latest.current.onSignedIn(session);
      } catch (e) {
        // A failed scan should not strand the user staring at a dead viewfinder.
        if (!cancelled) latest.current.onRefused(e.message);
      }
    }

    (async () => {
      try {
        const s = await startScanner(videoRef.current, (code) => {
          stop = null;                    // the scanner stops itself on a hit
          redeem(code);
        });
        if (cancelled) { s(); return; }   // left the pane while the camera was opening
        stop = s;
        // Permission granted and frames are flowing; the prompt hint is now noise.
        setHint(false);
      } catch (e) {
        if (cancelled) return;
        setHint(false);
        setErr(e.message);
      }
    })();

    return () => {
      cancelled = true;
      if (stop) { try { stop(); } catch { /* already gone */ } stop = null; }
    };
  }, []);

  return (
    <div id="auth-scan">
      <p style={{ fontSize: '.82rem', color: 'var(--txm)', marginBottom: 12 }}>
        Point the camera at the QR code on your other device.
      </p>
      {/* The first time through, the browser's own permission prompt sits on top
          of this and the preview stays black until it is answered. Say so, or a
          black rectangle reads as a broken feature. */}
      {hint && (
        <p id="scan-hint" style={{ fontSize: '.75rem', color: 'var(--txd)', marginBottom: 10 }}>
          Allow camera access when your browser asks.
        </p>
      )}
      <div className="scan-box">
        <video id="scan-video" ref={videoRef} playsInline muted></video>
        <div className="scan-reticle"></div>
      </div>
      <div id="scan-err" style={{ ...ERR_STYLE, margin: '10px 0' }}>{err}</div>
      <button
        className="btn b-gh" style={{ width: '100%', fontSize: '.78rem' }}
        onClick={onCodeEntry}
      >Type the code instead</button>
      <button
        className="btn b-gh" style={{ width: '100%', marginTop: 8, fontSize: '.78rem' }}
        onClick={onBack}
      >Back</button>
    </div>
  );
}

/**
 * Receiving end of device pairing, part 2 (#auth-paircode): the same pairing
 * code, typed. Upper-cases, re-groups as ABCDE-FGHJKLM, and submits once 12
 * characters land. `initialError` carries a refused scan across from PairScan.
 */
export function PairCodeEntry({ initialError = '', onSignedIn, onBack }) {
  const [value, setValue] = useState('');
  const [err, setErr] = useState(initialError);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function redeem(code) {
    if (inFlight.current) return;
    inFlight.current = true;
    setErr('');
    setBusy(true);
    try {
      const session = await claimPairing(code);
      onSignedIn(session);
    } catch (e) {
      setErr(e.message);
      setValue('');
      inputRef.current?.focus();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function onChange(e) {
    const clean = cleanPairCode(e.target.value).slice(0, 12);
    setValue(formatPairCode(clean));
    setErr('');
    if (clean.length === 12) redeem(clean);
  }

  return (
    <div id="auth-paircode">
      <p style={{ fontSize: '.82rem', color: 'var(--txm)', marginBottom: 12 }}>
        Enter the 12-character code shown under the QR on your other device.
      </p>
      <input
        className="fi pair-in" id="pair-input" type="text" maxLength={14} autoComplete="off"
        autoCapitalize="characters" autoCorrect="off" spellCheck={false} placeholder="ABCDE-FGHJKLM"
        ref={inputRef}
        style={{ marginBottom: 10 }}
        value={value}
        onChange={onChange}
        onKeyDown={(e) => { if (e.key === 'Enter') redeem(value); }}
      />
      <div id="pair-err" style={{ ...ERR_STYLE, marginBottom: 10 }}>{err}</div>
      <button
        className="btn b-pr" id="pair-submit-btn" style={{ width: '100%' }}
        disabled={busy} onClick={() => redeem(value)}
      >Sign in</button>
      <button
        className="btn b-gh" style={{ width: '100%', marginTop: 8, fontSize: '.78rem' }}
        onClick={onBack}
      >Back</button>
    </div>
  );
}
