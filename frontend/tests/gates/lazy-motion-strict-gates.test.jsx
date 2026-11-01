// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { motion, m } from 'framer-motion';
import { MotionProvider } from '../../src/ui/MotionProvider.jsx';
import { SoundProvider } from '../../src/SoundManager.jsx';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { MenuSystem } from '../../src/MenuSystem.jsx';
import { DamageOverlay, DeathScreen, VictoryOverlay } from '../../src/GameSystems.jsx';
import { SimpleXPGainVisual, SimpleLevelUpEffect } from '../../src/SimpleExperienceSystem.jsx';
import { QuestTracker, NotificationStack, ChestIndicator, QUEST_LIST } from '../../src/QuestSystem.jsx';
import { AchievementsPanel } from '../../src/ui/AchievementsPanel.jsx';
import { WorldManager } from '../../src/WorldManager.jsx';
import { TradingInterface } from '../../src/ui/TradingInterface.jsx';
import { ForgePanel } from '../../src/ui/panels/ForgePanel.jsx';
import { SpellUpgradePanel } from '../../src/ui/SpellUpgradePanel.jsx';
import { ChestInventoryPanel } from '../../src/ui/ChestInventoryPanel.jsx';
import { GameUI } from '../../src/ui/GameHud.jsx';
import DamageDirection from '../../src/ui/DamageDirection.jsx';
import LowHealthVignette from '../../src/ui/LowHealthVignette.jsx';
import { slowPageClock, restorePageClock } from '../e2e/_motionSample.js';

// EVERY ANIMATED PANEL RENDERS `m`, UNDER THE APP'S OWN STRICT LazyMotion PROVIDER (W2-L, DECISIONS 2026-10-30).
//
// `motion` ships every framer-motion feature (drag, layout, projection) into the boot chunk; `m` ships none and takes
// the features from the nearest LazyMotion. MotionProvider (src/ui/MotionProvider.jsx) is that provider, App's outermost
// element, with `strict`: a `motion.*` component rendered anywhere under it THROWS in dev and test (framer-motion 12.43
// `useStrictMode`, skipped in a production build). So this mounts one real component from each of the twelve modules
// that render an animated element, under that provider and no other, and a `motion.*` left in any of them is a throw
// here, naming the file in the failure.
//
// PRESENCE FIRST. The first two cases show the instrument can see both ways in this very environment: a `motion.div`
// under the provider throws (strict is live: an `m` mounted with no throw would otherwise prove nothing), and an `m.div`
// under it animates to a value strictly between its start and its end (the provider's features are live: a provider
// whose features never load renders every `m` frozen at its `initial`, which no throw would report).
//
// DENOMINATOR. ROWS is the list of mounted components; the last case reads it back: the twelve modules this table names,
// every one mounted, every marker found. A component dropped from the table is a fall in that count, not a silent pass.
// It counts the table and nothing outside it: a module added to src is not seen here.
//
// WHAT THIS DOES NOT CHECK: a `motion.*` in a module this table lacks, or in a branch the mount does not reach (a
// conditional element behind an unopened state). The shipped artifact is held by scripts/ci/bundle-budget.mjs, which
// reads every built chunk for the drag and projection code only a full `motion` brings (the lazy panel chunk included,
// where the index ceiling is blind), and tests/e2e/lazy-motion.spec.js watches a real panel animate in the running
// game; tests/gates/lazy-motion-exit-gates.test.jsx closes a panel. A second React root rendering `m` outside the
// provider is not seen either: today `src/index.jsx` has the only `createRoot`.
//
// Mutation-Proof: see the commit trailer.

const NOOP = () => {};
const QUESTS = QUEST_LIST.slice(0, 2).map((q) => ({ ...q, progress: 1, completed: false, claimed: false }));
const PANELS_CLOSED = {
  showInventory: false, showForge: false, showMagic: false, showBuildingTools: false,
  showSettings: false, showChestInterface: false, showTradingInterface: false,
  showWorldManager: false, showCredits: false, showQuestLog: false,
};
const HUD_STATE = {
  selectedBlock: null, inventory: { blocks: {} },
  setSelectedBlock: NOOP, setShowSettings: NOOP, setShowInventory: NOOP, setShowForge: NOOP,
  setShowMagic: NOOP, setShowBuildingTools: NOOP,
};

/** The app's tree as far as a panel sees it: the strict provider outermost, then the sound context a few panels read. */
const inApp = ({ children }) => <MotionProvider><SoundProvider>{children}</SoundProvider></MotionProvider>;

// file: the module the component lives in (what the failure names). marker: what proves THIS component rendered.
const ROWS = [
  { file: 'MenuSystem.jsx', name: 'the title', marker: () => screen.getByRole('button', { name: /start adventure/i }),
    ui: () => <MenuSystem showAchievements={false} setShowAchievements={NOOP} showSpellUpgrades={false} setShowSpellUpgrades={NOOP}
      showStats={false} setShowStats={NOOP} isPointerLocked={false} setIsPointerLocked={NOOP}
      questSystem={{ achievements: [], unlockedAchievements: [], stats: {}, quests: [] }}
      gameState={{ ...PANELS_CLOSED, gameStarted: false, isAlive: true, requestPointerLock: NOOP }} /> },
  { file: 'GameSystems.jsx', name: 'DamageOverlay', marker: () => document.querySelector('.fixed.inset-0.pointer-events-none.z-40'),
    ui: () => { useGameStore.setState({ damageFlash: true, screenShake: 1 }); return <DamageOverlay />; } },
  { file: 'GameSystems.jsx', name: 'DeathScreen', marker: () => screen.getByText('YOU DIED'), ui: () => <DeathScreen onRespawn={NOOP} /> },
  { file: 'GameSystems.jsx', name: 'VictoryOverlay', marker: () => screen.getByText('VICTORY'), ui: () => <VictoryOverlay onDismiss={NOOP} /> },
  { file: 'SimpleExperienceSystem.jsx', name: 'SimpleXPGainVisual', marker: () => screen.getByText('+7'),
    ui: () => <SimpleXPGainVisual xpGains={[{ id: 1, amount: 7 }]} /> },
  { file: 'SimpleExperienceSystem.jsx', name: 'SimpleLevelUpEffect', marker: () => screen.getByText('Level up', { exact: false }),
    ui: () => <SimpleLevelUpEffect levelUpEffects={[{ id: 1, level: 4 }]} onEffectComplete={NOOP} /> },
  { file: 'QuestSystem.jsx', name: 'QuestTracker (expanded)', marker: () => screen.getByTestId('quest-tracker-list'),
    ui: () => <QuestTracker quests={QUESTS} />, after: () => fireEvent.click(screen.getByTestId('quest-tracker-line')) },
  { file: 'QuestSystem.jsx', name: 'NotificationStack', marker: () => screen.getByTestId('notification'),
    ui: () => <NotificationStack notifications={[{ id: 1, type: 'info', text: 'hello' }]} /> },
  { file: 'ui/AchievementsPanel.jsx', name: 'AchievementsPanel', marker: () => screen.getByTestId('achievements-panel'),
    ui: () => <AchievementsPanel achievements={[]} unlockedAchievements={new Set()} stats={{}} onClose={NOOP} /> },
  { file: 'QuestSystem.jsx', name: 'ChestIndicator (a chest in reach)', marker: () => screen.getByText('Treasure', { exact: false }),
    ui: () => {
      useGameStore.setState({ playerPosition: { x: 0, y: 0, z: 0 } });
      return <ChestIndicator chests={[{ id: 'c1', position: [1, 0, 1] }]} openedChestIds={new Set()} />;
    },
    settle: () => waitFor(() => screen.getByText('Treasure', { exact: false }), { timeout: 3000 }) },
  { file: 'WorldManager.jsx', name: 'WorldManager', marker: () => document.querySelector('.bg-gray-800'),
    ui: () => <WorldManager onClose={NOOP} /> },
  { file: 'ui/TradingInterface.jsx', name: 'TradingInterface', marker: () => screen.getByText('Coins to Health Potion'),
    ui: () => <TradingInterface villager={{ npcName: 'Test Merchant' }} onClose={NOOP} /> },
  { file: 'ui/panels/ForgePanel.jsx', name: 'ForgePanel', marker: () => screen.getByTestId('forge-panel'),
    ui: () => <ForgePanel onClose={NOOP} /> },
  { file: 'ui/SpellUpgradePanel.jsx', name: 'SpellUpgradePanel', marker: () => screen.getByTestId('progression-panel'),
    ui: () => <SpellUpgradePanel onClose={NOOP} /> },
  { file: 'ui/ChestInventoryPanel.jsx', name: 'ChestInventoryPanel', marker: () => screen.getByRole('dialog', { name: 'Chest' }),
    ui: () => <ChestInventoryPanel coords="0,0,0" onClose={NOOP} /> },
  { file: 'ui/GameHud.jsx', name: 'GameUI', marker: () => screen.getByTestId('hud-settings'),
    ui: () => <GameUI gameState={HUD_STATE} level={1} xpProgress={0} /> },
  { file: 'ui/DamageDirection.jsx', name: 'DamageDirection', marker: () => document.querySelector('div[style*="z-index: 38"]'),
    ui: () => { useGameStore.setState({ lastHitDir: { angle: 0, t: 1 } }); return <DamageDirection />; } },
  { file: 'ui/LowHealthVignette.jsx', name: 'LowHealthVignette', marker: () => document.querySelector('div[style*="z-index: 37"]'),
    ui: () => { useGameStore.setState({ playerHealth: 5, maxHealth: 100 }); return <LowHealthVignette />; } },
];

const INITIAL = useGameStore.getInitialState();
beforeEach(() => { useGameStore.setState(INITIAL, true); });
afterEach(() => { cleanup(); restorePageClock(); useGameStore.setState(INITIAL, true); });

describe('the provider is strict and its features are live (the instrument sees both ways)', () => {
  it('a motion.div under the app provider throws, naming the rule', () => {
    // Without this, every mount below could pass on a provider that is not strict.
    const quiet = console.error;
    console.error = NOOP; // React logs the caught render error; the throw is the assertion
    try {
      expect(() => render(<motion.div />, { wrapper: MotionProvider }), 'a motion component under the provider did not throw: strict is off')
        .toThrow(/motion.*component.*LazyMotion|LazyMotion/);
    } finally {
      console.error = quiet;
    }
  });

  it('an m.div under the app provider animates: a value strictly between its start and its end is drawn', async () => {
    // Sampled on every animation frame the page gets. The tween runs against the clock framer-motion reads with
    // performance.now(): its frame loop clamps only its own delta (motion-dom batcher, maxElapsed 40), never an
    // animation's elapsed time, so a frame that stalls for longer than the tween steps over the whole of it and no middle
    // is ever drawn. The clock is slowed to a tenth (the sampler's own device), so the 0.5 s tween lasts 5 s and a stall
    // of a second still lands inside it. A provider whose features never loaded leaves the element at its `initial` forever.
    slowPageClock(0.1);
    render(<m.div data-testid="probe" initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ duration: 0.5, ease: 'linear' }} />, { wrapper: MotionProvider });
    const scaleOf = () => Number(/scale\(([\d.]+)\)/.exec(screen.getByTestId('probe').style.transform)?.[1] ?? 1);
    const seen = [];
    const deadline = Date.now() + 15000; // real time: performance.now is slowed
    while (Date.now() < deadline) {
      seen.push(scaleOf());
      if (seen.length > 3 && seen[seen.length - 1] === 1) break;
      await new Promise((r) => requestAnimationFrame(r));
    }
    const between = seen.filter((v) => v > 0.5 && v < 1);
    expect(seen[0], `the start was not the initial value: ${JSON.stringify(seen.slice(0, 5))}`).toBe(0.5);
    expect(seen[seen.length - 1], `it never reached its end in ${seen.length} samples`).toBe(1);
    expect(between.length, `it went from start to end with no value between them in ${seen.length} samples`).toBeGreaterThan(0);
  }, 30000);
});

describe('every module that renders an animated element mounts under the strict provider', () => {
  it.each(ROWS.map((r) => [r.file, r.name, r]))('%s: %s', async (_file, _name, row) => {
    render(row.ui(), { wrapper: inApp });
    if (row.after) row.after();
    if (row.settle) await row.settle();
    expect(row.marker(), `${row.file} ${row.name} mounted without its marker: SETUP, the mount proves nothing`).toBeTruthy();
  });

  it('the table names thirteen modules and eighteen components, each mounted above', () => {
    const files = new Set(ROWS.map((r) => r.file));
    expect(ROWS.length, 'a row fell out of this table, or one was added here without this count').toBe(18);
    expect([...files].sort(), 'this table\'s modules differ from the thirteen listed here: a row was removed, or a module was added to the table without this list (a module that is in src and not in the table is not seen by this case)').toEqual([
      'GameSystems.jsx', 'MenuSystem.jsx', 'QuestSystem.jsx', 'SimpleExperienceSystem.jsx', 'WorldManager.jsx',
      'ui/AchievementsPanel.jsx', 'ui/ChestInventoryPanel.jsx', 'ui/DamageDirection.jsx', 'ui/GameHud.jsx',
      'ui/LowHealthVignette.jsx', 'ui/SpellUpgradePanel.jsx', 'ui/TradingInterface.jsx', 'ui/panels/ForgePanel.jsx',
    ]);
  });
});
