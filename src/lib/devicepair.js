/* devicepair.js — sign in a second device from one that is already signed in.
 * Port of rie-dashboard2/js/devicepair.js.
 *
 * The laptop shows a QR code. The phone scans it in the app and is signed in.
 * No email, no browser, no clipboard, and nothing a link prefetcher can touch.
 *
 * Why this is the primary route on iOS, not a nicety:
 *
 *   1. Magic links are single-use GETs. On 2026-09-05 macOS QuickLook (Mail's
 *      link-preview prefetcher) redeemed one 14 seconds after it was sent, and
 *      the iPhone's own attempt came back 403. Any prefetcher can do that:
 *      mail previews, link scanners, corporate URL rewriting, chat unfurls.
 *   2. Since iOS 16.4 a Home Screen web app has a storage partition separate
 *      from the browser. A link opens in the *default* browser, so even a link
 *      that survives signs in somewhere the installed app cannot see.
 *
 * A QR code on a screen you are looking at has neither problem.
 *
 * The server half is the `device-pair` edge function (frozen backend). This
 * module never sees a service key: `start` is authorised by the laptop's own
 * JWT, and `claim` is deliberately unauthenticated because the claiming device
 * has no session yet.
 *
 * Differences from the old file (each is forced by the move to React/Next):
 *  - the function URL and keys are resolved per call (config.js never throws at
 *    import), so this module imports cleanly in plain Node;
 *  - pairUrl() always targets the site root, because src/app/page.jsx is the
 *    only place that reads `#pair=` (spec C13); the old code used the pathname;
 *  - renderQr() injected an SVG string into the DOM. buildQr() returns the SVG
 *    geometry instead and PairShow.jsx draws it as JSX;
 *  - jsQR used to be injected as a classic <script>. It is now an ES module in
 *    src/lib/vendor/ and, like the encoder, only ever loaded by dynamic import().
 */
import { sbUrl, sbKey } from './config.js';
import { decodeSession, getSession, scheduleAutoRefresh } from './auth.js';

/* ── pairing code shape ───────────────────────────────────────────────────── */

/** Group for reading aloud and typing: ABCDE-FGHJKLM. */
export function formatPairCode(code) {
  const c = (code || '').toUpperCase();
  return c.length === 12 ? `${c.slice(0, 5)}-${c.slice(5)}` : c;
}

/** Strip whatever a human or a scanner added back off. */
export function cleanPairCode(raw) {
  return (raw || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/**
 * The QR payload is the app's own URL with the code in the **fragment**:
 *
 *     https://…/#pair=ABCDEFGHJKLM
 *
 * The fragment matters. It is never sent to the server, so the code stays out
 * of server logs and out of any Referer header. Encoding a URL rather than a
 * bare code also means the phone's built-in Camera app can act on it: that
 * signs in whichever browser opens it, which is the right outcome everywhere
 * except an installed iOS app, where the in-app scanner is the route that works.
 */
export function pairUrl(code, location = globalThis.location) {
  return `${location.origin}/#pair=${cleanPairCode(code)}`;
}

/**
 * Pull a pairing code out of anything plausible: a scanned URL, a pasted URL,
 * a bare code, a code with dashes. Returns null if it is not 12 characters.
 */
export function parsePairPayload(raw) {
  const s = (raw || '').trim();
  if (!s) return null;
  const m = s.match(/[#?&]pair=([0-9A-Za-z-]+)/);
  const code = cleanPairCode(m ? m[1] : s);
  return code.length === 12 ? code : null;
}

/** Read and clear `#pair=…` from the current URL, if present. */
export function takePairFromUrl(location = globalThis.location, history = globalThis.history) {
  const code = parsePairPayload(location.hash);
  if (code) {
    history.replaceState(null, '', location.pathname + location.search);
  }
  return code;
}

/* ── edge function client ─────────────────────────────────────────────────── */

async function callPair(body, { withAuth } = { withAuth: false }) {
  const headers = { 'Content-Type': 'application/json', apikey: sbKey() };
  if (withAuth) {
    const s = getSession();
    if (!s?.accessToken) throw new Error('Sign in on this device first.');
    headers.Authorization = `Bearer ${s.accessToken}`;
  }
  let res;
  try {
    res = await fetch(`${sbUrl()}/functions/v1/device-pair`, {
      method: 'POST', headers, body: JSON.stringify(body),
    });
  } catch {
    throw new Error('No connection. Check the network and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Pairing failed (${res.status})`);
  return data;
}

/** Mint a pairing on the signed-in device. Returns {pairingId, code, expiresAt}. */
export function startPairing() {
  return callPair({ action: 'start' }, { withAuth: true });
}

/** Has the phone taken it yet? Drives the live tick on the laptop. */
export function pairingStatus(pairingId) {
  return callPair({ action: 'status', pairingId }, { withAuth: true });
}

/** Burn a pairing early, e.g. when the QR modal is closed. */
export function cancelPairing(pairingId) {
  return callPair({ action: 'cancel', pairingId }, { withAuth: true }).catch(() => {});
}

/**
 * Exchange a pairing code for this device's own session, and store it.
 * Called from the signed-OUT device, so it sends no Authorization header.
 */
export async function claimPairing(code) {
  const clean = cleanPairCode(code);
  if (clean.length !== 12) throw new Error('A pairing code is 12 characters.');
  const data = await callPair({ action: 'claim', code: clean });
  const session = decodeSession(data.access_token, data.refresh_token);
  if (!session) throw new Error('Sign-in succeeded but the session could not be read.');
  scheduleAutoRefresh();
  return session;
}

/** Turn a User-Agent into something a human recognises. Best effort only. */
export function describeUa(ua) {
  if (!ua) return '';
  if (/iPhone/i.test(ua))  return 'on an iPhone';
  if (/iPad/i.test(ua))    return 'on an iPad';
  if (/Android/i.test(ua)) return 'on an Android device';
  if (/Macintosh/i.test(ua)) return 'on a Mac';
  if (/Windows/i.test(ua)) return 'on Windows';
  return '';
}

/* ── QR geometry ──────────────────────────────────────────────────────────── */

/**
 * Compute the QR for `text` as SVG geometry: `{ size, d }` for
 * `<svg viewBox="0 0 size size"><path d={d} fill="#000"/></svg>`.
 *
 * SVG rather than canvas so it stays sharp at any size and on any DPI.
 *
 * The quiet zone is not decoration: scanners need >= 4 modules of clear margin
 * or they will not lock on.
 */
export async function buildQr(text) {
  // Dynamic import: only the device *showing* a QR needs the encoder, which is
  // a minority of loads.
  const { default: qrcode } = await import('./vendor/qrcode.js');

  const qr = qrcode(0, 'M');          // 0 = pick the smallest version that fits
  qr.addData(text);
  qr.make();

  const n = qr.getModuleCount();
  const quiet = 4;
  const size = n + quiet * 2;

  // One <path> for every dark module beats 400 <rect>s: fewer nodes, and Safari
  // renders it without the hairline seams that adjacent rects show at some
  // zoom levels.
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }
  return { size, d };
}

/* ── camera scanning ──────────────────────────────────────────────────────── */

/** True where a camera could plausibly be opened. Secure context is required. */
export function canScan() {
  return Boolean(globalThis.isSecureContext && globalThis.navigator?.mediaDevices?.getUserMedia);
}

/**
 * Open the rear camera and watch for a QR code.
 *
 * @param {HTMLVideoElement} video  must be in the DOM and visible
 * @param {(code:string)=>void} onCode called once, with a 12-char pairing code
 * @returns {Promise<() => void>} stop function — ALWAYS call it, or iOS leaves
 *          the camera light on and holds the device awake.
 */
export async function startScanner(video, onCode) {
  if (!canScan()) throw new Error('This browser cannot open the camera.');

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
  } catch (e) {
    // Distinguish "said no" from "no camera", because the fix differs.
    if (e?.name === 'NotAllowedError') {
      throw new Error('Camera access was denied. Allow it in Settings, or type the code instead.');
    }
    throw new Error('No camera available. Type the pairing code instead.');
  }

  // iOS refuses to play an inline video without all three of these, and falls
  // back to full-screen playback, which hides the rest of the sign-in sheet.
  video.setAttribute('playsinline', '');
  video.setAttribute('muted', '');
  video.muted = true;
  video.srcObject = stream;
  await video.play().catch(() => {});

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // BarcodeDetector is hardware-accelerated where it exists (Chrome, Android).
  // Safari has no implementation as of iOS 18, which is exactly the platform
  // that needs this most, hence the jsQR fallback rather than a feature gate.
  let detector = null;
  if ('BarcodeDetector' in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (formats.includes('qr_code')) {
        detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      }
    } catch { /* fall through to jsQR */ }
  }
  // Loaded on demand: 130 KB that the majority of sign-ins never need.
  const jsQR = detector ? null : (await import('./vendor/jsqr.js')).default;

  let stopped = false;
  let timer = null;

  function stop() {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    stream.getTracks().forEach((t) => t.stop());
    // Each run owns its own stream. Only detach if it is still OURS: under React
    // StrictMode a second scanner may already have attached its stream to this
    // same <video>, and clearing it would leave that one with a black viewfinder.
    if (video.srcObject === stream) video.srcObject = null;
  }

  async function tick() {
    if (stopped) return;
    try {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        let raw = null;
        if (detector) {
          const found = await detector.detect(video);
          raw = found[0]?.rawValue || null;
        } else {
          // Downscale before decoding. Full-resolution getImageData on a 4K
          // rear camera costs more per frame than the decode itself.
          const w = Math.min(video.videoWidth, 640);
          const h = Math.round((video.videoHeight / video.videoWidth) * w) || 480;
          canvas.width = w; canvas.height = h;
          ctx.drawImage(video, 0, 0, w, h);
          const img = ctx.getImageData(0, 0, w, h);
          raw = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' })?.data || null;
        }
        const code = raw && parsePairPayload(raw);
        if (code && !stopped) { stop(); onCode(code); return; }
      }
    } catch { /* a bad frame is not worth stopping for */ }
    // ~8 fps. Faster does not find codes sooner and does drain the battery.
    if (!stopped) timer = setTimeout(tick, 120);
  }
  tick();

  return stop;
}
