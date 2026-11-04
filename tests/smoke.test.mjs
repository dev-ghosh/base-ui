// Scaffold smoke test: guards the global constraints of the migration.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.type, 'module', 'package.json must have "type": "module"');
assert.ok(pkg.scripts && /-p 8080/.test(pkg.scripts.dev || ''), 'dev script must contain "-p 8080"');

// src/ may not exist yet; if it does it must be plain JavaScript.
const src = join(root, 'src');
if (existsSync(src)) {
  const ts = walk(src).filter((f) => /\.tsx?$/.test(f));
  assert.deepEqual(ts, [], 'no .ts/.tsx files allowed under src/');
}
assert.ok(!existsSync(join(root, 'tsconfig.json')), 'no tsconfig.json allowed (jsconfig only)');

const env = read('.env.example');
for (const name of ['NEXT_PUBLIC_SB_URL', 'NEXT_PUBLIC_SB_KEY', 'NEXT_PUBLIC_HR_AUTOMATION_URL']) {
  assert.ok(env.includes(name), `.env.example must name ${name}`);
}

console.log('smoke.test.mjs: ok');
