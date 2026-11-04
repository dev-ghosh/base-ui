// Pure date helpers ported unchanged from rie-dashboard2/js/utils.js.
// esc() is dropped (React escapes); the DOM helpers (setStatus, sp, openMo, closeMo,
// hideSplash, fill, toggleDropdown, openDeleteModal) are not ported.

export const parseD = s => {
  if (!s) return null;
  // Date-only strings (YYYY-MM-DD) are parsed as UTC by spec, which shifts the
  // displayed day backwards in UTC+ timezones (e.g. IST = UTC+5:30).
  // Appending T00:00:00 makes the browser parse as local midnight instead.
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T00:00:00' : s;
  const d = new Date(normalized);
  return isNaN(d) ? null : d;
};

export const fmtD = s => {
  const d = parseD(s);
  if (!d) return '—';
  const y = new Date().getFullYear();
  return d.toLocaleDateString('en-IN',
    d.getFullYear() === y ? { day: 'numeric', month: 'short' }
                          : { day: 'numeric', month: 'short', year: '2-digit' });
};

/* Copy rule for the Work tab: a date, not a day count. "127d late" is a
 * number that shouts; "Was due 16 May" is a fact. Day counts stay in Triage,
 * where the number is the work. */
export const dueLabel = (s, muted = false) => {
  const d = parseD(s);
  if (!d) return 'No date';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  const when = fmtD(s);
  if (muted) return when;
  if (diff === 0) return 'Due today';
  if (diff === 1) return 'Due tomorrow';
  if (diff < 0)  return `Was due ${when}`;
  if (diff <= 6) return 'Due ' + d.toLocaleDateString('en-IN', { weekday: 'short' });
  return 'Due ' + when;
};

export const dueCls = dateStr => {
  const d = parseD(dateStr);
  if (!d) return 'due-ok';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  if (d < today) return 'due-ov';
  if (d.getTime() === today.getTime()) return 'due-to';
  return 'due-ok';
};

