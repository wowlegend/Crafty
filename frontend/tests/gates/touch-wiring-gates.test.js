import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(here, '../../', p), 'utf8');

describe('touch wiring gates (M1)', () => {
  it('TouchControls is capture-safe + desktop-inert (M2 3-way guard) (trap-1/2)', () => {
    const c = read('src/ui/TouchControls.jsx');
    // capture branch renders null UNLESS the mobile fixture opted in via showTouch (trap-1 [BLOCKING])
    expect(/isCaptureMode\(\)[\s\S]*getCaptureOpts\(\)\.showTouch[\s\S]*null/.test(c)).toBe(true);
    // desktop-inert: a non-touch device returns null (trap-2 [HIGH])
    expect(/if\s*\(\s*!isTouchDevice\(\)\s*\)\s*return null/.test(c)).toBe(true);
  });

  it('TouchControls writes through setIntent/setActive/performVerb -- NEVER reads document.pointerLockElement (trap-2)', () => {
    const c = read('src/ui/TouchControls.jsx');
    expect(c.includes('document.pointerLockElement')).toBe(false);
    expect(/setActive|setIntent|performVerb/.test(c)).toBe(true);
  });

  it('Components.jsx still has document.pointerLockElement AT MOST ONCE (single active-authority preserved)', () => {
    const m = read('src/Components.jsx').match(/document\.pointerLockElement/g) || [];
    expect(m.length).toBeLessThanOrEqual(1);
  });

  it('the touchmove handler uses refs, not React state -- no setState/useState inside it (trap-6)', () => {
    const c = read('src/ui/TouchControls.jsx');
    const moveBody = c.slice(c.indexOf('const onMove'), c.indexOf('const onEnd'));
    expect(/set[A-Z]\w*\(|useState/.test(moveBody)).toBe(false);
  });

  it('the touch listeners are registered passive:false (so preventDefault cancels scroll/zoom -- spec section 4)', () => {
    const c = read('src/ui/TouchControls.jsx');
    expect(/addEventListener\('touchmove'.*\{\s*passive:\s*false/.test(c)).toBe(true);
  });

  it('touchHandlers.js (the real per-move seam) writes no React/zustand state (trap-6, deeper than the onMove slice)', () => {
    const h = read('src/input/touchHandlers.js');
    expect(/useState|\.setState\(/.test(h)).toBe(false);
  });

  it('TouchControls cleanup relinquishes the active gate -- no stuck-active on unmount', () => {
    expect(/setActive\(false\)/.test(read('src/ui/TouchControls.jsx'))).toBe(true);
  });

  it('the Terrain build-highlight gate is capture-safe (isCaptureMode guard, independent of active)', () => {
    expect(/getInput\(\)\.active\s*\|\|\s*isCaptureMode\(\)/.test(read('src/world/Terrain.jsx'))).toBe(true);
  });

  it('no other file leaks a document.pointerLockElement read (single-active-authority stays in Components)', () => {
    for (const p of ['src/App.jsx', 'src/HUD.jsx', 'src/MenuSystem.jsx', 'src/ui/TouchControls.jsx']) {
      expect(read(p).includes('document.pointerLockElement'), `${p} must not read document.pointerLockElement`).toBe(false);
    }
  });
});
