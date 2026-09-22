import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// THE BOSS DAMAGE FLASH WAS COINCIDENCE-DRIVEN, NEVER HIT-DRIVEN.
//
// `isFlashing` was computed DURING RENDER from `flashTime.current`, and the only writer was a useEffect on
// the bossHealth prop. An effect runs AFTER the commit of the render its dependency triggered, and a ref
// write schedules nothing — so the hit's own render read the pre-effect 0, and useFrame decayed the timer
// back to zero inside 180ms with no render in between. Every consumer of the flash is a declarative prop,
// so a render is the only way it can reach the screen at all.
//
// It was not literally never visible: setEffects re-renders this component from useFrame on fireball and
// lava spawns, so a hit whose 180ms window happened to contain one DID flash. That is worse than invisible
// — it is a cue that fires on someone else's schedule.
//
// The fix is a membership transition, the pattern HurlSystem already uses for inFlight: setState on the
// rare event, never per frame. A boss hit is rare, so Game-Loop-Isolation holds.
const SRC = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'BossEntity.jsx'), 'utf8');

/*
 * ENHANCED 2026-09-22, selected by `gate-census.mjs` at 0/5. The assertions here were already sound —
 * slice-anchored, negative cases carrying their rationale — so nothing was rewritten. What was missing
 * was the evidence ABOUT them: no stated receipt, no stated blind spot, and no denominator.
 *
 * BLIND SPOT, stated (R7), and it is large: every case below reads `BossEntity.jsx` as TEXT. Nothing
 * renders the boss, nothing takes a hit, and nothing observes a pixel change. The bug this file exists
 * for was precisely a cue that did not reach the screen, so a source gate is structurally the wrong
 * shape for it — it is here because BossEntity is an R3F component and no harness in this repo drives
 * one. The honest statement is that the SHAPE of the fix is pinned, not the behaviour. A real check
 * would be a live probe that damages the boss and diffs the frame; that does not exist.
 *
 * Mutation-Proof: 4 mutations, recorded on the commit.
 */
describe('boss damage flash — a render actually happens', () => {
  it('the subject file was actually read — the source of every claim below', () => {
    // R3a: `not.toMatch` on an empty string passes. Two of the cases here are negative assertions, so a
    // failed read would report the defect as fixed.
    expect(SRC.length, 'BossEntity.jsx read as empty — every negative assertion below is vacuous')
      .toBeGreaterThan(2000);
    expect(SRC).toContain('isFlashing');
  });

  it('the flash is STATE, not a ref read during render', () => {
    expect(SRC).toMatch(/const \[isFlashing, setIsFlashing\] = useState\(false\)/);
    expect(
      /const isFlashing = flashTime\.current > 0/.test(SRC),
      'isFlashing is computed from a ref during render again — a ref write schedules nothing, so the hit that set it cannot show it'
    ).toBe(false);
  });

  it('the hit path SETS it, in the same effect that stamps the timer', () => {
    expect(SRC).toMatch(/if \(bossHealth < prevHealth\.current\) \{[\s\S]{0,200}setIsFlashing\(true\)/);
  });

  it('and the decay CLEARS it, or the flash latches until the next hit', () => {
    // The transition out is a membership change too. Setting true without ever setting false would turn a
    // 180ms cue into a permanent red boss — the opposite failure, and just as invisible in review.
    expect(SRC).toMatch(/flashTime\.current -= delta;[\s\S]{0,120}setIsFlashing\(false\)/);
  });

  it('does NOT set state every frame — the rule this fix is closest to breaking', () => {
    // Game-Loop-Isolation: an unconditional setState inside useFrame would re-render the boss at display
    // refresh. The clear must sit behind the `<= 0` edge, which is why the regex above requires it.
    const frameBlock = SRC.slice(SRC.indexOf('flashTime.current -= delta;'));
    const clearLine = frameBlock.slice(0, frameBlock.indexOf('\n', frameBlock.indexOf('setIsFlashing(false)')));
    expect(clearLine, 'the clear is not guarded by the timer reaching zero').toMatch(/if \(flashTime\.current <= 0\)/);
  });

  it('every flash consumer is still a declarative prop — the reason a render is required', () => {
    // If a future edit drives the material imperatively instead, this whole approach can be revisited.
    // Until then, no render means no flash, and that is the fact the fix rests on.
    expect(SRC).toMatch(/isFlashing \? "#ef4444"/);
    expect(SRC).toMatch(/emissiveIntensityVal = isFlashing \? 3\.0/);
  });
});
