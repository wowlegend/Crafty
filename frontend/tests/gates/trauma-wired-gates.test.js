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
  const sns = read('src/SimplifiedNPCSystem.jsx') + read('src/systems/CombatSystem.jsx'); // A1.8: hitstop moved to CombatSystem
  const store = read('src/store/useGameStore.jsx');
  const channel = read('src/game/cameraShakeChannel.js');

  it('Components uses shakeOffset (trauma^2) for the camera shake, not flat Math.random jitter', () => {
    expect(comp.includes("from './game/trauma")).toBe(true);
    expect(/shakeOffset\(\s*trauma/.test(comp)).toBe(true);
    // the old flat linear random shake is gone
    expect(comp.includes('(Math.random() - 0.5) * 0.5 * intensity')).toBe(false);
  });

  it('the camera shake is scaled by the juiceIntensity dial', () => {
    // Asserted on the CALL, not on a character window around it: the window version broke the moment a
    // comment was added above the call, which is a gate reporting on its own formatting rather than on
    // the wiring it exists to protect.
    expect(/shakeOffset\(.*\bji\b.*\)/.test(comp), 'the juice dial is not in the shakeOffset args').toBe(true);
    expect(comp.includes('const ji = store.juiceIntensity')).toBe(true);
  });

  it('M2 #9: the camera shake is biased along the hit direction (cameraShakeDir), not direction-less', () => {
    // Components reads the stored hit-dir and feeds it into shakeOffset (was a literal 0, 0).
    expect(comp.includes('const [dx, dz] = shakeDir();'), 'the consumer no longer reads the hit direction at all').toBe(true);
    expect(/,\s*dx,\s*dz,/.test(comp)).toBe(true);            // dir threaded into the shakeOffset args
    expect(comp.includes('* 0.05, 0, 0,')).toBe(false);       // the old direction-less call is gone
    // The dir now lives in the transient CHANNEL, not the store: holding trauma in zustand meant a set()
    // per frame from useFrame. The invariant is unchanged and is asserted where it now lives -- omitting
    // the dir preserves the one already set, so the bias survives the multi-frame falloff. Pinning the
    // store's parameter NAME is what made this gate red at two correct refactors in a row.
    expect(/triggerCameraShake:\s*\([a-zA-Z]+ = 1\.0, dirX, dirZ\)/.test(store)).toBe(true);
    expect(channel.includes('if (dirX !== undefined)'), 'the dir is overwritten unconditionally').toBe(true);
    expect(/let _dirX = 0/.test(channel)).toBe(true);
  });

  it('SimplifiedNPCSystem hitstop is weight-tiered via HITSTOP, not the flat +28', () => {
    expect(/from '\.\.?\/game\/trauma/.test(sns)).toBe(true); // ./ (host) or ../ (CombatSystem extracted, A1.8)
    expect(/hitstopUntil:\s*performance\.now\(\)\s*\+\s*HITSTOP\[/.test(sns)).toBe(true);
    expect(/hitstopUntil:\s*performance\.now\(\)\s*\+\s*28\b/.test(sns)).toBe(false);
    expect(sns.includes('juiceIntensity')).toBe(true); // dial scales the freeze too
  });

  it('the juiceIntensity dial exists in the store (default 1, the M3 a11y/reduced-motion toggle)', () => {
    expect(/juiceIntensity:\s*1/.test(store)).toBe(true);
    expect(store.includes('setJuiceIntensity')).toBe(true);
  });
});
