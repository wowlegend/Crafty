// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { useQuestSystem, QUEST_LIST } from '../../src/QuestSystem.jsx';
import { GameMethods } from '../../src/GameMethods';
import { emitMobKill } from '../../src/game/mobKillBus';
import { questTitle, questDescription } from '../../src/game/questText.js';
import { tIn } from '../../src/i18n/i18n.js';

// THE KEY MAP (W2-F step 7; DECISIONS 2026-10-29 item 76). Quest text moved to the creatures' names; no key a save
// holds moved with it. A saved quest is found by its id, a hunt counts the kills of its `mobType`, and the kill
// counter `stats.kills_by_type` is keyed by the same MOB_TYPES key. So the map from the keys a save written before this
// change holds to the keys this build reads is the identity, and it is frozen here as literals: a later rename of a
// quest id or a mob key goes red and stays red until this test is edited. The edit that clears it has to change the
// identity check below too (it fails for any pair whose two sides differ), and nothing here checks that the edit
// also adds a migration. The text a save carries (`title`, `description`) is never read for display; it is rendered
// from the id and the mob key.
//
// WHAT THIS DOES NOT CHECK: the tracker's DOM (tests/gates/quest-text-gates.test.jsx), or a kill in the running game
// (tests/e2e/quest-text.spec.js).

const KEY_MAP = Object.freeze([
  // [quest id in a pre-change save, its mob key in kills_by_type] -> [the id this build reads, its mob key]
  [['zombie_slayer', 'zombie'], ['zombie_slayer', 'zombie']],
  [['spider_hunter', 'spider'], ['spider_hunter', 'spider']],
  [['ember_hunter', 'emberhusk'], ['ember_hunter', 'emberhusk']],
  [['undead_destroyer', 'skeleton'], ['undead_destroyer', 'skeleton']],
  [['brute_breaker', 'moss_brute'], ['brute_breaker', 'moss_brute']],
]);

/** A pre-change save's quest state: Zombie Slayer at 7 of 10 under its old words, seven zombies in the kill counter. */
const preChange = () => ({
  quests: [
    { id: 'first_blood', title: 'First Blood', description: 'Cut down the first horror at the gate', icon: 'sword', type: 'kill', target: 1, xpReward: 30, tier: 1, progress: 1, completed: true, claimed: true },
    { id: 'zombie_slayer', title: 'Zombie Slayer', description: 'Defeat 10 zombies', icon: 'zombie', type: 'kill_type', mobType: 'zombie', target: 10, xpReward: 120, tier: 2, progress: 7, completed: false, claimed: false },
  ],
  completedQuestIds: ['first_blood'],
  stats: { kills: 7, kills_by_type: { zombie: 7 }, spells: 0, blocks_placed: 0, blocks_broken: 0, chests: 0, distance: 0, deaths: 0, level: 1 },
  unlockedAchievements: ['first_step'],
});

beforeEach(() => {
  useGameStore.setState(useGameStore.getInitialState(), true);
  GameMethods.grantXP = vi.fn();
  GameMethods.spawnLootDrop = vi.fn();
});
afterEach(() => cleanup());

describe('the key map', () => {
  it('every hunt this build offers is in the map, under the id and mob key a pre-change save holds', () => {
    const hunts = QUEST_LIST.filter((q) => q.mobType).map((q) => [q.id, q.mobType]);
    expect(hunts.length, 'SETUP: no quest hunts one creature').toBeGreaterThan(0);
    expect(hunts, 'a hunt\'s id or mob key moved without an entry in the map').toEqual(KEY_MAP.map(([, now]) => now));
    for (const [was, now] of KEY_MAP) expect(now, `${was.join('/')} maps to a different key`).toEqual(was);
  });
});

describe('a hunt begun before the change', () => {
  it('reads the creature\'s name, keeps its seven kills, and three more Husks complete it under the same counter key', () => {
    useGameStore.setState({ questState: preChange() });
    const { result } = renderHook(() => useQuestSystem());
    const z = () => result.current.quests.find((q) => q.id === 'zombie_slayer');
    expect(z()?.progress, 'the saved hunt lost its progress on load').toBe(7);
    const en = (k, v) => tIn('en', k, v);
    expect([questTitle(en, 'en', z()), questDescription(en, 'en', z())]).toEqual(['Husk Slayer', 'Defeat 10 Husks']);

    for (let i = 0; i < 3; i += 1) act(() => emitMobKill('zombie', [0, 0, 0], 'player'));
    expect({ progress: z().progress, completed: z().completed }, 'three Husk kills did not finish the saved hunt').toEqual({ progress: 10, completed: true });
    const stats = useGameStore.getState().questState.stats;
    expect(stats.kills_by_type, 'the kill counter moved to a different key').toEqual({ zombie: 10 });
  });

  it('a kill of another creature does not count toward it', () => {
    useGameStore.setState({ questState: preChange() });
    const { result } = renderHook(() => useQuestSystem());
    act(() => emitMobKill('emberhusk', [0, 0, 0], 'player'));
    expect(result.current.quests.find((q) => q.id === 'zombie_slayer').progress, 'an Ember Husk counted as a Husk').toBe(7);
    expect(useGameStore.getState().questState.stats.kills_by_type).toEqual({ zombie: 7, emberhusk: 1 });
  });
});
