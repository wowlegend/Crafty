#!/usr/bin/env node
/**
 * REAL bundle-byte budget gate.
 *
 * WHY (STATUS §V4): the previous `bundle-split-gates.test.js` only regexed `vite.config.js` for
 * /manualChunks/ and asserted ZERO bytes against a ~4.5MB bundle. It could not have caught a regression:
 * you could ship a 40MB entry chunk and it would stay green. That is a VACUOUS gate — it asserts that a
 * line of config EXISTS, not that the shipped artifact is actually within budget.
 *
 * This gate reads the bytes that ACTUALLY ship (vite outDir = `build/`, NOT `dist/` — a gate hardcoded to
 * `dist/` would glob nothing and pass forever, which is how vacuous gates are born).
 *
 * It asserts two things:
 *   1. Each known chunk stays within its byte budget (catches a dependency blowing up the bundle).
 *   2. three / rapier / r3f stay in SEPARATE chunks (the cache-stability property manualChunks exists for).
 *
 * MUTATION-PROOF (per LOOP-CHARTER §3 — a gate you have not seen fail is not a gate):
 *   Add `import * as THREE from 'three'` to an entry module, rebuild → `index` blows its budget → RED.
 *   Remove `manualChunks` from vite.config.js, rebuild → the split assertion → RED.
 *   Point OUT_DIR at a non-existent dir → "no chunks found" → RED (it fails loud instead of passing empty).
 */
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, '../../build/assets'); // vite.config.js -> build.outDir = 'build'

// Budgets are the measured 2026-07-13 sizes + ~8% headroom. Tightening them is a deliberate act;
// RAISING one to make a red build go green is a reward-hack and is forbidden (LOOP-CHARTER §3).
const BUDGETS = [
  { name: 'rapier', max: 2_420_000, actualAtWrite: 2_236_813 }, // WASM physics — the giant, and it is inert
  { name: 'r3f', max: 900_000, actualAtWrite: 833_418 },
  { name: 'index', max: 760_000, actualAtWrite: 697_775 }, // the app itself — the one that creeps
  { name: 'three', max: 740_000, actualAtWrite: 680_700 },
];

// These must never end up in the same chunk as each other, or every app edit busts the vendor cache.
const MUST_STAY_SPLIT = ['three', 'rapier', 'r3f'];

if (!existsSync(OUT_DIR)) {
  console.error(`✘ bundle-budget: no build output at ${OUT_DIR}\n  Run \`npm run build\` first.`);
  process.exit(1);
}

const chunks = readdirSync(OUT_DIR)
  .filter((f) => f.endsWith('.js'))
  .map((f) => ({ file: f, bytes: statSync(join(OUT_DIR, f)).size }));

// FAIL LOUD on an empty read. An empty glob silently passing is the exact vacuous-gate failure mode.
if (chunks.length === 0) {
  console.error(`✘ bundle-budget: ZERO chunks found in ${OUT_DIR}. Refusing to pass vacuously.`);
  process.exit(1);
}

/** vite emits `<name>-<hash>.js`; match on the name prefix. */
const findChunk = (name) => chunks.find((c) => c.file.startsWith(`${name}-`));

let failed = false;
const kb = (n) => `${(n / 1024).toFixed(1)}KB`;

console.log(`bundle-budget: ${chunks.length} chunks in build/assets\n`);

for (const { name, max, actualAtWrite } of BUDGETS) {
  const chunk = findChunk(name);
  if (!chunk) {
    console.error(`✘ ${name}: MISSING. Expected a \`${name}-*.js\` chunk — did manualChunks change?`);
    failed = true;
    continue;
  }
  const drift = chunk.bytes - actualAtWrite;
  const sign = drift >= 0 ? '+' : '';
  if (chunk.bytes > max) {
    console.error(
      `✘ ${name}: ${kb(chunk.bytes)} EXCEEDS budget ${kb(max)} (${sign}${kb(drift)} since the budget was set)`,
    );
    failed = true;
  } else {
    console.log(`✓ ${name}: ${kb(chunk.bytes)} / ${kb(max)} (${sign}${kb(drift)})`);
  }
}

// Cache-stability: each vendor must be its OWN chunk.
const splitMissing = MUST_STAY_SPLIT.filter((n) => !findChunk(n));
if (splitMissing.length) {
  console.error(
    `\n✘ chunk-split broken: ${splitMissing.join(', ')} not emitted as separate chunk(s).` +
      `\n  three/rapier/r3f must stay split or every app edit invalidates the vendor cache.`,
  );
  failed = true;
} else {
  console.log(`\n✓ split: ${MUST_STAY_SPLIT.join(' / ')} are separate chunks`);
}

if (failed) {
  console.error(
    `\n✘ bundle-budget FAILED.` +
      `\n  Do NOT raise a budget to make this green — that is a reward-hack (LOOP-CHARTER §3).` +
      `\n  Find what grew. If the growth is genuinely intended, raise the budget in a SEPARATE commit` +
      `\n  whose body says what grew and why.`,
  );
  process.exit(1);
}

console.log('\n✓ bundle-budget PASSED');
