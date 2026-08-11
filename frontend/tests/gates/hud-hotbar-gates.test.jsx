// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { selectHudState, HUD_CALLABLE_KEYS } from '../../src/store/hudState.js';
import { GameUI } from '../../src/ui/GameHud.jsx';
import { HOTBAR_BLOCKS } from '../../src/world/Blocks';
import { handlersCalledOnHudSlice } from '../_support/hudCallSites.js';

// X3, SECOND LAYER — the hotbar click threw on DESKTOP too.
//
// The slice App feeds the HUD carried `selectedBlock` but not `setSelectedBlock`, so
// `onClick={() => gameState.setSelectedBlock(blockType)}` raised "not a function" the moment anyone
// clicked a slot. It survived because the keyboard and scroll paths call the store directly
// (InputManager.jsx), so selection LOOKED fine — only the click was dead — and on touch a full-screen
// overlay swallowed the tap before it could reach the handler and reveal the throw.
//
// These build the slice through the REAL `selectHudState` rather than retyping it. That distinction is the
// whole point: a test that hand-writes its own gameState proves only that the copy agrees with itself, and
// would have stayed green through this bug.

const slice = () => selectHudState(useGameStore.getState());

describe('the HUD slice exposes every handler the HUD calls', () => {
  it('resolves each callable key to an actual function', () => {
    // A missing VALUE reads as undefined and usually renders blank. A missing HANDLER is invisible until a
    // player touches it, then throws. That asymmetry is why this is asserted rather than eyeballed.
    const s = slice();
    for (const key of HUD_CALLABLE_KEYS) {
      expect(typeof s[key], `gameState.${key} is ${typeof s[key]}, not a function`).toBe('function');
    }
  });

  it('checks a non-trivial number of keys — an empty list would make the above vacuous', () => {
    expect(HUD_CALLABLE_KEYS.length).toBeGreaterThan(10);
  });

  // THE DENOMINATOR CAME FROM THE WRONG SIDE.
  //
  // HUD_CALLABLE_KEYS was hand-maintained beside the selector, and it had drifted into being exactly the
  // selector's own function-valued keys — 13 of them. So the check asked "is every key I selected a
  // function", which the selector guarantees, and could not answer the question anyone cares about: "does
  // every handler the HUD CALLS exist". It had never gone red for any of the six omissions it was written
  // to catch, and the six are recorded in hudState.js's own comments.
  //
  // The list is now derived from the CONSUMERS: every `gameState.X(` call across src. That set extends
  // itself when someone adds a call site, which is precisely when the check needs to grow.
  const calledOnHudSlice = handlersCalledOnHudSlice;

  it('EVERY handler the HUD components call is SELECTED — derived from the call sites, not the selector', () => {
    // `k in s`, not `typeof s[k] === 'function'`: requestPointerLock is deliberately null at rest and is
    // installed by GameScene on mount. What useShallow propagates is the KEY — an unselected key means
    // `if (gameState.requestPointerLock)` takes its false branch forever no matter what the store does.
    const { names, files } = calledOnHudSlice();
    expect(files.length, 'no HUD-slice consumer files were found — the scan is broken, not the code').toBeGreaterThan(2);
    expect(names.length, 'no call sites were found').toBeGreaterThan(10);
    const s = slice();
    const unselected = names.filter((k) => !(k in s));
    expect(unselected, 'called on the HUD slice and never selected — the handler is undefined at the call site').toEqual([]);
    const wrongType = names.filter((k) => k in s && s[k] != null && typeof s[k] !== 'function');
    expect(wrongType, 'selected but not callable').toEqual([]);
  });

  it('the hand-kept list COVERS every handler the HUD slice is called with', () => {
    // The anti-drift direction the sibling gate cannot see. hud-slice-reachability derives its
    // expectation FROM THE SLICE — every setter-shaped key must be listed — which is the producer side
    // and is exactly why the list could sit at 13 while 20 handlers were called. This asserts the
    // consumer side: nothing may be called on the slice without appearing in the list that gets checked.
    const { names } = calledOnHudSlice();
    // Same named exception both sibling gates carry: requestPointerLock is null at rest by design and
    // every caller guards on it, so it must be SELECTED but must not be asserted callable.
    const uncovered = names.filter((k) => !HUD_CALLABLE_KEYS.includes(k) && k !== 'requestPointerLock');
    expect(uncovered, 'called on the HUD slice and absent from the list the contract check walks').toEqual([]);
  });

  it('keeps selectedBlock and its setter together', () => {
    const s = slice();
    expect(s).toHaveProperty('selectedBlock');
    expect(typeof s.setSelectedBlock).toBe('function');
  });
});

describe('X3 — clicking a hotbar slot actually selects that block', () => {
  beforeEach(() => {
    useGameStore.setState({ selectedBlock: HOTBAR_BLOCKS[0], gameStarted: true, isAlive: true });
  });
  afterEach(cleanup);

  it('changes the STORE, not just the markup', () => {
    const target = HOTBAR_BLOCKS[1];
    render(<GameUI gameState={slice()} />);
    expect(useGameStore.getState().selectedBlock).toBe(HOTBAR_BLOCKS[0]);
    const slot = document.querySelector(`[data-hotbar-block="${target}"]`);
    expect(slot, `no hotbar slot rendered for ${target}`).toBeTruthy();
    fireEvent.click(slot);
    expect(useGameStore.getState().selectedBlock).toBe(target);
  });

  it('selects EVERY slot, not just the second one', () => {
    // Deliberately not an `expect(...).not.toThrow()` around the click. That was the first version, and
    // mutation-proofing showed it stays GREEN with the bug reintroduced: React catches a handler error and
    // reports it to window.onerror instead of letting it propagate out of fireEvent. A test that cannot
    // fail for the reason it names is worse than no test, so the assertion is the store transition itself,
    // swept across the whole hotbar rather than a single slot.
    render(<GameUI gameState={slice()} />);
    for (const b of HOTBAR_BLOCKS) {
      fireEvent.click(document.querySelector(`[data-hotbar-block="${b}"]`));
      expect(useGameStore.getState().selectedBlock, `clicking ${b} did not select it`).toBe(b);
    }
  });

  it('renders a slot per configured block — a hotbar of zero slots would make this suite vacuous', () => {
    render(<GameUI gameState={slice()} />);
    expect(document.querySelectorAll('[data-hotbar-block]').length).toBe(HOTBAR_BLOCKS.length);
    expect(HOTBAR_BLOCKS.length).toBeGreaterThan(1);
  });
});
