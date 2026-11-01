// THE FIRST NIGHT'S RECORD IS CURRENT (tests/e2e/_firstNightAwaits.js; DECISIONS 2026-11-01 (W3-A PR C) item 488). CI
// skips a beat listed in AWAITS, so a unit that lands its feature and leaves the beat listed would leave it skipped for
// ever while `ci ok` stays green. This runs in every unit run, so on every CI sha: it reads the repo for each unit that
// owns a listed red (LANDED: an export the task script names, or a behaviour of a pure module only that unit adds) and
// fails while a listed red belongs to a unit that has landed. The unit that lands a feature therefore runs its beat with
// FIRST_NIGHT_AWAITING=1 and rewrites or deletes its reds in the same commit, and a beat whose last red goes leaves the
// table and gates every sha from then on.
//
// WHY tests/scripts/: the subject is the repo's files (what has landed) against a table; it reads source by its nature.
// Each probe is first shown to SEE a landing, on a fixture tree holding only that unit's piece, so a probe that cannot
// read "landed" can never make this check pass by reading nothing.
//
// Mutation-Proof: via scripts/dev/mutate.sh, 5 tests, each observed RED:
//   L1 the reader's file read returns nothing (the static probes blind) -> "each probe sees its unit land" and "a landed
//      unit's red fails the record"
//   L1b the reader's module load returns nothing (the behavioural probes blind) -> the same two
//   L2 staleReds counts no unit as landed -> "a landed unit's red fails the record"
//   L3 plausible-wrong: the N8 probe takes any import of game/lights.js -> "a module importing only isWarded is not N8"
//   L4 a red in the real table owned by a unit with no probe ('Z9') -> the suite (its probe-less unit fails the reads)
//   I0 identity (a comment edit in _firstNightAwaits.js) SURVIVED.
//
// NOT CHECKED HERE: that a landed feature is right (the beat, once it gates, does that), and a unit that builds its piece
// under another name than its probe reads (the probe moves with it, in the commit that lands it; until then this check
// cannot see that unit land).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AWAITS, LANDED, repoReader, staleReds, unitsOf } from '../e2e/_firstNightAwaits.js';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Each unit's piece, as small as its probe reads it: the files a fixture tree holds for that unit alone. */
const PIECES = Object.freeze({
  D2: { 'src/night/kindle.js': 'export const kindleBeat = [];\n' },
  N5: { 'src/night/SiegeDirectorSystem.jsx': 'export function SiegeDirectorSystem() { return null; }\n' },
  U3: { 'src/ui/compassLayout.js': 'export const layoutCompass = (markers) => markers.map((m) => ({ id: m.id, x: 0 }));\n' },
  B1: { 'src/game/playerPoint.js': 'export function steadyEye(body) { return body; }\n' },
  V2: { 'src/game/vitality.js': 'export const isCalm = () => true;\n' },
  N6a: {
    'src/render/skyClock.js': 'export const makeSkyClock = () => ({ t: null });\n'
      + 'export function followSkyClock(c, t, dt, rate = 2.5) { if (c.t === null || t - c.t > 2 * rate) { c.t = t; return t; } c.t = Math.min(t, c.t + dt * rate); return c.t; }\n',
  },
  D3: { 'src/night/dawnPayoff.js': 'const dawnPayoffBeat = [];\nexport { dawnPayoffBeat };\n' },
  L2: { 'src/world/blockIds.js': 'export const BLOCK_ID = Object.freeze({ air: 0, lantern: 16 });\n' },
  L3: { 'src/game/forge.js': "export const forgeOffers = () => [{ id: 'goods:lantern', give: 'lantern' }];\n" },
  N8: { 'src/systems/respawnAnchor.js': "import { nearestLit } from '../game/lights.js';\nexport const anchorOf = nearestLit;\n" },
  N2: { 'src/night/spawnContract.js': "import { registerTestHook } from '../devtest/testBridge.js';\nregisterTestHook('ambientAttempts', () => []);\n" },
  R1: { 'src/i18n/strings.js': "export const STRINGS = { en: { 'notice.hearthLends': 'The Hearth lends you its fire. Hold R.' } };\n" },
});

const roots = [];
function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'first-night-landed-'));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}
afterAll(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });

const landedIn = async (root, units) => {
  const reader = repoReader(root);
  const out = new Set();
  for (const u of units) if (await LANDED[u].probe(reader)) out.add(u);
  return out;
};

const owners = [...new Set(Object.values(AWAITS).flatMap(unitsOf))];

describe('the First Night record against the repo', () => {
  it('every unit that owns a red has a probe and a fixture piece', () => {
    expect(owners.filter((u) => !LANDED[u]), 'a unit that owns a red has no landing probe').toEqual([]);
    expect(Object.keys(LANDED).filter((u) => !PIECES[u]), 'a probe with no fixture to show it can see a landing').toEqual([]);
  });

  it('each probe sees its unit land, on a tree holding only that unit\'s piece, and nothing on an empty tree', async () => {
    const empty = repoReader(tree({}));
    for (const [unit, { probe, says }] of Object.entries(LANDED)) {
      expect(await probe(repoReader(tree(PIECES[unit]))), `${unit}'s probe (${says}) does not see its own piece`).toBe(true);
      expect(await probe(empty), `${unit}'s probe reads landed on an empty tree`).toBe(false);
    }
  });

  it('a module importing only isWarded from game/lights.js is not N8', async () => {
    const reader = repoReader(tree({ 'src/night/ward.js': "import { isWarded } from '../game/lights.js';\nexport const w = isWarded;\n" }));
    expect(await LANDED.N8.probe(reader)).toBe(false);
  });

  it('a landed unit\'s red fails the record (a tree where every owner landed)', async () => {
    const all = tree(Object.assign({}, ...owners.map((u) => PIECES[u])));
    const landed = await landedIn(all, owners);
    expect([...landed].sort(), 'the fixture tree did not read as every owner landed').toEqual([...owners].sort());
    const stale = staleReds(AWAITS, landed);
    const reds = Object.values(AWAITS).reduce((n, r) => n + r.length, 0);
    expect(stale.length, 'a landed unit\'s red did not fail the record').toBe(reds);
  });

  let landedHere;
  beforeAll(async () => { landedHere = await landedIn(APP, owners); });

  it('no listed red belongs to a unit that has landed in this tree', () => {
    const reds = Object.values(AWAITS).reduce((n, r) => n + r.length, 0);
    console.log(`first-night AWAITS: ${Object.keys(AWAITS).length} beats listed, ${reds} reds, ${owners.length} units probed, `
      + `${landedHere.size} landed${landedHere.size ? ` (${[...landedHere].join(' ')})` : ''}`);
    const stale = staleReds(AWAITS, landedHere);
    expect(stale.map((s) => s.why), 'the record names reds of a landed unit, or a beat with none').toEqual([]);
  });
});
