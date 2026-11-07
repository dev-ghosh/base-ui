// Behaviour of the inline <head> script (src/lib/early-script.js), run for real in a
// node:vm context with just enough of a browser around it.
import vm from 'node:vm';
import { EARLY_SCRIPT } from '../src/lib/early-script.js';

let bad = 0;
const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL') + '  ' + m); if (!c) bad++; };

/** Runs EARLY_SCRIPT against a fake page and returns what it did to <html>. */
function run({ store = {}, throwing = false, prefersLight = false, standalone = false, width = 1280 } = {}) {
  const attrs = {};
  const classes = new Set();
  const root = {
    setAttribute: (k, v) => { attrs[k] = v; },
    getAttribute: (k) => (k in attrs ? attrs[k] : null),
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
  };
  const ctx = {
    document: { documentElement: root },
    localStorage: {
      getItem: (k) => { if (throwing) throw new Error('storage blocked'); return k in store ? store[k] : null; },
    },
    innerWidth: width,
    navigator: {},
    matchMedia: (q) => ({
      matches: q.includes('display-mode: standalone') ? standalone
        : q.includes('prefers-color-scheme: light') ? prefersLight : false,
    }),
  };
  ctx.window = ctx;                       // `window.matchMedia` / `window.navigator` resolve to the same object
  let threw = null;
  try { vm.runInNewContext(EARLY_SCRIPT, ctx); } catch (e) { threw = e; }
  return { attrs, classes, threw };
}

// themes
for (const t of ['dark', 'light', 'spc', 'spc-modern']) {
  const r = run({ store: { 'rie-theme': t }, prefersLight: t === 'dark' });
  check(r.attrs['data-theme'] === t, `a saved "${t}" stays "${t}" (even when the OS prefers the other scheme)`);
}
{
  const r = run({ store: { 'rie-theme': 'junk' }, prefersLight: true });
  check(r.attrs['data-theme'] === 'light', 'a saved "junk" falls back to the OS preference (light)');
}
{
  const r = run({ store: { 'rie-theme': 'junk' }, prefersLight: false });
  check(r.attrs['data-theme'] === 'dark', 'a saved "junk" falls back to dark when the OS does not prefer light');
}
{
  const r = run({ store: {}, prefersLight: true });
  check(r.attrs['data-theme'] === 'light', 'nothing saved follows the OS (light)');
}

// storage that throws
{
  const r = run({ throwing: true, standalone: false, width: 1280 });
  check(r.threw === null, 'localStorage throwing does not throw out of the script');
  check(!('data-theme' in r.attrs), 'localStorage throwing leaves data-theme untouched (the server-rendered value stays)');
  check(!r.classes.has('side-collapsed'), 'localStorage throwing leaves side-collapsed off');
}

// installed
check(run({ standalone: true }).classes.has('installed'), 'standalone display mode adds "installed"');
check(!run({ standalone: false }).classes.has('installed'), 'a normal tab does not add "installed"');
{
  const r = run({});
  check(r.threw === null, 'a page with no webkit bridge does not throw');
}

// collapsed side menu
check(run({ store: { rie_side_collapsed: '1' }, width: 1280 }).classes.has('side-collapsed'),
  'rie_side_collapsed=1 at innerWidth 1280 adds "side-collapsed"');
check(run({ store: { rie_side_collapsed: '1' }, width: 1024 }).classes.has('side-collapsed'),
  'rie_side_collapsed=1 at exactly 1024 adds "side-collapsed"');
check(!run({ store: { rie_side_collapsed: '1' }, width: 1023 }).classes.has('side-collapsed'),
  'rie_side_collapsed=1 below 1024 does not (the drawer is not a rail)');
check(!run({ store: { rie_side_collapsed: '0' }, width: 1280 }).classes.has('side-collapsed'),
  'rie_side_collapsed=0 does not');

process.exit(bad ? 1 : 0);
