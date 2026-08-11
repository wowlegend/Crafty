// @vitest-environment jsdom
//
// ON TOUCH, EVERY TAP INSIDE A WORLD-OPENED PANEL WAS ROUTED AS A LOOK-DRAG.
//
// TouchControls gates its move/look routing on `getInput().active`. There are TWO panel openers with
// different focus contracts, and nothing reconciles them:
//
//   - the TRAY opener maintains the invariant by hand — `togglePanel(...); setTrayOpen(false); setActive(false)`
//   - the WORLD opener (Terrain's `open(h)`, dispatched from the interact verb) does NOT
//
// On desktop the world opener gets away with it, because exiting pointer-lock lowers `active` as a side
// effect. On touch there is no pointer lock, so `active` stays true: open a chest by walking up to it, and
// every tap in that panel is swallowed by the look-drag router and preventDefault'd.
//
// So the fix is not "lower active in the world opener too" — that is a third hand-maintained copy of the
// same invariant, and PANEL_FLAGS exists precisely because two such copies already drifted. The gate reads
// the canonical list instead.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { setActive } from '../../src/input/inputState.js';
import { PANEL_FLAGS } from '../../src/ui/panelState.js';

vi.mock('../../src/input/touchDevice.js', () => ({ isTouchDevice: () => true }));
vi.mock('@react-three/fiber', () => ({ useFrame: () => {}, useThree: () => ({ camera: null }) }));

/** Dispatch a real touchstart on window whose target is scenery — not a HUD control. */
function sceneryTouch(type) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const touch = { identifier: 1, target, clientX: 200, clientY: 400, pageX: 200, pageY: 400 };
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'changedTouches', { value: [touch] });
  Object.defineProperty(ev, 'touches', { value: [touch] });
  window.dispatchEvent(ev);
  return ev;
}

describe('touch focus gate — a world-opened panel must stop look-drag routing', () => {
  beforeEach(() => {
    for (const f of PANEL_FLAGS) useGameStore.setState({ [f]: false });
    useGameStore.setState({ isAlive: true, gameStarted: true, lookSensitivity: 1 });
    setActive(true);
  });
  afterEach(() => {
    cleanup();
    setActive(false);
    for (const f of PANEL_FLAGS) useGameStore.setState({ [f]: false });
  });

  it('CONTROL — with no panel open, a scenery touch IS routed (preventDefault called)', async () => {
    // Asserted first and it is load-bearing: every assertion below is "the event was NOT consumed", which
    // is indistinguishable from a component that never mounted or a listener that never bound.
    const { default: TouchControls } = await import('../../src/ui/TouchControls.jsx');
    render(<TouchControls isWorldBuilt />);
    const ev = sceneryTouch('touchstart');
    expect(ev.defaultPrevented, 'the control never routed — nothing below is meaningful').toBe(true);
  });

  it('does NOT route a scenery touch while the chest panel is open — the world-opener case', async () => {
    const { default: TouchControls } = await import('../../src/ui/TouchControls.jsx');
    render(<TouchControls isWorldBuilt />);
    // The world opener sets the flag and, unlike the tray opener, does NOT lower `active`.
    useGameStore.setState({ showChestInterface: true });
    const ev = sceneryTouch('touchstart');
    expect(
      ev.defaultPrevented,
      'the tap was routed into a look-drag while a panel was open — every tap in that panel is swallowed'
    ).toBe(false);
  });

  it.each(PANEL_FLAGS.filter((f) => f.startsWith('show')))(
    'blocks routing for %s too — the whole canonical list, not just the chest',
    async (flag) => {
      // Reading PANEL_FLAGS rather than a retyped list is the point: two hand-maintained copies of this
      // invariant already drifted once (2026-06-07), which is why panelState.js exists at all.
      const { default: TouchControls } = await import('../../src/ui/TouchControls.jsx');
      render(<TouchControls isWorldBuilt />);
      useGameStore.setState({ [flag]: true });
      expect(sceneryTouch('touchstart').defaultPrevented, `${flag} did not stop routing`).toBe(false);
    }
  );

  it('resumes routing once the panel closes', async () => {
    const { default: TouchControls } = await import('../../src/ui/TouchControls.jsx');
    render(<TouchControls isWorldBuilt />);
    useGameStore.setState({ showChestInterface: true });
    expect(sceneryTouch('touchstart').defaultPrevented).toBe(false);
    useGameStore.setState({ showChestInterface: false });
    expect(sceneryTouch('touchstart').defaultPrevented, 'routing never came back — the gate latched shut').toBe(true);
  });

  it('does NOT route while input is inactive, even with every panel closed', () => {
    // The OTHER half of the gate. A mutation that dropped the `getInput().active` term left all the
    // panel tests green — the term was in the code and unprovable by this file, which is a decoration
    // until something can redden it. `active` is false while paused and before the player has entered
    // play, and routing a look-drag in either state is the bug the term exists for.
    setActive(false);
    return import('../../src/ui/TouchControls.jsx').then(({ default: TouchControls }) => {
      render(<TouchControls isWorldBuilt />);
      expect(
        sceneryTouch('touchstart').defaultPrevented,
        'routed a look-drag while input was inactive — paused, or not yet in play'
      ).toBe(false);
    });
  });

  it('has a non-empty PANEL_FLAGS to iterate — the denominator', () => {
    // An empty list would make the it.each above expand to zero cases and the file report green.
    expect(PANEL_FLAGS.length).toBeGreaterThan(10);
    expect(PANEL_FLAGS).toContain('showChestInterface');
  });
});
