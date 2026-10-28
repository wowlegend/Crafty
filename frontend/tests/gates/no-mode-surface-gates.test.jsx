// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { GameUI } from '../../src/ui/GameHud.jsx';
import { SettingsPanel } from '../../src/ui/GamePanels.jsx';
import { useGameStore } from '../../src/store/useGameStore.jsx';

// THE MODE SURFACE IS GONE (DECISIONS 2026-10-28 W1-H item 4). Every game is costed, so the HUD's Mode chip and the
// Settings panel's creative/survival toggle went with the store's gameMode. Each case reads the rendered component, and
// proves the instrument sees it first: the HUD's gear, the Settings panel's Frame Rate toggle.
//
// The Settings case reads CONTROLS, not label text: a toggle with its strings removed renders a key or nothing, and
// reads clean. So the store is planted with a live mode and a spy setter, as a control reading them would find it, and
// every button in the panel is clicked; none may call the setter, and none may name a mode.
//
// WHAT THIS DOES NOT CHECK: the HUD in the running game (tests/e2e/the-cut.spec.js reads the live top row and the live
// Settings dialog), or any other panel.
//
// Mutation-Proof: see the commit trailers (the chip put back into GameHud.jsx; the toggle row put back into
// GamePanels.jsx with and without its strings).
beforeEach(() => {
  useGameStore.setState(useGameStore.getInitialState(), true);
});
afterEach(() => {
  cleanup();
  useGameStore.setState(useGameStore.getInitialState(), true);
});

const HUD_STATE = {
  selectedBlock: 'grass', inventory: { blocks: { grass: 3 } },
  setSelectedBlock: () => {}, setShowSettings: () => {}, setShowInventory: () => {}, setShowCrafting: () => {},
  setShowMagic: () => {}, setShowBuildingTools: () => {},
};
const MODE_TEXT = /\bMode\b|creative|survival/i;

describe('no game mode on any surface', () => {
  it('the HUD top row holds the Settings gear and nothing that names a mode', () => {
    render(<GameUI gameState={HUD_STATE} />);
    const gear = screen.getByTestId('hud-settings');
    const row = gear.parentElement.parentElement;
    expect(row.children.length, 'the HUD top row holds something beside the gear group').toBe(1);
    expect(row.textContent, 'the HUD top row names a mode').not.toMatch(MODE_TEXT);
  });

  it('no Settings control writes or names a game mode, with a live mode planted in the store', () => {
    const setGameMode = vi.fn();
    useGameStore.setState({ gameMode: 'creative', setGameMode, frameCap: 60 });
    render(<SettingsPanel onClose={() => {}} showStats={false} setShowStats={() => {}} onOpenWorldManager={() => {}} onOpenCredits={() => {}} />);
    expect(screen.getByTestId('frame-cap-toggle'), 'SETUP: the Settings panel did not render its rows').toBeTruthy();
    expect(screen.getByRole('dialog').textContent, 'the Settings panel offers a game mode').not.toMatch(/Game Mode|panel\.gameMode|creative|survival/i);

    const clicked = new Set();
    const named = [];
    for (let next; (next = screen.queryAllByRole('button').find((b) => !clicked.has(b)));) {
      clicked.add(next);
      expect(clicked.size, 'a click keeps minting new buttons').toBeLessThan(60);
      const name = next.getAttribute('aria-label') || next.textContent.trim();
      named.push(name);
      expect(name, 'a Settings button names a game mode').not.toMatch(MODE_TEXT);
      fireEvent.click(next);
      expect(setGameMode, `the "${name}" button wrote a game mode`).not.toHaveBeenCalled();
    }
    expect(clicked.size, `the panel rendered too few buttons for this to have clicked anything: ${JSON.stringify(named)}`).toBeGreaterThanOrEqual(9);
    // Presence, same instrument: a click on a real row reaches the store.
    expect(useGameStore.getState().frameCap, 'SETUP: the Frame Rate click never landed').toBe(0);
    expect(useGameStore.getState().gameMode, 'a Settings click moved the planted mode').toBe('creative');
  });
});
