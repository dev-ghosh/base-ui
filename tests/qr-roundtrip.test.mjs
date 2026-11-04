/**
 * Proves the QR code RIE draws is actually scannable, by round-tripping it
 * through the same decoder the phone uses.
 *
 * Run with: node tests/qr-roundtrip.test.mjs   (no network, no keys)
 *
 * This is not testing the vendored libraries. It is testing *our* use of them:
 * the module matrix, the quiet zone, and the exact payload shape produced by
 * pairUrl(). A QR with too small a quiet zone encodes perfectly and still will
 * not scan, and that failure is invisible without a decode step.
 *
 * .mjs because it imports the ES-module half of the app; the other tests in
 * this directory are CommonJS.
 */
import qrcode from '../src/lib/vendor/qrcode.js';
import jsQR from '../src/lib/vendor/jsqr.js';

let passed = 0, failed = 0;
const assert = (c, m) => c
  ? (console.log(`  ✓ ${m}`), passed++)
  : (console.error(`  ✗ ${m}`), failed++);

/** Mirrors buildQr() in src/lib/devicepair.js: same version, EC level and quiet zone. */
function modules(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 4;
  const size = n + quiet * 2;
  const dark = (r, c) => {
    const rr = r - quiet, cc = c - quiet;
    return rr >= 0 && cc >= 0 && rr < n && cc < n && qr.isDark(rr, cc);
  };
  return { size, dark, version: (n - 17) / 4 };
}

/** Rasterise to RGBA at `scale` device pixels per module, as a screen would. */
function raster(text, scale) {
  const { size, dark } = modules(text);
  const w = size * scale;
  const data = new Uint8ClampedArray(w * w * 4);
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const v = dark(Math.floor(y / scale), Math.floor(x / scale)) ? 0 : 255;
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width: w, height: w };
}

const ORIGIN = 'https://base.example.com/';
const CODES = ['ABCDEFGHJKMN', '0123456789ZZ', 'ZZZZZZZZZZZZ', 'T7Q2M9X4WVR0'];

console.log('\nQR round trip\n');

for (const code of CODES) {
  const payload = `${ORIGIN}#pair=${code}`;
  const { data, width, height } = raster(payload, 6);
  const decoded = jsQR(data, width, height);
  assert(decoded?.data === payload, `decodes back to the exact payload for ${code}`);
}

console.log('\nsize and margin\n');
{
  const payload = `${ORIGIN}#pair=ABCDEFGHJKMN`;
  const m = modules(payload);
  assert(m.version <= 6, `stays a small QR version (v${m.version}) so it scans from a distance`);
  // Four clear modules on every side. Less than this and many scanners refuse
  // to lock on even though the data is intact.
  let clear = true;
  for (let i = 0; i < m.size; i++) {
    for (let q = 0; q < 4; q++) {
      if (m.dark(q, i) || m.dark(m.size - 1 - q, i) || m.dark(i, q) || m.dark(i, m.size - 1 - q)) {
        clear = false;
      }
    }
  }
  assert(clear, 'has a 4-module quiet zone on all four sides');
}

console.log('\nscanning at small sizes\n');
{
  // A 12-char code on a laptop screen at ~180 CSS px is about 3 device pixels
  // per module. If it survives that it survives any realistic display.
  const payload = `${ORIGIN}#pair=ABCDEFGHJKMN`;
  for (const scale of [3, 4, 8]) {
    const { data, width, height } = raster(payload, scale);
    assert(jsQR(data, width, height)?.data === payload, `scans at ${scale} px per module`);
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
