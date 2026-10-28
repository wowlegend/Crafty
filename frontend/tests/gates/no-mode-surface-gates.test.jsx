// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { GameUI } from '../../src/ui/GameHud.jsx';
import { SettingsPanel } from '../../src/ui/GamePanels.jsx';

// THE MODE SURFACE IS GONE (DECISIONS 2026-10-28 W1-H item 4). Every game is costed, so the HUD's Mode chip and the
// Settings panel's creative/survival toggle went with the store's gameMode. Each case reads the rendered component, and
// proves the instrument sees it first: the HUD's gear, the Settings panel's Frame Rate toggle.
//
// WHAT THIS DOES NOT CHECK: the HUD in the running game (tests/e2e/the-cut.spec.js reads the live top row and the live
// Settings dialog), or any other panel.
//
// Mutation-Proof: see the commit trailer (the chip put back into GameHud.jsx, the toggle row put back into GamePanels.jsx).
afterEach(cleanup);

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

  it('the Settings panel renders its rows and offers no game mode', () => {
    render(<SettingsPanel onClose={() => {}} showStats={false} setShowStats={() => {}} onOpenWorldManager={() => {}} onOpenCredits={() => {}} />);
    expect(screen.getByTestId('frame-cap-toggle'), 'SETUP: the Settings panel did not render its rows').toBeTruthy();
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent, 'the Settings panel offers a game mode').not.toMatch(/Game Mode|creative|survival/i);
  });
});
