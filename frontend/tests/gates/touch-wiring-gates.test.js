import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { carriersOf } from './_srcWalk.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(here, '../../', p), 'utf8');

/*
 * ENHANCED 2026-09-22, selected by `gate-census.mjs` at 0/5. The assertions were mostly sound already —
 * structural anchors, a counted occurrence, a slice-bounded search — so only the scope-qualified one was
 * rewritten, plus the evidence the file lacked.
 *
 * BLIND SPOT, stated (R7): every case reads source. Nothing here dispatches a touch, acquires a lock, or
 * observes the player move — and the failure this whole area exists for is a player left input-dead and
 * alive while mobs keep swinging, which is a RUNTIME state no source assertion can reach. The exhaustive
 * recovery-surface invariant lives in the panel-state gate; `scripts/visual/touch-probe.mjs` is manual
 * and in neither pre-push nor CI; real-device feel is Kevin-gated with no harness at all.
 *
 * Mutation-Proof: 2 mutations, recorded on the commit.
 */
describe('touch wiring gates (M1)', () => {
  it('the subject files were read — four cases below are negative assertions', () => {
    // R3a: `not.toMatch` / `.includes(...) === false` over an empty read all report clean.
    expect(read('src/ui/TouchControls.jsx').length).toBeGreaterThan(2000);
    expect(read('src/input/touchHandlers.js').length).toBeGreaterThan(500);
  });

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

  it('exactly TWO modules read document.pointerLockElement, and they are the two we know about', () => {
    // WIDENED 2026-09-22. This checked four hand-named files while claiming "no other file" — the
    // scope-qualified shape: correct about the four, silent about the other 304, and a scattered lock
    // read lands wherever someone is adding input handling.
    //
    // WIDENING IT IMMEDIATELY DISPROVED THE CLAIM I FIRST WROTE. I asserted Components.jsx was the ONLY
    // reader, because `.claude/rules/input-and-pointer-lock.md` says reads "are centralized" there.
    // Measured: there are TWO in code. `Components.jsx:510` is the authority — it owns the
    // `pointerlockchange` handler and writes `setActive()`, which is what the rule is about.
    // `input/pointerLook.js:32` guards its own mousemove on the lock being held at all, deliberately
    // NOT on which element holds it (its comment explains that element-matching was version-drift
    // fragile). That is a second reader, and the rule's "consumers read getInput().active" would
    // arguably have it use the gate instead — a real tension, recorded here rather than papered over by
    // an assertion that would have been false the day it was written.
    //
    // Pinned as a PAIR: a third reader reds, and so does either of these two disappearing.
    expect(carriersOf(/document\.pointerLockElement/),
      'the set of pointer-lock readers changed — the active gate may now have two authorities')
      .toEqual(['Components.jsx', 'input/pointerLook.js']);
  });
});
