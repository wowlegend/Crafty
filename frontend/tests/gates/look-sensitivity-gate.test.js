import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { useGameStore } from '../../src/store/useGameStore.jsx';

/**
 * look-sensitivity — CONVERTED 2026-09-22 from a pure source-grep gate.
 *
 * The 2026-09-22 gate audit listed this file for DELETE on the evidence that it imported no module and
 * only read source text. Checking the citations first (the step that list now requires) showed
 * `.claude/rules/input-and-pointer-lock.md` names it as what pins drei's `PointerLockControls` staying
 * ABSENT — the component whose removal that entire rule file exists to protect. A weak grep that is the
 * last thing watching a live property is a CONVERT, never a DELETE.
 *
 * WHAT MOVED, and why the split falls where it does. Five claims lived here as text matches. Three were
 * about BEHAVIOUR and are now executed:
 *   - the clamped setter          -> driven below (`/setLookSensitivity:/` matched any body, including none)
 *   - the handler reading it live -> `src/render/PointerLook.test.jsx`, which mounts the component,
 *                                    dispatches locked mousemoves and measures the yaw ratio
 *   - the look math + lock gate   -> `src/input/pointerLook.test.js` (already existed)
 *
 * What remains here is the residue that is genuinely a claim about SOURCE, and it is labelled as such
 * rather than dressed as a behavioural check. A dependency staying uninstalled, and a component being
 * mounted inside an R3F canvas, are not things a jsdom test can execute — the honest form is a grep that
 * says so.
 *
 * BLIND SPOT, stated per R7: nothing below proves the touch path or the settings slider RUN. Both are
 * call-site greps. TouchControls needs a touch device and GamePanels needs the panel tree, so the property
 * "the slider actually changes the sensitivity" is unguarded end-to-end. That is a real gap, not a
 * formality — `8a5e008` shipped two keybinds that compiled, gated green, and were reachable from nowhere.
 *
 * Mutation-Proof: MEASURED, 8 mutations, each reddening exactly the case that names it (7 of 7 cases
 * collected on every run — the runner exits 3 rather than reporting a result when the count is off, after
 * an earlier harness printed "Tests  no tests" for four mutations and nearly had that read as green).
 *
 *   SM1  Math.max(0.3, …)            -> Math.max(0, …)            -> clamp case RED  (-5 yields 0)
 *   SM2  Math.min(2.5, …)            -> Math.min(25, …)           -> clamp case RED  (99 yields 25)
 *   SM3  Number(v) || 1              -> Number(v)                 -> garbage case RED (NaN clears both clamps)
 *   SM4  Math.max(2.5, Math.min(2.5, …))                          -> clamp + garbage RED (the constant-pin
 *        that SM1/SM2 alone would miss — this is why the in-range control value is asserted)
 *   GM1  delete <PointerLook /> from GameScene                    -> mount-point case RED
 *   GM2  re-import drei PointerLockControls                       -> absence case RED (an absence assertion
 *        is mutated by INTRODUCING the thing, not by deleting one)
 *   GM3  TouchControls -> `sensitivity: 1`                        -> touch case RED
 *   GM4  rename the GamePanels setter call                        -> settings case RED
 *
 * Every subject restored from a cp backup and diffed byte-identical afterwards.
 */
const __dir = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(__dir, '../../src', p), 'utf8');

const DEFAULT = useGameStore.getState().lookSensitivity;
afterEach(() => useGameStore.setState({ lookSensitivity: DEFAULT }));

describe('look sensitivity — the setting itself (executed)', () => {
  const set = (v) => {
    useGameStore.getState().setLookSensitivity(v);
    return useGameStore.getState().lookSensitivity;
  };

  it('defaults to 1', () => {
    expect(DEFAULT).toBe(1);
  });

  it('clamps above 2.5 and below 0.3 (a slider cannot hand the camera an unusable value)', () => {
    expect(set(99)).toBe(2.5);
    expect(set(-5)).toBe(0.3);
    // control: an in-range value passes through unchanged, so the clamp is not pinning everything to a
    // constant — which is exactly what `Math.max(2.5, Math.min(2.5, v))` would do while passing the two above
    expect(set(1.7)).toBe(1.7);
  });

  it('falls back to 1 on garbage rather than writing NaN into the camera math', () => {
    expect(set('not a number')).toBe(1);
    expect(set(undefined)).toBe(1);
    expect(set(0)).toBe(1); // `Number(0) || 1` — 0 is falsy, so it takes the fallback, NOT the 0.3 floor
  });
});

describe('look sensitivity — wiring that only source can answer (grep, and it says so)', () => {
  const scene = read('GameScene.jsx');

  it('GameScene mounts <PointerLook/> (the component src/render/PointerLook.test.jsx drives)', () => {
    // Un-executable here: GameScene needs an R3F canvas and Rapier WASM. This asserts the mount POINT
    // exists; PointerLook.test.jsx asserts what happens once it is mounted.
    expect(scene).toMatch(/<PointerLook\s*\/>/);
  });

  it('drei PointerLockControls is fully removed (the replaced black box)', () => {
    // A claim about a DEPENDENCY being absent. There is no runtime observation of a component nobody
    // renders, so this is grep by nature rather than by laziness.
    expect(scene + read('render/PointerLook.jsx')).not.toMatch(/PointerLockControls/);
  });

  it('the touch path feeds the same store value into applyLook', () => {
    expect(read('ui/TouchControls.jsx')).toMatch(/sensitivity:\s*useGameStore\.getState\(\)\.lookSensitivity/);
  });

  it('SettingsPanel edits it via setLookSensitivity', () => {
    expect(read('ui/GamePanels.jsx')).toMatch(/setLookSensitivity\(/);
  });
});
