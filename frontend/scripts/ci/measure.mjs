#!/usr/bin/env node
/**
 * MEASURE — the single authority for every repo number a governing doc quotes.
 *
 * WHY. `.agent/AGENTS.md` is the project constitution: symlinked as CLAUDE.md, auto-loaded on every task,
 * re-injected after every compaction. Its architecture paragraph hand-typed "~14.4k LOC / ~31 JS(X) files"
 * and asserted "Components ~1330 is the LAST single large file". Measured 2026-08-02:
 *
 *     files   ~31   ->   373      (12x)
 *     LOC     ~14.4k ->  36,192   (2.5x)
 *     "last single large file"    ->  FIVE files >= 900 LOC
 *
 * Every one of those is load-bearing. An agent that believes this codebase is ~31 files reasons about it as
 * a small project, and "Components is the last god-file" actively misdirects de-monolith work away from the
 * four other files that qualify. A number in a document that is re-read every iteration is a CLAIM, and a
 * claim nobody recomputes has a half-life of days.
 *
 * SO THE NUMBERS ARE NOT TYPED. They are generated into AGENTS.md between HTML-comment markers, and
 * `doc-currency.mjs` re-measures on every push and fails if the committed block has drifted.
 *
 * TOLERANCE IS DELIBERATE, AND IT IS THE WHOLE DESIGN. LOC changes on nearly every commit, so an
 * exact-match check would go red constantly for no reason and be switched off within a day — the same
 * reasoning that made the i18n gate a ratchet instead of a zero-target. What this defends against is
 * MATERIAL drift: the doc claiming a codebase 12x smaller than it is. A +/-10% band ignores ordinary churn
 * and still catches that by a wide margin.
 *
 * The >=900-LOC list is checked EXACTLY, not by tolerance. It is a short, slow-moving set, it is the claim
 * that was most wrong, and its membership is precisely what de-monolith decisions get made from.
 *
 *   node scripts/ci/measure.mjs            print the markdown block
 *   node scripts/ci/measure.mjs --json     machine-readable
 *   node scripts/ci/measure.mjs --write    regenerate the block inside .agent/AGENTS.md
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '../..'); // frontend/
const ROOT = resolve(APP, '..'); // repo root
const AGENTS = join(ROOT, '.agent/AGENTS.md');

export const BEGIN = '<!-- BEGIN MEASURED (regenerate: node frontend/scripts/ci/measure.mjs --write) -->';
export const END = '<!-- END MEASURED -->';
export const LARGE_FILE_LOC = 900; // the "god-file" threshold this project has always used
export const TOLERANCE = 0.10;

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'build' || e.name.startsWith('.')) continue;
      walk(p, out);
    } else if (/\.(js|jsx)$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

const loc = (p) => readFileSync(p, 'utf8').split('\n').length;

export function measure() {
  const all = walk(join(APP, 'src')).sort();
  // Tests colocated in src/ are real files but they are not the ARCHITECTURE. Conflating them would
  // overstate the app by ~a third and hide movement in the thing the doc is actually describing.
  const isTest = (p) => /\.test\.(js|jsx)$/.test(p);
  const src = all.filter((p) => !isTest(p));
  const tests = all.filter(isTest);

  const sized = src.map((p) => ({ file: relative(APP, p), loc: loc(p) })).sort((a, b) => b.loc - a.loc);
  return {
    srcFiles: src.length,
    srcLoc: sized.reduce((n, f) => n + f.loc, 0),
    colocatedTestFiles: tests.length,
    largeFiles: sized.filter((f) => f.loc >= LARGE_FILE_LOC),
    top5: sized.slice(0, 5),
  };
}

export function renderBlock(m) {
  const large = m.largeFiles.map((f) => `\`${f.file}\` ${f.loc}`).join(' · ');
  return [
    BEGIN,
    `- **Size (measured):** **${m.srcFiles} source files / ${m.srcLoc.toLocaleString('en-US')} LOC** in`,
    `  \`frontend/src\`, plus ${m.colocatedTestFiles} colocated \`*.test.js(x)\` files (counted separately —`,
    `  tests are not the architecture).`,
    `- **Files ≥ ${LARGE_FILE_LOC} LOC (${m.largeFiles.length}):** ${large || '_none_'}.`,
    `  Its MEMBERSHIP is checked exactly by \`doc-currency\`; the LOC beside each name, and the counts above,`,
    `  sit under a ±${Math.round(TOLERANCE * 100)}% band so ordinary churn does not redden the push — so a specific number here`,
    `  can be mildly stale and still green. Regenerate before trusting one: \`node frontend/scripts/ci/measure.mjs --write\`.`,
    END,
  ].join('\n');
}

/** Parse the committed block back into numbers, so the lint can compare without re-parsing prose. */
export function parseBlock(md) {
  const i = md.indexOf(BEGIN);
  const j = md.indexOf(END);
  if (i === -1 || j === -1) return null;
  const block = md.slice(i, j);
  const files = block.match(/\*\*(\d[\d,]*) source files/);
  const locM = block.match(/\/ ([\d,]+) LOC\*\*/);
  const large = [...block.matchAll(/`([^`]+\.jsx?)` (\d+)/g)].map((m) => ({ file: m[1], loc: Number(m[2]) }));
  if (!files || !locM) return null;
  return {
    srcFiles: Number(files[1].replace(/,/g, '')),
    srcLoc: Number(locM[1].replace(/,/g, '')),
    largeFiles: large,
  };
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const m = measure();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(m, null, 2));
  } else if (process.argv.includes('--write')) {
    const md = readFileSync(AGENTS, 'utf8');
    const i = md.indexOf(BEGIN);
    const j = md.indexOf(END);
    if (i === -1 || j === -1) {
      console.error(`measure: no MEASURED block in .agent/AGENTS.md — add the markers first:\n${BEGIN}\n${END}`);
      process.exit(1);
    }
    writeFileSync(AGENTS, md.slice(0, i) + renderBlock(m) + md.slice(j + END.length));
    console.log(`measure: wrote ${m.srcFiles} files / ${m.srcLoc} LOC / ${m.largeFiles.length} large into .agent/AGENTS.md`);
  } else {
    console.log(renderBlock(m));
  }
}
