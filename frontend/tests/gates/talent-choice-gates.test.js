import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SRC, strip } from './_srcWalk.js';
import {
  ASPECT_TREES, TALENT_LIMITS, foldTalentEffects,
  canUnlockTalent, talentBlockedBy, respecTalents,
} from '../../src/game/talentTree.js';
import { useGameStore } from '../../src/store/useGameStore';

const NODES = ASPECT_TREES.flatMap((t) => t.nodes);

/**
 * C4/Q24 — the tree is a CHOICE now, and the store is the authority on what may be taken.
 *
 * The stated problem in one sentence: *with 18 nodes that all add a number, there is no build to
 * choose, so there is no build to come back and try differently.* Fifteen of eighteen added a flat stat,
 * there were no capstones, no mutually exclusive picks and no respec, and the tree drained by L18.
 *
 * TWO MECHANISMS, both one field or one function: `excludes` on a node, and a respec that refunds. The
 * capstones are ADDITIVE — new nodes behind existing prereqs — because making two existing nodes
 * exclusive would silently remove power from every saved character, which is a balance change wearing
 * a mechanism's clothes.
 *
 * AND A HOLE FOUND WHILE WIRING IT. `spendTalentPoint` checked points and limit and NEVER `prereq`, so
 * the tree's own shape was advisory — held up by whatever the panel chose to grey out, with the store,
 * which is the authority, happily ranking a gated node. `tests/store/progressionXp.test.js` had a case
 * that spent nine points into `voidhand_crush` with its prereq untaken and expected 2 ranks: it passed
 * BECAUSE the bug existed. Both are fixed here and there.
 *
 * BLIND SPOT, stated (R7): nothing here renders the talent panel or clicks anything. Whether the UI
 * greys out an excluded node, or offers the respec at all, is unchecked — the store refusing the spend
 * is the invariant, and a panel that lets you click a dead button is a separate (milder) defect.
 *
 * Mutation-Proof: 5 mutations, recorded on the commit.
 */
describe('C4 the talent tree is a choice', () => {
  beforeEach(() => {
    useGameStore.setState({ unlockedTalents: {}, talentPoints: 20, level: 10 });
  });

  it('every node id is unique and every limit is a positive integer', () => {
    // R3a: the sweeps below quantify over NODES. An empty or duplicated table makes them vacuous.
    expect(NODES.length).toBeGreaterThanOrEqual(26);
    expect(new Set(NODES.map((n) => n.id)).size).toBe(NODES.length);
    for (const n of NODES) expect(Number.isInteger(n.limit) && n.limit > 0, `${n.id} has a bad limit`).toBe(true);
    expect(Object.keys(TALENT_LIMITS).length).toBe(NODES.length);
  });

  it('EXCLUSIVITY IS SYMMETRIC — a one-way exclude is a node you can sneak past by ordering', () => {
    // The failure this prevents: A excludes B but B does not exclude A, so taking B first then A gets
    // you both. Swept over the whole table rather than checked on the pair I happened to write.
    let pairs = 0;
    for (const n of NODES) {
      if (!n.excludes) continue;
      const rival = NODES.find((m) => m.id === n.excludes);
      expect(rival, `${n.id} excludes '${n.excludes}', which is not a node`).toBeTruthy();
      expect(rival.excludes, `${rival.id} does not exclude ${n.id} back — take them in the other order and you get both`)
        .toBe(n.id);
      pairs++;
    }
    expect(pairs, 'no exclusive nodes exist — the tree has no choice in it').toBeGreaterThanOrEqual(8);
  });

  it('an exclusive rival becomes UNTAKEABLE once its pair is ranked, in the store', () => {
    // Driven through the real action, not the pure predicate: the predicate is worth nothing if
    // spendTalentPoint does not consult it.
    const s = () => useGameStore.getState();
    s().spendTalentPoint('voidhand_force');
    s().spendTalentPoint('voidhand_crush');
    s().spendTalentPoint('voidhand_singularity');
    expect(s().unlockedTalents.voidhand_singularity, 'the capstone could not be taken at all').toBe(1);
    const pointsBefore = s().talentPoints;
    s().spendTalentPoint('voidhand_horizon');
    expect(s().unlockedTalents.voidhand_horizon, 'both halves of an either/or were taken').toBeUndefined();
    expect(s().talentPoints, 'a refused spend still consumed a point').toBe(pointsBefore);
  });

  it('the STORE refuses a node whose prereq is untaken — it used to allow it', () => {
    const s = () => useGameStore.getState();
    s().spendTalentPoint('voidhand_crush');
    expect(s().unlockedTalents.voidhand_crush, 'a gated node was ranked with no prereq').toBeUndefined();
    expect(s().talentPoints).toBe(20);
  });

  it('RESPEC refunds every rank and the derived caps FALL — never a free heal', () => {
    const s = () => useGameStore.getState();
    s().spendTalentPoint('voidhand_force');
    s().spendTalentPoint('voidhand_ward');
    const spent = 20 - s().talentPoints;
    expect(spent).toBe(2);
    const maxBefore = s().maxHealth;
    s().respecTalentPoints();
    expect(s().unlockedTalents, 'respec left ranks behind').toEqual({});
    expect(s().talentPoints, 'respec did not refund every point').toBe(20);
    expect(s().maxHealth, 'the caps did not fall when the stat talents went').toBeLessThanOrEqual(maxBefore);
    expect(s().playerHealth, 'a respec healed the player past the new cap').toBeLessThanOrEqual(s().maxHealth);
  });

  it('capstones FOLD through the stat pipeline — no dead config', () => {
    // An effect-less capstone would need a call site, and a table entry nothing reads is dead config
    // that looks like a feature. Every exclusive node must carry a real effect.
    for (const n of NODES.filter((x) => x.excludes)) {
      expect(n.effect, `${n.id} is exclusive but has no effect — it would do nothing when taken`).toBeTruthy();
      const folded = foldTalentEffects({ strength: 0, agility: 0, intellect: 0, armor: 0 }, { [n.id]: 1 });
      expect(folded[n.effect.stat], `${n.id} folds to nothing`).toBe(n.effect.perRank);
    }
  });

  it('the pure predicate and the store agree — one authority, not two', () => {
    expect(canUnlockTalent('voidhand_crush', {}, 5), 'prereq untaken must be refused').toBe(false);
    expect(canUnlockTalent('voidhand_force', {}, 0), 'no points must be refused').toBe(false);
    expect(canUnlockTalent('voidhand_force', {}, 5)).toBe(true);
    expect(talentBlockedBy('voidhand_horizon', { voidhand_singularity: 1 })).toBe('voidhand_singularity');
    expect(talentBlockedBy('voidhand_force', { voidhand_singularity: 1 })).toBe(null);
    expect(respecTalents({ a: 2, b: 1 }, 3)).toEqual({ unlockedTalents: {}, talentPoints: 6 });
  });

  it('the store CONSULTS the shared predicate rather than re-deriving the rules', () => {
    const st = strip(readFileSync(resolve(SRC, 'store/useGameStore.jsx'), 'utf8'));
    expect(st, 'spendTalentPoint no longer calls the shared authority').toMatch(/canUnlockTalent\(talentId/);
    expect(st, 'the store re-derives the limit itself again — two authorities drift')
      .not.toMatch(/const limit = TALENT_LIMITS\[talentId\]/);
  });
});

/**
 * THE WIRING HALF — added after the store action shipped with NO CALLER.
 *
 * `respecTalentPoints` went in one commit with a docblock warning that a table entry nothing reads is
 * dead config, and it had zero call sites: the exact mistake, one commit after writing the warning, for
 * the third time in a session. This asserts the panel reaches it.
 *
 * It also asserts the panel asks the SHARED predicate. The panel used to re-derive the unlock rules
 * itself, which is precisely how the store's missing `prereq` check survived: the UI greyed the node
 * out, so no one could reach the hole by clicking, and the authority stayed wrong while every visible
 * symptom was absent. Two implementations of one rule is one that can drift, and here the drift was
 * invisible BY CONSTRUCTION.
 *
 * BLIND SPOT (R7): source assertions. Nothing renders the panel or clicks the button — that the control
 * is reachable, enabled at the right time, and legible is unchecked.
 */
describe('C4 the respec and the exclusion are REACHABLE, not just implemented', () => {
  const panel = strip(readFileSync(resolve(SRC, 'ui/SpellUpgradePanel.jsx'), 'utf8'));

  it('the panel was read as code', () => {
    expect(panel.length).toBeGreaterThan(2000);
  });

  it('the respec action has a CALL SITE — it shipped with none', () => {
    expect(panel, 'the panel does not read the respec action').toMatch(/state\.respecTalentPoints/);
    expect(panel, 'the respec action is read but never invoked').toMatch(/respecTalentPoints\(\)/);
  });

  it('the panel asks the SHARED predicate instead of re-deriving the rules', () => {
    expect(panel, 'the panel no longer consults canUnlockTalent').toMatch(/canUnlockTalent\(node\.id/);
    expect(panel, 'the panel re-derives the spend rule itself again — two authorities drift')
      .not.toMatch(/canUpgrade = talentPoints > 0 && isPrereqMet/);
  });

  it('an excluded node SAYS why it is closed', () => {
    // A disabled control with no reason reads as a bug, and the choice IS the feature.
    expect(panel, 'the exclusion is computed but never shown').toMatch(/talentBlockedBy\(node\.id/);
    expect(panel).toMatch(/talent\.excludedBy/);
  });
});
