// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { SpellUpgradePanel } from '../../src/ui/SpellUpgradePanel.jsx';
import { useGameStore } from '../../src/store/useGameStore.jsx';

// The audit flagged "talent-tree spend never E2E'd". The SpellUpgradePanel renders one "Upgrade" button
// per unlockable talent node (gated by talentPoints + prereq + rank-cap) and calls the REAL
// spendTalentPoint store action, which both decrements the pool AND folds the talent's stat effect into
// getEffectiveAttributes. This renders the REAL panel and clicks the REAL node-Upgrade buttons,
// asserting the store mutated and the prereq chain unlocks dynamically. No SoundProvider needed (the
// panel uses store selectors only, not useGameSounds).
const g = () => useGameStore.getState();
const ORIGINAL = {
  talentPoints: g().talentPoints,
  unlockedTalents: g().unlockedTalents,
  attributes: g().attributes,
  maxHealth: g().maxHealth,
  maxMana: g().maxMana,
  playerHealth: g().playerHealth,
  mana: g().mana,
};
const seed = (talentPoints) =>
  useGameStore.setState({
    talentPoints,
    unlockedTalents: {},
    attributes: { strength: 10, agility: 10, intellect: 10, armor: 0, attributePoints: 0 },
  });

beforeEach(() => {
  seed(2);
});
afterEach(() => {
  cleanup();
  useGameStore.setState({ ...ORIGINAL });
});

// Click the "Upgrade" button inside the talent-node card whose heading is `nodeName` — robust to the
// many sibling "Upgrade" buttons (one per node + spell-mastery row): climb to the nearest ancestor
// that owns exactly this node's Upgrade button.
function clickUpgradeInNode(nodeName) {
  const label = screen.getByText(nodeName);
  let row = label.parentElement;
  while (row && !within(row).queryByRole('button', { name: /^upgrade$/i })) {
    row = row.parentElement;
  }
  if (!row) throw new Error(`No Upgrade button found in talent node "${nodeName}"`);
  fireEvent.click(within(row).getByRole('button', { name: /^upgrade$/i }));
}

describe('SpellUpgradePanel talent tree (jsdom) — real Upgrade buttons spend talent points', () => {
  it('unlocking a no-prereq node spends a point, ranks it up, and folds into effective stats', () => {
    render(<SpellUpgradePanel onClose={() => {}} />);
    const strBefore = g().getEffectiveAttributes().strength;

    clickUpgradeInNode('Kinetic Force'); // voidhand_force: +3 STR/rank, prereq null

    expect(g().unlockedTalents.voidhand_force).toBe(1);
    expect(g().talentPoints).toBe(1);
    expect(g().getEffectiveAttributes().strength).toBe(strBefore + 3); // talent fold (rank 1 x +3)
  });

  it('a prereq node becomes upgradeable only after its parent is unlocked (dynamic gate)', () => {
    render(<SpellUpgradePanel onClose={() => {}} />);
    const strBefore = g().getEffectiveAttributes().strength;

    // Crushing Pull (voidhand_crush, +2 STR/rank) requires voidhand_force — locked at first render.
    expect(g().unlockedTalents.voidhand_crush).toBeUndefined();
    clickUpgradeInNode('Kinetic Force'); // satisfy the prereq
    // now the panel re-renders and Crushing Pull exposes its Upgrade button
    clickUpgradeInNode('Crushing Pull');

    expect(g().unlockedTalents.voidhand_force).toBe(1);
    expect(g().unlockedTalents.voidhand_crush).toBe(1);
    expect(g().talentPoints).toBe(0); // both points spent
    expect(g().getEffectiveAttributes().strength).toBe(strBefore + 5); // +3 force +2 crush
  });

  it('with zero talent points the node Upgrade button is disabled and the click is a no-op', () => {
    seed(0);
    render(<SpellUpgradePanel onClose={() => {}} />);

    clickUpgradeInNode('Kinetic Force'); // button rendered but disabled (canUpgrade=false)

    expect(g().unlockedTalents.voidhand_force).toBeUndefined();
    expect(g().talentPoints).toBe(0);
  });
});
