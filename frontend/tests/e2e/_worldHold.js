// THE WORLD HELD STILL FOR A MEASUREMENT UNTIL THE SPEC LETS GO — the freeze's END is the measurement's, never a window
// sized in advance. Kept out of the spec so a unit gate can drive it (tests/gates/world-hold-gates.test.js): in a browser
// the case that decides it, a runner slow enough to outlive a window, comes down to which machine CI hands you.
//
// tests/e2e/touch-hold.spec.js's action case froze the world with one `triggerHitstop(120000)`, copied from
// heavy-melee.spec.js, and its phases outlived it on main CI run 40642071917 (shard 7/8, 3 of 3: "SETUP: the world freeze
// ran out by the late press"): from the overlay's entry to the log line took 129-154 s there, against 59 s on PR #25's
// run 40637517889, where the same spec passed. Each real touch's handled gap ran 12-19 s on that runner, and a round trip
// seconds. No window sized in advance can promise a run's length — tests/e2e/world-hitstop.spec.js reached the same
// conclusion about frames (THE FREEZE IS HELD FOR A FRAME COUNT, there).
//
// THE RULE. The freeze opens as one long beat through the store's own action (triggerHitstop: stackHitstop honours one
// long beat whole), capped at `capMs`, which the spec sets to its own test timeout — the one wall budget the run already
// has, so no runner the test can finish on ends the freeze first. The spec ends it with release() once its last read is
// taken, by writing hitstopUntil = now: every reader (worldTimeScale, tickWorldClock, the player) compares that value with
// the clock and nothing else, so this IS the clock reaching the end of a timed freeze, and the world clock carries on
// from where it stood. A hit landing inside the freeze cannot end or shorten it (stackHitstop only extends, and a burst
// only to start + its cap).
//
// COUNTED IN DRAWN FRAMES. A frame loop counts the frames drawn while the freeze holds (a frame drawn after it ended is
// not the freeze's: world-hitstop's rule) and the longest frame, and release() reports them with the span actually
// frozen and whether it lapsed before the release — the denominator every `frozen` verdict prints, so a future failure
// says at once whether the cap ran out (heldMs = capMs), something else ended it (heldMs short of both), or nothing did.

/** Installed into the page, before boot (page.addInitScript; page functions are serialised and close over nothing):
 *  defines window.__e2eHoldWorld({ capMs }), which freezes the world at once and leaves window.__e2eWorldHold, whose
 *  release() ends the freeze and returns { capMs, heldMs, lapsed, frames, longestFrameMs }. */
export const installWorldHold = () => {
  window.__e2eHoldWorld = ({ capMs }) => {
    const store = window.useGameStore;
    store.getState().triggerHitstop(capMs); // one long beat, honoured whole — ended by release(), never left to the cap
    const start = store.getState().hitstopStart;
    const hold = { frames: 0, longest: 0, done: false };
    let prev = performance.now();
    const frame = () => {
      if (hold.done) return;
      const t = performance.now();
      hold.longest = Math.max(hold.longest, t - prev);
      prev = t;
      if (t >= store.getState().hitstopUntil) { hold.done = true; return; } // it ended without the spec: stop counting
      hold.frames += 1;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    hold.release = () => {
      const t = performance.now();
      const until = store.getState().hitstopUntil;
      if (t < until) store.setState({ hitstopUntil: t }); // the timed freeze's end, reached now (the next frame stops counting)
      return { capMs, heldMs: Math.round(Math.min(t, until) - start), lapsed: until <= t, frames: hold.frames,
        longestFrameMs: Math.round(hold.longest) };
    };
    window.__e2eWorldHold = hold;
  };
};
