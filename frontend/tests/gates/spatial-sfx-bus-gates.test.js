import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gameScene = readFileSync(path.resolve(__dirname, '../../src/GameScene.jsx'), 'utf8')
  + readFileSync(path.resolve(__dirname, '../../src/render/SpatialAudioController.jsx'), 'utf8'); // A2.6: SpatialAudioController moved -> src/render/
const soundMgr = readFileSync(path.resolve(__dirname, '../../src/SoundManager.jsx'), 'utf8');

// W1 audio fix: spatial SFX (THREE.AudioListener.gain) must route through the master-bus limiter,
// not straight to ctx.destination. masterBus.test.js covers the bus DSP; this gate locks the route.
describe('W1 — spatial SFX route through the master bus', () => {
  it('SoundManager exposes getMasterBus in the provider context value', () => {
    expect(/value\s*=\s*\{[\s\S]*getMasterBus[\s\S]*\}/.test(soundMgr)).toBe(true);
  });
  it('GameScene reads getMasterBus from useSounds()', () => {
    expect(/getMasterBus/.test(gameScene)).toBe(true);
  });
  it('GameScene routes the listener chain into the bus input (not direct to destination)', () => {
    // the listener signal flows listener.gain -> filter (environmental lowpass) -> busInput;
    // the terminal connect that carries it into the bus must target busInput, not ctx.destination.
    expect(/filter\.connect\(\s*busInput\s*\)/.test(gameScene)).toBe(true);
    // and the lowpass filter must NOT terminate at the raw destination (would bypass the limiter).
    expect(/filter\.connect\(\s*audioContext\.destination\s*\)/.test(gameScene)).toBe(false);
  });
  it('GameScene no longer reads the phantom store field getState().volume', () => {
    expect(gameScene.includes('getState().volume')).toBe(false);
  });
});
