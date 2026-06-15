import { describe, it, expect } from 'vitest';
import { VOICES, makeBindSound, makeZapSound } from './synthVoices';

// The DSP's first characterization (S3-M1): jsdom has no WebAudio, so a FAKE ctx exercises
// every factory — buffer shape, audibility, headroom, and two waveform spot-pins.
const fakeCtx = () => ({
  sampleRate: 44100,
  createBuffer: (ch, frames, rate) => {
    // the real API truncates frameCount (unsigned long); several voices compute
    // sampleRate * duration as a float (0.7 * 44100 = 30869.999...)
    const n = Math.floor(frames);
    const d = new Float32Array(n);
    return { length: n, sampleRate: rate, getChannelData: () => d };
  },
});

const ALL_NAMES = [
  'blockPlace', 'blockBreak', 'footstep', 'jump', 'pickup', 'craft', 'magic',
  'attack', 'hit', 'defeat', 'swing',
  'magicCast', 'magicHit', 'magicExplosion', 'magicCharge', 'levelUp',
  'roar', 'aggroGrowl', 'grab', 'hurl', 'slam', 'anvilHit', 'bind',
  'ignite', 'freeze', 'zap', 'rune',
  'motifWildheart', 'motifVoidhand', 'motifSoulbind', 'motifElemancer', // music-motif v2
  'uiOpen', 'uiClose', // UI foley (panel open/close)
  'heartbeat', // low-health danger cue
  'siegeHorn', 'dawnChime', // day/night transition stings
  'fanfare', // reward beat (level-up / achievement / quest complete)
  'victory', // the climax payoff sting (Blight Heart shattered -> VictoryOverlay)
];

describe('the synth voice bank (S3-M1 — the registry contract)', () => {
  it('VOICES holds EXACTLY the 38 registered names', () => {
    expect(Object.keys(VOICES).sort()).toEqual([...ALL_NAMES].sort());
  });
  it('every factory returns a sane, audible, unclipped buffer', () => {
    for (const name of ALL_NAMES) {
      const buf = VOICES[name](fakeCtx());
      expect(buf, `${name} returned nothing`).toBeTruthy();
      expect(buf.length, `${name} empty`).toBeGreaterThan(0);
      expect(buf.length, `${name} absurdly long`).toBeLessThanOrEqual(3 * 44100);
      const d = buf.getChannelData(0);
      let peak = 0;
      for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
      expect(peak, `${name} is silent`).toBeGreaterThan(0.01);
      expect(peak, `${name} clips`).toBeLessThanOrEqual(1.0);
    }
  });
  it('known durations hold (the element voices + the tone-based six)', () => {
    const expectLen = (name, sec) => expect(VOICES[name](fakeCtx()).length).toBe(Math.floor(sec * 44100));
    expectLen('blockPlace', 0.1); expectLen('blockBreak', 0.15); expectLen('footstep', 0.05);
    expectLen('jump', 0.2); expectLen('pickup', 0.1); expectLen('craft', 0.3);
    expectLen('ignite', 0.45); expectLen('freeze', 0.5); expectLen('zap', 0.18); expectLen('rune', 0.7);
  });
  it("waveform pin: the bind chime's G4->C5 rise resolves (the frequency steps up at t=0.18)", () => {
    const d = makeBindSound(fakeCtx()).getChannelData(0);
    // count zero-crossings in two equal windows before/after the step — C5 > G4 means more crossings
    const crossings = (from, to) => {
      let c = 0;
      for (let i = from + 1; i < to; i++) if ((d[i - 1] < 0) !== (d[i] < 0)) c++;
      return c;
    };
    const w = Math.floor(0.10 * 44100);
    expect(crossings(Math.floor(0.20 * 44100), Math.floor(0.20 * 44100) + w))
      .toBeGreaterThan(crossings(Math.floor(0.02 * 44100), Math.floor(0.02 * 44100) + w));
  });
  it('waveform pin: the zap decays fast (amplitude at t=0.15 << t=0.01)', () => {
    const d = makeZapSound(fakeCtx()).getChannelData(0);
    const near = (t) => {
      const i0 = Math.floor(t * 44100);
      let peak = 0;
      for (let i = i0; i < i0 + 200 && i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
      return peak;
    };
    expect(near(0.15)).toBeLessThan(near(0.01) * 0.3);
  });
  it('waveform pin: aggroGrowl is a shorter, higher snarl than the heroic roar', () => {
    const growl = VOICES.aggroGrowl(fakeCtx());
    const roar = VOICES.roar(fakeCtx());
    expect(growl.length).toBeLessThan(roar.length);              // a bark, not a bellow
    const crossings = (buf, sec) => { const d = buf.getChannelData(0); const w = Math.floor(0.08 * 44100);
      const i0 = Math.floor(sec * 44100); let c = 0;
      for (let i = i0 + 1; i < i0 + w && i < d.length; i++) if ((d[i - 1] < 0) !== (d[i] < 0)) c++; return c; };
    expect(crossings(growl, 0.02)).toBeGreaterThan(crossings(roar, 0.02)); // higher pitch = more crossings
  });
});
