// HOW LONG combat-stance.spec.js and combat-touch.spec.js WAIT FOR THE STANCE TO ENGAGE, kept out of the specs so a unit
// gate can drive it (tests/gates/stance-engage-wait-gates.test.js), the same split as _worldHold.js and _floorSamples.js.
//
// The wait is bounded in GAME time, the stance's own clock (readStance().atS + stepS, the sum of the frames' capped
// steps; src/game/frameStep.js), as combat-stance.spec.js's holds are. A software-rendered frame of several seconds
// advances the game by one 0.25 s step, so a wall-clock budget is spent by that single frame and the spec reports a
// stance that never engaged against one that had engaged and was blending in. Only a page that stops advancing game time
// inside `wallMs` is SETUP (`stalled`). With no stance record to read, wall seconds stand in for game seconds, so an
// unwired stance still ends as the verdict.
//
// WHAT THIS DOES NOT CHECK: that the husk is aggro'd or close (the specs stage it), or what the stance itself does across
// a long frame (src/game/combatStance.test.js drives one 3.5 s frame through stanceFrame).

/** Installed into the page before boot (page.addInitScript; page functions are serialised and close over nothing):
 *  defines window.__stanceEngage(id, medianMs, wallMs), which resolves { ok, ms, gameS } once the stance is engaged at
 *  full weight, else { ok: false, budgetS, trace } once the game budget is spent, or the same with `stalled: true` and
 *  the game time reached when the wall bound ran out first. trace rows are [wall ms, game s, w, engaged, husk gap m]. */
export const installStanceEngage = () => {
  window.__stanceEngage = async (id, medianMs, wallMs) => {
    const call = (n, ...a) => window.__craftyTest.call(n, ...a);
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const t0 = performance.now();
    const budgetS = Math.max(3000, 15 * medianMs) / 1000;
    const s0 = call('readStance');
    const g0 = s0 ? s0.atS + s0.stepS : 0;
    const trace = [];
    const kept = () => (trace.length > 20 ? [...trace.slice(0, 8), '...', ...trace.slice(-12)] : trace);
    for (;;) {
      await frame();
      const st = call('readStance');
      const ms = performance.now() - t0;
      const g = st ? st.atS + st.stepS - g0 : ms / 1000;
      const m = call('readMobs').find((x) => x.id === id), c = window.__threeCamera.position;
      trace.push([Math.round(ms), +g.toFixed(2), st ? +st.w.toFixed(2) : 'no readStance', st?.engaged, m ? +Math.hypot(m.x - c.x, m.z - c.z).toFixed(2) : 'gone']);
      if (st && st.engaged === true && st.w === 1) return { ok: true, ms: Math.round(ms), gameS: +g.toFixed(2) };
      if (g > budgetS) return { ok: false, budgetS, trace: kept() };
      if (ms > wallMs) return { ok: false, stalled: true, budgetS, gameS: +g.toFixed(2), ms: Math.round(ms), trace: kept() };
    }
  };
};
