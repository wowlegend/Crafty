// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { PANEL_GROUPS, openTab, panelWrites, toggleGroupTarget, applyPanelWrites, CLOSED_ON_SWITCH } from '../../src/ui/panelGroups.js';
import { PanelTabs } from '../../src/ui/PanelTabs.jsx';
import { PANEL_FLAGS } from '../../src/ui/panelState.js';

// THREE PANELS WHERE THERE WERE SEVEN (the HUD lane, DECISIONS 2026-10-29 item 96): Character holds the gear, spells and
// talents; Journal the quests and the feats; each tab is the panel that was there before, opened by its own flag, and a
// strip of tabs switches between them. These drive the group rules and the strip.
afterEach(cleanup);

describe('the panel groups', () => {
  it('Character is gear, spells, talents; Journal is quests, feats; every tab flag is a real panel flag', () => {
    expect(PANEL_GROUPS.character.map((t) => t.id)).toEqual(['gear', 'spells', 'talents']);
    expect(PANEL_GROUPS.journal.map((t) => t.id)).toEqual(['quests', 'feats']);
    for (const tab of Object.values(PANEL_GROUPS).flat()) expect(PANEL_FLAGS, `${tab.flag} is not a panel flag`).toContain(tab.flag);
  });

  it('a group key opens its first tab, and closes the group from any of its tabs', () => {
    expect(toggleGroupTarget('character', {})).toBe('showInventory');
    expect(toggleGroupTarget('character', { showSpellUpgrades: true })).toBeNull();
    expect(toggleGroupTarget('journal', { showAchievements: true })).toBeNull();
    expect(toggleGroupTarget('journal', { showInventory: true }), 'Character open does not count as Journal').toBe('showQuestLog');
    expect(openTab('character', { showMagic: true })).toBe('spells');
    expect(openTab('journal', {})).toBeNull();
  });

  it('switching leaves exactly one key-opened panel open, and null closes them all', () => {
    const w = panelWrites('showMagic');
    expect(Object.keys(w).sort()).toEqual([...CLOSED_ON_SWITCH].sort());
    expect(Object.entries(w).filter(([, v]) => v).map(([k]) => k)).toEqual(['showMagic']);
    expect(Object.values(panelWrites(null)).some(Boolean)).toBe(false);
  });

  it('writes reach the store setters and the two React-local ones', () => {
    const store = { setShowInventory: vi.fn(), setShowMagic: vi.fn(), setShowQuestLog: vi.fn(), setShowBuildingTools: vi.fn(),
      setShowForge: vi.fn(), setShowSettings: vi.fn(), setShowControls: vi.fn() };
    const local = { setShowSpellUpgrades: vi.fn(), setShowAchievements: vi.fn() };
    applyPanelWrites(panelWrites('showSpellUpgrades'), store, local);
    expect(local.setShowSpellUpgrades).toHaveBeenCalledWith(true);
    expect(local.setShowAchievements).toHaveBeenCalledWith(false);
    expect(store.setShowInventory).toHaveBeenCalledWith(false);
  });
});

describe('the tab strip', () => {
  it('shows only while its group is open, marks the open tab, and a tab press asks for that tab\'s flag', () => {
    const onSelect = vi.fn();
    const { rerender } = render(<PanelTabs group="character" flags={{}} onSelect={onSelect} />);
    expect(screen.queryByTestId('panel-tabs-character'), 'the strip shows with the group closed').toBeNull();
    rerender(<PanelTabs group="character" flags={{ showInventory: true }} onSelect={onSelect} />);
    expect(screen.getByTestId('panel-tab-gear').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('panel-tab-talents').getAttribute('aria-selected')).toBe('false');
    fireEvent.click(screen.getByTestId('panel-tab-talents'));
    expect(onSelect).toHaveBeenCalledWith('showSpellUpgrades');
  });
});
