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
 * MUTATION-PROOF (a gate you have not seen fail is not a gate):
 *   Add `import * as THREE from 'three'` to an entry module, rebuild → manualChunks buckets the pulled
 *   three modules into the `three` chunk, which blows its budget → RED.
 *   Remove `manualChunks` from vite.config.js, rebuild → the split assertion → RED.
 *   Point OUT_DIR at a non-existent dir → "no chunks found" → RED (it fails loud instead of passing empty).
 */
import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, '../../build/assets'); // vite.config.js -> build.outDir = 'build'

// Budgets are the measured 2026-07-13 sizes + ~8% headroom. Tightening them is a deliberate act;
// RAISING one to make a red build go green is a reward-hack and is forbidden (CLAUDE.md, Invariants).
const BUDGETS = [
  { name: 'rapier', max: 2_420_000, actualAtWrite: 2_236_813 }, // WASM physics — the giant, and it is inert
  // The ceiling keeps about 72 KB of headroom over the chunk without N8AO (DECISIONS 2026-10-28 item 29).
  { name: 'r3f', max: 760_000, actualAtWrite: 687_959 },
  // the app itself — the one that creeps. Ceiling = measured + the programme byte ledger's 67,600 B of lane
  // allowances + ~13 KB, so the in-flight lanes still fit and nothing else gets the freed bytes.
  { name: 'index', max: 700_000, actualAtWrite: 618_708 },
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

// LAZY PANELS (plan 2026-09-23-crafty-lazy-panels): the on-demand panels are ONE chunk loaded after boot. A marker
// only a panel's source carries (a data-testid) must be ABSENT from the boot `index` chunk and PRESENT in exactly one
// other chunk, the same one for every marker — the presence half proves the split happened rather than the panel
// having been deleted, and one chunk means one request. A second STATIC importer of any panel module would pull it
// back into the boot chunk; this is what sees that.
const LAZY_PANEL_MARKERS = ['relic-slot', 'progression-panel']; // GamePanels, SpellUpgradePanel
const bootChunk = findChunk('index');
// Each chunk is read ONCE, lazily, and kept: the per-marker scan re-read every chunk (the 2.2 MB rapier one too) once
// per marker (review #8, R9.9).
const chunkText = new Map();
const textOf = (c) => {
  if (!chunkText.has(c.file)) chunkText.set(c.file, readFileSync(join(OUT_DIR, c.file), 'utf8'));
  return chunkText.get(c.file);
};
const holdersOf = (marker) => chunks.filter((c) => textOf(c).includes(marker));
// A testid marker is matched as the minified string literal, quotes included, so a renamed testid that merely starts
// with it ("relic-sloth") is not mistaken for it. A minifier that changes its quoting finds it nowhere and fails.
const testidHoldersOf = (testid) => holdersOf(`"${testid}"`);
const panelChunks = new Set();
let lazyBad = 0;
for (const marker of LAZY_PANEL_MARKERS) {
  const holders = testidHoldersOf(marker);
  if (bootChunk && holders.includes(bootChunk)) {
    console.error(`✘ lazy panels: "${marker}" is in the BOOT chunk (${bootChunk.file}) — a panel is statically imported again`);
    failed = true; lazyBad++;
  } else if (holders.length !== 1) {
    console.error(`✘ lazy panels: "${marker}" found in ${holders.length} chunk(s) — expected exactly one lazy panel chunk`);
    failed = true; lazyBad++;
  } else {
    panelChunks.add(holders[0].file);
  }
}
if (panelChunks.size > 1) {
  console.error(`✘ lazy panels: the panels are split across ${panelChunks.size} chunks (${[...panelChunks].join(', ')}) — one import, one chunk`);
  failed = true;
} else if (panelChunks.size === 1 && lazyBad === 0) {
  console.log(`✓ lazy panels: ${LAZY_PANEL_MARKERS.length} panel markers only in ${[...panelChunks][0]}, none in the boot chunk`);
}

// THE LAZY DRAGON (DECISIONS 2026-10-30 item 121): the Shadow Dragon's code is its own chunk, downloaded when a fight
// is due. Its outer group's name is an inline, unexported literal in render/BossEntity.jsx: ABSENT from the boot chunk
// proves no static import pulled the dragon back in; PRESENT in exactly one other chunk proves the split happened
// rather than the dragon having been deleted. Unexported on purpose: render/dragonLoader.js hands the whole module
// namespace on, so Rollup keeps every export of the lazy module, and an exported constant would keep the string in the
// chunk after its one use was gone.
const DRAGON_MARKERS = ['crafty:dragon-chunk'];
for (const marker of DRAGON_MARKERS) {
  const holders = holdersOf(`"${marker}"`);
  if (bootChunk && holders.includes(bootChunk)) {
    console.error(`✘ dragon: "${marker}" is in the BOOT chunk (${bootChunk.file}) — render/BossEntity.jsx is statically imported again`);
    failed = true;
  } else if (holders.length !== 1) {
    console.error(`✘ dragon: "${marker}" found in ${holders.length} chunk(s) — expected exactly one lazy dragon chunk`);
    failed = true;
  } else {
    console.log(`✓ dragon: ${DRAGON_MARKERS.length} marker only in ${holders[0].file}, none in the boot chunk`);
  }
}

// LAZY GAME ICONS: the baked game-icons.net path data (~75 KB) is fetched
// after boot by Icon.jsx. Path data from the first, a middle and the last baked icon must be ABSENT from the boot chunk
// and PRESENT in exactly one other chunk, the same one for all three: presence proves the icons still ship, absence
// proves no static import of gameIcons.js pulled them back into the boot chunk.
const GAME_ICON_MARKERS = ['M278.814 35.137c', 'M143.627 36.361c', 'M54.6 25.88L41.4']; // apple, star-formation, glowing-artifact
const iconChunks = new Set();
let iconBad = 0;
for (const marker of GAME_ICON_MARKERS) {
  const holders = holdersOf(marker);
  if (bootChunk && holders.includes(bootChunk)) {
    console.error(`✘ lazy icons: game-icon path data "${marker}" is in the BOOT chunk (${bootChunk.file}); gameIcons.js is statically imported again`);
    failed = true; iconBad++;
  } else if (holders.length !== 1) {
    console.error(`✘ lazy icons: game-icon path data "${marker}" found in ${holders.length} chunk(s); expected exactly one lazy icon chunk`);
    failed = true; iconBad++;
  } else {
    iconChunks.add(holders[0].file);
  }
}
if (iconChunks.size > 1) {
  console.error(`✘ lazy icons: the baked set is split across ${iconChunks.size} chunks (${[...iconChunks].join(', ')})`);
  failed = true;
} else if (iconChunks.size === 1 && iconBad === 0) {
  console.log(`✓ lazy icons: ${GAME_ICON_MARKERS.length} game-icon markers only in ${[...iconChunks][0]}, none in the boot chunk`);
}

// PRELOADED GAME ICONS: the title button's sword is a game icon, due 0.9 s into the menu's fade-in. Lazy alone, its
// chunk is requested only after the boot chunk has downloaded and run; vite.config.js's preloadGameIcons() adds a
// modulepreload to index.html so the fetch starts beside the boot chunk's. Read from the HTML that ships.
const INDEX_HTML = resolve(OUT_DIR, '../index.html');
if (iconChunks.size === 1) {
  const iconFile = [...iconChunks][0];
  const html = existsSync(INDEX_HTML) ? readFileSync(INDEX_HTML, 'utf8') : '';
  const preloads = (html.match(/<link\b[^>]*>/g) ?? []).filter((tag) => /\brel=["']?modulepreload\b/.test(tag));
  if (preloads.some((tag) => new RegExp(`\\bhref=["']?[^"' >]*/${iconFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["' >]`).test(tag))) {
    console.log(`✓ icon preload: index.html modulepreloads ${iconFile} (${preloads.length} modulepreload links)`);
  } else {
    console.error(`✘ icon preload: index.html has no modulepreload for ${iconFile} (${preloads.length} modulepreload links${html ? '' : '; build/index.html is missing'}); the title icon waits for the boot chunk to run`);
    failed = true;
  }
}

// NO N8AO (DECISIONS 2026-10-28 item 29): the ambient-occlusion pass was deleted on its measured GPU cost. Two
// strings only n8ao's own code carries, an internal transparency mode and a line of its shader, so any chunk that has
// either ships the pass again, whoever imports it (our code, or a vendor's wrapper pulled into the r3f chunk).
const N8AO_MARKERS = ['transparencyDWTrueDepth', 'uniform sampler2D bluenoise'];
const n8aoHolders = chunks.filter((c) => N8AO_MARKERS.some((m) => textOf(c).includes(m)));
if (n8aoHolders.length) {
  console.error(`✘ n8ao: its code is in ${n8aoHolders.map((c) => c.file).join(', ')}; the deleted ambient-occlusion pass ships again`);
  failed = true;
} else {
  console.log(`✓ n8ao: ${N8AO_MARKERS.length} markers absent from all ${chunks.length} chunks`);
}

// NO TAILWIND-MERGE: cn.js is a plain joiner and the primitives name each default a caller may replace, so the
// ~28 KB merge engine has no reader. These are class-group ids from tailwind-merge's own config, which no Tailwind
// class and nothing in src spells; any chunk carrying one ships the library again.
const TAILWIND_MERGE_MARKERS = ['fvn-normal', 'mask-image-linear-pos'];
const mergeHolders = chunks.filter((c) => TAILWIND_MERGE_MARKERS.some((m) => textOf(c).includes(m)));
if (mergeHolders.length) {
  console.error(`✘ tailwind-merge: its config markers are in ${mergeHolders.map((c) => c.file).join(', ')}; the dependency is back in the bundle`);
  failed = true;
} else {
  console.log(`✓ tailwind-merge: ${TAILWIND_MERGE_MARKERS.length} markers absent from all ${chunks.length} chunks`);
}

if (failed) {
  console.error(
    `\n✘ bundle-budget FAILED.` +
      `\n  Do NOT raise a budget to make this green — that is a reward-hack (CLAUDE.md, Invariants).` +
      `\n  Find what grew. If the growth is genuinely intended, raise the budget in a SEPARATE commit` +
      `\n  whose body says what grew and why.`,
  );
  process.exit(1);
}

console.log('\n✓ bundle-budget PASSED');
