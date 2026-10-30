// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { AnimatePresence } from 'framer-motion';
import { MotionProvider } from '../../src/ui/MotionProvider.jsx';
import { SpellUpgradePanel } from '../../src/ui/SpellUpgradePanel.jsx';
import { slowPageClock, restorePageClock } from '../e2e/_motionSample.js';

// A PANEL STILL PLAYS ITS EXIT UNDER THE APP'S LazyMotion PROVIDER (W2-L, DECISIONS 2026-10-30 item 145).
//
// `m` has no features of its own. A panel's EXIT is one of the features MotionProvider loads (framer-motion 12.43
// motion/features/animations.mjs: `animation` and `exit`, both in `domAnimation`). AnimatePresence holds a closing child
// in the DOM only while that child's exit feature has registered with it; a provider whose features lack `exit` renders
// every panel, enters it, and then drops it from the DOM on the tick its flag flips, with nothing thrown and no entry
// gate red (the strict gate reads throws; the App gate and the e2e read the ENTRY). So this closes the real Talents
// panel inside AnimatePresence, the way MenuSystem mounts it, under MotionProvider and nothing else.
//
// PRESENCE FIRST. The panel has fully entered (dialog opacity 1) before it is closed, so the exit starts from a known
// state. Then three things must hold: the node is STILL in the DOM on the first read after the flag flips (the exit
// deferred the unmount), the dialog's opacity is read STRICTLY BETWEEN 1 and 0 on some drawn frame (the tween played, not
// only a delay), and the node is gone at the end (the exit completed and released the unmount). The control is the same
// panel with no provider: its `m` has no animation feature, so it never leaves opacity 0 and is gone on the first read
// after close; the reading "gone at once" is therefore one this instrument can produce, not a default.
//
// THE CLOCK. The exit is a JavaScript tween on the clock framer-motion reads with performance.now(), about 370 ms here.
// At that pace a frame that stalls for a few hundred milliseconds on a loaded runner steps over the whole tween and
// leaves no value between the ends, which is the flake the e2e sampler and the m.div control had (DECISIONS item 142).
// So the clock is slowed to a tenth from the moment of the close (slowPageClock, continuous at the switch): the tween
// lasts about 3.7 s and the same stall lands inside it. It is put back after every case.
//
// DENOMINATOR. The exit read prints how many frames it sampled and how many fell between the ends.
//
// WHAT THIS DOES NOT CHECK: the other panels' exits (each is `m` with `exit` inside an AnimatePresence at its mount site,
// which the strict gate mounts without closing), that MenuSystem's mount sites wrap them (tests/integration/
// trading-exit-tween.test.jsx reads one of them), and Chromium: jsdom fades opacity from JavaScript and has no
// compositor, so nothing here says the exit looks right.
//
// Mutation-Proof: see the commit trailer.

const NOOP = () => {};
afterEach(() => { cleanup(); restorePageClock(); });

const Tree = ({ open, provider }) => {
  const inner = <AnimatePresence>{open && <SpellUpgradePanel key="talents" onClose={NOOP} />}</AnimatePresence>;
  return provider ? <MotionProvider>{inner}</MotionProvider> : inner;
};
/** The Talents dialog's inline opacity: null when the panel is not in the DOM, NaN when it has none. */
const dialogOpacity = () => {
  const dialog = screen.queryByTestId('progression-panel')?.closest('[role="dialog"]');
  return dialog ? parseFloat(dialog.style.opacity) : null;
};
const nextFrame = () => new Promise((r) => requestAnimationFrame(r));

describe('closing the Talents panel under the app provider', () => {
  it('holds the panel in the DOM, draws its opacity between 1 and 0, then removes it', async () => {
    const { rerender } = render(<Tree open provider />);
    const until = performance.now() + 8000;
    while (dialogOpacity() !== 1 && performance.now() < until) await nextFrame();
    expect(dialogOpacity(), 'SETUP: the panel never finished entering, so its exit starts from nowhere').toBe(1);

    slowPageClock(0.1);
    act(() => { rerender(<Tree open={false} provider />); });
    const reads = [];
    const deadline = Date.now() + 25000; // real time: performance.now is slowed from here
    while (Date.now() < deadline) {
      const o = dialogOpacity();
      reads.push(o);
      if (o === null) break;
      await nextFrame();
    }
    const between = reads.filter((o) => o !== null && o > 0.001 && o < 0.999).length;
    const shown = `${reads.length} reads, ${between} between the ends: ${JSON.stringify(reads.slice(0, 6))}...${JSON.stringify(reads.slice(-3))}`;
    expect(reads[0], `the panel was gone on the first read after the flag flipped: no exit played (${shown})`).not.toBe(null);
    expect(between, `the panel was held but its opacity never took a value between 1 and 0 (${shown})`).toBeGreaterThan(0);
    expect(reads[reads.length - 1], `the exit never finished and released the panel (${shown})`).toBe(null);
  }, 40000);

  it('CONTROL, no provider: the panel never enters and is gone on the first read after the flag flips', async () => {
    const { rerender } = render(<Tree open provider={false} />);
    for (let i = 0; i < 10; i++) await nextFrame();
    expect(dialogOpacity(), 'SETUP: the panel was not mounted').not.toBe(null);
    expect(dialogOpacity(), 'without the provider the panel entered: the control no longer shows a frozen `m`').toBe(0);
    act(() => { rerender(<Tree open={false} provider={false} />); });
    expect(dialogOpacity(), 'without the provider the panel was held for an exit: the control cannot show "gone at once"').toBe(null);
  });
});
