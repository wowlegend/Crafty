// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { AnimatePresence, motion } from 'framer-motion';

// AN EXIT TWEEN NOTHING COULD PLAY.
//
// framer-motion only DEFERS an unmount when there is an AnimatePresence ancestor. TradingInterface
// declares `exit={{ ... }}` and was mounted with a bare `&&` in the gap between two AnimatePresence
// blocks -- App.jsx contains none at all and MenuSystem's own root is a bare fragment, so there was no
// ancestor anywhere on the path and the tween was discarded on every close. Every sibling panel IS
// wrapped, so the merchant was the one panel that POPPED out while the rest faded: the kind of thing that
// reads as "feels slightly off" and never gets filed.
//
// This EXECUTES the difference rather than grepping for the wrapper, because the wrapper is not the
// point -- the deferred unmount is. Asserting the JSX shape would pass against an AnimatePresence that
// was somehow inert, and would fail against any future mechanism that achieves the same thing.
const Panel = () => (
  <motion.div data-testid="panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    transition={{ duration: 0.3 }}>
    merchant
  </motion.div>
);

afterEach(() => cleanup());

describe('a panel with an exit variant survives its own unmount long enough to play it', () => {
  it('WRAPPED: the node is still in the DOM immediately after the flag flips', () => {
    const { rerender } = render(<AnimatePresence>{true && <Panel />}</AnimatePresence>);
    expect(screen.getByTestId('panel'), 'the panel never mounted, so this proves nothing').toBeTruthy();
    act(() => { rerender(<AnimatePresence>{false && <Panel />}</AnimatePresence>); });
    expect(
      screen.queryByTestId('panel'),
      'the exit tween had no chance to run — the panel vanished on the same tick'
    ).not.toBe(null);
  });

  it('UNWRAPPED: the node is gone instantly — the defect, reproduced', () => {
    // The control. Without it, the assertion above could pass for reasons unrelated to AnimatePresence.
    const { rerender } = render(<div>{true && <Panel />}</div>);
    expect(screen.getByTestId('panel')).toBeTruthy();
    act(() => { rerender(<div>{false && <Panel />}</div>); });
    expect(screen.queryByTestId('panel'), 'an unwrapped exit variant somehow deferred').toBe(null);
  });

  it('MenuSystem mounts the trading panel with that deferral available', async () => {
    // The reachability half: the shape above is worth nothing if the real mount site does not use it.
    const { MenuSystem } = await import('../../src/MenuSystem.jsx');
    const { readFileSync } = await import('node:fs');
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/MenuSystem.jsx'), 'utf8');
    expect(typeof MenuSystem, 'MenuSystem no longer exports a component').toBe('function');
    const at = src.indexOf('{gameState.showTradingInterface && (');
    expect(at, 'the trading mount site vanished; re-point this test').toBeGreaterThan(-1);
    expect(
      src.slice(Math.max(0, at - 300), at).includes('<AnimatePresence>'),
      'the trading panel is mounted with a bare && again — its exit tween is discarded on close'
    ).toBe(true);
  });
});
