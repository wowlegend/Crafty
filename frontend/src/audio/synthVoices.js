/**
 * synthVoices.js — the all-synth voice bank (#74): EVERY game sound as a pure
 * (ctx) => AudioBuffer factory over a caller-supplied AudioContext. Extracted from
 * SoundManager (S3-M1, the first de-monolith cut): the waveform math is VERBATIM —
 * byte-identical buffers — and the fake-ctx tests beside this file are the DSP's
 * first-ever characterization (the closures were untestable until this move).
 * The VOICES registry is the one source of truth for the named-buffer set; the
 * SoundProvider loops it at init.
 */

export const makeTone = (ctx, frequency, duration, type = 'sine') => {
    if (!ctx) return null;

    const sampleRate = ctx.sampleRate;
    const frameCount = sampleRate * duration;
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      let sample = 0;

      switch (type) {
        case 'sine':
          sample = Math.sin(2 * Math.PI * frequency * t);
          break;
        case 'square':
          sample = Math.sin(2 * Math.PI * frequency * t) > 0 ? 1 : -1;
          break;
        case 'sawtooth':
          sample = 2 * (t * frequency - Math.floor(t * frequency + 0.5));
          break;
        case 'triangle':
          sample = 2 * Math.abs(2 * (t * frequency - Math.floor(t * frequency + 0.5))) - 1;
          break;
      }

      // Apply envelope
      const envelope = Math.exp(-t * 5);
      channelData[i] = sample * envelope * 0.3;
    }

    return buffer;
};

export const makeNoise = (ctx, duration) => {
    if (!ctx) return null;

    const sampleRate = ctx.sampleRate;
    const frameCount = sampleRate * duration;
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      const envelope = Math.exp(-i / frameCount * 10);
      channelData[i] = (Math.random() * 2 - 1) * envelope * 0.1;
    }

    return buffer;
};

export const makeRoarSound = (ctx) => {
    if (!ctx) return null;
    const sampleRate = ctx.sampleRate;
    const duration = 0.7;
    const frameCount = sampleRate * duration;
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const d = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      const k = t / duration;
      const freq = 80 - 35 * k; // feral low sweep 80 -> 45Hz
      const saw = 2 * (t * freq - Math.floor(t * freq + 0.5));
      const growl = Math.sin(2 * Math.PI * freq * 2.02 * t) * 0.5; // slow-beating layer
      const noise = (Math.random() * 2 - 1) * Math.exp(-t * 6) * 0.35;
      const sub = Math.sin(2 * Math.PI * 38 * t) * Math.exp(-t * 3) * 0.5;
      const env = Math.min(t * 18, 1) * Math.exp(-t * 2.2);
      d[i] = (saw * 0.5 + growl + noise + sub) * env * 0.4;
    }
    return buffer;
};

// The ENEMY snarl (player-vs-enemy audio split): a SHORT, gnarly bark fired when a mob goes aggro —
// deliberately higher + shorter + nastier than the heroic WILDHEART roar so a threat reads as a threat,
// not the hero. A lunging pitch (snaps up then sags) + a dissonant fifth overtone = menace.
export const makeAggroGrowl = (ctx) => {
    if (!ctx) return null;
    const sampleRate = ctx.sampleRate;
    const duration = 0.34;                       // a short bark vs the roar's 0.7 bellow
    const frameCount = sampleRate * duration;
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const d = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      const k = t / duration;
      const freq = 130 + 60 * Math.exp(-k * 6) - 40 * k; // a lunge: ~190 snaps down to ~90Hz
      const saw = 2 * (t * freq - Math.floor(t * freq + 0.5));
      const rasp = Math.sin(2 * Math.PI * freq * 1.5 * t) * 0.4; // a dissonant fifth = menace
      const noise = (Math.random() * 2 - 1) * Math.exp(-t * 10) * 0.4; // a teeth/bite transient
      const env = Math.min(t * 60, 1) * Math.exp(-t * 5.5);          // snap-attack, quick decay
      d[i] = (saw * 0.55 + rasp + noise) * env * 0.42;               // peak ~0.5 (headroom safe)
    }
    return buffer;
};

export const makeGrabSound = (ctx) => {
    if (!ctx) return null;
    const sampleRate = ctx.sampleRate;
    const duration = 0.3;
    const frameCount = sampleRate * duration;
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const d = buffer.getChannelData(0);
    const WT = Math.pow(2, 2 / 12); // a whole tone
    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      const k = t / duration;
      const f = 220 + 300 * k; // weightless rise
      const tri = 2 * Math.abs(2 * (t * f - Math.floor(t * f + 0.5))) - 1;
      const sh1 = Math.sin(2 * Math.PI * f * WT * WT * t) * 0.3;  // +2 whole tones
      const sh2 = Math.sin(2 * Math.PI * f * WT * WT * WT * WT * t) * 0.18; // +4 whole tones
      const env = Math.min(t * 30, 1) * Math.exp(-t * 7);
      d[i] = (tri * 0.5 + sh1 + sh2) * env * 0.35;
    }
    return buffer;
};

export const makeHurlSound = (ctx) => {
    if (!ctx) return null;
    const sampleRate = ctx.sampleRate;
    const duration = 0.3;
    const frameCount = sampleRate * duration;
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const d = buffer.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      const k = t / duration;
      const cutoff = 0.45 - 0.38 * k; // crude one-pole sweep down
      lp = lp + cutoff * ((Math.random() * 2 - 1) - lp);
      const body = Math.sin(2 * Math.PI * (600 - 450 * k) * t) * 0.25;
      const env = Math.min(t * 25, 1) * Math.exp(-t * 6);
      d[i] = (lp * 0.8 + body) * env * 0.5;
    }
    return buffer;
};

export const makeSlamSound = (ctx) => {
    if (!ctx) return null;
    const sampleRate = ctx.sampleRate;
    const duration = 0.28;
    const frameCount = sampleRate * duration;
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const d = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      const click = (Math.random() * 2 - 1) * Math.exp(-t * 120) * 0.6;
      const thump = Math.sin(2 * Math.PI * (90 - 40 * t / duration) * t) * Math.exp(-t * 10);
      const sub = Math.sin(2 * Math.PI * 45 * t) * Math.exp(-t * 7) * 0.6;
      d[i] = (click + thump + sub) * 0.55;
    }
    // headroom guard: the random click + thump + sub can RARELY sum past 1.0 (~4% of seeds clipped at
    // ~1.0005); normalize the rare loud buffer down so it never clips (common case untouched). Same
    // pattern as aspectMotifs.makeArp. Keeps the voice-bank's "unclipped" contract deterministic.
    let peak = 0;
    for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
    if (peak > 0.98) for (let i = 0; i < d.length; i++) d[i] *= 0.98 / peak;
    return buffer;
};

export const makeAnvilSound = (ctx) => {
    if (!ctx) return null;
    const sampleRate = ctx.sampleRate;
    const duration = 0.22;
    const frameCount = sampleRate * duration;
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const d = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      const mod = Math.sin(2 * Math.PI * 320 * t) * 7 * Math.exp(-t * 9); // FM index decays
      const carrier = Math.sin(2 * Math.PI * 1180 * t + mod);
      const shimmer = Math.sin(2 * Math.PI * 2360 * t + mod * 0.5) * 0.3;
      const env = Math.min(t * 60, 1) * Math.exp(-t * 14);
      d[i] = (carrier + shimmer) * env * 0.4;
    }
    return buffer;
};

export const makeIgniteSound = (ctx) => {
    if (!ctx) return null;
    const sampleRate = ctx.sampleRate;
    const duration = 0.45;
    const frameCount = sampleRate * duration;
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const d = buffer.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      // a noise WHOOSH sweeping down (800->300Hz one-pole) + three crackle ticks
      const cutoff = 800 - 500 * (t / duration);
      const alpha = Math.min((2 * Math.PI * cutoff) / sampleRate, 1);
      lp += alpha * ((Math.random() * 2 - 1) - lp);
      const crackle = (t > 0.12 && t < 0.14) || (t > 0.22 && t < 0.235) || (t > 0.33 && t < 0.345)
        ? (Math.random() * 2 - 1) * 0.6 : 0;
      const env = Math.min(t * 30, 1) * Math.exp(-t * 5);
      d[i] = (lp * 0.85 + crackle) * env * 0.5;
    }
    return buffer;
};

export const makeFreezeSound = (ctx) => {
    if (!ctx) return null;
    const sampleRate = ctx.sampleRate;
    const duration = 0.5;
    const frameCount = sampleRate * duration;
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const d = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      // a descending crystalline shimmer: 1400->700Hz with a detuned twin
      const f = 1400 - 700 * (t / duration);
      const a = Math.sin(2 * Math.PI * f * t);
      const b = Math.sin(2 * Math.PI * f * 1.007 * t) * 0.7;
      const sparkle = Math.sin(2 * Math.PI * f * 3 * t) * 0.15 * Math.exp(-t * 8);
      const env = Math.min(t * 20, 1) * Math.exp(-t * 4);
      d[i] = (a * 0.4 + b * 0.3 + sparkle) * env * 0.42;
    }
    return buffer;
};

export const makeZapSound = (ctx) => {
    if (!ctx) return null;
    const sampleRate = ctx.sampleRate;
    const duration = 0.18;
    const frameCount = sampleRate * duration;
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const d = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      // a bright sawtooth snap + a noise transient, fast decay
      const f = 220;
      const saw = 2 * (t * f - Math.floor(t * f + 0.5));
      const snap = t < 0.02 ? (Math.random() * 2 - 1) * 0.8 : 0;
      const env = Math.exp(-t * 22);
      d[i] = (saw * 0.5 + snap) * env * 0.5;
    }
    return buffer;
};

export const makeRuneSound = (ctx) => {
    if (!ctx) return null;
    const sampleRate = ctx.sampleRate;
    const duration = 0.7;
    const frameCount = sampleRate * duration;
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const d = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      // two soft sines a fifth apart, a slow swell — the catalyst HUM (arcane bends, never bites)
      const a = Math.sin(2 * Math.PI * 330 * t);
      const b = Math.sin(2 * Math.PI * 495 * t) * 0.6;
      const breath = 1 + 0.12 * Math.sin(2 * Math.PI * 6 * t);
      const env = Math.min(t * 6, 1) * Math.exp(-Math.max(t - 0.35, 0) * 6);
      d[i] = (a * 0.4 + b * 0.3) * breath * env * 0.38;
    }
    return buffer;
};

export const makeBindSound = (ctx) => {
    if (!ctx) return null;
    const sampleRate = ctx.sampleRate;
    const duration = 0.45;
    const frameCount = sampleRate * duration;
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const d = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      const f = t < 0.18 ? 392 : 523.25; // G4 -> C5: the rise RESOLVES (binding lands)
      const tri = 2 * Math.abs(2 * (t * f - Math.floor(t * f + 0.5))) - 1;
      const shimmer = Math.sin(2 * Math.PI * f * 2 * t) * 0.2;
      const env = Math.min(t * 25, 1) * Math.exp(-t * 4.5);
      d[i] = (tri * 0.55 + shimmer) * env * 0.4;
    }
    return buffer;
};

export const makeAttackSound = (ctx) => {
    if (!ctx) return null;

    const sampleRate = ctx.sampleRate;
    const duration = 0.2;
    const frameCount = sampleRate * duration;
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      const freq = 180 + Math.sin(t * 50) * 30;
      const sample = Math.sin(2 * Math.PI * freq * t);
      const envelope = Math.exp(-t * 8);
      channelData[i] = sample * envelope * 0.3;
    }

    return buffer;
};

export const makeHitSound = (ctx) => {
    if (!ctx) return null;

    const sampleRate = ctx.sampleRate;
    const duration = 0.15;
    const frameCount = sampleRate * duration;
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      const noise = (Math.random() - 0.5) * 2;
      const tone = Math.sin(2 * Math.PI * 120 * t);
      const envelope = Math.exp(-t * 12);
      channelData[i] = (noise * 0.7 + tone * 0.3) * envelope * 0.4;
    }

    return buffer;
};

export const makeDefeatSound = (ctx) => {
    if (!ctx) return null;

    const sampleRate = ctx.sampleRate;
    const duration = 0.8;
    const frameCount = sampleRate * duration;
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      const freq = 200 - t * 150; // Descending frequency
      const sample = Math.sin(2 * Math.PI * freq * t);
      const envelope = Math.exp(-t * 2);
      channelData[i] = sample * envelope * 0.3;
    }

    return buffer;
};

export const makeSwingSound = (ctx) => {
    if (!ctx) return null;

    const sampleRate = ctx.sampleRate;
    const duration = 0.3;
    const frameCount = sampleRate * duration;
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      const freq = 80 + t * 200; // Rising whoosh sound
      const noise = (Math.random() - 0.5) * 2;
      const tone = Math.sin(2 * Math.PI * freq * t);
      const envelope = Math.sin(Math.PI * t / duration);
      channelData[i] = (noise * 0.8 + tone * 0.2) * envelope * 0.2;
    }

    return buffer;
};

export const makeMagicSound = (ctx) => {
    if (!ctx) return null;

    const sampleRate = ctx.sampleRate;
    const duration = 0.5;
    const frameCount = sampleRate * duration;
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      const freq1 = 440 + Math.sin(t * 20) * 100;
      const freq2 = 660 + Math.cos(t * 15) * 80;

      const sample1 = Math.sin(2 * Math.PI * freq1 * t);
      const sample2 = Math.sin(2 * Math.PI * freq2 * t);

      const envelope = Math.exp(-t * 2);
      channelData[i] = (sample1 + sample2) * envelope * 0.2;
    }

    return buffer;
};

export const makeMagicCastSound = (ctx) => {
    if (!ctx) return null;

    const sampleRate = ctx.sampleRate;
    const duration = 0.6;
    const frameCount = sampleRate * duration;
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      const freq1 = 440 + Math.sin(t * 30) * 150;
      const freq2 = 880 + Math.cos(t * 25) * 200;
      const freq3 = 220 + Math.sin(t * 40) * 100;

      const sample1 = Math.sin(2 * Math.PI * freq1 * t);
      const sample2 = Math.sin(2 * Math.PI * freq2 * t) * 0.5;
      const sample3 = Math.sin(2 * Math.PI * freq3 * t) * 0.3;

      const envelope = Math.sin(Math.PI * t / duration) * Math.exp(-t * 1.5);
      channelData[i] = (sample1 + sample2 + sample3) * envelope * 0.15;
    }

    return buffer;
};

export const makeMagicHitSound = (ctx) => {
    if (!ctx) return null;

    const sampleRate = ctx.sampleRate;
    const duration = 0.3;
    const frameCount = sampleRate * duration;
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      const noise = (Math.random() - 0.5) * 2;
      const freq = 300 + Math.sin(t * 50) * 200;
      const tone = Math.sin(2 * Math.PI * freq * t);

      const envelope = Math.exp(-t * 8);
      channelData[i] = (noise * 0.4 + tone * 0.6) * envelope * 0.3;
    }

    return buffer;
};

export const makeMagicExplosionSound = (ctx) => {
    if (!ctx) return null;

    const sampleRate = ctx.sampleRate;
    const duration = 1.0;
    const frameCount = sampleRate * duration;
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      const noise = (Math.random() - 0.5) * 2;
      const freq = 100 - t * 80; // Descending boom
      const tone = Math.sin(2 * Math.PI * freq * t);

      const envelope = Math.exp(-t * 3);
      channelData[i] = (noise * 0.7 + tone * 0.3) * envelope * 0.4;
    }

    return buffer;
};

export const makeMagicChargeSound = (ctx) => {
    if (!ctx) return null;

    const sampleRate = ctx.sampleRate;
    const duration = 0.8;
    const frameCount = sampleRate * duration;
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      const freq = 200 + t * 400; // Rising charge sound
      const sample = Math.sin(2 * Math.PI * freq * t);

      const envelope = t / duration * Math.exp(-t * 0.5);
      channelData[i] = sample * envelope * 0.2;
    }

    return buffer;
};

export const makeLevelUpSound = (ctx) => {
    if (!ctx) return null;

    const sampleRate = ctx.sampleRate;
    const duration = 1.5;
    const frameCount = sampleRate * duration;
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;

      // Triumphant chord progression
      const freq1 = 440; // A
      const freq2 = 554.37; // C#
      const freq3 = 659.25; // E
      const freq4 = 880; // A octave

      const sample1 = Math.sin(2 * Math.PI * freq1 * t);
      const sample2 = Math.sin(2 * Math.PI * freq2 * t);
      const sample3 = Math.sin(2 * Math.PI * freq3 * t);
      const sample4 = Math.sin(2 * Math.PI * freq4 * t) * 0.5;

      const envelope = Math.sin(Math.PI * t / duration) * Math.exp(-t * 0.8);
      channelData[i] = (sample1 + sample2 + sample3 + sample4) * envelope * 0.1;
    }

    return buffer;
};


// UI foley: soft, low-gain panel open (rising) / close (falling) clicks. Subtle by design (peak ~0.2)
// so menu chrome feels responsive without being intrusive. Same pure (ctx)=>AudioBuffer contract.
export const makeUIOpen = (ctx) => {
    if (!ctx) return null;
    const sr = ctx.sampleRate, dur = 0.13, n = Math.floor(sr * dur);
    const b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const t = i / sr, k = t / dur;
      const f = 480 + 260 * k; // gentle rise 480 -> 740
      const env = Math.min(t * 60, 1) * Math.exp(-t * 9);
      d[i] = Math.sin(2 * Math.PI * f * t) * env * 0.22;
    }
    return b;
};
export const makeUIClose = (ctx) => {
    if (!ctx) return null;
    const sr = ctx.sampleRate, dur = 0.13, n = Math.floor(sr * dur);
    const b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const t = i / sr, k = t / dur;
      const f = 620 - 220 * k; // gentle fall 620 -> 400
      const env = Math.min(t * 60, 1) * Math.exp(-t * 10);
      d[i] = Math.sin(2 * Math.PI * f * t) * env * 0.2;
    }
    return b;
};

import { MOTIFS } from './aspectMotifs';

/** name -> factory; the SoundProvider's generateSounds loops this registry. */
export const VOICES = {
  ...MOTIFS, // music-motif v2: the per-Aspect stingers (audio/aspectMotifs.js)
  blockPlace: (ctx) => makeTone(ctx, 200, 0.1, 'square'),
  blockBreak: (ctx) => makeTone(ctx, 150, 0.15, 'sawtooth'),
  footstep: (ctx) => makeNoise(ctx, 0.05),
  jump: (ctx) => makeTone(ctx, 300, 0.2, 'sine'),
  pickup: (ctx) => makeTone(ctx, 400, 0.1, 'sine'),
  craft: (ctx) => makeTone(ctx, 350, 0.3, 'triangle'),
  magic: makeMagicSound,
  attack: makeAttackSound,
  hit: makeHitSound,
  defeat: makeDefeatSound,
  swing: makeSwingSound,
  magicCast: makeMagicCastSound,
  magicHit: makeMagicHitSound,
  magicExplosion: makeMagicExplosionSound,
  magicCharge: makeMagicChargeSound,
  levelUp: makeLevelUpSound,
  roar: makeRoarSound,
  aggroGrowl: makeAggroGrowl,
  uiOpen: makeUIOpen,
  uiClose: makeUIClose,
  grab: makeGrabSound,
  hurl: makeHurlSound,
  slam: makeSlamSound,
  anvilHit: makeAnvilSound,
  bind: makeBindSound,
  ignite: makeIgniteSound,
  freeze: makeFreezeSound,
  zap: makeZapSound,
  rune: makeRuneSound,
};
