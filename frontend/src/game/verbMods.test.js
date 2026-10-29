import { describe, it, expect } from 'vitest';
import { VERB_BASE, foldVerbMods } from './verbMods.js';
import { ASPECT_TREES } from './talentTree.js';
import { RELICS } from './relics.js';
import { FORM_DURATION_SEC, ENDURANCE_SEC_PER_RANK } from './beastTransform.js';
import { MAX_HOLD_SEC } from './voidhand.js';
import { SLAM_RADIUS } from './hurl.js';
import { BASE_SQUAD_CAP } from './soulbind.js';

// One vocabulary for talents and relics (DECISIONS 2026-10-28 W1-H item 6): the fold over no talent and no relic is the
// verbs as they played before, each node moves its own key by `add` a rank, and a relic moves its key once.
const NODES = ASPECT_TREES.flatMap((t) => t.nodes);

describe('foldVerbMods', () => {
  it('with nothing taken is each verb as it played before', () => {
    expect(foldVerbMods({}, null)).toEqual({
      roarSec: FORM_DURATION_SEC, beastMeleeMult: 1, grabThrows: 1, holdSec: MAX_HOLD_SEC, slamRadius: SLAM_RADIUS,
      snareArc: Math.PI / 8, snareHpFrac: 0.3, squadCap: BASE_SQUAD_CAP, imbueChain: 0, zoneRadiusMult: 1,
    });
    expect(foldVerbMods(undefined, undefined)).toEqual(VERB_BASE);
  });

  it('moves exactly the node\'s own key, by add for each rank up to the limit, for every modifier node', () => {
    let checked = 0;
    for (const n of NODES.filter((x) => x.mod)) {
      for (let rank = 1; rank <= n.limit + 1; rank++) {
        const out = foldVerbMods({ [n.id]: rank }, null);
        for (const key of Object.keys(VERB_BASE)) {
          const want = key === n.mod.key ? VERB_BASE[key] + n.mod.add * Math.min(rank, n.limit) : VERB_BASE[key];
          expect(out[key], `${n.id} at rank ${rank}, ${key}`).toBeCloseTo(want, 10);
        }
        checked++;
      }
    }
    expect(checked).toBe(NODES.filter((x) => x.mod).reduce((s, n) => s + n.limit + 1, 0));
  });

  it('a verb unlock changes no number', () => {
    expect(foldVerbMods({ wildheart_roar: 1, voidhand_grasp: 1, soulbind_snare: 1, elemancer_imbue: 1 }, null)).toEqual(VERB_BASE);
  });

  it('a longer roar: Primal Endurance adds its seconds per rank, and Untamed and Ember Fang add on top', () => {
    expect(foldVerbMods({ wildheart_roar: 1, wildheart_endurance: 1 }, null).roarSec).toBe(FORM_DURATION_SEC + ENDURANCE_SEC_PER_RANK);
    expect(foldVerbMods({ wildheart_endurance: 3, wildheart_untamed: 1 }, 'Ember Fang').roarSec)
      .toBe(FORM_DURATION_SEC + 3 * ENDURANCE_SEC_PER_RANK + 8 + 4);
  });

  it('every relic moves its own key once, in the same vocabulary, and stacks with a talent on the same key', () => {
    let checked = 0;
    for (const [name, relic] of Object.entries(RELICS)) {
      expect(Object.keys(VERB_BASE), `${name}'s key`).toContain(relic.mod.key);
      const out = foldVerbMods({}, name);
      expect(out[relic.mod.key], name).toBeCloseTo(VERB_BASE[relic.mod.key] + relic.mod.add, 10);
      checked++;
    }
    expect(checked).toBe(4);
    expect(foldVerbMods({ voidhand_twin: 1 }, 'Lodestone').grabThrows).toBe(3);
    expect(foldVerbMods({}, 'Not A Relic')).toEqual(VERB_BASE);
    expect(foldVerbMods({}, 'toString')).toEqual(VERB_BASE);
  });

  it('each relic changes its verb by the amount DECISIONS 2026-10-29 item 37 names', () => {
    // Pinned as data, so a relic that adds nothing or moves the wrong key fails here rather than in a playtest.
    expect(Object.fromEntries(Object.entries(RELICS).map(([name, r]) => [name, { verb: r.verb, ...r.mod }]))).toEqual({
      'Ember Fang': { verb: 'roar', key: 'roarSec', add: 4 },
      Lodestone: { verb: 'grab', key: 'grabThrows', add: 1 },
      'Snare Knot': { verb: 'snare', key: 'snareArc', add: Math.PI / 8 },
      'Prism Shard': { verb: 'imbue', key: 'imbueChain', add: 1 },
    });
    expect(foldVerbMods({}, 'Snare Knot').snareArc, 'Snare Knot does not double the cone').toBeCloseTo(2 * VERB_BASE.snareArc, 10);
    expect(foldVerbMods({ soulbind_snare: 1, soulbind_wide: 1 }, null).snareArc, 'Wide Snare does not double the cone').toBeCloseTo(2 * VERB_BASE.snareArc, 10);
  });

  it('ignores an unknown id and a junk rank', () => {
    expect(foldVerbMods({ voidhand_force: 3, wildheart_endurance: 'x', soulbind_wide: -2 }, null)).toEqual(VERB_BASE);
  });
});
