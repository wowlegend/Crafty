// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
vi.mock('../../src/input/touchDevice', async (orig) => ({ ...(await orig()), isTouchDevice: () => false, isTouchUIMode: () => false }));
import { renderHook, cleanup, act } from '@testing-library/react';
import { useInputManager } from '../../src/InputManager.jsx';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { setActive } from '../../src/input/inputState.js';
import { HOTBAR_BLOCKS } from '../../src/world/Blocks';

// THE WHEEL WALKS THE HOTBAR ONE SLOT PER NOTCH, NOT ONE PER EVENT (AUDIT:input:wheel-hotbar-per-event).
//
// The real useInputManager's window wheel listener, driven by WheelEvents shaped like each device's, each with its own
// timeStamp (the stepper groups a run of events into one gesture by the gaps between them). The notch sizes are the ones
// browsers report (input/wheelStep.js names them): Chrome on Windows 100 px, Firefox 3 lines, Chrome and Safari on macOS
// 4 px for a slow notch. The trackpad stream is the audit verifier's: a finger ramp and a decaying momentum tail at
// 16 ms, 135 px in 30 events, which moved 30 slots; it is judged by the slots the bar moved through, counted event by
// event, since the final slot of a 9-slot bar is the same after 1 step and after 10. Not covered: a real device's
// stream, which only a person with the wheel in hand can judge, and a fast spin on a macOS mouse (4 px notches under
// GESTURE_GAP_MS apart: the first slot at once, then one per 25 notches; registry REVIEW:l5:wheel-mac-medium-spin).

const slot = () => HOTBAR_BLOCKS.indexOf(useGameStore.getState().selectedBlock);
/** The slots a run of readings moved through from `start`: each event moves at most one, so a wrap counts as one. */
function stepsOf(start, trace) {
  let steps = 0;
  let prev = start;
  for (const s of trace) {
    const d = (s - prev + HOTBAR_BLOCKS.length) % HOTBAR_BLOCKS.length;
    steps += Math.min(d, HOTBAR_BLOCKS.length - d);
    prev = s;
  }
  return steps;
}
let t = 1e6;
function wheel({ deltaY = 0, deltaX = 0, deltaMode = 0, gap = 16 }) {
  t += gap;
  const ev = new WheelEvent('wheel', { deltaY, deltaX, deltaMode, bubbles: true });
  Object.defineProperty(ev, 'timeStamp', { value: t });
  act(() => { window.dispatchEvent(ev); });
}
const run = (seq) => seq.map((e) => { wheel(e); return slot(); });
const from = (i) => act(() => { useGameStore.setState({ selectedBlock: HOTBAR_BLOCKS[i] }); });

beforeEach(() => {
  useGameStore.setState({ selectedBlock: HOTBAR_BLOCKS[0], gameStarted: true, isAlive: true, showInventory: false });
  setActive(true);
  renderHook(() => useInputManager({}, { isAlive: true }));
});
afterEach(() => { cleanup(); setActive(false); });

describe('one slot per notch, on every wheel', () => {
  it('a notched mouse moves one slot per notch, slow in each browser\'s units and fast in Chrome on Windows, and back the other way', () => {
    from(0);
    const windowsSlow = run([{ deltaY: 100, gap: 300 }, { deltaY: 100, gap: 300 }, { deltaY: 100, gap: 300 }, { deltaY: -100, gap: 300 }]);
    from(0);
    const windowsFast = run([{ deltaY: 100, gap: 30 }, { deltaY: 100, gap: 30 }, { deltaY: 100, gap: 30 }, { deltaY: -100, gap: 30 }]);
    from(0);
    const firefoxLines = run([{ deltaY: 3, deltaMode: 1, gap: 300 }, { deltaY: 3, deltaMode: 1, gap: 30 }]);
    from(0);
    const macSlow = run([{ deltaY: 4.000244140625, gap: 300 }, { deltaY: 4.000244140625, gap: 300 }, { deltaY: 4.000244140625, gap: 300 }]);
    // A notch straight back the other way is a new gesture, however soon it comes.
    from(0);
    const macReverse = run([{ deltaY: 100, gap: 300 }, { deltaY: -4.000244140625, gap: 30 }]);
    expect({ windowsSlow, windowsFast, firefoxLines, macSlow, macReverse }).toEqual({
      windowsSlow: [1, 2, 3, 2], windowsFast: [1, 2, 3, 2], firefoxLines: [1, 2], macSlow: [1, 2, 3], macReverse: [1, 0],
    });
  });

  it('a trackpad swipe moves one or two slots, not one per event, momentum tail and all', () => {
    from(0);
    const fingers = [1, 2, 4, 7, 10, 12, 12, 10, 8, 6, 4, 2];
    const momentum = [];
    for (let v = 9; v >= 0.5; v *= 0.85) momentum.push(Math.round(v * 10) / 10);
    const seq = [...fingers, ...momentum].map((deltaY) => ({ deltaY, gap: 16 }));
    const trace = run(seq);
    const steps = stepsOf(0, trace);
    console.log(`[wheel] trackpad: ${seq.length} events, ${seq.reduce((a, e) => a + e.deltaY, 0).toFixed(0)} px, ${steps} steps, slots ${trace.join(',')}`);
    expect(seq.length, 'the denominator: the verifier\'s 30-event stream').toBe(30);
    expect(steps, `PRESENCE: the swipe moved the bar no slot (slots ${trace.join(',')})`).toBeGreaterThanOrEqual(1);
    expect(steps, `the swipe spun the hotbar through ${steps} slots (slots ${trace.join(',')})`).toBeLessThanOrEqual(2);
  });

  it('a 0.01 px nudge and a sideways swipe move nothing; the same bar still moves for a notch (the presence)', () => {
    from(4);
    const tiny = run([{ deltaY: 0.01, gap: 300 }]);
    const sideways = run([1, 2, 3, 4, 5].map(() => ({ deltaX: 6, deltaY: 0, gap: 16 })));
    const diagonal = run([{ deltaX: 8, deltaY: 6, gap: 300 }]);
    const notch = run([{ deltaY: 100, gap: 300 }]);
    expect({ tiny, sideways, diagonal, notch }).toEqual({ tiny: [4], sideways: [4, 4, 4, 4, 4], diagonal: [4], notch: [5] });
  });

  it('with a tile off the bar selected (coal from the inventory), a notch comes back to the first slot', () => {
    act(() => { useGameStore.setState({ selectedBlock: 'coal' }); });
    expect(slot(), 'SETUP: coal is on the hotbar, so this case shows nothing').toBe(-1);
    wheel({ deltaY: 100, gap: 300 });
    expect(useGameStore.getState().selectedBlock, 'the wheel is dead with a tile off the bar selected').toBe(HOTBAR_BLOCKS[0]);
  });
});
