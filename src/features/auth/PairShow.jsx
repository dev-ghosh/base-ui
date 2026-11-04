'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildQr, cancelPairing, describeUa, formatPairCode, pairUrl, pairingStatus, startPairing,
} from '@/lib/devicepair.js';

const secondsLeft = (expiresAt) => Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000));

/**
 * "Sign in another device" (#mo-pair), shown on the device that is ALREADY
 * signed in. It vouches for the new device over a channel nothing can prefetch:
 * a QR code on a screen the user is looking at.
 *
 * Rendered by whichever screen offers it (Profile, a later task); `onClose` is
 * called after the code has been burned.
 */
export default function PairShow({ onClose }) {
  const [nonce, setNonce] = useState(0);       // bumped by "New code"
  const [phase, setPhase] = useState('loading'); // 'loading' | 'body' | 'done'
  const [pairing, setPairing] = useState(null);
  const [qr, setQr] = useState(null);
  const [left, setLeft] = useState(null);
  const [err, setErr] = useState('');
  const [doneUa, setDoneUa] = useState('');
  const idRef = useRef(null);

  // Burn the code. Leaving a live pairing behind after the QR is off screen is
  // exactly the window an over-the-shoulder photo would use.
  const release = useCallback(() => {
    if (idRef.current) {
      cancelPairing(idRef.current);
      idRef.current = null;
    }
  }, []);

  // Mint a pairing (on mount, and again for "New code").
  useEffect(() => {
    let cancelled = false;
    setPhase('loading');
    setErr('');
    setPairing(null);
    setQr(null);

    (async () => {
      let p;
      try {
        p = await startPairing();
      } catch (e) {
        if (cancelled) return;
        setErr(e.message);
        setPhase('body');
        return;
      }
      if (cancelled) { cancelPairing(p.pairingId); return; }
      idRef.current = p.pairingId;
      let model;
      try {
        model = await buildQr(pairUrl(p.code));
      } catch (e) {
        if (!cancelled) { setErr(e.message); setPhase('body'); }
        return;
      }
      if (cancelled) return;
      setPairing(p);
      setQr(model);
      setLeft(secondsLeft(p.expiresAt));
      setPhase('body');
    })();

    return () => { cancelled = true; release(); };
  }, [nonce, release]);

  // Countdown and claim polling while a code is on screen.
  // Poll rather than subscribe: the pairing lives for three minutes, so a
  // handful of 2 s requests is cheaper than opening a realtime channel, and it
  // works on the signed-in device even if the websocket is down.
  useEffect(() => {
    if (phase !== 'body' || !pairing) return undefined;
    let countdown = null;
    let poll = null;
    const stopTimers = () => { clearInterval(countdown); clearInterval(poll); };

    countdown = setInterval(() => {
      const n = secondsLeft(pairing.expiresAt);
      setLeft(n);
      if (!n) stopTimers();
    }, 1000);
    poll = setInterval(async () => {
      try {
        const st = await pairingStatus(pairing.pairingId);
        if (st.claimed) {
          stopTimers();
          setDoneUa(describeUa(st.claimedUa));
          setPhase('done');
        } else if (st.expired) {
          stopTimers();
        }
      } catch { /* a dropped poll is not worth surfacing */ }
    }, 2000);

    return stopTimers;
  }, [phase, pairing]);

  function close() {
    release();
    onClose();
  }

  const expiry = left === null ? ' '
    : left ? `Expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
    : 'Expired — tap New code';

  return (
    <div
      className="mo open" id="mo-pair"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div className="mb" style={{ maxWidth: 340 }}>
        <div className="mh">
          <div className="mti">Sign in another device</div>
          <button className="mx" onClick={close}>✕</button>
        </div>

        {phase === 'body' && (
          <div id="pair-share-body">
            <p style={{ fontSize: '.8rem', color: 'var(--txm)', marginBottom: 14 }}>
              On the other device, open BASE and choose <strong>Scan the QR code</strong>.
            </p>
            <div className="qr-box" id="pair-qr">
              {qr && (
                <svg
                  viewBox={`0 0 ${qr.size} ${qr.size}`} width="100%" height="100%"
                  shapeRendering="crispEdges" role="img" aria-label="Sign-in QR code"
                  style={{ display: 'block', background: '#fff', borderRadius: 8 }}
                >
                  <path d={qr.d} fill="#000" />
                </svg>
              )}
            </div>
            <div className="pair-code" id="pair-code-text" style={{ margin: '14px 0 6px' }}>
              {pairing ? formatPairCode(pairing.code) : '—'}
            </div>
            <div className="pair-meta" id="pair-expiry">{expiry}</div>
            <div
              id="pair-share-err"
              style={{ fontSize: '.75rem', color: 'var(--hot)', minHeight: '1.1em', marginTop: 10, textAlign: 'center' }}
            >{err}</div>
            <button
              className="btn b-gh" style={{ width: '100%', marginTop: 12, fontSize: '.78rem' }}
              onClick={() => setNonce((n) => n + 1)}
            >New code</button>
          </div>
        )}

        {phase === 'loading' && (
          <div
            id="pair-share-loading"
            style={{ textAlign: 'center', padding: '36px 0', color: 'var(--txm)', fontSize: '.82rem' }}
          >
            Creating a code…
          </div>
        )}

        {phase === 'done' && (
          <div id="pair-share-done" style={{ textAlign: 'center', padding: '26px 0' }}>
            <div style={{ fontSize: '2rem', marginBottom: 10 }}>✅</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Signed in on the other device</div>
            <p style={{ fontSize: '.78rem', color: 'var(--txm)' }} id="pair-done-ua">{doneUa || ' '}</p>
            <button className="btn b-pr" style={{ width: '100%', marginTop: 16 }} onClick={close}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
