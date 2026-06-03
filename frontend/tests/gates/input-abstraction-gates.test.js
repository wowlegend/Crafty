import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// S2-A-M1 Task 2: INPUT-INTENT ABSTRACTION BOUNDARY.
//
// Task 1 shipped a pure, alloc-free input-intent module (src/input/inputState.js) with the
// API getInput()/setIntent()/setActive()/resetInput(). This task routes Crafty's EXISTING
// player input + verbs through that module as a PURE REFACTOR (behavior byte-identical).
//
// The player controller (Components.jsx) historically read raw key/mouse listeners and
// scattered `document.pointerLockElement` checks through the movement/mouse/dodge code. The
// refactor inverts that into a writer/reader split:
//   - WRITER: the keyboard/mouse listeners map WASD/Space/Shift/F/click/right-click -> setIntent,
//     and the SINGLE pointer-lock-change site calls setActive(!!document.pointerLockElement).
//   - READER: the useFrame verb loop reads getInput() once and gates movement/dodge/mouse on
//     getInput().active (replacing the scattered isLocked = document.pointerLockElement reads).
//
// These gates are STATIC (source text, GPU-free in CI). The single allowed pointerLockElement
// read is the setActive writer; everywhere else in the controller now reads getInput().active.

const SRC = resolve(process.cwd(), 'src');
const components = () => readFileSync(resolve(SRC, 'Components.jsx'), 'utf8');
const inputManager = () => readFileSync(resolve(SRC, 'InputManager.jsx'), 'utf8');

describe('S2-A-M1 input-intent abstraction boundary', () => {
  it('Components.jsx imports from the input-intent module', () => {
    expect(components(), 'Components.jsx must import from ./input/inputState')
      .toMatch(/from\s+['"]\.\/input\/inputState['"]/);
  });

  it('document.pointerLockElement appears AT MOST ONCE in Components.jsx (the single setActive writer)', () => {
    const matches = components().match(/document\.pointerLockElement/g) || [];
    expect(matches.length, `pointerLockElement must be centralized to one site, found ${matches.length}`)
      .toBeLessThanOrEqual(1);
  });

  it('the verb loop reads intents via getInput()', () => {
    expect(components(), 'Components.jsx verb code must read getInput()')
      .toMatch(/getInput\(\)/);
  });

  it('the controller gates on the active intent (getInput().active) instead of raw pointer-lock', () => {
    expect(components(), 'Components.jsx must gate verbs on the active intent')
      .toMatch(/\.active\b/);
  });

  it('the single pointer-lock site routes through setActive (centralized active gate)', () => {
    expect(components(), 'pointer-lock change must call setActive(...)')
      .toMatch(/setActive\(/);
  });
});

// S2-A-M2d: SINGLE pointer-lock authority. M2d collapses the DUAL pointer-lock
// authority — InputManager.jsx used to own a SECOND `pointerlockchange` listener +
// its own `isPointerLocked` useState (a parallel representation of the same fact as
// inputState.active). M2d deletes that listener + all of InputManager's raw
// `document.pointerLockElement` reads; InputManager now reads the gate via
// getInput().active and writes optimistically via setActive. Components.jsx remains
// the SOLE authoritative pointerlockchange listener (the single allowed read above).
describe('S2-A-M2d single pointer-lock authority (InputManager off the dup listener)', () => {
  it('InputManager.jsx has ZERO document.pointerLockElement reads', () => {
    const matches = inputManager().match(/document\.pointerLockElement/g) || [];
    expect(matches.length, `InputManager must not read document.pointerLockElement, found ${matches.length}`)
      .toBe(0);
  });

  it('InputManager.jsx has NO pointerlockchange listener (Components.jsx is the sole authority)', () => {
    expect(inputManager(), 'InputManager must not register a pointerlockchange listener')
      .not.toMatch(/pointerlockchange/);
  });

  it('InputManager.jsx imports getInput and setActive from ./input/inputState', () => {
    const src = inputManager();
    expect(src, 'InputManager must import from ./input/inputState')
      .toMatch(/from\s+['"]\.\/input\/inputState['"]/);
    expect(src, 'InputManager must import getInput').toMatch(/\bgetInput\b/);
    expect(src, 'InputManager must import setActive').toMatch(/\bsetActive\b/);
  });
});
