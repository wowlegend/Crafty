#!/usr/bin/env node
/**
 * FREEZE THE LOCAL-DENSITY RATCHET from a real capture pair.
 *
 * Usage: node scripts/visual/freeze-density.mjs        (writes tests/visual/.density-ledger.json)
 *        node scripts/visual/freeze-density.mjs --dry  (prints the table, writes nothing)
 *
 * Reads `tests/visual/baseline` against `tests/visual/current` — so it must run immediately after a
 * capture, on a pair you have already reviewed. Freezing against an unreviewed pair records whatever
 * noise or regression that run happened to contain as permanently allowed, which is the same defect as
 * blessing a baseline nobody opened.
 *
 * Every frame is frozen at `max(FLOOR, observed * HEADROOM)`; the arithmetic lives in
 * scripts/ci/_density-ratchet.mjs so the gate and the freezer cannot drift apart.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { maxWindowDensity } from '../../src/devtest/diffDensity.js';
import { frozenFor } from '../ci/_density-ratchet.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const VIS = resolve(HERE, '../../tests/visual');
const LEDGER = join(VIS, '.density-ledger.json');

function main() {
  const dry = process.argv.includes('--dry');
  const names = readdirSync(join(VIS, 'baseline')).filter((f) => f.endsWith('.png')).sort();
  if (!names.length) {
    console.error('freeze-density: no baseline PNGs found — nothing to freeze');
    process.exit(1);
  }
  const frames = {};
  const rows = [];
  for (const f of names) {
    const a = PNG.sync.read(readFileSync(join(VIS, 'baseline', f)));
    let b;
    try {
      b = PNG.sync.read(readFileSync(join(VIS, 'current', f)));
    } catch {
      console.error(`freeze-density: current/${f} is missing — capture before freezing`);
      process.exit(1);
    }
    if (a.width !== b.width || a.height !== b.height) {
      console.error(`freeze-density: ${f} differs in SIZE between baseline and current`);
      process.exit(1);
    }
    const mask = new PNG({ width: a.width, height: a.height });
    pixelmatch(a.data, b.data, mask.data, a.width, a.height, { threshold: 0.1, diffMask: true });
    const d = maxWindowDensity(mask.data, a.width, a.height, 128, 32);
    const state = f.replace(/\.png$/, '');
    frames[state] = frozenFor(d.density);
    rows.push({ state, observed: d.density, frozen: frames[state] });
  }
  rows.sort((x, y) => y.observed - x.observed);
  console.log(`  ${'state'.padEnd(26)}${'observed'.padStart(10)}${'frozen at'.padStart(12)}`);
  for (const r of rows) {
    console.log(`  ${r.state.padEnd(26)}${(r.observed * 100).toFixed(2).padStart(9)}%${(r.frozen * 100).toFixed(2).padStart(11)}%`);
  }
  const atFloor = rows.filter((r) => r.observed === 0).length;
  console.log(`  ${rows.length} frames; ${atFloor} byte-identical (frozen at the floor)`);
  if (dry) return;
  writeFileSync(
    LEDGER,
    JSON.stringify({ _count: Object.keys(frames).length, _note: 'regenerate: node scripts/visual/freeze-density.mjs, on a REVIEWED capture pair', frames }, null, 2) + '\n'
  );
  console.log(`  frozen ${Object.keys(frames).length} frames -> tests/visual/.density-ledger.json`);
}

// CLI only — importing this file must not read the whole corpus as a side effect (cli-guard).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
