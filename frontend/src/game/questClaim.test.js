import { describe, it, expect } from 'vitest';
import { reduceClaim, MAX_ACTIVE_QUESTS } from './questClaim.js';

const q = (id, over = {}) => ({ id, title: id, completed: false, claimed: false, ...over });

describe('reduceClaim — pure quest-claim reduction', () => {
  it('claims a completed+unclaimed quest: returns it, records completion, drops it from the feed', () => {
    const state = { quests: [q('a', { completed: true }), q('b')], completedQuestIds: new Set() };
    const out = reduceClaim(state, 'a');
    expect(out.claimed?.id).toBe('a');
    expect(out.completedQuestIds.has('a')).toBe(true);
    expect(out.quests.map((x) => x.id)).toEqual(['b']); // 'a' left the active feed
  });

  it('is idempotent for an unclaimable id: same identities, claimed null (no double-pay)', () => {
    const state = { quests: [q('a', { completed: true, claimed: true })], completedQuestIds: new Set(['a']) };
    const out = reduceClaim(state, 'a');
    expect(out.claimed).toBeNull();
    expect(out.quests).toBe(state.quests);            // identity preserved
    expect(out.completedQuestIds).toBe(state.completedQuestIds);
  });

  it('a not-yet-completed quest cannot be claimed', () => {
    const state = { quests: [q('a', { completed: false })], completedQuestIds: new Set() };
    expect(reduceClaim(state, 'a').claimed).toBeNull();
  });

  it('pickNext refills the feed when there is room, but only then', () => {
    const state = { quests: [q('a', { completed: true }), q('b')], completedQuestIds: new Set() };
    const out = reduceClaim(state, 'a', () => q('c'));
    expect(out.quests.map((x) => x.id)).toEqual(['b', 'c']);
    // full feed -> no refill
    const full = { quests: [q('a', { completed: true }), q('b'), q('c'), q('d')], completedQuestIds: new Set() };
    const out2 = reduceClaim(full, 'a', () => q('e'));
    expect(out2.quests.length).toBe(MAX_ACTIVE_QUESTS); // 3 remain (b,c,d), refill blocked at the cap
  });

  it('a null/undefined quest entry does not crash the claim (feed filter is null-guarded like the find)', () => {
    // The find() on line 46 already guarded `q && ...`; the active-feed filter did not, so a null entry
    // threw on q.id. MUTATION-PROOF: drop the `q &&` from the filter and this throws instead of dropping
    // the null.
    const state = { quests: [null, q('a', { completed: true }), undefined, q('b')], completedQuestIds: new Set() };
    let out;
    expect(() => { out = reduceClaim(state, 'a'); }).not.toThrow();
    expect(out.claimed?.id).toBe('a');
    expect(out.quests.map((x) => x.id)).toEqual(['b']); // null + undefined + claimed 'a' all dropped
  });
});
