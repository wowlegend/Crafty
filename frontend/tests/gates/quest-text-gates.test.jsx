// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, renderHook, act, fireEvent } from '@testing-library/react';
vi.mock('../../src/input/touchDevice', () => ({ isTouchUIMode: vi.fn(() => false), isTouchDevice: vi.fn(() => false) }));
import { QuestTracker, useQuestSystem } from '../../src/QuestSystem.jsx';
import { QuestLog } from '../../src/ui/QuestLog.jsx';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { GameMethods } from '../../src/GameMethods';
import { emitMobKill } from '../../src/game/mobKillBus';

// THE TRACKER AND THE LOG NAME THE CREATURE ON SCREEN (W2-F step 7; DECISIONS 2026-10-29 items 75-78). A hunt is shown
// by its id and mob key through game/questText.js, never by the words a save carried, so a hunt saved as "Defeat 10
// zombies" reads "Defeat 10 Husks", and in zh-CN reads Chinese. The tracker is drawn as it was (W2-D restyles it):
// only the source of the two text lines moved. The completion notice is English and names the hunt by its English
// title, which a load takes from QUEST_LIST rather than from the save (QuestSystem.jsx withCurrentAsk).
//
// WHAT THIS DOES NOT CHECK: the HUD in the running game, its pointer lock or a real kill (tests/e2e/quest-text.spec.js).

const SAVED_HUNT = Object.freeze({ id: 'zombie_slayer', title: 'Zombie Slayer', description: 'Defeat 10 zombies', icon: 'zombie',
  type: 'kill_type', mobType: 'zombie', target: 10, xpReward: 120, tier: 2, progress: 7, completed: false, claimed: false });
const PLAIN = Object.freeze({ id: 'first_blood', title: 'First Blood', description: 'Cut down the first horror at the gate', icon: 'sword',
  type: 'kill', target: 1, xpReward: 30, tier: 1, progress: 0, completed: false, claimed: false });

beforeEach(() => useGameStore.setState({ locale: 'en' }));
afterEach(() => { cleanup(); useGameStore.setState({ locale: 'en' }); });

describe.each([
  // The tracker rests as one line (the HUD lane); opened, it lists every quest the way the log does.
  ['the HUD tracker, opened', (quests) => {
    const r = render(<QuestTracker quests={quests} onClaim={() => {}} />);
    fireEvent.click(screen.getByTestId('quest-tracker-line'));
    return r;
  }],
  ['the quest log', (quests) => render(<QuestLog quests={quests} onClose={() => {}} />)],
])('%s', (_name, mount) => {
  it('shows a saved hunt under the creature\'s name, and a plain quest as authored', () => {
    const { container } = mount([PLAIN, SAVED_HUNT]);
    expect(screen.getByText('First Blood'), 'SETUP: the plain quest did not render').toBeTruthy();
    expect(container.textContent, 'SETUP: the hunt\'s progress did not render').toMatch(/7\s*\/\s*10/);
    expect(screen.getByText('Husk Slayer')).toBeTruthy();
    expect(screen.getByText('Defeat 10 Husks')).toBeTruthy();
    expect(container.textContent, 'the saved words leaked onto the screen').not.toMatch(/Zombie Slayer|zombies/);
  });

  it('in zh-CN the hunt reads in Chinese', () => {
    useGameStore.setState({ locale: 'zh-CN' });
    const { container } = mount([SAVED_HUNT]);
    expect(container.textContent, 'SETUP: the hunt\'s progress did not render').toMatch(/7\s*\/\s*10/);
    expect(screen.getByText('击败 10 个尸傀')).toBeTruthy();
    expect(screen.getByText('尸傀杀手')).toBeTruthy();
    expect(container.textContent).not.toMatch(/Husk|Zombie|zombies/);
  });
});

describe('the completion notice', () => {
  it('names the hunt by the creature on screen', () => {
    GameMethods.grantXP = vi.fn();
    GameMethods.spawnLootDrop = vi.fn();
    useGameStore.setState({ questState: { quests: [{ ...SAVED_HUNT, progress: 9 }], completedQuestIds: [],
      stats: { kills: 9, kills_by_type: { zombie: 9 } }, unlockedAchievements: ['first_step'] } });
    const { result } = renderHook(() => useQuestSystem());
    act(() => emitMobKill('zombie', [0, 0, 0], 'player'));
    const notices = result.current.notifications.map((n) => n.text);
    // The feed is topped up on load (QuestSystem.jsx fillFeed), so the same kill may finish First Blood beside it.
    const done = notices.filter((s) => s.startsWith('Quest Complete'));
    expect(done.length, `SETUP: the kill completed no quest (${JSON.stringify(notices)})`).toBeGreaterThan(0);
    expect(done, 'the hunt\'s completion notice does not name the Husk').toContain('Quest Complete: Husk Slayer! Click Q to claim reward.');
    expect(done.join(' '), 'a completion notice used the saved words').not.toMatch(/Zombie/);
  });
});
