import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SRC, strip } from './_srcWalk.js';
import { bossEmissiveIntensity, BOSS_EMISSIVE, BOSS_FLASH_EMISSIVE } from '../../src/render/characterStyle.js';

/**
 * B3/Q15 — emissive belongs on surfaces light passes THROUGH, not on armour plate.
 *
 * The boss torso is obsidian: `roughness={0.15} metalness={0.9}` on a `#111029` box. A phase-coloured
 * emissive at 0.8 → 2.2 flooded it, so the obsidian stopped being obsidian and the climax of the entire
 * run read as a flat purple box — cheaper-looking than the trash mobs.
 *
 * AND THE RATIO WAS INVERTED, which is the part a "turn it down" fix would have missed. The WINGS sat at
 * `emissiveIntensityVal * 0.4` — forty percent of the plate. The one surface on the model that should
 * carry a phase glow, because light through a membrane is exactly what that glow imitates, was dimmer
 * than the surface that should only have grazed. Turning the single value down would have dimmed the
 * wings too and left the relationship backwards.
 *
 * `bodyColor` is deliberately untouched. The obsidian was always right; lightening it to "fix the boss"
 * would have lost the one thing that already worked.
 *
 * BLIND SPOT, stated (R7), and it is the whole visual claim: these are NUMBERS and a source assertion.
 * Nothing here renders the boss. Whether obsidian now reads as heated stone rather than plastic is a
 * judgement about pixels that no test in this repo can make — the boss is R3F, jsdom cannot render it,
 * and the capture corpus has no boss state. This gate proves the RULE is applied and the ordering holds;
 * Kevin's eye is the judge of whether the ordering is right.
 *
 * Mutation-Proof: 4 mutations, recorded on the commit.
 */
describe('B3 boss emissive by surface kind', () => {
  it('the bands are non-empty and cover every phase', () => {
    // Exactly two kinds. There is deliberately no `eye` band: the boss eyes are a basic, untone-mapped
    // material, already the brightest thing on the model by construction. An entry for them would be a
    // table row nothing reads — and the first version of it was also wrong, sitting above the flash so a
    // hit would have DIMMED the eyes. Pinned as an exact set so it cannot creep back.
    expect(Object.keys(BOSS_EMISSIVE).sort()).toEqual(['membrane', 'plate']);
    for (const [kind, band] of Object.entries(BOSS_EMISSIVE)) {
      expect(band, `${kind} must have one value per boss phase`).toHaveLength(3);
    }
  });

  it('MEMBRANE outranks PLATE at every phase — the ordering that was backwards', () => {
    // The invariant, over all phases rather than a sampled one. Before this, plate 0.8-2.2 sat above
    // membrane 0.32-0.88, and no test could have noticed.
    let checked = 0;
    for (let phase = 0; phase < 3; phase++) {
      const plate = bossEmissiveIntensity('plate', phase);
      const membrane = bossEmissiveIntensity('membrane', phase);
      expect(membrane, `membrane must outglow plate at phase ${phase}`).toBeGreaterThan(plate);
      // And the plate must stay a SHEEN. Above ~0.5 on a metalness-0.9 surface it floods again, which
      // is the defect returning by retune rather than by revert.
      expect(plate, `the plate is flooding again at phase ${phase}`).toBeLessThan(0.5);
      checked++;
    }
    expect(checked).toBe(3);
  });

  it('every band ESCALATES with phase — the boss must visibly heat up', () => {
    for (const [kind, band] of Object.entries(BOSS_EMISSIVE)) {
      expect(band[1], `${kind} does not escalate into phase 1`).toBeGreaterThan(band[0]);
      expect(band[2], `${kind} does not escalate into phase 2`).toBeGreaterThan(band[1]);
    }
  });

  it('the damage FLASH dominates every surface, and every phase', () => {
    // Kind-independent on purpose: a flash that only lit some of the model stops reading as a hit.
    for (const kind of Object.keys(BOSS_EMISSIVE)) {
      for (let phase = 0; phase < 3; phase++) {
        expect(bossEmissiveIntensity(kind, phase, true)).toBe(BOSS_FLASH_EMISSIVE);
        expect(BOSS_FLASH_EMISSIVE).toBeGreaterThanOrEqual(bossEmissiveIntensity(kind, phase));
      }
    }
  });

  it('a nonsense phase or kind is CLAMPED, never undefined', () => {
    // An undefined emissiveIntensity silently becomes 1.0 in three.js — a wrong value that looks
    // plausible, which is worse than a crash.
    for (const p of [-1, 99, NaN, undefined, null]) {
      expect(Number.isFinite(bossEmissiveIntensity('plate', p))).toBe(true);
    }
    expect(bossEmissiveIntensity('not-a-kind', 0)).toBe(BOSS_EMISSIVE.plate[0]);
  });

  it('BossEntity applies the rule — plates and membranes read different values', () => {
    const b = strip(readFileSync(resolve(SRC, 'render/BossEntity.jsx'), 'utf8'));
    expect(b, 'the single flooding intensity is back').not.toMatch(/emissiveIntensityVal/);
    // COUNTED, not matched. There are two plate surfaces (torso, tail) and two membranes (both wings),
    // and `toMatch` passes if ANY ONE of them still reads the right band — so reverting a single plate
    // to the membrane value would have left this green. A mutation doing exactly that was refused by the
    // harness as a non-unique anchor, which is what prompted counting them.
    expect((b.match(/emissiveIntensity=\{plateEmissive\}/g) || []).length,
      'a plate surface stopped reading the plate band — that one is flooding again').toBe(2);
    expect((b.match(/emissiveIntensity=\{membraneEmissive\}/g) || []).length,
      'a wing stopped reading the membrane band').toBe(2);
    expect(b, 'the obsidian body colour was changed — it was never the problem').toMatch(/"#111029"/);
    expect(b, 'the eyes stopped being an unlit basic material — they would now blow out or be dimmable')
      .toMatch(/<meshBasicMaterial color=\{eyeColor\} toneMapped=\{false\} \/>/);
  });
});
