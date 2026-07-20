// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { SoundProvider, useSounds } from './SoundManager';

// B8 (18-domain review): "spatial audio dead until the first hostile spawns". ROOT CAUSE (verified, not the
// registry's guess): the SoundProvider context `value` exposes `audioContext: audioContext.current` and
// `sounds: sounds.current` -- both REFS captured at render time -- but they are populated in a mount-effect
// (`audioContext.current = new AudioContext()` + generateSounds()). Ref mutations do NOT re-render, so the
// provider keeps handing consumers the STALE first-render undefined/{} until some UNRELATED state change
// re-renders it. SpatialAudioController's effect early-returns on `!audioContext`, so playSpatialSound never
// registers -- and footsteps/jump/swing are silent -- until the first hostile spawn re-renders the provider
// (its music effect keys on activeHostiles). Fix: force one re-render after the audio mount-effect so the
// context value carries the populated refs immediately.
//
// MUTATION-PROOF: remove the `setAudioReady(true)` from the audio init effect and this test goes RED
// (a consumer mounted with the provider still sees an undefined audioContext / empty sounds after init).

// Robust Web-Audio mock: createBuffer returns a real Float32Array channel (the synth voices fill it);
// every other node/param access returns a chainable stub so any synth path completes without throwing.
const audioParam = { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} };
const makeNode = () => new Proxy(function noop() {}, {
  get(_t, p) {
    if (['gain', 'threshold', 'knee', 'ratio', 'attack', 'release', 'frequency', 'Q', 'detune', 'pan', 'delayTime', 'playbackRate'].includes(p)) return audioParam;
    if (p === 'then') return undefined; // not a thenable
    return () => makeNode();
  },
  set() { return true; },
});
function makeCtx() {
  const base = {
    sampleRate: 44100, currentTime: 0, state: 'running', destination: makeNode(),
    createBuffer: (_ch, len) => ({ getChannelData: () => new Float32Array(len) }),
    resume: () => Promise.resolve(), close: () => Promise.resolve(), suspend: () => Promise.resolve(),
    addEventListener() {}, removeEventListener() {},
  };
  return new Proxy(base, { get(t, p) { return p in t ? t[p] : () => makeNode(); } });
}

let captured;
function Probe() { captured = useSounds(); return null; }

describe('SoundProvider audio-ready propagation (B8 spatial-audio init)', () => {
  beforeEach(() => {
    captured = undefined;
    globalThis.AudioContext = function AudioContext() { return makeCtx(); };
    globalThis.webkitAudioContext = globalThis.AudioContext;
    // jsdom has no matchMedia / rAF quirks the pad may touch; keep them benign.
    if (!globalThis.requestAnimationFrame) globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('exposes the initialized audioContext + sounds to consumers immediately after mount', () => {
    render(<SoundProvider><Probe /></SoundProvider>);
    // render() flushes mount effects (wrapped in act). After the audio init effect runs, the provider must
    // have re-rendered so the context value carries the populated refs -- not the stale first-render values.
    expect(captured, 'consumer must receive the context').toBeTruthy();
    expect(captured.audioContext, 'audioContext must be exposed after init (was undefined until an unrelated re-render — the "dead until first hostile" bug)').toBeTruthy();
    expect(Object.keys(captured.sounds || {}).length, 'the synth sound buffers must be exposed after init').toBeGreaterThan(0);
  });
});
