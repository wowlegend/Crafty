// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
vi.mock('../../src/input/touchDevice', async (orig) => ({ ...(await orig()), isTouchDevice: () => false, isTouchUIMode: () => false }));
import { render, screen, cleanup, act } from '@testing-library/react';
import { MenuSystem } from '../../src/MenuSystem.jsx';
import { SoundProvider } from '../../src/SoundManager.jsx';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { selectHudState } from '../../src/store/hudState.js';
import { KEY_MAP } from '../../src/game/keyMap.js';

/**
 * THE FEATS TAB AND THE CONTROLS PANEL LOAD WHEN THEY ARE OPENED (W3-A PR C, DECISIONS 2026-11-01 (W3-A PR C) item 495).
 * The achievements panel (the Journal's feats tab) and the controls panel (H) left the boot chunk for the lazy panel
 * chunk (ui/panels/lazyPanels.js), as C0's boss bar did (item 480). scripts/ci/bundle-budget.mjs proves the split on the
 * BUILT bundle (each testid absent from the boot chunk, present in one lazy chunk); this proves what a bundle cannot:
 * MenuSystem mounts the lazy panels, and each resolves to the real panel through the panel chunk's own import, so an open
 * still shows it. The panel chunk is NOT loaded first, the case the idle prefetch has not reached (H pressed at once).
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, 1 test, each observed RED:
 *   P1 MenuSystem.jsx imports AchievementsPanel statically again -> "the feats panel rendered in the first commit"
 *   P2 MenuSystem.jsx imports ControlsPanel statically again -> "the controls panel rendered in the first commit"
 *   P3 panelBundle.js drops its AchievementsPanel export -> "a lazy panel never resolved"
 *   P4 panelBundle.js drops its ControlsPanel export -> the same. Either drop names neither panel: a lazy panel that
 *      resolves to undefined throws React's "Element type is invalid" past PanelBoundary and unmounts the whole tree
 *      (observed; the same as C0's boss-bar mutant R3), so the case cannot say which export went.
 *   I0 identity (a comment edit in lazyPanels.js) SURVIVED.
 *
 * NOT CHECKED HERE: the chunk boundary itself (bundle-budget.mjs); the panels' close paths (close-relock-gates) and their
 * contents (controls-panel-gates, taught-keys-gates, lazy-motion-strict-gates), which import the modules directly.
 */
const ACHIEVEMENTS = [
  { id: 'a1', title: 'First Steps', description: 'Walk', icon: 'star' },
  { id: 'a2', title: 'Builder', description: 'Build', icon: 'star' },
];
const QUESTS = { achievements: ACHIEVEMENTS, unlockedAchievements: new Set(['a1']), stats: { kills: 3 }, quests: [], notifications: [] };

beforeAll(() => {
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  window.HTMLMediaElement.prototype.pause = () => {};
});
afterEach(() => { cleanup(); useGameStore.setState({ showControls: false }); });

describe('the feats tab and the controls panel, lazy', () => {
  it('are absent from the first commit of their open, then resolve to the real panels through the panel chunk', async () => {
    act(() => { useGameStore.setState({ showControls: true, gameStarted: true, isAlive: true }); });
    const gameState = selectHudState(useGameStore.getState());
    expect(gameState.showControls, 'SETUP: the HUD slice does not carry showControls').toBe(true);
    render(
      <SoundProvider>
        <MenuSystem gameState={gameState} showAchievements setShowAchievements={() => {}} showSpellUpgrades={false}
          setShowSpellUpgrades={() => {}} isPointerLocked={false} setIsPointerLocked={() => {}} showStats={false}
          setShowStats={() => {}} questSystem={QUESTS} />
      </SoundProvider>,
    );
    expect(screen.queryByTestId('achievements-panel'), 'the feats panel rendered in the first commit: it is statically imported, not lazy')
      .toBeNull();
    expect(screen.queryByTestId('controls-panel'), 'the controls panel rendered in the first commit: it is statically imported, not lazy')
      .toBeNull();
    const [feats, controls] = await Promise.all(['achievements-panel', 'controls-panel']
      .map((id) => screen.findByTestId(id, {}, { timeout: 15000 }).catch(() => null)));
    expect([feats ? null : 'the feats panel', controls ? null : 'the controls panel'].filter(Boolean),
      'a lazy panel never resolved to the real panel through the panel chunk').toEqual([]);
    expect(feats.textContent, 'presence: the real feats panel counts the unlocked feats and names them').toMatch(/1 \/ 2 unlocked[\s\S]*First Steps[\s\S]*Builder/);
    const taught = KEY_MAP.filter((r) => !r.panelHide).length;
    expect(controls.querySelectorAll('[data-controls-key]').length, 'presence: the real controls panel lists every taught key').toBe(taught);
  });
});
