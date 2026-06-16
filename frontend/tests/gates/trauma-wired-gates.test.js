import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.resolve(__dirname, '../../', p), 'utf8');

// SOTA M1 Slice 3: the trauma core (game/trauma.js) is WIRED into the live shake + hitstop sites, gated by
// a single juiceIntensity dial. Locks the audit's #1 game-feel fix: directional/quadratic trauma shake
// (not flat Math.random jitter) + weight-tiered hitstop (not a flat 28ms).
describe('M1 trauma core is wired', () => {
  const comp = read('src/Components.jsx');
  const sns = read('src/SimplifiedNPCSystem.jsx');
  const store = read('src/store/useGameStore.jsx');

  it('Components uses shakeOffset (trauma^2) for the camera shake, not flat Math.random jitter', () => {
    expect(comp.includes("from './game/trauma")).toBe(true);
    expect(/shakeOffset\(\s*trauma/.test(comp)).toBe(true);
    // the old flat linear random shake is gone
    expect(comp.includes('(Math.random() - 0.5) * 0.5 * intensity')).toBe(false);
  });

  it('the camera shake is scaled by the juiceIntensity dial', () => {
    const i = comp.indexOf('shakeOffset(');
    const block = comp.slice(i - 400, i + 120); // widened: M2 #9 added the dx/dz lines between ji and the call
    expect(block.includes('juiceIntensity')).toBe(true);
  });

  it('M2 #9: the camera shake is biased along the hit direction (cameraShakeDir), not direction-less', () => {
    // Components reads the stored hit-dir and feeds it into shakeOffset (was a literal 0, 0).
    expect(comp.includes('store.cameraShakeDir')).toBe(true);
    expect(/,\s*dx,\s*dz,/.test(comp)).toBe(true);            // dir threaded into the shakeOffset args
    expect(comp.includes('* 0.05, 0, 0,')).toBe(false);       // the old direction-less call is gone
    // the store carries the dir + a decay-preserving trigger signature
    expect(/cameraShakeDir:\s*\[0,\s*0\]/.test(store)).toBe(true);
    expect(/triggerCameraShake:\s*\(intensity = 1\.0, dirX, dirZ\)/.test(store)).toBe(true);
  });

  it('SimplifiedNPCSystem hitstop is weight-tiered via HITSTOP, not the flat +28', () => {
    expect(sns.includes("from './game/trauma")).toBe(true);
    expect(/hitstopUntil:\s*performance\.now\(\)\s*\+\s*HITSTOP\[/.test(sns)).toBe(true);
    expect(/hitstopUntil:\s*performance\.now\(\)\s*\+\s*28\b/.test(sns)).toBe(false);
    expect(sns.includes('juiceIntensity')).toBe(true); // dial scales the freeze too
  });

  it('the juiceIntensity dial exists in the store (default 1, the M3 a11y/reduced-motion toggle)', () => {
    expect(/juiceIntensity:\s*1/.test(store)).toBe(true);
    expect(store.includes('setJuiceIntensity')).toBe(true);
  });
});
