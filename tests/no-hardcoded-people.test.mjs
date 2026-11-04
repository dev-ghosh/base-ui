// The owner vocabulary is public.people. Until 2026-09-11 js/db.js carried a
// six-entry name<->code map and js/today.js an email->code map; a colleague
// missing from either was written as owner_code NULL and had a Today that
// could not tell what was theirs. This is the same guard PR #37 put on company
// and function names (spec §8.7): the vocabulary must not reappear in source.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dir = join(root, 'src');

// Every .js / .jsx under src/, recursively.
function walk(d) {
  const out = [];
  for (const name of readdirSync(d)) {
    const full = join(d, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.jsx?$/.test(name)) out.push(full);
  }
  return out;
}
const files = walk(dir);
const banned = /\b(VRISHABH|AKHILESH|PUNEET|PIYUSH)\b|akhileshsuthar1@gmail\.com|puneet@hedgept\.com|EMAIL_TO_OWNER|NAME_TO_OWNER|OWNER_TO_NAME|ASSIGNEE_OPTIONS/;

let bad = 0;
for (const file of files) {
  const f = relative(root, file).split(sep).join('/');
  const src = readFileSync(file, 'utf8');
  src.split(/\r?\n/).forEach((line, i) => {
    // Comments may cite history; code may not carry the names.
    const t = line.trim();
    if (t.startsWith('*') || t.startsWith('/*') || t.startsWith('//')) return;
    const code = t.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
    if (banned.test(code)) { console.log(`  FAIL  ${f}:${i + 1}  ${line.trim()}`); bad++; }
  });
}
console.log(bad ? `\n${bad} hardcoded people reference(s)\n` : `\nno hardcoded people in src/ (${files.length} files scanned)\n`);
process.exit(bad ? 1 : 0);
