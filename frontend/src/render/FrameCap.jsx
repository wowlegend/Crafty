// FrameCap — a frame-rate ceiling for the game canvas (plan docs/superpowers/plans/2026-09-23-crafty-perf-heat-ipad.md,
// Task 4). On a 120 Hz display (an M3 Max's ProMotion panel, an iPad Pro) the render loop ran at 120 frames a second
// with the full post-processing chain: twice the GPU work of 60, for a difference few players can see in a voxel
// game — and Kevin measured the result as fans at full speed. PerformanceMonitor could not help: it samples FRAME
// RATE, and a GPU pinned at 100% while holding its frame rate sits in the governor's dead zone forever.
//
// How: GameScene switches the Canvas to R3F's 'demand' loop while the cap is active (R3F's own loop then renders only
// when invalidated), and one rAF loop here renders at most `fps` times a second, on vsync, so frames stay even (every
// other vsync at 120 Hz). The simulation is unaffected: every system already steps by its frame delta. `fps` 0 =
// uncapped ('always', the old loop). Never under capture or the perf probe: they step or time their own frames.
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { registerTestHook } from '../devtest/testBridge.js';
import { claimHudTick, emitHudTick } from '../ui/hudTicker.js';

/**
 * PURE: one rAF tick of the cap. `last` is the cap's own clock (the time the last rendered frame was DUE, not when it
 * rendered), so the average holds at `fps` on any refresh rate: 120 Hz renders every 2nd tick; 144 Hz renders 5 of
 * every 12 ticks (60 fps), where resetting to the tick time would give every 3rd (48). 1 ms slack keeps a 60 Hz
 * display from skipping on timer jitter; a stall longer than two intervals resynchronises instead of bursting.
 *
 * The clock never runs AHEAD of the tick: `min(last + interval, t)`. Without that, a display a hair faster than the cap
 * (60.05 Hz, 60.5 Hz — real panels run there, and a 120 Hz ProMotion panel drifts the same way) let the due-time creep
 * past the ticks until one fell inside the slack and was skipped: a dropped frame every 20 s at 60.05 Hz, every 2 s
 * at 60.5 Hz, and 25 ms gaps at 120.2 Hz (review #9, simulated). The cap may then draw a hair over its rate on such
 * a display — the right side to err on: a dropped frame is visible judder, 60.5 fps is not.
 * @returns {{ render: boolean, last: number }}
 */
export function stepCap(t, last, fps) {
  if (!(fps > 0)) return { render: true, last: t };
  const interval = 1000 / fps;
  if (t - last < interval - 1) return { render: false, last };
  return { render: true, last: t - last > 2 * interval ? t : Math.min(last + interval, t) };
}

/**
 * PURE: the tier governor's bounds (drei PerformanceMonitor) — [decline below, incline above], in frames a second.
 * drei's `refreshrate` is the HIGHEST rate it has seen this session and is never reset, so it cannot tell the governor
 * a cap is on: a player who tried Unlimited on a 120 Hz panel for a moment and came back to 60 kept the [50, 90]
 * bounds, which a capped 60 can never exceed — after any decline the tier could never climb back (review #4). Under
 * the cap the loop IS a 60 Hz display, so it gets a 60 Hz display's bounds whatever was seen before.
 */
export function governorBounds(refreshrate, frameCap) {
  if (frameCap > 0) return [40, 55];
  return refreshrate > 90 ? [50, 90] : [40, 55];
}

/**
 * PURE: switch R3F's frame loop WITHOUT moving the clock. R3F's setFrameloop stops the clock and zeroes elapsedTime
 * on every switch — and the player's state machines read `state.clock.getElapsedTime()` against stored start times
 * (the attack cooldown, the snare and fuse channels), so a reset to 0 after twenty minutes of play would leave every
 * `now - start` negative for twenty minutes. The clock resumes from where it stood.
 */
export function switchKeepingClock(clock, setFrameloop, mode) {
  const t = clock.elapsedTime;
  setFrameloop(mode);
  clock.elapsedTime = t;
}

/**
 * Paces a 'demand' loop: while `active`, renders at most `fps` times a second on vsync. The loop MODE is the
 * <Canvas frameloop> prop (GameScene) — R3F re-applies that prop on every Canvas render, so this component must not
 * set it (a setFrameloop from here was overwritten by the next re-render).
 *
 * It renders with advance(), synchronously inside its own rAF tick. It first called invalidate(), and the e2e measured
 * HALF the uncapped frame rate: invalidate() from outside R3F's loop only schedules that loop for the NEXT vsync, and
 * the loop stops after each render, so the next tick's invalidate landed on the pending frame and every other vsync
 * went undrawn — a 60 Hz display would have run at 30. advance() also consumes a pending invalidation (it decrements
 * R3F's frame count), so a React commit on a rendered tick does not draw twice.
 * The demand loop is NOT idle here: @react-three/rapier invalidates from inside its step for every awake body, and the
 * player's body never sleeps — so once anything starts R3F's own loop (a React commit: applyProps invalidates), rapier
 * keeps it drawing at the display rate. The e2e measured it: under a 1 fps cap the loop drew 2.7 fps, because each
 * commit bought a full second of uncapped frames until the cap's next advance() reset the count. So a SKIPPED tick
 * clears R3F's pending frame count (`internal.frames`, R3F 9.5's own field for exactly this; invalidate() sets it and
 * its loop draws only while it is above 0). A loop started by a commit registers its rAF after this tick's, so from the
 * vsync after the switch on, this tick runs first: the loop finds nothing to draw and stops, and the commit's change is
 * drawn by the next capped frame, at most one interval later. A commit landing on a render tick is drawn by advance().
 */
export function FrameCap({ fps, active, testHooks = false, drivesHud = false }) {
  const advance = useThree((s) => s.advance);
  const get = useThree((s) => s.get);
  const set = useThree((s) => s.set);
  useLayoutEffect(() => {
    const original = get().setFrameloop;
    set({ setFrameloop: (mode) => switchKeepingClock(get().clock, original, mode) });
    return () => set({ setFrameloop: original });
  }, [get, set]);
  const frames = useRef(0);
  const fpsRef = useRef(fps);
  fpsRef.current = fps; // the pace in force, for the DEV hook (the title screen selects a slower one)
  useFrame(() => {
    frames.current += 1; // one per R3F frame drawn, whichever loop drew it (read by the DEV hook below)
  });
  useEffect(() => {
    // Only the game canvas registers the test hooks: the title canvas mounts a FrameCap too, and one hook name
    // registered from two canvases would answer for whichever mounted last.
    if (!import.meta.env.DEV || !testHooks) return;
    // DEV-only: the frame-cap e2e reads the live mode, the count of R3F frames drawn (the world clock is no proof of
    // drawing: it advances with no frame drawn at all), and the R3F clock, which must not jump back on a loop switch.
    registerTestHook('readFrameloop', () => ({ loop: get().frameloop, frames: frames.current, clock: get().clock.elapsedTime, fps: fpsRef.current }));
    registerTestHook('invalidateCanvas', () => get().invalidate()); // stands in for a React commit inside the Canvas
  }, [get, testHooks]);
  useEffect(() => {
    if (!active || !(fps > 0)) return undefined;
    // THE HUD FOLLOWS THE CANVAS (ui/hudTicker.js): while this loop paces the game canvas it owns the HUD's clock and
    // ticks it once per RENDERED frame; on cleanup (Unlimited, unmount) the ticker falls back to its own rAF (F10).
    const release = drivesHud ? claimHudTick() : null;
    let last = -Infinity;
    let raf = 0;
    const tick = (t) => {
      raf = requestAnimationFrame(tick);
      const step = stepCap(t, last, fps);
      last = step.last;
      if (step.render) {
        advance(t);
        if (drivesHud) emitHudTick(t);
      } else get().internal.frames = 0; // nothing for R3F's own loop to draw between capped frames (see above)
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (release) release();
    };
  }, [fps, active, advance, get, drivesHud]);
  return null;
}
