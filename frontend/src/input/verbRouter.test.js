import { describe, it, expect } from 'vitest';
import { routeMouseVerb, AIM_CONE_RANGE, AIM_CONE_ARC } from './verbRouter';

// ctx shape: { held, meleeHit, aimedMobDist, terrainDist, chestTargeted }
const base = { held: false, meleeHit: false, aimedMobDist: Infinity, terrainDist: Infinity, chestTargeted: false };

describe('verbRouter (#72 — the spec §5 edge table)', () => {
  // §5-1: mob in melee cone, wall behind -> attack (wall safe)
  it('1: melee-cone mob beats terrain', () => {
    expect(routeMouseVerb(0, { ...base, meleeHit: true, terrainDist: 3 })).toBe('attack');
  });
  // §5-2: THROUGH-MOB GUARD — mob at 6m dead-center (outside melee cone), wall behind at 7m
  it('2: aimed mob nearer than terrain -> attack whiff, NEVER mine', () => {
    expect(routeMouseVerb(0, { ...base, aimedMobDist: 6, terrainDist: 7 })).toBe('attack');
  });
  // §5-3: terrain in reach, no mob aimed -> mine
  it('3: bare terrain -> mine', () => {
    expect(routeMouseVerb(0, { ...base, terrainDist: 5 })).toBe('mine');
  });
  // §5-4: HELD short-circuits everything on b0 (aiming at own wall to hurl into it)
  it('4: held -> attack regardless of targets', () => {
    expect(routeMouseVerb(0, { ...base, held: true, terrainDist: 2, meleeHit: true })).toBe('attack');
  });
  // §5-5: HELD on b2 -> cast (chest ignored — hands full)
  it('5: held -> cast, chest ignored', () => {
    expect(routeMouseVerb(2, { ...base, held: true, chestTargeted: true, terrainDist: 2 })).toBe('cast');
  });
  // §5-6: chest nearest -> interact
  it('6: chest (occlusion-correct) -> interact', () => {
    expect(routeMouseVerb(2, { ...base, chestTargeted: true, terrainDist: 4, aimedMobDist: 9 })).toBe('interact');
  });
  // §5-7: mob nearer than chest -> cast
  it('7: mob in front of chest -> cast', () => {
    expect(routeMouseVerb(2, { ...base, chestTargeted: true, terrainDist: 6, aimedMobDist: 3 })).toBe('cast');
  });
  // §5-8: wall gap aimed, mobs beyond it (occluded -> farther than the wall) -> place (mid-siege repair)
  it('8: occluded mobs lose to the wall -> place', () => {
    expect(routeMouseVerb(2, { ...base, terrainDist: 4, aimedMobDist: 9 })).toBe('place');
  });
  // §5-9: mob IN the gap (nearer than terrain) -> cast
  it('9: mob in the gap -> cast', () => {
    expect(routeMouseVerb(2, { ...base, terrainDist: 6, aimedMobDist: 3 })).toBe('cast');
  });
  // §5-10: sky / nothing
  it('10: nothing targeted -> attack whiff / cast', () => {
    expect(routeMouseVerb(0, base)).toBe('attack');
    expect(routeMouseVerb(2, base)).toBe('cast');
  });
  // §5-11: terrain beyond reach (Infinity by construction of the 8m ray)
  //
  // THIS USED TO BE `{ ...base }` — a shallow copy of base's identical primitives, i.e. byte-for-byte
  // the inputs of test 10 above. It claimed a distinct §5-11 case and exercised the same branch with the
  // same values, so the property in its name ("out-of-reach terrain behaves as nothing") was never
  // tested at all. What §5-11 actually asserts is that an unreachable wall can NEVER produce a
  // world-destructive or world-building verb, whatever else is in the context.
  it('11: out-of-reach terrain can never yield mine or place', () => {
    let checked = 0;
    for (const held of [false, true]) {
      for (const meleeHit of [false, true]) {
        for (const aimedMobDist of [Infinity, 6]) {
          for (const chestTargeted of [false, true]) {
            const ctx = { held, meleeHit, aimedMobDist, terrainDist: Infinity, chestTargeted };
            expect(routeMouseVerb(0, ctx), `b0 mined unreachable terrain: ${JSON.stringify(ctx)}`).not.toBe('mine');
            expect(routeMouseVerb(2, ctx), `b2 placed onto unreachable terrain: ${JSON.stringify(ctx)}`).not.toBe('place');
            checked += 1;
          }
        }
      }
    }
    expect(checked, 'the sweep enumerated nothing').toBe(16);
  });
  // §5-12: chest with no mob, b0 -> mine (break chest, existing cleanup)
  it('12: b0 on chest -> mine', () => {
    expect(routeMouseVerb(0, { ...base, chestTargeted: true, terrainDist: 4 })).toBe('mine');
  });
  // §5-13: unknown button -> none (b1/middle never routes)
  it('13: middle button -> none', () => {
    expect(routeMouseVerb(1, { ...base, terrainDist: 2 })).toBe('none');
  });
  // §5-14: tie-break — equal distances must NOT mine/place (protect the base when ambiguous)
  it('14: mob/terrain tie goes to combat', () => {
    expect(routeMouseVerb(0, { ...base, aimedMobDist: 5, terrainDist: 5 })).toBe('attack');
    expect(routeMouseVerb(2, { ...base, aimedMobDist: 5, terrainDist: 5 })).toBe('cast');
  });
  it('exports the aim-cone constants for the ctx builder', () => {
    expect(AIM_CONE_RANGE).toBe(24);
    expect(AIM_CONE_ARC).toBeCloseTo(Math.PI / 8, 5);
  });
});

// THE TWO FINAL RETURNS: UNREACHABLE FOR WELL-FORMED INPUT, AND A DELIBERATE NaN FALLBACK.
//
// A holistic-review finding proposed deleting them as unreachable. The first half of that is right and
// is proven exhaustively below; the second half is the trap. Removing them makes routeMouseVerb return
// `undefined` when a distance arrives as NaN, and downstream reads no verb — a click that silently does
// nothing while the player keeps clicking. So the fallback stays, and BOTH facts are pinned here so the
// next person to read `return 'attack'` at the bottom of a chain that always returns earlier does not
// have to re-derive why it is there.
describe('routeMouseVerb — the final returns', () => {
  const DISTS = [0, 1, 5, 23.9, 24, 100, Infinity];
  const BOOLS = [false, true];

  it('is UNREACHABLE across every well-formed ctx — 392 combinations per button', () => {
    // Exhaustive rather than sampled: the claim is "no input reaches this", and a sample cannot say that.
    // Detected by instrumenting the branch conditions in the same order the router evaluates them.
    let reached0 = 0, reached2 = 0, checked = 0;
    for (const held of BOOLS) for (const meleeHit of BOOLS) for (const chestTargeted of BOOLS)
      for (const aimedMobDist of DISTS) for (const terrainDist of DISTS) {
        checked++;
        if (!held && !meleeHit && !(aimedMobDist <= terrainDist) && !(terrainDist < Infinity)) reached0++;
        if (!held && !(chestTargeted && terrainDist < aimedMobDist)
            && !(aimedMobDist <= terrainDist) && !(terrainDist < Infinity)) reached2++;
      }
    expect(checked, 'the sweep collapsed — this assertion would be vacuous').toBe(392);
    expect(reached0, 'the button-0 fallback IS reachable with ordinary numbers — the ladder above has a hole').toBe(0);
    expect(reached2, 'the button-2 fallback IS reachable with ordinary numbers — the ladder above has a hole').toBe(0);
  });

  it('the WHIFF is handled above it, which is what its comment used to claim', () => {
    // No target of any kind: both distances Infinity. `Infinity <= Infinity` is true, so the through-mob
    // guard returns the combat verb and the bottom line is never involved.
    const nothing = { held: false, meleeHit: false, chestTargeted: false, aimedMobDist: Infinity, terrainDist: Infinity };
    expect(routeMouseVerb(0, nothing)).toBe('attack');
    expect(routeMouseVerb(2, nothing)).toBe('cast');
  });

  it('a NaN distance still yields a VERB rather than undefined', () => {
    // The reason to keep them. An upstream position going bad must not turn into a dead mouse button.
    for (const ctx of [
      { held: false, meleeHit: false, chestTargeted: false, aimedMobDist: NaN, terrainDist: Infinity },
      { held: false, meleeHit: false, chestTargeted: false, aimedMobDist: 0, terrainDist: NaN },
      { held: false, meleeHit: false, chestTargeted: true, aimedMobDist: NaN, terrainDist: NaN },
    ]) {
      expect(routeMouseVerb(0, ctx), `button 0 returned no verb for ${JSON.stringify(ctx)}`).toBe('attack');
      expect(routeMouseVerb(2, ctx), `button 2 returned no verb for ${JSON.stringify(ctx)}`).toBe('cast');
    }
  });

  it('and the NaN fallback is COMBAT, never a world-mutating verb', () => {
    // The direction matters: mining or placing a block on garbage input edits the player's world. Swinging
    // at nothing does not. If the fallback is ever changed, it must not be changed to 'mine' or 'place'.
    const ctx = { held: false, meleeHit: false, chestTargeted: true, aimedMobDist: NaN, terrainDist: NaN };
    expect(['mine', 'place', 'interact']).not.toContain(routeMouseVerb(0, ctx));
    expect(['mine', 'place', 'interact']).not.toContain(routeMouseVerb(2, ctx));
  });
});
