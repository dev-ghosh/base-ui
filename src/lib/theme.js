// Themes. Port of THEMES/setTheme in rie-dashboard2/js/app.js and applyThemeColor/
// notifyNative in js/platform.js. The early script in <head> (early-script.js) has
// already set data-theme before first paint; this module changes it afterwards.
//
// Four themes (docs/route-inventory.md ruling 12.3). SPC is a different design, not
// a palette: it overrides the radius and shadow tokens too (see globals.css).

export const THEME_KEY = 'rie-theme';

export const THEMES = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'spc', label: 'SPC' },
  { id: 'spc-modern', label: 'SPC Modern' },
];

const DEFAULT_THEME = THEMES[0].id;
const listeners = new Set();

export const isTheme = (id) => THEMES.some((t) => t.id === id);

/** The theme on <html> right now (the single source of truth, as in the old app). */
export function getTheme() {
  if (typeof document === 'undefined') return DEFAULT_THEME;
  const v = document.documentElement.getAttribute('data-theme');
  return isTheme(v) ? v : DEFAULT_THEME;
}

export function subscribeTheme(fn) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Post to the native iOS shell. No-op in a browser. */
function notifyNative(type, payload) {
  try { window.webkit?.messageHandlers?.rie?.postMessage({ type, ...payload }); }
  catch { /* not in the shell */ }
}

/**
 * iOS tints the status bar from <meta name="theme-color">, but only reads it live;
 * it does not re-evaluate the prefers-color-scheme variants when the app flips theme
 * through the in-app control. Only 'dark' is dark (the old rule), the other three
 * use the light colour.
 *
 * The old code removed every theme-color meta and appended a new one. Here Next owns
 * the `viewport.themeColor` tags in <head>, and React must be able to keep reconciling
 * them, so they are edited in place instead: content set, `media` dropped so the
 * in-app choice beats the OS scheme. If there is none, one is added.
 */
export function applyThemeColor() {
  const dark = getTheme() === 'dark';
  const colour = dark ? '#262624' : '#FAF9F5';
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  if (metas.length) {
    metas.forEach((m) => { m.setAttribute('content', colour); m.removeAttribute('media'); });
  } else {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = colour;
    document.head.appendChild(meta);
  }
  notifyNative('theme', { theme: dark ? 'dark' : 'light', color: colour });
}

/** Pick a theme: set data-theme, remember it, re-sync the status-bar colour. */
export function setTheme(id) {
  const theme = THEMES.find((t) => t.id === id) || THEMES[0];
  document.documentElement.setAttribute('data-theme', theme.id);
  try { localStorage.setItem(THEME_KEY, theme.id); } catch { /* private mode */ }
  applyThemeColor();
  listeners.forEach((fn) => fn());
}
