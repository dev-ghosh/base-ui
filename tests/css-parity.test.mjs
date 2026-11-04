// Guards that the global CSS is a verbatim copy of the old app's CSS, and that the early
// (pre-paint) script keeps the old app's behaviour.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const oldRepo = resolve(root, process.env.OLD_REPO || '../rie-dashboard2');
// This machine checks files out with CRLF; compare with LF on both sides.
const lf = (s) => s.replace(/\r\n?/g, '\n');
const read = (p) => lf(readFileSync(p, 'utf8'));

const oldHtml = read(join(oldRepo, 'index.html'));
const m = oldHtml.match(/<style>([\s\S]*?)<\/style>/);
assert.ok(m, 'old index.html must contain a <style> block');

assert.equal(
  read(join(root, 'src/app/globals.css')).trim(),
  m[1].trim(),
  'src/app/globals.css must equal the first <style> body of the old index.html',
);
assert.equal(
  read(join(root, 'src/app/shell.css')).trim(),
  read(join(oldRepo, 'css/shell.css')).trim(),
  'src/app/shell.css must equal the old css/shell.css',
);

const { EARLY_SCRIPT } = await import(pathToFileURL(join(root, 'src/lib/early-script.js')).href);
assert.equal(typeof EARLY_SCRIPT, 'string');
assert.ok(EARLY_SCRIPT.includes('display-mode: standalone'), 'EARLY_SCRIPT must probe display-mode: standalone');
assert.ok(EARLY_SCRIPT.includes("'installed'"), 'EARLY_SCRIPT must set the installed class');
assert.ok(EARLY_SCRIPT.includes('rie-theme'), 'EARLY_SCRIPT must read the saved theme');

console.log('css-parity.test.mjs: ok');
