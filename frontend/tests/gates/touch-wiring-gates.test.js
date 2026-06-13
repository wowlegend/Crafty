import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(here, '../../', p), 'utf8');

describe('touch wiring gates (M1)', () => {
  it('TouchControls early-returns null under isCaptureMode AND !isTouchDevice (trap-1/2)', () => {
    const c = read('src/ui/TouchControls.jsx');
    expect(/if\s*\(\s*isCaptureMode\(\)\s*\|\|\s*!isTouchDevice\(\)\s*\)\s*return null/.test(c)).toBe(true);
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
});
