// Copies the old app's CSS into this app, byte-identical modulo line endings (LF output).
//   node tools/extract-css.mjs [oldRepoPath]      (default: $OLD_REPO or ../rie-dashboard2)
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lf = (s) => s.replace(/\r\n?/g, '\n');

export function extractCss(oldRepoPath) {
  const html = lf(readFileSync(join(oldRepoPath, 'index.html'), 'utf8'));
  const m = html.match(/<style>([\s\S]*?)<\/style>/);
  if (!m) throw new Error('no <style> block in old index.html');
  writeFileSync(join(root, 'src/app/globals.css'), m[1].trim() + '\n');
  const shell = lf(readFileSync(join(oldRepoPath, 'css/shell.css'), 'utf8'));
  writeFileSync(join(root, 'src/app/shell.css'), shell.trim() + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const old = resolve(root, process.argv[2] || process.env.OLD_REPO || '../rie-dashboard2');
  extractCss(old);
  console.log('wrote src/app/globals.css and src/app/shell.css from', old);
}
