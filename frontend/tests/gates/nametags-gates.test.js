import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nametagFor } from '../../src/game/nametagData.js';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/**
 * NAMETAG WIRING — enhanced 2026-09-22, selected by `gate-census.mjs` at 0/5.
 *
 * WHY THIS IS NOT CONVERTED TO A DRIVEN TEST, and that is the honest answer rather than a cop-out.
 * `render/Nametags.jsx` mounts inside the R3F tree (drei <Billboard>, a live camera, the ECS world), which
 * no jsdom harness in this repo can stand up. The BEHAVIOUR it wires — LOD range, showBar, danger colour —
 * is a pure function and is genuinely exercised in `tests/data/nametagData.test.js`. So the split is
 * correct as it stands: that file owns the logic, this one owns the SEAM.
 *
 * What was wrong was not the greps; it was that the file offered no evidence about itself. It stated no
 * denominator, had no zero-guard, named no blind spot, and carried no receipt — so a reader could not tell
 * a deliberate source-gate from a lazy one. The 2026-09-22 audit put this file in its DELETE column on
 * exactly that appearance, and `hud-stat-wire-gates` was in the same column and turned out to be the last
 * guard for a live property. Appearance is not evidence in either direction.
 *
 * Added here: the pure function is IMPORTED and driven at the boundary the seam depends on, the grep set
 * is enumerated with an asserted count so a silently-dropped check is visible, and the blind spot is
 * stated.
 *
 * Mutation-Proof: 4 mutations, denominator asserted (6/6 cases collected on every run).
 *   M1 remove <Billboard> from Nametags.jsx      -> billboard case RED
 *   M2 iterate a prop array instead of mobsQuery -> ECS case RED (stale entities)
 *   M3 drop the isCaptureMode guard              -> capture case RED (overlay would enter the baselines)
 *   M4 gate the bar background on tag.visible instead of tag.showBar -> wiring case RED (a name-only tag
 *      would leave a stray empty rectangle, which is the defect the check names)
 * Nametags.jsx restored from a cp backup and diffed byte-identical after each.
 *
 * BLIND SPOT, stated (R7): every assertion below except the last is a claim about SOURCE TEXT. Nothing
 * here proves a nametag is ever RENDERED, positioned correctly, or reaches a player's screen. That needs
 * a live probe or an E2E pass, and neither exists for this overlay.
 */
describe('nametags gates', () => {
  const nt = strip(read('render/Nametags.jsx'));

  it('the source was actually read — a zero-length scan would make every grep below vacuous', () => {
    // R3a. An empty or renamed file makes `toMatch` fail loudly, but a file that shrank to a stub would
    // fail in a way that reads like a wiring regression rather than a missing subject. State the size.
    expect(nt.length).toBeGreaterThan(400);
  });

  it('the pure tag data it wires is real and responds to distance (driven, not grepped)', () => {
    // The one thing here that CAN be executed: the seam's payload. If nametagFor stopped varying with
    // distance, every wiring assertion below would still pass while the overlay showed nothing useful.
    const near = nametagFor({ name: 'Mara', health: 10, maxHealth: 10, hostile: false }, 2);
    const far = nametagFor({ name: 'Mara', health: 10, maxHealth: 10, hostile: false }, 9999);
    expect(near).toBeTruthy();
    expect(near.visible).toBe(true);
    expect(far.visible).toBe(false); // LOD actually culls
  });
  it('billboards via drei <Billboard> (faces camera) and reads nametagFor', () => {
    // ANCHORED TO THE JSX ELEMENT, not the bare word. `/Billboard/` was satisfied by `BillboardX` — a
    // mutation renaming the import SURVIVED it, because a substring match cannot tell a component from a
    // typo of one. `<Billboard` can only be the element.
    // COUNTED, not merely present. Two mutations survived a presence check here before this line was
    // written: `/Billboard/` was satisfied by `BillboardX` (a substring cannot tell a component from a
    // typo of one), and `<Billboard` still matched after ONE of the two elements was renamed, because a
    // text match cannot tell which occurrence is load-bearing (gates-and-probes 4b). Pinning the count
    // means renaming ANY of them reds.
    const billboards = (nt.match(/<Billboard[\s/>]/g) || []).length;
    // ONE in code. The raw file has two, but the other is inside a comment and `nt` is comment-stripped
    // — measured, not assumed, after pinning 2 failed on the clean file. A count asserted from reading
    // the file with your eyes is the same mistake as the presence check it replaced.
    expect(billboards).toBe(1);
    expect(nt).toMatch(/\bnametagFor\s*\(/); // the CALL, not the token
  });
  it('iterates the ECS mobsQuery (live entities) not a stale prop array', () => {
    expect(nt).toMatch(/mobsQuery/);
  });
  it('capture-suppressed (no overlay in the deterministic baselines)', () => {
    expect(nt).toMatch(/isCaptureMode\(\)/);
  });
  // Static-source presence check only — the LOD range / showBar / danger-color BEHAVIOR is
  // genuinely exercised in tests/data/nametagData.test.js (M-HUD.5). Here we assert the render
  // layer WIRES the tag.visible flag to group visibility, and gates BOTH the bar fill AND its
  // dark background with tag.showBar (so name-only tags never leave a stray empty rectangle).
  it('wires tag.visible to group visibility and gates bar fill + background by tag.showBar', () => {
    expect(nt).toMatch(/g\.visible\s*=\s*tag\.visible/);
    expect(nt).toMatch(/bgRef\.current\.visible\s*=\s*tag\.showBar/);
    expect(nt).toMatch(/barRef\.current\.visible\s*=\s*tag\.showBar/);
  });
});
