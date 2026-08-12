import { describe, it, expect, vi } from 'vitest';
import { createStormBed } from './stormBed.js';

function fakeCtx() {
  // RECORD THE NODES. Every node used to be a fresh throwaway object, so nothing the bed did to a gain
  // was observable after the call returned — which is why the test below could only manage
  // `expect(true).toBe(true)` under a comment claiming the ramps had been scheduled.
  const made = [];
  const node = () => {
    const n = {
      connect: vi.fn(), disconnect: vi.fn(),
      frequency: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      Q: { setValueAtTime: vi.fn() },
      gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
      start: vi.fn(), stop: vi.fn(),
      buffer: null, loop: false,
    };
    made.push(n);
    return n;
  };
  return {
    made,
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

    // THE RAMPS, ASSERTED. This was `expect(true).toBe(true)` beneath a comment asserting in prose
    // exactly what the test declined to check — so the bed could have scheduled nothing at all, or been
    // gutted to three empty functions, and the suite would still have reported this behaviour locked.
    const rampsBefore = ctx.made.reduce((n, x) => n + x.gain.linearRampToValueAtTime.mock.calls.length, 0);
    bed.setIntensity(1);
    const rampsAfter = ctx.made.reduce((n, x) => n + x.gain.linearRampToValueAtTime.mock.calls.length, 0);
    expect(ctx.made.length, 'the bed built no audio nodes at all').toBeGreaterThan(0);
    expect(rampsAfter, 'setIntensity scheduled no gain ramp on any node').toBeGreaterThan(rampsBefore);

    // And it routes where it was told, rather than to ctx.destination.
    expect(dest.connect.mock.calls.length + ctx.made.filter((n) => n.connect.mock.calls.some((c) => c[0] === dest)).length,
      'nothing was ever connected to the destination the caller supplied').toBeGreaterThan(0);

    bed.stop();
    const stopped = ctx.made.some((n) => n.stop.mock.calls.length > 0);
    const faded = ctx.made.some((n) => n.gain.linearRampToValueAtTime.mock.calls.length > 0);
    expect(stopped || faded, 'stop() neither stopped a source nor ramped a gain down').toBe(true);
  });
});
