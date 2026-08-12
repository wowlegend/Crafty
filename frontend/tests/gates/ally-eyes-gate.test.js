import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasHostileEyes } from '../../src/game/mobFeatures.js';
import { MOB_TYPES } from '../../src/game/mobTypes.js';

const HERE = dirname(fileURLToPath(import.meta.url));

// W1 — A BOUND ALLY MUST NOT STARE AT YOU WITH HOSTILE RED EYES.
//
// The rule is a boolean over THREE fields: not passive, not a villager, not an ally. The gate that
// guarded it grepped MobModel.jsx for the token `!entity.isAlly` appearing ANYWHERE in the file — which
// the ally-attack branch 166 lines above the eyes satisfies on its own, and which is silent about the
// other two terms, about the operator joining them, and about whether the expression is even the one
// wired to the eyes. A grep for one term of a conjunction cannot verify the conjunction.
//
// The predicate now lives in game/mobFeatures.js, so it can be run rather than read, and the truth table
// below is exhaustive over the three inputs.
describe('W1 — hostile eyes, as a truth table rather than a token search', () => {
  it('a soulbound ally NEVER has hostile eyes, whatever it used to be', () => {
    // The regression this gate exists for. A captured Husk is still a non-passive non-villager.
    for (const type of ['zombie', 'skeleton', 'spider', 'moss_brute', 'duskhound', 'emberhusk', 'skitterling']) {
      expect(hasHostileEyes({ type, isAlly: true }, MOB_TYPES[type]), `a bound ${type} is red-eyed`).toBe(false);
    }
  });

  it('an ordinary hostile DOES have them — the presence case, so the rule above is not vacuous', () => {
    // Without this, a predicate hardwired to `false` passes every assertion in the block above.
    for (const type of ['zombie', 'skeleton', 'spider', 'moss_brute', 'duskhound', 'emberhusk', 'skitterling']) {
      expect(hasHostileEyes({ type, isAlly: false }, MOB_TYPES[type]), `${type} lost its hostile eyes`).toBe(true);
    }
  });

  it('passive livestock never has them, ally or not', () => {
    for (const type of ['pig', 'cow']) {
      expect(MOB_TYPES[type].passive, `${type} is no longer passive — this case is testing nothing`).toBe(true);
      expect(hasHostileEyes({ type, isAlly: false }, MOB_TYPES[type])).toBe(false);
      expect(hasHostileEyes({ type, isAlly: true }, MOB_TYPES[type])).toBe(false);
    }
  });

  it('the villager carve-out survives independently of the passive flag', () => {
    // Villagers are passive AND named, so the real config cannot tell the two terms apart. Feeding a
    // non-passive config with type 'villager' isolates the term the passive flag would otherwise mask —
    // which is exactly the kind of overlap a conjunction hides and a single-token grep cannot see.
    expect(hasHostileEyes({ type: 'villager', isAlly: false }, { passive: false })).toBe(false);
    expect(hasHostileEyes({ type: 'villager', isAlly: false }, MOB_TYPES.villager)).toBe(false);
  });

  it('every term is load-bearing: flipping any one of the three flips the answer', () => {
    // A conjunction where one term is dead reads correctly and guards nothing. This pins all three.
    const hostile = { entity: { type: 'zombie', isAlly: false }, cfg: { passive: false } };
    expect(hasHostileEyes(hostile.entity, hostile.cfg)).toBe(true);
    expect(hasHostileEyes({ ...hostile.entity, isAlly: true }, hostile.cfg), 'the isAlly term is dead').toBe(false);
    expect(hasHostileEyes({ ...hostile.entity, type: 'villager' }, hostile.cfg), 'the villager term is dead').toBe(false);
    expect(hasHostileEyes(hostile.entity, { passive: true }), 'the passive term is dead').toBe(false);
  });

  it('a missing entity or config renders no eyes rather than throwing', () => {
    expect(hasHostileEyes(null, { passive: false })).toBe(false);
    expect(hasHostileEyes({ type: 'zombie' }, null)).toBe(false);
  });

  it('the renderer calls the predicate, and the red eye mesh is still there', () => {
    // The one edge a pure test cannot reach: that MobModel actually consults this rather than keeping a
    // second inline copy. Anchored to the call form, not a bare token — and the colour assertion stays
    // because "no eyes anywhere" would satisfy every behavioural assertion above.
    const src = readFileSync(resolve(HERE, '../../src/render/MobModel.jsx'), 'utf8');
    expect(src, 'MobModel no longer calls hasHostileEyes — it has its own copy of the rule').toMatch(
      /\{hasHostileEyes\(entity,\s*mobConfig\)\s*&&/,
    );
    expect(src, 'the red eye meshes were deleted wholesale').toContain('#ff0000');
  });
});
