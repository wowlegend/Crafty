import { describe, it, expect } from 'vitest';
import { drawnFeatures } from './eliteLook.js';
import { featureColor, mobFeatures } from '../game/mobFeatures.js';
import { MOB_TYPES } from '../game/mobTypes.js';

// ELITES YOU CAN SEE ON EVERY TIER (encounters-siege plan Move E; W3-A PR A F5). An ember-touched elite wears a
// three-box ember crest above its head; the siege captain adds a two-box banner on its back. The boxes are mobFeatures'
// vocabulary ({ pos, box, tone }), so MobModel draws them as features, and each is marked `elite` so it casts no shadow
// (each would otherwise add a shadow-map draw). Heights are derived from the dims, never baked: two types are run.
// Whether the crest clears each type's own features and the nametag is tests/gates/elite-clearance-gates.test.js.
//
// Mutation-Proof: via scripts/dev/mutate.sh against these 5 tests, each observed RED, an identity mutant SURVIVED:
//   K7b the banner in front of the body -> "the captain adds a two-box banner behind the body"
//   K7c featureColor('ember') falls back to the body colour -> "the ember tone"
//   K7d the crest not sized to the head -> "the crest is sized to the head"
// (K7a, the crest at a fixed height, now survives here, on two heads 0.2 m apart; elite-clearance-gates reds it, K10i.)

const dimsOf = (type) => {
  const [bodyW, bodyH, bodyD] = MOB_TYPES[type].bodySize;
  const [headW, headH, headD] = MOB_TYPES[type].headSize;
  return { bodyW, bodyH, bodyD, headW, headH, headD };
};
const TYPES = ['zombie', 'skeleton'];

describe('drawnFeatures: the crest and the banner', () => {
  it('ember gives three crest boxes, all above the head top, all ember, none casting a shadow', () => {
    for (const type of TYPES) {
      const d = dimsOf(type);
      const f = drawnFeatures(type, 'ember', d).filter((b) => b.elite);
      expect(f).toHaveLength(3);
      for (const b of f) {
        expect(b.pos[1] - b.box[1] / 2, JSON.stringify(b)).toBeGreaterThanOrEqual(d.bodyH + d.headH);
        expect(b.tone).toBe('ember');
      }
    }
  });

  it('the crest is sized to the head: the same shape on a 0.7 m and a 0.6 m head', () => {
    const shape = TYPES.map((type) => {
      const d = dimsOf(type);
      const c = drawnFeatures(type, 'ember', d).filter((b) => b.elite);
      const lo = Math.min(...c.map((b) => b.pos[0] - b.box[0] / 2)), hi = Math.max(...c.map((b) => b.pos[0] + b.box[0] / 2));
      const tall = Math.max(...c.map((b) => b.box[1]));
      return [(hi - lo) / d.headW, tall / d.headW];
    });
    expect(MOB_TYPES[TYPES[0]].headSize[0], 'two head widths').not.toBe(MOB_TYPES[TYPES[1]].headSize[0]);
    expect(shape[1][0]).toBeCloseTo(shape[0][0], 9);
    expect(shape[1][1]).toBeCloseTo(shape[0][1], 9);
  });

  it('the captain adds a two-box banner behind the body', () => {
    for (const type of TYPES) {
      const d = dimsOf(type);
      const f = drawnFeatures(type, 'captain', d).filter((b) => b.elite);
      expect(f).toHaveLength(5);
      const banner = f.slice(3);
      for (const b of banner) expect(b.pos[2], JSON.stringify(b)).toBeLessThan(-d.bodyD / 2);
    }
  });

  it('no rank, the type\'s own boxes only', () => {
    for (const type of TYPES) {
      const d = dimsOf(type);
      expect(drawnFeatures(type, null, d)).toEqual(mobFeatures(type, d));
      expect(drawnFeatures(type, undefined, d)).toEqual(mobFeatures(type, d));
    }
  });

  it('the ember tone is ember, whatever the body', () => {
    expect(featureColor('ember', '#228B22')).toBe('#FF7A2A');
    expect(featureColor('ember', '#4A3A50')).toBe('#FF7A2A');
  });
});
