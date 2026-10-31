// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import React from 'react';
import { render, act, cleanup } from '@testing-library/react';

const r3f = vi.hoisted(() => ({ frame: null, camera: { position: { x: 0, y: 60, z: 0 } } }));
vi.mock('@react-three/fiber', () => ({
  useFrame: (cb) => { r3f.frame = cb; },
  useThree: () => ({ camera: r3f.camera }),
}));

import { SoundProvider, useSounds } from '../../src/SoundManager';
import { PositionTracker } from '../../src/systems/PositionTracker';
import { useGameStore } from '../../src/store/useGameStore';
import { biomeAmbience } from '../../src/audio/biomeAmbience.js';
import { surfaceBlockAt, seedClimate } from '../../src/world/climate.js';
import { SEA_LEVEL } from '../../src/world/oceanProfile.js';
import { loadTerrainWorker, sendToWorker as send, workerVoxel, pickEdgeColumns } from '../_support/terrainWorker.js';

/**
 * THE WIND BED, AS THE GAME FEEDS IT (AUDIT:ultra:ultra-player-world-9). water-one-predicate-gates holds that the
 * sampler, `ambienceAt`, answers for the column a position is in. That says nothing about which position the sound
 * layer hands it: the store's `playerPosition` is the camera rounded to whole metres (systems/PositionTracker.jsx), and
 * the rounded point is the next column over whenever the player is at or past the middle of a block, so a wind bed fed
 * the store sounds underwater on dry sand however right the sampler is.
 *
 * This drives the whole chain with no model of its links: the camera at a float position, the real PositionTracker
 * frame callback writing the real store, the real SoundProvider's 8 s step interval, and the cutoff it ramps the wind
 * bed's bandpass filter to. The one modelled link is the Player publishing the R3F camera as `gameCamera`
 * (Components.jsx, `useGameStore.setState({ gameCamera: camera })`): the same object PositionTracker reads through
 * useThree. The truth is what the real terrain worker put above the column the camera stands in (Math.floor of x and z:
 * the mesher puts a block at local x over [x, x + 1) and the chunk group at cx * 16).
 *
 * Mutation-Proof: see the commit trailer.
 */

const SEEDS = [12345, 777];
const PER_CLASS = 8;
const SUBDIV = 4;
const CLASSES = [SEA_LEVEL - 1, SEA_LEVEL, SEA_LEVEL + 1];
const UNDERWATER_CUTOFF = biomeAmbience(0, true).cutoff;
const STEP_MS = 8000; // SoundManager's step interval

// The one fake is the AudioContext (jsdom has none): every node keeps its own params, and frequency ramps are logged.
const nodes = [];
const ramps = [];
function makeParam(node, name) {
  return {
    value: 0,
    setValueAtTime(v) { this.value = v; return this; },
    linearRampToValueAtTime(v) { if (name === 'frequency') ramps.push({ node, v }); this.value = v; return this; },
    exponentialRampToValueAtTime() { return this; },
    setTargetAtTime() { return this; },
    cancelScheduledValues() { return this; },
  };
}
const PARAMS = ['gain', 'frequency', 'Q', 'detune', 'pan', 'delayTime', 'playbackRate', 'threshold', 'knee', 'ratio', 'attack', 'release'];
function makeNode(kind) {
  const node = { kind, type: '' };
  for (const p of PARAMS) node[p] = makeParam(node, p);
  nodes.push(node);
  const proxy = new Proxy(node, {
    get(o, p) { if (p in o) return o[p]; if (p === 'then') return undefined; return () => proxy; },
    set(o, p, v) { o[p] = v; return true; },
  });
  return proxy;
}
function makeCtx() {
  const base = {
    sampleRate: 44100, currentTime: 0, state: 'running', destination: makeNode('destination'),
    createBuffer: (ch, len) => ({ length: len, numberOfChannels: ch, getChannelData: () => new Float32Array(len) }),
    createBiquadFilter: () => makeNode('biquad'),
    createGain: () => makeNode('gain'),
    createOscillator: () => makeNode('osc'),
    createBufferSource: () => makeNode('source'),
    resume: () => Promise.resolve(), close: () => Promise.resolve(), suspend: () => Promise.resolve(),
    addEventListener() {}, removeEventListener() {},
  };
  return new Proxy(base, { get(t, p) { return p in t ? t[p] : () => makeNode(String(p)); } });
}

let sounds;
function SoundsProbe() { sounds = useSounds(); return null; }
let bed;

beforeAll(async () => {
  globalThis.AudioContext = function AudioContext() { return makeCtx(); };
  globalThis.webkitAudioContext = globalThis.AudioContext;
  await loadTerrainWorker();
  render(<SoundProvider><SoundsProbe /></SoundProvider>);
  render(<PositionTracker />);
  useGameStore.setState({ gameCamera: r3f.camera });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
  act(() => { sounds.playBackgroundMusic(); });
  const bandpass = nodes.filter((n) => n.kind === 'biquad' && n.type === 'bandpass');
  expect(bandpass.length, 'SETUP: exactly one bandpass filter (the wind bed) was built').toBe(1);
  bed = bandpass[0];
});
afterAll(() => {
  vi.useRealTimers();
  cleanup();
  useGameStore.setState({ gameCamera: null });
});

describe.each(SEEDS)('seed %i: the wind bed the game plays inside a shore column is that column\'s', (seed) => {
  let readings;
  beforeAll(() => {
    send('init', { seed });
    seedClimate(seed);
    readings = [];
    for (const [surfaceY, list] of pickEdgeColumns(CLASSES, SEA_LEVEL)) {
      for (const [x, z] of list) {
        const workerWater = workerVoxel(x, surfaceY + 1, z) === 9;
        for (let i = 0; i < SUBDIV; i++) {
          for (let j = 0; j < SUBDIV; j++) {
            const px = x + (i + 0.5) / SUBDIV, pz = z + (j + 0.5) / SUBDIV;
            r3f.camera.position = { x: px, y: 60.37, z: pz };
            vi.advanceTimersByTime(250); // past PositionTracker's 200 ms throttle
            useGameStore.setState({ playerPosition: { x: NaN, y: NaN, z: NaN } });
            r3f.frame();
            const store = useGameStore.getState().playerPosition;
            const before = ramps.length;
            vi.advanceTimersByTime(STEP_MS);
            const mine = ramps.slice(before).filter((r) => r.node === bed);
            readings.push({ x, z, px, pz, surfaceY, workerWater, store: { ...store }, cutoff: mine.length ? mine[mine.length - 1].v : NaN });
          }
        }
      }
    }
  });

  it('SETUP: every position went through the real tracker and the real interval, and the store\'s point misleads', () => {
    for (const c of CLASSES) expect(readings.filter((r) => r.surfaceY === c).length, `positions in surfaceY ${c} columns`).toBe(PER_CLASS * SUBDIV * SUBDIV);
    expect(readings.filter((r) => r.surfaceY === SEA_LEVEL - 1).every((r) => r.workerWater), 'the cell above a surfaceY 27 column is not water').toBe(true);
    expect(readings.filter((r) => r.surfaceY >= SEA_LEVEL).some((r) => r.workerWater), 'water above a column at or over the sea').toBe(false);
    const written = readings.filter((r) => Number.isFinite(r.store.x) && Math.abs(r.store.x - r.px) <= 1 && Math.abs(r.store.z - r.pz) <= 1);
    expect(written.length, 'positions where PositionTracker wrote the store from the camera').toBe(readings.length);
    expect(readings.filter((r) => Number.isFinite(r.cutoff)).length, 'positions where the SoundManager interval ramped the wind bed').toBe(readings.length);
    // A probe that cannot see the defect proves nothing: a sound fed the store's point must be wrong somewhere in here.
    const storeWrong = readings.filter((r) => surfaceBlockAt(Math.floor(r.store.x), Math.floor(r.store.z)).isWater !== r.workerWater);
    expect(storeWrong.length, 'positions where the store\'s point is in a column of the other water state').toBeGreaterThan(0);
  });

  it('the wind bed sounds underwater exactly where the worker put water above the column the camera stands in', () => {
    const wrong = readings
      .filter((r) => (r.cutoff === UNDERWATER_CUTOFF) !== r.workerWater)
      .map((r) => `camera (${r.px}, ${r.pz}) in column (${r.x}, ${r.z}) surfaceY ${r.surfaceY}: worker water ${r.workerWater}, store (${r.store.x}, ${r.store.z}), cutoff ${r.cutoff}`);
    expect(wrong.length, `${wrong.length} of ${readings.length} positions: ${wrong.slice(0, 3).join('; ')}`).toBe(0);
  });
});
