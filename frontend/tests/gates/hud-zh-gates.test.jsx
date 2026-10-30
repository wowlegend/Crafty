// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import * as THREE from 'three';

/**
 * THE PLAY SCREEN AT REST READS IN CHINESE under zh-CN: no English word in the strings the HUD lane owns. Each piece is
 * rendered from the real component against the real store and dictionary, driven by the real HUD ticker where it writes
 * through refs, and its whole text is scanned:
 *   the day-phase dial at dusk and at night; the objective line (its name and its distance); the IMBUE tell; the quest
 *   line with a finished hunt (its claim on desktop and on touch) and the opened list; the hotbar's level; the compass
 *   strip (the eight points, HOME, the shrine, the Blight Heart); the toast stack carrying the dusk warning, a siege,
 *   a dawn with its loot, the dragon's defeat and an Aspect's unlock; and the level-up banner at the screen's centre.
 * A word is two or more Latin letters in a row, or a letter written onto a number (a unit: "69m"). Allowed, and named
 * here: a single letter standing alone, which is what a key prints (Q, R), digits, and the four Aspect names (WILDHEART, VOIDHAND, SOULBIND, ELEMANCER), which keep their English in every
 * locale as the controls do.
 * NOT SCANNED: a quest that is not a hunt keeps the words it was authored with (game/questText.js, the quest-text lane);
 * an NPC's name on the compass is the name on its tag; the combat log's plain-text entries and the notification call
 * sites that still pass English literals (registry REVIEW:w2d:notifications-english-literals).
 */
vi.mock('../../src/input/touchDevice', () => ({ isTouchUIMode: vi.fn(() => false), isTouchDevice: vi.fn(() => false) }));
import { isTouchUIMode } from '../../src/input/touchDevice';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { DayPhaseDial, ObjectiveTracker, ImbueTell } from '../../src/HUD.jsx';
import { QuestTracker, NotificationStack } from '../../src/QuestSystem.jsx';
import { GameUI } from '../../src/ui/GameHud.jsx';
import { Compass } from '../../src/ui/Compass.jsx';
import { SimpleLevelUpEffect } from '../../src/SimpleExperienceSystem.jsx';
import { HALF_CYCLE_UNITS } from '../../src/game/dayNight.js';
import { claimHudTick, emitHudTick } from '../../src/ui/hudTicker.js';
import { exitCaptureMode } from '../../src/devtest/captureMode.js';

const PROPER = /\b(WILDHEART|VOIDHAND|SOULBIND|ELEMANCER)\b/g;
// Two or more Latin letters, or one written onto a number (a unit: "69m").
const englishWords = (text) => (text.replace(PROPER, '').match(/[A-Za-z]{2,}|\d[A-Za-z]\b/g) || []);
const HAN = /[一-鿿]/;

let release = null;
// jsdom lays nothing out, so every element is 0 px wide and the compass would place nothing; its strip is given its
// 280 px for the length of each case.
const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return 280; } });
  exitCaptureMode();
  release = claimHudTick();
  useGameStore.setState({
    locale: 'zh-CN', gameCamera: { matrixWorld: new THREE.Matrix4() }, playerPosition: { x: 40, y: 60, z: 40 },
    shrineReached: true, imbueArmed: true, isDay: true, gameTime: HALF_CYCLE_UNITS * 0.95,
  });
});
afterEach(() => {
  cleanup();
  if (clientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidth);
  release();
  useGameStore.setState({ locale: 'en', imbueArmed: false });
});

const tick = () => act(() => { emitHudTick(0); });
const HUNT_DONE = { id: 'zombie_slayer', mobType: 'zombie', title: 'Zombie Slayer', description: 'Defeat 10 Zombies', icon: 'zombie',
  progress: 10, target: 10, completed: true, claimed: false };
const HUD_STATE = { selectedBlock: null, inventory: { blocks: {} }, setSelectedBlock: () => {}, setShowSettings: () => {} };
const TOASTS = [
  { id: 1, type: 'warn', key: 'notice.dusk' },
  { id: 2, type: 'danger', key: 'notice.siege.ferocious', vars: { n: 5 } },
  { id: 3, type: 'warn', key: 'notice.dawnReward', vars: { xp: 250, coins: 50, item: { key: 'loot.dawn.legendary' } } },
  { id: 4, type: 'danger', key: 'notice.bossDefeated', vars: { boss: { key: 'boss.dragonRisenN', vars: { roman: 'II', n: 2 } }, xp: 900 } },
  { id: 5, type: 'success', key: 'notice.aspect.roar', vars: { key: 'R' } },
];

/** Every piece, rendered in zh-CN, as [name, its text]. */
function renderAll() {
  const out = [];
  const take = (name, node) => out.push([name, node.textContent]);
  const dial = render(<DayPhaseDial />);
  take('dial at dusk', dial.getByTestId('day-phase-dial'));
  act(() => useGameStore.setState({ isDay: false, gameTime: HALF_CYCLE_UNITS * 1.5 }));
  dial.rerender(<DayPhaseDial />);
  take('dial at night', dial.getByTestId('day-phase-dial'));
  const obj = render(<ObjectiveTracker />);
  tick();
  take('objective line', obj.getByTestId('objective-tracker'));
  take('imbue tell', render(<ImbueTell />).container);
  for (const touch of [false, true]) {
    isTouchUIMode.mockReturnValue(touch);
    const q = render(<QuestTracker quests={[HUNT_DONE]} onClaim={() => {}} />);
    take(`quest line (${touch ? 'touch' : 'desktop'})`, q.getByTestId('quest-tracker'));
    act(() => { q.getByTestId('quest-tracker-line').click(); });
    take(`quest list (${touch ? 'touch' : 'desktop'})`, q.getByTestId('quest-tracker'));
    q.unmount();
  }
  isTouchUIMode.mockReturnValue(false);
  take('hotbar level', render(<GameUI gameState={HUD_STATE} level={4} xpProgress={30} />).getByTestId('hotbar-xp-row'));
  const compass = render(<Compass treasureChests={{ chests: [], openedChestIds: new Set() }} bossSystem={{ bossActive: false }} />);
  tick();
  take('compass', compass.getByTestId('compass-track'));
  take('toasts', render(<NotificationStack notifications={TOASTS} />).getByTestId('notification-stack'));
  take('level-up banner', render(<SimpleLevelUpEffect levelUpEffects={[{ id: 1, level: 5 }]} />).container);
  return out;
}

describe('the play screen at rest under zh-CN', () => {
  it('every piece rendered, each with Chinese in it (the instrument sees text before it judges it)', () => {
    const pieces = renderAll();
    expect(pieces.map(([n]) => n), 'a piece went unrendered').toHaveLength(12);
    for (const [name, text] of pieces) expect(text, `${name} rendered no Chinese: "${text}"`).toMatch(HAN);
  });

  it('no English word in any of them', () => {
    const found = renderAll().map(([name, text]) => [name, englishWords(text)]).filter(([, w]) => w.length);
    expect(found, 'English on the zh-CN play screen').toEqual([]);
  });

  it('the scan finds an English word where there is one (the dial, the objective distance, the level, the claim)', () => {
    act(() => useGameStore.setState({ locale: 'en' }));
    const found = new Map(renderAll().map(([name, text]) => [name, englishWords(text)]));
    expect(found.get('dial at dusk')).toContain('DUSK');
    expect(found.get('objective line').join(' ')).toMatch(/\d*m\b|Shatter/);
    expect(found.get('hotbar level')).toContain('Lv');
    expect(found.get('level-up banner')).toContain('LEVEL');
    expect(found.get('quest line (desktop)')).toEqual(expect.arrayContaining(['Press']));
    expect(found.get('quest line (touch)')).toEqual(expect.arrayContaining(['Claim']));
  });
});
