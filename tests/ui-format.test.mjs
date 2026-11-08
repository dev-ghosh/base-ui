// The formatting shared by Team and Expenses (money in rupees with Indian grouping, short money,
// initials, tones, month arithmetic, the readForm normalisation). Values worked out by hand.
import { inr, inrShort, fmtDate, toneFor, initialsOf, monthLabel, shiftMonth, normalizeForm } from '../src/lib/ui-format.js';

let bad = 0;
const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL') + '  ' + m); if (!c) bad++; };
// Intl puts a no-break space after the currency sign in some ICU versions; compare without spaces.
const flat = (s) => s.replace(/\s/g, '');

check(flat(inr(123456)) === '₹1,23,456', 'inr groups the Indian way: 1,23,456');
check(flat(inr(1234.5, true)) === '₹1,234.50', 'inr exact keeps two decimals');
check(flat(inr(null)) === '₹0' && flat(inr('x')) === '₹0', 'inr of nothing is 0');
check(flat(inr('1500.4')) === '₹1,500', 'inr rounds to whole rupees and takes numeric strings (amounts arrive as strings)');

check(inrShort(999) === '₹999', 'under a thousand is plain');
check(inrShort(1500) === '₹1.5k', '1500 is 1.5k');
check(inrShort(123456) === '₹1.23L', '1,23,456 is 1.23L');
check(inrShort(25000000) === '₹2.5Cr', '2,50,00,000 is 2.5Cr');
check(inrShort(-2000) === '-₹2k', 'negative keeps its sign in front');

check(initialsOf('Asha Rao') === 'AR' && initialsOf('asha') === 'A' && initialsOf('a b c') === 'AC' && initialsOf('') === '?' && initialsOf(null) === '?', 'initials: first and last word');
check(toneFor('') === '#D97757' && toneFor('a') === '#6FA287', 'tone is picked by a stable hash (97 % 8 = 1)');
check(toneFor('Visa') === toneFor('Visa'), 'same name, same tone');

check(shiftMonth('2026-01', -1) === '2025-12' && shiftMonth('2026-11', 3) === '2027-02' && shiftMonth('2026-05', 0) === '2026-05', 'month arithmetic crosses year ends');
check(monthLabel('2026-10') === 'October 2026', 'month label');

check(fmtDate('') === '—' && fmtDate(null) === '—' && fmtDate('garbage') === '—', 'no date is a dash');
check(fmtDate('2020-03-05') === '5 Mar 20', 'another year shows the two-digit year');
check(fmtDate('2020-03-05T10:00:00Z') === '5 Mar 20', 'a timestamp is cut to its date');

const n = normalizeForm({ a: '  x ', b: '   ', c: true, d: false, e: undefined, f: 0, g: '0' });
check(n.a === 'x' && n.b === null && n.c === true && n.d === false && n.e === null, 'trim, blank -> null, booleans kept');
check(n.f === '0' && n.g === '0', 'zero is a value, not a blank (readForm kept "0")');

console.log(bad ? `\n${bad} FAILED\n` : '\nui-format ok\n');
process.exit(bad ? 1 : 0);
