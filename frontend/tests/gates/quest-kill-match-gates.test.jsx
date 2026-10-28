// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { questMatches } from '../../src/game/questMatch';
import { useQuestSystem } from '../../src/QuestSystem';
import { useGameStore } from '../../src/store/useGameStore';
import { emitMobKill } from '../../src/game/mobKillBus';

// B6a + B6b — the two quest-kill bugs, both in one matcher (18-domain review, CRITICAL x2).
//
// B6a DOUBLE COUNT: onMobKill fires BOTH updateQuestProgress('kill') AND ('kill_type',{mobType}) for the
//   same kill; the old matcher advanced a generic 'kill' quest on BOTH -> "Defeat N mobs" completed at half
//   cost (5 kills counted as 10).
// B6b DEAD FILTER: a kill_type quest matched whenever type==='kill_type', never comparing quest.mobType to
//   the killed mob -> killing ANY mob advanced EVERY targeted-hunt quest ("Defeat 5 moss brutes" done on
//   5 spider kills).
//
// FIX = one pure predicate (game/questMatch.js): a 'kill' quest advances only on the 'kill' dispatch; a
// 'kill_type' quest only when the killed mob is its target; everything else on an exact type match.
//
// MUTATION-PROOF: in questMatch.js, re-admit the kill_type echo into generic-kill quests
// (`if (quest.type === 'kill') return type === 'kill' || type === 'kill_type';`) -> B6a tests RED; or drop
// the mob guard (`if (quest.type === 'kill_type') return type === 'kill_type';`) -> B6b tests RED.

describe('B6 questMatches — the pure predicate', () => {
  it('B6a: a generic kill quest advances on the kill dispatch ONLY (not the kill_type echo)', () => {
    const q = { type: 'kill', target: 5 };
    expect(questMatches(q, 'kill')).toBe(true);
    expect(questMatches(q, 'kill_type', { mobType: 'zombie' })).toBe(false); // the echo must NOT double-count
  });

  it('B6b: a kill_type quest advances only for its OWN mob type', () => {
    const q = { type: 'kill_type', mobType: 'zombie', target: 10 };
    expect(questMatches(q, 'kill_type', { mobType: 'zombie' })).toBe(true);
    expect(questMatches(q, 'kill_type', { mobType: 'spider' })).toBe(false); // dead filter fixed
    expect(questMatches(q, 'kill')).toBe(false);                              // a plain kill isn't a hunt
  });

  it('other quest types still match on exact dispatch type', () => {
    expect(questMatches({ type: 'block_place' }, 'block_place')).toBe(true);
    expect(questMatches({ type: 'chest_open' }, 'chest_open')).toBe(true);
    expect(questMatches({ type: 'spell_cast' }, 'block_break')).toBe(false);
    expect(questMatches({ type: 'survive_nights' }, 'survive_nights')).toBe(true);
  });
});

// End-to-end through the REAL hook: seed known quests into questState, fire the REAL onMobKill, assert the
// progress the player actually gets. This proves QuestSystem uses the seam (not just that the seam is right).
const seed = (quests) =>
  useGameStore.setState({ questState: { quests, completedQuestIds: [] } }); // no stats -> hook uses its defaults

const kill = (mobType, n) => {
  for (let i = 0; i < n; i++) act(() => emitMobKill(mobType, [0, 0, 0], 'player'));
};
const progressOf = (result, id) => result.current.quests.find((q) => q.id === id)?.progress;

describe('B6 wiring — the real hook credits kills correctly', () => {
  beforeEach(() => {
    seed([
      { id: 'hunter', title: 'Hunter', type: 'kill', target: 50, progress: 0, completed: false, claimed: false },
      { id: 'zslayer', title: 'Zombie Slayer', type: 'kill_type', mobType: 'zombie', target: 50, progress: 0, completed: false, claimed: false },
    ]);
  });

  it('B6a: 5 kills advance a "Defeat N mobs" quest by 5, not 10', () => {
    const { result } = renderHook(() => useQuestSystem());
    kill('spider', 5);
    expect(progressOf(result, 'hunter')).toBe(5); // RED before the fix: 10 (each kill counted twice)
  });

  it('B6b: killing spiders does NOT advance a "Defeat zombies" hunt', () => {
    const { result } = renderHook(() => useQuestSystem());
    kill('spider', 4);
    expect(progressOf(result, 'zslayer')).toBe(0); // RED before the fix: 4 (any kill advanced it)

    kill('zombie', 3);
    expect(progressOf(result, 'zslayer')).toBe(3); // the RIGHT mob still advances it
    expect(progressOf(result, 'hunter')).toBe(7);  // and every kill still counts once for the generic quest
  });

  it('a Settler kill earns no quest credit and no kill count; a Husk or a Boar kill earns both', () => {
    // A Settler kill pays no XP (mobTypes xp 0), so it may not pay XP through "Defeat N mobs", or count toward the kill
    // achievements (Warrior, Serial Slayer, Centurion) either.
    const { result } = renderHook(() => useQuestSystem());
    kill('villager', 3);
    expect(progressOf(result, 'hunter'), 'killing Settlers advanced a kill quest').toBe(0);
    expect(progressOf(result, 'zslayer')).toBe(0);
    expect(result.current.stats.kills, 'killing Settlers counted toward the kill achievements').toBe(0);
    expect(result.current.stats.kills_by_type.villager, 'Settler kills were tallied by type').toBeUndefined();
    expect(result.current.unlockedAchievements.has('first_kill'), 'a Settler kill unlocked Warrior').toBe(false);
    kill('zombie', 1);
    kill('pig', 1);
    expect(progressOf(result, 'hunter'), 'a Husk or a Boar kill earned no credit — the kill path is dead').toBe(2);
    expect(progressOf(result, 'zslayer')).toBe(1);
    expect(result.current.stats.kills, 'a Husk or a Boar kill was not counted — the stats path is dead').toBe(2);
    expect(result.current.stats.kills_by_type).toMatchObject({ zombie: 1, pig: 1 });
    expect(result.current.unlockedAchievements.has('first_kill'), 'the first Husk kill did not unlock Warrior').toBe(true);
  });
});

// Spell quests count spells that land on an enemy, not casts: ten casts at the sky must not finish Spellcaster, or the
// day quests are claimed automatically casting at nothing pays 40 XP. The magic system calls the store's onSpellHit on a
// hostile landing (tests/gates/spent-spell-record-gates); this is the quest side of that seam.
describe('spell quests count spells that land on an enemy', () => {
  // The shape a save written before the retype holds: the old ask, and progress made under it.
  const oldSpellcaster = {
    id: 'spellcaster', title: 'Spellcaster', icon: 'magic', description: 'Cast 10 spells', type: 'spell_cast',
    target: 10, xpReward: 40, tier: 1, progress: 3, completed: false, claimed: false,
  };
  const quest = (result, id) => result.current.quests.find((q) => q.id === id);

  it('a cast advances no spell quest; a hit on an enemy does, and an old save takes the new ask with its progress', () => {
    seed([oldSpellcaster]);
    const { result } = renderHook(() => useQuestSystem());
    expect(quest(result, 'spellcaster'), 'the old save lost its Spellcaster').toMatchObject({ type: 'spell_hit', progress: 3 });
    expect(quest(result, 'spellcaster').description, 'the old save still shows the old ask').toMatch(/land 10 spells/i);

    const s = useGameStore.getState();
    expect(typeof s.onSpellHit, 'QuestSystem published no onSpellHit for the magic system to call').toBe('function');
    for (let i = 0; i < 5; i++) act(() => useGameStore.getState().onSpellCast());
    expect(result.current.stats.spells, 'the casts never reached the quest system — nothing below is about them').toBe(5);
    expect(quest(result, 'spellcaster').progress, 'casting advanced Spellcaster').toBe(3);
    for (let i = 0; i < 2; i++) act(() => useGameStore.getState().onSpellHit());
    expect(quest(result, 'spellcaster').progress, 'a spell on an enemy did not advance Spellcaster').toBe(5);
  });

  it('a save loaded into a running game takes the new ask too', () => {
    seed([]);
    const { result } = renderHook(() => useQuestSystem());
    act(() => {
      useGameStore.setState({
        questState: { quests: [{ ...oldSpellcaster, id: 'archmage', title: 'Archmage', description: 'Cast 100 spells', target: 100, progress: 40 }], completedQuestIds: [] },
        questLoadedAt: (useGameStore.getState().questLoadedAt || 0) + 1,
      });
    });
    expect(quest(result, 'archmage'), 'the loaded Archmage kept the old ask').toMatchObject({ type: 'spell_hit', progress: 40 });
    expect(quest(result, 'archmage').description).toMatch(/land 100 spells/i);
  });
});
