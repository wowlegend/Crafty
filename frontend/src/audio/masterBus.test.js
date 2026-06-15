import { describe, it, expect } from 'vitest';
import { createMasterBus } from './masterBus';

// SFX overhaul Slice 1: a single master bus (gain -> limiter -> destination) so the whole mix (music + SFX)
// routes through ONE limiter before the speakers, instead of each voice connecting straight to destination
// (which lets peaks sum + clip). jsdom has no WebAudio -> a FAKE ctx exercises the wiring (mirrors the
// synthVoices fake-ctx tests beside this file).
const fakeParam = () => { const calls = []; return { setValueAtTime: (v, t) => calls.push([v, t]), _calls: calls }; };
const fakeNode = () => { const conns = []; return { connect: (dst) => conns.push(dst), _conns: conns }; };
const fakeCtx = () => {
  const destination = { _isDestination: true };
  return {
    currentTime: 0,
    destination,
    createGain: () => fakeNode(),
    createDynamicsCompressor: () => ({
      ...fakeNode(),
      threshold: fakeParam(), knee: fakeParam(), ratio: fakeParam(), attack: fakeParam(), release: fakeParam(),
    }),
  };
};

describe('createMasterBus — the single mix bus + limiter (SFX overhaul)', () => {
  it('returns null for a nullish ctx', () => {
    expect(createMasterBus(null)).toBeNull();
    expect(createMasterBus(undefined)).toBeNull();
  });
  it('builds gain(input) -> limiter -> destination', () => {
    const ctx = fakeCtx();
    const bus = createMasterBus(ctx);
    expect(bus).toBeTruthy();
    expect(bus.input).toBeTruthy();
    expect(bus.limiter).toBeTruthy();
    expect(bus.input._conns).toContain(bus.limiter);     // input -> limiter
    expect(bus.limiter._conns).toContain(ctx.destination); // limiter -> destination
  });
  it('sets all 5 limiter params (brickwall-ish: threshold/knee/ratio/attack/release)', () => {
    const bus = createMasterBus(fakeCtx());
    for (const p of ['threshold', 'knee', 'ratio', 'attack', 'release']) {
      expect(bus.limiter[p]._calls.length, p).toBeGreaterThan(0);
    }
  });
});
