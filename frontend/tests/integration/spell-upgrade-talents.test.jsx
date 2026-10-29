// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { SpellUpgradePanel } from '../../src/ui/SpellUpgradePanel.jsx';
import { useGameStore } from '../../src/store/useGameStore.jsx';

// The audit flagged "talent-tree spend never E2E'd". The SpellUpgradePanel renders one "Upgrade" button
// per unlockable talent node (gated by talentPoints + prereq + rank-cap) and calls the REAL
// spendTalentPoint store action, which decrements the pool and ranks the node; a node changes a verb
// (getVerbMods), never a stat. This renders the REAL panel and clicks the REAL node-Upgrade buttons,
// asserting the store mutated and the prereq chain unlocks dynamically. No SoundProvider needed (the
// panel uses store selectors only, not useGameSounds).
const g = () => useGameStore.getState();
const ORIGINAL = {
  talentPoints: g().talentPoints,
  unlockedTalents: g().unlockedTalents,
  maxHealth: g().maxHealth,
  maxMana: g().maxMana,
  playerHealth: g().playerHealth,
  mana: g().mana,
};
const seed = (talentPoints) =>
  useGameStore.setState({
    talentPoints,
    unlockedTalents: {},
  });

beforeEach(() => {
  seed(2);
});
afterEach(() => {
  cleanup();
  useGameStore.setState({ ...ORIGINAL });
});

// Click the "Upgrade" button inside the talent-node card whose heading is `nodeName` — robust to the
// many sibling "Upgrade" buttons (one per node): climb to the nearest ancestor that owns exactly this
// node's Upgrade button.
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
  it('unlocking a root spends a point, ranks it up, and folds no stat', () => {
    render(<SpellUpgradePanel onClose={() => {}} />);
    const strBefore = g().getEffectiveAttributes().strength;

    clickUpgradeInNode('Primal Roar'); // wildheart_roar: the verb unlock, prereq null

    expect(g().unlockedTalents.wildheart_roar).toBe(1);
    expect(g().talentPoints).toBe(1);
    expect(g().getEffectiveAttributes().strength, 'a talent added a stat').toBe(strBefore);
  });

  it('a modifier becomes upgradeable only after its root, and taking it changes the verb', () => {
    render(<SpellUpgradePanel onClose={() => {}} />);
    const roarBefore = g().getVerbMods().roarSec;

    expect(screen.queryByTestId('talent-take-wildheart_endurance'), 'a gated node offered its button before its root').toBeNull();
    clickUpgradeInNode('Primal Roar'); // satisfy the prereq
    fireEvent.click(screen.getByTestId('talent-take-wildheart_endurance'));

    expect(g().unlockedTalents.wildheart_roar).toBe(1);
    expect(g().unlockedTalents.wildheart_endurance).toBe(1);
    expect(g().talentPoints).toBe(0); // both points spent
    expect(g().getVerbMods().roarSec, 'Primal Endurance did not lengthen the roar').toBe(roarBefore + 3);
  });

  it('with zero talent points the node Upgrade button is disabled and the click is a no-op', () => {
    seed(0);
    render(<SpellUpgradePanel onClose={() => {}} />);

    clickUpgradeInNode('Primal Roar'); // button rendered but disabled (canUpgrade=false)

    expect(g().unlockedTalents.wildheart_roar).toBeUndefined();
    expect(g().talentPoints).toBe(0);
  });

  it('the page has no Spell Mastery section and no stat node', () => {
    render(<SpellUpgradePanel onClose={() => {}} />);
    expect(screen.getByTestId('progression-panel'), 'SETUP: the page did not render').toBeTruthy();
    expect(screen.queryByText(/Spell Mastery/i)).toBeNull();
    expect(screen.queryByText(/\+\d+ (Strength|Agility|Intellect|Armor)/)).toBeNull();
  });
});
