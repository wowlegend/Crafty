import { describe, it, expect } from 'vitest';
import { QUEST_LIST } from '../../src/QuestSystem.jsx';

// S8c: the "reach a shrine" pilgrim quest gives the outward journey a concrete GOAL, replacing the
// dead Travel-500 'explorer' quest (which had no driver -> never progressed). reach_shrine progress is
// fired by the shrine-reach poll in useQuestSystem (player within ~10 blocks of nearestLandmark).
describe('S8c pilgrim quest (reach a shrine)', () => {
  it('ships a reach_shrine pilgrim quest', () => {
    const p = QUEST_LIST.find(q => q.type === 'reach_shrine');
    expect(p).toBeTruthy();
    expect(p.target).toBeGreaterThanOrEqual(1);
    expect(typeof p.xpReward).toBe('number');
  });
  it('no longer ships the dead "distance" explorer quest (it had no progress driver)', () => {
    expect(QUEST_LIST.some(q => q.type === 'distance')).toBe(false);
  });
});
