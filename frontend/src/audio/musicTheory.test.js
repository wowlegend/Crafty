import { describe, it, expect } from 'vitest';
import { DAY_CHORDS, NIGHT_CHORDS, BOSS_CHORDS, arpeggiatorBpm } from './musicTheory';

describe('music theory (S3-M1 T2 — the arpeggiator brain)', () => {
  it('the three chord tables exist and hold frequency rows', () => {
    for (const prog of [DAY_CHORDS, NIGHT_CHORDS, BOSS_CHORDS]) {
      expect(prog.length).toBeGreaterThan(0);
      for (const chord of prog) {
        expect(chord.length).toBeGreaterThan(0);
        for (const f of chord) expect(f).toBeGreaterThan(20);
      }
    }
  });
  // EXHAUSTIVE ACROSS EVERY BOUNDARY AND ITS NEIGHBOUR, so the ladder is pinned by behaviour rather
  // than by how it happens to be branched. The old case sampled 0/1/3/6 and could not tell a three-rung
  // ladder from a four-rung one — which mattered, because the source carried a `>= 1 return 110` branch
  // sitting directly above `return 110`, unable to change any answer.
  it('the bpm thresholds: boss/swarm 150, pack 130, otherwise 110', () => {
    expect(arpeggiatorBpm(true, 0)).toBe(150);
    for (const [n, bpm] of [[0, 110], [1, 110], [2, 110], [3, 130], [4, 130], [5, 130], [6, 150], [7, 150], [20, 150]]) {
      expect(arpeggiatorBpm(false, n), `hostileCount ${n} should give ${bpm}`).toBe(bpm);
    }
    // A boss outranks the count at every rung, including the quiet one.
    for (const n of [0, 2, 5, 9]) expect(arpeggiatorBpm(true, n)).toBe(150);
  });
});
