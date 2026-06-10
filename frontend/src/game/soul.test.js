import { describe, it, expect } from 'vitest';
import { SOUL_MAX, SNARE_COST, FUSE_COST, soulForKill, clampSoul, canSnare, canFuse } from './soul';

describe('S2-B3-M2: the Soul economy (kinetic twin)', () => {
  it('constants: 100 bank, 35 snare, 50 fuse (design §2)', () => {
    expect(SOUL_MAX).toBe(100); expect(SNARE_COST).toBe(35); expect(FUSE_COST).toBe(50);
  });
  it('per-kill gradient matches the economy family (8/16/60, default 12)', () => {
    expect(soulForKill('pig')).toBe(8);
    expect(soulForKill('zombie')).toBe(16);
    expect(soulForKill('mega_boss')).toBe(60);
    expect(soulForKill('unknown_future_mob')).toBe(12);
  });
  it('clampSoul: rounds, clamps [0,MAX], swallows non-finite', () => {
    expect(clampSoul(150)).toBe(100); expect(clampSoul(-5)).toBe(0);
    expect(clampSoul(49.6)).toBe(50); expect(clampSoul(NaN)).toBe(0);
  });
  it('canSnare/canFuse gate on the respective costs', () => {
    expect(canSnare(35)).toBe(true); expect(canSnare(34)).toBe(false);
    expect(canFuse(50)).toBe(true); expect(canFuse(49)).toBe(false);
  });
});
