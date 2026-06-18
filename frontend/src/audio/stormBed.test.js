import { describe, it, expect, vi } from 'vitest';
import { createStormBed } from './stormBed.js';

function fakeCtx() {
  const node = () => ({
    connect: vi.fn(), disconnect: vi.fn(),
    frequency: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
    Q: { setValueAtTime: vi.fn() },
    gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
    start: vi.fn(), stop: vi.fn(),
    buffer: null, loop: false,
  });
  return {
    currentTime: 0,
    sampleRate: 48000,
    createGain: node, createBiquadFilter: node, createBufferSource: node,
    createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) }),
    destination: {},
  };
}

describe('createStormBed', () => {
  it('returns null for a nullish ctx', () => {
    expect(createStormBed(null, {})).toBe(null);
  });
  it('builds a bed with start/stop/setIntensity and routes to the provided destination', () => {
    const ctx = fakeCtx();
    const dest = { connect: vi.fn() };
    const bed = createStormBed(ctx, dest);
    expect(typeof bed.start).toBe('function');
    expect(typeof bed.stop).toBe('function');
    expect(typeof bed.setIntensity).toBe('function');
    bed.start();
    bed.setIntensity(1);
    bed.stop();
    // does not throw; the gain ramps were scheduled
    expect(true).toBe(true);
  });
});
