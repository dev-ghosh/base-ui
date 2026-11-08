// Formatting shared by the newer pages (Team, Expenses, ...). Port of the pure helpers in
// rie-dashboard2/js/ui.js (inr, inrShort, fmtDate, toneFor, initialsOf, monthLabel, shiftMonth,
// thisMonth). The HTML builders of that file (badge, avatar, field, emptyCard, openDialog) are
// components now: src/components/ui.jsx.
//
// Plain JS, no store, no DOM: plain Node can import it.

const inrFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inrFmt2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });

/** Rupees with Indian grouping: inr(123456) = "₹1,23,456"; `exact` keeps the paise. */
export const inr = (n, exact = false) => (exact ? inrFmt2 : inrFmt).format(Number(n) || 0);

/** Compact money for tight spaces: ₹1.2L, ₹3.4Cr (Indian grouping). */
export function inrShort(n) {
  const v = Math.abs(Number(n) || 0);
  const s = v >= 1e7 ? `${+(v / 1e7).toFixed(2)}Cr` : v >= 1e5 ? `${+(v / 1e5).toFixed(2)}L` : v >= 1e3 ? `${+(v / 1e3).toFixed(1)}k` : String(Math.round(v));
  return `${n < 0 ? '-' : ''}₹${s}`;
}

/** "12 Oct" (this year) or "12 Oct 25"; an empty or invalid date is an em dash. */
export const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  return Number.isNaN(+d) ? '—' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : '2-digit' });
};

const TONES = ['#D97757', '#6FA287', '#5B93D3', '#9B72B8', '#C99A3B', '#C96F8A', '#6B7A90', '#3E9EA3'];

/** A stable colour for a name (avatars, card tiles). */
export const toneFor = (s) => {
  let h = 0;
  for (const c of String(s || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
};

/** "Asha Rao" -> "AR"; one word -> its first letter; nothing -> "?". */
export const initialsOf = (name) => {
  const p = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
};

/** The month a "YYYY-MM" key names, e.g. "October 2026". */
export const monthLabel = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

/** "YYYY-MM" moved by `delta` months. */
export const shiftMonth = (ym, delta) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** The current month in India, "YYYY-MM". */
export const thisMonth = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()).slice(0, 7);

/** Today in India, "YYYY-MM-DD" (the default date of a new expense). */
export const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

/**
 * What the old readForm() did to a form: strings are trimmed and a blank one becomes null, so it
 * reaches the database as NULL rather than ''. Booleans (checkboxes) are kept.
 */
export function normalizeForm(values) {
  const out = {};
  for (const [k, v] of Object.entries(values)) {
    if (typeof v === 'boolean') { out[k] = v; continue; }
    const s = String(v ?? '').trim();
    out[k] = s === '' ? null : s;
  }
  return out;
}
