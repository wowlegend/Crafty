#!/usr/bin/env node
/**
 * CONTROLS TABLE — the README's keyboard and mouse table, rendered from KEY_MAP (src/game/keyMap.js), the
 * same list the in-game controls panel reads. doc-currency fails when the README's block differs from a fresh
 * render, so a rebound key cannot leave the README teaching the old one.
 *
 *   node scripts/ci/controls-table.mjs           print the block
 *   node scripts/ci/controls-table.mjs --write   regenerate the block inside README.md
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KEY_MAP, KEY_GROUPS } from '../../src/game/keyMap.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
export const README = join(ROOT, 'README.md');

export const BEGIN = '<!-- BEGIN CONTROLS (generated from frontend/src/game/keyMap.js: node frontend/scripts/ci/controls-table.mjs --write) -->';
export const END = '<!-- END CONTROLS -->';

const kbd = (k) => `<kbd>${escapeCell(k)}</kbd>`;

// KEY_MAP names some inputs in the in-game panel's shorthand; a reader of the README needs the full name.
const KEY_DISPLAY = {
  WASD: ['W', 'A', 'S', 'D'].map(kbd).join(' '),
  LMB: kbd('Left click'),
  RMB: kbd('Right click'),
  Wheel: kbd('Mouse wheel'),
  ESC: kbd('Esc'),
  '1–4': `${kbd('1')} to ${kbd('4')}`,
};

export function escapeCell(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '\\|');
}

/** The block, markers included, for `keyMap` grouped in `groups` order. Every row is rendered. */
export function renderBlock(keyMap = KEY_MAP, groups = KEY_GROUPS) {
  const rows = [];
  for (const group of groups) {
    keyMap
      .filter((r) => r.group === group)
      .forEach((r, i) => {
        const keys = KEY_DISPLAY[r.key] ?? kbd(r.key);
        rows.push(`| ${i === 0 ? `**${escapeCell(group)}**` : ''} | ${keys} | ${escapeCell(r.label)} |`);
      });
  }
  const orphans = keyMap.filter((r) => !groups.includes(r.group));
  if (orphans.length) {
    throw new Error(`controls-table: rows in no known group: ${orphans.map((r) => r.key).join(', ')}`);
  }
  return [BEGIN, '| | Key | What it does |', '|---|---|---|', ...rows, END].join('\n');
}

/** Is the README's block present exactly once and identical to a fresh render? */
export function checkBlock(md, keyMap = KEY_MAP, groups = KEY_GROUPS) {
  const want = renderBlock(keyMap, groups);
  const rows = keyMap.length;
  const begins = md.split(BEGIN).length - 1;
  const ends = md.split(END).length - 1;
  if (begins === 0 || ends === 0) return { ok: false, reason: 'CONTROLS block missing', rows };
  if (begins > 1 || ends > 1) return { ok: false, reason: 'CONTROLS block appears more than once', rows };
  const i = md.indexOf(BEGIN);
  const got = md.slice(i, md.indexOf(END, i) + END.length);
  return { ok: got === want, reason: got === want ? '' : 'CONTROLS block is stale', rows };
}

export function writeBlock(path = README) {
  const md = readFileSync(path, 'utf8');
  const i = md.indexOf(BEGIN);
  const j = md.indexOf(END);
  if (i < 0 || j < i) throw new Error(`controls-table: no ${BEGIN} / ${END} markers in ${path}`);
  writeFileSync(path, md.slice(0, i) + renderBlock() + md.slice(j + END.length));
}

function main() {
  if (process.argv.includes('--write')) {
    writeBlock();
    console.log(`controls-table: wrote ${KEY_MAP.length} rows into README.md`);
    return;
  }
  console.log(renderBlock());
}

if (import.meta.main) main();
