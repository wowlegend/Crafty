import { describe, it, expect, beforeEach } from 'vitest';
import { writeSnareState, readSnareState, clearSnareState } from './snareChannel';

beforeEach(() => clearSnareState());

describe('S2-B3-M4: the snare channel transient', () => {
  it('write -> read roundtrip (single slot)', () => {
    writeSnareState({ channeling: true, targetId: 4, progress: 0.5, from: { x: 1, y: 2, z: 3 }, to: { x: 4, y: 5, z: 6 } });
    const s = readSnareState();
    expect(s.channeling).toBe(true);
    expect(s.targetId).toBe(4);
    expect(s.progress).toBe(0.5);
    expect(s.to.x).toBe(4);
  });
  it('clear resets the live flags (positions may go stale — visibility gates on channeling)', () => {
    writeSnareState({ channeling: true, targetId: 4, progress: 0.9 });
    clearSnareState();
    const s = readSnareState();
    expect(s.channeling).toBe(false);
    expect(s.targetId).toBe(null);
    expect(s.progress).toBe(0);
  });
});
