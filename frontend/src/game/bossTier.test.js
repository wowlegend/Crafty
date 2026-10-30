import { describe, it, expect } from 'vitest';
import { bossTierStats } from './bossTier.js';
import { CORE_MOVES } from './dragonMoves.js';

// THE MOVES A TIER KNOWS (DECISIONS 2026-10-30 item 123). Every tier carries its tricks, the one list the move machine
// reads for its non-core moves (game/dragonMoves.js), so a later unit can add a move to a return and move 14 can take
// one away (tricks.filter) without touching the machine. The core moves are not tricks and cannot be removed.
//
// Mutation-Proof: via scripts/dev/mutate.sh, each observed RED, an identity mutant (a comment edit) GREEN:
//   N0 the returning tiers' tricks dropped (only tier 0 has a list) -> "every tier carries its tricks"
//   N1 a core move put in the list -> "never a core move"
//   N2 tier 0 hands out the one shared list -> "a fresh list each call"
describe('bossTierStats(tier).tricks', () => {
  it('every tier carries its tricks: fireball, lava and summon from the first fight on', () => {
    for (let t = 0; t <= 4; t++) {
      const { tricks } = bossTierStats(t);
      expect(Array.isArray(tricks), `tier ${t} has no tricks list`).toBe(true);
      for (const m of ['fireball', 'lava', 'summon']) expect(tricks, `tier ${t}`).toContain(m);
    }
  });
  it('never a core move', () => {
    for (let t = 0; t <= 4; t++) for (const m of CORE_MOVES) expect(bossTierStats(t).tricks, `tier ${t}`).not.toContain(m);
  });
  it('a fresh list each call, so removing a trick for one fight leaves the tier alone', () => {
    for (let t = 0; t <= 2; t++) {
      const a = bossTierStats(t).tricks;
      a.splice(0, 1);
      expect(bossTierStats(t).tricks, `tier ${t}`).toContain('fireball');
    }
  });
});
