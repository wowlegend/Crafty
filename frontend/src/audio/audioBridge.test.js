import { describe, it, expect, beforeEach } from 'vitest';
import { setAudioBridge, getAudioBridge } from './audioBridge.js';

describe('audioBridge', () => {
  beforeEach(() => setAudioBridge(null, null));

  it('defaults to a null pair before audio inits', () => {
    expect(getAudioBridge()).toEqual({ ctx: null, busInput: null });
  });
  it('round-trips the published ctx + bus input', () => {
    const ctx = { sampleRate: 48000 };
    const bus = { connect: () => {} };
    setAudioBridge(ctx, bus);
    expect(getAudioBridge()).toEqual({ ctx, busInput: bus });
  });
  it('coerces missing args to null (never undefined)', () => {
    setAudioBridge();
    expect(getAudioBridge()).toEqual({ ctx: null, busInput: null });
  });
});
