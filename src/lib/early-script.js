// Inline script rendered in <head>; runs before first paint. Ported from the old index.html:
//  1. flag "running as an installed app" (class `installed`), lines 28-40;
//  2. restore the saved theme from localStorage['rie-theme'] (four themes), falling back to
//     the OS colour scheme, lines ~6537-6548;
//  3. restore the collapsed side menu (`side-collapsed`), lines ~6552-6556.
export const EARLY_SCRIPT = `
try {
  if (window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true
    || (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.rie)) {
    document.documentElement.classList.add('installed');
  }
} catch (e) { /* non-fatal: the platform layer sets the class again on boot */ }
try {
  var saved = localStorage.getItem('rie-theme');
  if (['dark', 'light', 'spc', 'spc-modern'].indexOf(saved) === -1) {
    saved = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.setAttribute('data-theme', saved);
} catch (e) { /* keep the server-rendered data-theme="dark" */ }
try { if (localStorage.getItem('rie_side_collapsed') === '1' && innerWidth >= 1024) document.documentElement.classList.add('side-collapsed'); } catch (e) { }
`;
