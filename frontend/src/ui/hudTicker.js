// hudTicker — one clock for the DOM HUD (plan docs/superpowers/plans/2026-10-27-crafty-steady-cool.md, item f; F10).
//
// The ObjectiveTracker, the Compass and the AbilityBar each ran their own requestAnimationFrame loop at the DISPLAY rate
// — 120 Hz on a ProMotion panel — outside the 60 fps cap, so the HUD re-derived and re-wrote itself twice for every
// frame the canvas drew. Now they subscribe here, and the ticker has two sources:
//   - while the game canvas is CAPPED, render/FrameCap.jsx claims the ticker and ticks it once per frame it renders, so
//     the HUD updates exactly when the world does (60 fps, or 30 behind a panel);
//   - otherwise (Unlimited, the capture harness, the perf probe: FrameCap's loop is not running) the ticker runs its own
//     rAF. F10 is why this fallback exists: a HUD driven only by FrameCap froze under Unlimited.
// Module state, deliberately: there is one game canvas and one HUD.

const subscribers = new Set();
let claims = 0;
let raf = 0;

const rafLoop = (t) => {
  raf = requestAnimationFrame(rafLoop);
  for (const fn of subscribers) fn(t);
};

function syncLoop() {
  const wanted = claims === 0 && subscribers.size > 0;
  if (wanted && !raf) raf = requestAnimationFrame(rafLoop);
  else if (!wanted && raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
}

/** Tick `fn(t)` on every HUD frame. @returns {() => void} unsubscribe */
export function subscribeHudTick(fn) {
  subscribers.add(fn);
  syncLoop();
  return () => {
    subscribers.delete(fn);
    syncLoop();
  };
}

/** The capped canvas takes over the ticker (stops the rAF fallback). @returns {() => void} release */
export function claimHudTick() {
  claims += 1;
  syncLoop();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    claims -= 1;
    syncLoop();
  };
}

/** One HUD frame, from the claimant (FrameCap, after a rendered frame). Ignored when nobody holds the ticker. */
export function emitHudTick(t) {
  if (claims === 0) return;
  for (const fn of subscribers) fn(t);
}
