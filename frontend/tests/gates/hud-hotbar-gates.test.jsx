// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { selectHudState, HUD_CALLABLE_KEYS } from '../../src/store/hudState.js';
import { GameUI } from '../../src/ui/GameHud.jsx';
import { HOTBAR_BLOCKS } from '../../src/world/Blocks';

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
