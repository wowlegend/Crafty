// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { SPELL_UPGRADES, requiredLevelForUpgrade } from '../../src/world/spellUpgrades.js';
import { SpellUpgradePanel } from '../../src/ui/SpellUpgradePanel.jsx';

// #51 S2 — THE SPELL MASTERY PANEL, CLICKED RATHER THAN READ.
//
// This gate grepped SpellUpgradePanel.jsx for six fragments: `Spell Mastery`, `SPELL_MASTERY.map`,
// `upgradeSpell?.(key)`, `spellLevels[key]`, `SPELL_UPGRADES[key].levels`, `requiredLevelFor`. Every one
// is a spelling. The panel's whole job is to be the ONE reachable surface where a player can trigger
// `store.upgradeSpell` — the feature exists because that action had no reachable caller at all — and
// "the call is written down somewhere in the file" is the same evidence the dead version would have
// produced. It also cannot see the level gate work, which is the part with a wrong answer available:
// showing Upgrade to an under-levelled player, or locking a player who has earned it.
//
// It renders in jsdom. So drive it.
vi.mock('../../src/SoundManager', () => ({ useGameSounds: () => ({ playPickup: () => {}, playLevelUpSound: () => {} }) }));

/** The Spell Mastery row for `key`, located by the spell's authored display name. */
const rowFor = (key) => {
  const name = SPELL_UPGRADES[key].name;
  const row = screen.getByText(name).closest('div.flex.items-center.gap-3');
  expect(row, `no Spell Mastery row for "${name}" — the section changed shape`).toBeTruthy();
  return row;
};

const open = () => render(createElement(SpellUpgradePanel, { onClose: () => {} }));

const setup = ({ playerLevel = 10, spellLevels = {}, upgradeSpell = vi.fn() } = {}) => {
  useGameStore.setState({ spellLevels, upgradeSpell, getPlayerLevel: () => playerLevel, talentPoints: 0 });
  return upgradeSpell;
};

afterEach(cleanup);
beforeEach(() => { useGameStore.setState({ unlockedTalents: {} }); });

describe('#51 S2 — the Spell Mastery section is real and reachable', () => {
  it('renders one row per castable spell, each showing its CURRENT stats', () => {
    setup({ spellLevels: { fireball: 2 } });
    open();
    expect(screen.getByText('Spell Mastery')).toBeTruthy();

    for (const key of ['fireball', 'iceball', 'lightning', 'arcane']) {
      const row = rowFor(key);
      const lvl = key === 'fireball' ? 2 : 1;
      const stats = SPELL_UPGRADES[key].levels[lvl - 1];
      expect(within(row).getByText(`Level ${lvl}/3`), `${key} shows the wrong level`).toBeTruthy();
      // The damage number the player is reading must be the row the caster actually fires at — the two
      // came apart once already (the hydrate-once mirror bug), with the panel showing MAX RANK while
      // every cast used level 1.
      expect(within(row).getByText(String(stats.damage)), `${key} displays a damage that is not its level's`).toBeTruthy();
    }
  });

  it('clicking Upgrade calls store.upgradeSpell with THAT row\'s spell', () => {
    // The single fact the whole feature exists to provide. `upgradeSpell?.(key)` appearing in the source
    // says nothing about which key, or whether the button is reachable.
    const upgradeSpell = setup({ playerLevel: 10 });
    open();
    fireEvent.click(within(rowFor('iceball')).getByRole('button', { name: /upgrade/i }));
    expect(upgradeSpell, 'the Upgrade button is not wired — this is the dead-action defect the feature fixed').toHaveBeenCalledTimes(1);
    expect(upgradeSpell, 'the button upgraded the wrong spell').toHaveBeenCalledWith('iceball');
  });

  it('a store with no upgradeSpell yet does not crash the panel', () => {
    // What the `?.` in `upgradeSpell?.(key)` is for. The store's default is literally `upgradeSpell: null`
    // until useSpellUpgrades mounts, so this is a real early-boot state, not a hypothetical.
    setup({ upgradeSpell: null });
    open();
    expect(() => fireEvent.click(within(rowFor('fireball')).getByRole('button', { name: /upgrade/i }))).not.toThrow();
  });
});

describe('#51 S2 — the level gate, in both directions', () => {
  it('an under-levelled player is LOCKED, and told what they need', () => {
    const required = requiredLevelForUpgrade(SPELL_UPGRADES.fireball.levels[1]);
    expect(required, 'the fireball ladder no longer gates on level — this test has nothing to check').toBeGreaterThan(1);

    const upgradeSpell = setup({ playerLevel: required - 1 });
    open();
    const row = rowFor('fireball');
    expect(within(row).getByText(`Requires Lv ${required}`), 'the gate is silent about what it wants').toBeTruthy();
    expect(within(row).queryByRole('button', { name: /upgrade/i }), 'an under-levelled player is offered the upgrade').toBeNull();
    expect(upgradeSpell).not.toHaveBeenCalled();
  });

  it('a player at exactly the required level is ALLOWED — the boundary, not just the far side', () => {
    // Off-by-one is the available bug here, and a source-grep for `requiredLevelFor` cannot see which
    // comparison the panel uses.
    const required = requiredLevelForUpgrade(SPELL_UPGRADES.fireball.levels[1]);
    setup({ playerLevel: required });
    open();
    expect(within(rowFor('fireball')).getByRole('button', { name: /upgrade/i }).disabled).toBe(false);
  });

  it('a MAXED spell offers no upgrade at all', () => {
    setup({ playerLevel: 99, spellLevels: { fireball: 3 } });
    open();
    const row = rowFor('fireball');
    expect(within(row).queryByRole('button', { name: /upgrade/i }), 'a level-3 spell can still be upgraded').toBeNull();
    expect(within(row).getByText('Level 3/3')).toBeTruthy();
  });

  it('a CORRUPT saved level is clamped instead of indexing off the end of the ladder', () => {
    // The comment on the clamp says a corrupt save must not index out of bounds. Nothing tested it, and
    // the failure mode is a blank-screen crash inside the progression panel.
    setup({ playerLevel: 99, spellLevels: { fireball: 99, iceball: 0, lightning: -4 } });
    expect(() => open()).not.toThrow();
    expect(within(rowFor('fireball')).getByText('Level 3/3'), 'level 99 was not clamped down').toBeTruthy();
    expect(within(rowFor('iceball')).getByText('Level 1/3'), 'level 0 was not clamped up').toBeTruthy();
    expect(within(rowFor('lightning')).getByText('Level 1/3'), 'a negative level was not clamped up').toBeTruthy();
  });
});
