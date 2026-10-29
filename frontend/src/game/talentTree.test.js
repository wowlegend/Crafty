import { describe, it, expect } from 'vitest';
import { ASPECT_TREES, TALENT_LIMITS, talentNode, refundUnknownTalents, canUnlockTalent, talentBlockedBy, respecTalents } from './talentTree.js';
import { VERB_BASE } from './verbMods.js';
import { KEY_MAP } from './keyMap.js';

// THE TREES (DECISIONS 2026-10-28 W1-H item 6): every node changes a verb. A root unlocks its Aspect's verb (the one
// KEY_MAP gates on it) and needs no prerequisite; every other node carries one modifier in the verbMods vocabulary;
// two capstones per tree exclude each other.
const allNodes = ASPECT_TREES.flatMap((t) => t.nodes);
const VERB_TALENTS = KEY_MAP.filter((r) => r.verb).map((r) => r.talent);

describe('ASPECT_TREES shape', () => {
  it('has exactly 4 aspect trees with unique node ids, each prerequisite a real node', () => {
    expect(ASPECT_TREES.map((t) => t.aspect)).toEqual(['voidhand', 'wildheart', 'soulbind', 'elemancer']);
    const ids = allNodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const n of allNodes) if (n.prereq) expect(ids, `${n.id}'s prerequisite`).toContain(n.prereq);
    for (const n of allNodes) expect(TALENT_LIMITS[n.id]).toBe(n.limit);
  });

  it('roots are the four verb unlocks, need nothing, carry no modifier, and every other node changes a verb', () => {
    let roots = 0, mods = 0;
    for (const n of allNodes) {
      if (VERB_TALENTS.includes(n.id)) {
        roots++;
        expect(n.prereq, `${n.id} needs a prerequisite, so a level-2 player cannot take it`).toBeNull();
        expect(n.mod, `${n.id} is an unlock and also a modifier`).toBeUndefined();
        expect(n.limit).toBe(1);
      } else {
        mods++;
        expect(n.mod, `${n.id} changes no verb`).toBeTruthy();
        expect(Object.keys(VERB_BASE), `${n.id}'s key is not in the vocabulary`).toContain(n.mod.key);
        expect(n.mod.add, `${n.id} changes its verb by nothing`).toBeGreaterThan(0);
        expect('effect' in n, `${n.id} adds a stat`).toBe(false);
      }
    }
    expect(roots).toBe(4);
    expect(mods).toBe(allNodes.length - 4);
  });

  it('names the four changes the decision asks for: a longer roar, a second grab, a wider snare, an imbue that chains', () => {
    expect(talentNode('wildheart_endurance').mod.key).toBe('roarSec');
    expect(talentNode('voidhand_twin').mod).toEqual({ key: 'grabThrows', add: 1 });
    expect(talentNode('soulbind_wide').mod.key).toBe('snareArc');
    expect(talentNode('elemancer_chain').mod).toEqual({ key: 'imbueChain', add: 1 });
  });

  it('gives every tree exactly one pair of capstones, each excluding the other and sharing a prerequisite', () => {
    for (const tree of ASPECT_TREES) {
      const caps = tree.nodes.filter((n) => n.excludes);
      expect(caps.length, `${tree.aspect} capstones`).toBe(2);
      const [a, b] = caps;
      expect(a.excludes).toBe(b.id);
      expect(b.excludes).toBe(a.id);
      expect(a.prereq).toBe(b.prereq);
      expect(a.prereq, `${tree.aspect}'s capstones sit on its root`).not.toBe(tree.nodes[0].id);
    }
  });
});

describe('canUnlockTalent, exclusivity and respec', () => {
  it('takes a root at once, a modifier only after its root, and a capstone only while its rival is untaken', () => {
    expect(canUnlockTalent('wildheart_roar', {}, 1)).toBe(true);
    expect(canUnlockTalent('wildheart_endurance', {}, 1)).toBe(false);
    expect(canUnlockTalent('wildheart_endurance', { wildheart_roar: 1 }, 1)).toBe(true);
    expect(canUnlockTalent('wildheart_endurance', { wildheart_roar: 1, wildheart_endurance: 3 }, 1), 'over the limit').toBe(false);
    const built = { wildheart_roar: 1, wildheart_endurance: 1 };
    expect(canUnlockTalent('wildheart_apex', built, 1)).toBe(true);
    expect(canUnlockTalent('wildheart_apex', { ...built, wildheart_untamed: 1 }, 1)).toBe(false);
    expect(talentBlockedBy('wildheart_apex', { ...built, wildheart_untamed: 1 })).toBe('wildheart_untamed');
    expect(canUnlockTalent('wildheart_roar', {}, 0), 'no points').toBe(false);
    expect(canUnlockTalent('voidhand_force', {}, 5), 'a retired id').toBe(false);
  });

  it('respec returns every rank as a point', () => {
    expect(respecTalents({ wildheart_roar: 1, wildheart_endurance: 2 }, 3)).toEqual({ unlockedTalents: {}, talentPoints: 6 });
  });
});

describe('refundUnknownTalents (load)', () => {
  it('refunds retired ids, ranks over a limit, orphans of a missing prerequisite, and the later of two rival capstones', () => {
    const r = refundUnknownTalents({
      voidhand_force: 2, // retired
      wildheart_roar: 1, wildheart_endurance: 5, // 2 over the limit of 3
      elemancer_chain: 1, // its root elemancer_imbue is not held
      soulbind_snare: 1, soulbind_wide: 1, soulbind_communion: 1, soulbind_bulwark: 1, // both rivals
    }, 1);
    expect(r.unlockedTalents).toEqual({ wildheart_roar: 1, wildheart_endurance: 3, soulbind_snare: 1, soulbind_wide: 1, soulbind_bulwark: 1 });
    expect(r.talentPoints).toBe(1 + 2 + 2 + 1 + 1);
  });

  it('takes a refunded root\'s whole branch with it', () => {
    const r = refundUnknownTalents({ wildheart_endurance: 2, wildheart_apex: 1 }, 0);
    expect(r.unlockedTalents).toEqual({});
    expect(r.talentPoints).toBe(3);
  });

  it('keeps a valid build unchanged', () => {
    const build = { voidhand_grasp: 1, voidhand_twin: 1, voidhand_singularity: 1, elemancer_imbue: 1, elemancer_chain: 2 };
    expect(refundUnknownTalents(build, 4)).toEqual({ unlockedTalents: build, talentPoints: 4 });
  });
});
