import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SRC, strip, carriersOf } from './_srcWalk.js';

const read = (rel) => strip(readFileSync(resolve(SRC, rel), 'utf8'));

/**
 * RadialMinimap — the circular compass HUD. What it plots, and what it must not look like.
 *
 * REWRITTEN 2026-09-22, selected by `gate-census.mjs` at 0/5. Every assertion was a bare-token grep over
 * the component read WITHOUT stripping comments, which in this corpus has now been shown four times to
 * mean a gate can be satisfied by the prose describing the thing it guards. The loosest was
 * `/borderRadius|rounded-full|clip/` — three alternatives, any one of which appears in almost any styled
 * component, standing in for "it is a circle".
 *
 * A canvas HUD is not drivable here: `RadialMinimap` draws with 2D canvas calls inside an R3F-adjacent
 * React tree, and jsdom has no canvas. So these stay source assertions — but anchored to the call FORM
 * and read from CODE, and the brand exclusions are repo-wide, since an off-brand font coming back does
 * so wherever someone is working.
 *
 * BLIND SPOT, stated (R7), and it is the whole of the visual claim: nothing here renders a pixel. That
 * the minimap is ROUND, that blips land in the right place, that the colours are legible — none of it is
 * checked by anything in this repo, and the visual capture gate's cameras cannot resolve a HUD detail
 * either. What is proven is that the code still reads the stores it plots from and still excludes the
 * off-brand font.
 *
 * Mutation-Proof: 4 mutations, recorded on the commit.
 */
describe('radial-minimap gates', () => {
  const mm = read('ui/RadialMinimap.jsx');

  it('the component was read as CODE — every negative assertion below depends on it', () => {
    // R3a: `not.toMatch` over an empty read passes, and two cases here are exclusions.
    expect(mm.length, 'RadialMinimap.jsx read as empty — the exclusions below are vacuous')
      .toBeGreaterThan(1500);
  });

  it('it plots from the live store mirrors, not from a snapshot it owns', () => {
    // The minimap is a VIEW. If it kept its own copy of entity positions it would drift from the world
    // silently, which on a compass reads as the world being wrong rather than the HUD.
    // Anchored to the READ SHAPE, not the bare token: the token also appears in this component's own
    // header comment, and a gate satisfied by its own documentation is the defect this corpus keeps
    // shipping. `getState().<store>` is the live read — a snapshot held in a ref would not match.
    expect(mm, 'the minimap no longer reads mobEntities live — mob blips go blank or go stale')
      .toMatch(/getState\(\)\.mobEntities/);
    expect(mm, 'the minimap no longer reads npcEntities live — the gold NPC blips go blank')
      .toMatch(/getState\(\)\.npcEntities/);
  });

  it('it plots the three destination classes a player navigates by', () => {
    expect(mm, 'the HOME/shrine landmark blip is gone — the compass loses its anchor')
      .toMatch(/nearestLandmark/);
    expect(mm, 'the Blight Heart blip is gone — the win condition is unfindable')
      .toMatch(/blightHeartSite/);
  });

  it('the off-brand Orbitron font stays out of ALL of src/, not just this file', () => {
    // W2/Art lock. Scoped to one file before; a font comes back wherever someone is styling, and the
    // design language is a repo-wide claim.
    expect(carriersOf(/Orbitron/), 'the off-brand font is back — the bold-flat art direction is LOCKED')
      .toEqual([]);
  });

  it('HUD mounts the radial minimap, and the legacy square one is gone from src entirely', () => {
    expect(read('HUD.jsx'), 'the HUD no longer mounts RadialMinimap').toMatch(/<RadialMinimap\b/);
    // The old gate checked only that the NEW name appears. Both could coexist — two minimaps, or the
    // legacy one still mounted somewhere else — and it would have passed.
    expect(carriersOf(/<Minimap\b/), 'the legacy square Minimap is mounted somewhere again').toEqual([]);
  });
});
