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
  it('the bpm thresholds: boss/swarm 150, pack 130, any 110, calm 110', () => {
    expect(arpeggiatorBpm(true, 0)).toBe(150);
    expect(arpeggiatorBpm(false, 6)).toBe(150);
    expect(arpeggiatorBpm(false, 3)).toBe(130);
    expect(arpeggiatorBpm(false, 1)).toBe(110);
    expect(arpeggiatorBpm(false, 0)).toBe(110);
  });
});
