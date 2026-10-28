#!/usr/bin/env node
/**
 * freeze-material-before.mjs — writes the BEFORE reference the tone grammar is held to: each sampled block layer's
 * linear mean, luminance and chromaticity, read from the texture array the game renders with.
 *
 * Written once, before the repaint, and never rewritten: a reference regenerated from the code it judges agrees with
 * that code by construction. It refuses to overwrite an existing fixture.
 *
 *   node scripts/visual/freeze-material-before.mjs [--out tests/world/material-before-2026-10-28.json]
 */
import { existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProceduralVoxelTextures } from '../../src/world/proceduralTextures.js';
import { layerStats, chromaOf } from '../../tests/world/_textureStats.js';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const i = process.argv.indexOf('--out');
const OUT = resolve(APP, i > 0 && process.argv[i + 1] ? process.argv[i + 1] : 'tests/world/material-before-2026-10-28.json');

// Air (0) is never painted and water (9) is never sampled: the mesher emits no water faces.
const SAMPLED = [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];

if (existsSync(OUT)) {
  console.error(`freeze-material-before: ${OUT} exists; a reference is written once, before the change it judges`);
  process.exit(1);
}
const tex = createProceduralVoxelTextures();
const round = (v) => Number(v.toFixed(6));
const out = {};
for (const layer of SAMPLED) {
  const s = layerStats(tex, layer);
  out[layer] = { meanLinear: s.meanLinear.map(round), lum: round(s.lum), chroma: chromaOf(s.meanLinear).map(round) };
  console.log(`layer ${String(layer).padStart(2)}  lum ${s.lum.toFixed(4)}  distinct ${String(s.distinct).padStart(3)}  same-neighbour ${s.sameNeighbour.toFixed(3)}  min/mean ${(s.minLum / s.lum).toFixed(2)}`);
}
writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
console.log(`freeze-material-before: ${SAMPLED.length} layers written to ${OUT}`);
