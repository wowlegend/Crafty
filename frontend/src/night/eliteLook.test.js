import { describe, it, expect } from 'vitest';
import { eliteFeatures } from './eliteLook.js';
import { featureColor } from '../game/mobFeatures.js';

// ELITES YOU CAN SEE ON EVERY TIER (encounters-siege plan Move E; W3-A PR A F5). An ember-touched elite wears a
// three-box ember crest above its head; the siege captain adds a two-box banner on its back. The boxes are mobFeatures'
// vocabulary ({ pos, box, tone }), so MobModel draws them as features, and each is marked `elite` so it casts no shadow
// (each would otherwise add a shadow-map draw). Heights are derived from the dims, never baked: two dims sets are run.
//
// Mutation-Proof: via scripts/dev/mutate.sh against these 4 tests, each observed RED, an identity mutant SURVIVED:
//   K7a the crest at a fixed height -> "ember gives three crest boxes"
//   K7b the banner in front of the body -> "the captain adds a two-box banner behind the body"
//   K7c featureColor('ember') falls back to the body colour -> "the ember tone"

const DIMS = [
  { bodyW: 0.8, bodyH: 1.6, bodyD: 0.5, headW: 0.7, headH: 0.7, headD: 0.7 },
  { bodyW: 1.6, bodyH: 2.0, bodyD: 1.0, headW: 0.9, headH: 0.8, headD: 0.9 },
];

describe('eliteFeatures: the crest and the banner', () => {
  it('ember gives three crest boxes, all above the head top, all ember, none casting a shadow', () => {
    for (const d of DIMS) {
      const f = eliteFeatures('ember', d);
      expect(f).toHaveLength(3);
      for (const b of f) {
        expect(b.pos[1] - b.box[1] / 2, JSON.stringify(b)).toBeGreaterThanOrEqual(d.bodyH + d.headH);
        expect(b.tone).toBe('ember');
        expect(b.elite).toBe(true);
      }
    }
  });

  it('the captain adds a two-box banner behind the body', () => {
    for (const d of DIMS) {
      const f = eliteFeatures('captain', d);
      expect(f).toHaveLength(5);
      const banner = f.slice(3);
      for (const b of banner) expect(b.pos[2], JSON.stringify(b)).toBeLessThan(-d.bodyD / 2);
      expect(banner.every((b) => b.elite)).toBe(true);
    }
  });

  it('no rank, no boxes', () => {
    expect(eliteFeatures(null, DIMS[0])).toEqual([]);
    expect(eliteFeatures(undefined, DIMS[0])).toEqual([]);
  });

  it('the ember tone is ember, whatever the body', () => {
    expect(featureColor('ember', '#228B22')).toBe('#FF7A2A');
    expect(featureColor('ember', '#4A3A50')).toBe('#FF7A2A');
  });
});
