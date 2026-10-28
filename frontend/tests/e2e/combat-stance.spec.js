import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';

// YOU CANNOT OUTWALK A FIGHT, through real held keys (docs/superpowers/plans/2026-10-27-crafty-combat-stance.md, Task 5).
//
// src/game/combatStance.test.js proves the clamp and the state machine as pure functions. This drives the running game:
// a real zombie chased by the real AI worker, real KeyboardEvents through the controller's window listener, and the
// Player loop calling stanceStep and stanceVelocity once a frame.
//
// TWO KINDS OF VERDICT, ON PURPOSE.
//   - THE TARGET AND THE APPLIED VELOCITY, every frame, at any frame rate. `readMoveTarget` is the controller's own
//     record (game/combatStance.js stanceWalk): moveVector's output (`raw`), what the stance handed rampVelocity
//     (`target`), and what the ramp returned (`applied`), the planar velocity the KCC is fed. Each away-from-threat
//     component is judged against a direction THIS SPEC rebuilds from the positions that frame used
//     (`readStance().threatX/Z` and `playerX/Z`, the same `frame`), never from `readStance().awayX/Z`, which a negated
//     away (T5) would negate too; and against LITERAL caps (2.0, 6.5), never STANCE_CAPS, which a mutant of the
//     derivation (T2) would move with the subject. `applied` is judged once the ramp has settled (SETTLE_MS after the
//     key went down; round-1 review c: judging `target` alone let a bypass placed AFTER the record pass every run whose
//     chase went unjudged).
//   - THE CHASE, in GAME time: whether the husk closes, and how fast the BODY left it. The player and the AI worker
//     advance by the same capped step (src/game/frameStep.js), so a long frame slows both alike and a retreat chase is
//     judged at every frame rate. A hold lasts 8 s of game time on the stance's own clock (readStance().atS), so a stall
//     cannot use up the husk's time; a page that cannot advance that far inside HOLD_WALL_MS is SETUP. Speeds are the
//     body's own (readStance().playerX/Z, where each frame's step starts) over that clock: a wall-clock sample of the
//     camera mixes frame timing into the speed (case 3 read 8 to 23 m/s for a 14 m/s walk). The strafe chase is still
//     judged only at a median frame interval of 61 ms or less (STRAFE_CHASE_MAX_INTERVAL_MS, the husk's 15 Hz aim),
//     else reported as not judged. Every run logs its median frame interval, and each chase its worst frame.
//
// WHERE IT STANDS. The plan asked for one flat strip (14 m behind to 6 m ahead, 25 m lateral) and SETUP without one.
// The first local run measured the spawn: the hearth platform (floor 52, a 15 x 15 m pad) inside rolling ground at
// 45-61, so no heading of 8 had such a strip and the whole spec would have reported SETUP forever. So every case is
// staged from the platform (the player put back on its stand point, as context-loss.spec moves the body), with a
// heading chosen per case: the husk on the player's own level (else SETUP, since a husk out of its vertical reach
// never engages), preferring a heading whose WALKED path is flat. Flatness gates only that case's chase, like the frame
// rate does; the target assertions never need it.
//
// WHY THE GEOMETRY VARIES (review finding 1). With the husk dead ahead, a held S is both away-from-threat and
// camera-backward, so a camera-backward away vector (T6) or a moveB-gated call (T7) passes every S case. Case 2b (W,
// the husk behind) and case 2c (D, a pure strafe, which a decomposition along the camera's axes gets wrong) separate
// them.
//
// CASE 0, THE HEIGHT REFERENCE (the command session's decision; plan Task 4, "Deviation"). The stance must measure the
// player from the point the AI worker strikes from. This spec wraps Worker.prototype.postMessage before the app loads
// and keeps the playerPos of the last AI TICK; with the player standing still, the stance's recorded player point must
// equal it. (Round-1 review b: the point's x and z are now the body this frame, the y the worker's; standing still, the
// camera's x and z have converged on the body's, so the agreement still holds there, and H1 is still the 1.2 m in y.) A stance fed the rigid-body translation reads about 1.2 m low (H1), and so does a worker fed the body
// centre (H2). It is an AGREEMENT gate: a sense point moved for both readers at once (H3) survives here by design, and
// src/game/mobSenses.test.js pins the point itself.
//
// WHAT THIS DOES NOT CHECK: a stranded mob (the stall rule is unit-proven only, plan review finding 4); beast forms
// and the heavy's walk slow (unit-proven); touch input (tests/e2e/combat-touch.spec.js, Task 11); the dodge, which
// the stance does not clamp.
//
// Mutation-Proof: observed 2026-10-27 in the authoring lane, one local run per mutant on a THROWAWAY Playwright config
// (port 4297, Chromium + SwiftShader, median frame interval 214-387 ms), each scored by scripts/dev/mutate-e2e.sh's own
// rules (only an `Error:` line carrying SETUP: is a precondition; a test timeout is COULD NOT CHECK). mutate-e2e.sh
// itself was not used: it serves port 4179 and sweeps with kill-test-procs.sh, neither open to that lane. Red-first:
// the spec against the Task 4 tree (App.jsx, Components.jsx, AIWorkerSystem.jsx at HEAD) failed at the first stage.
//   T0 src/game/combatStance.js   a comment edit (identity)                                      SURVIVED (three runs)
//   T1 src/Components.jsx         the stanceVelocity call bypassed (the raw mv.x / mv.z used)     RED case 2: target 14 m/s
//   T2 src/game/combatStance.js   the slowest pursuer picked with Math.max (retreat 5.0)          RED case 2: target 5 m/s
//   T3 src/game/combatStance.js   ENGAGE_RADIUS_M = 0                                             RED case 0: never engaged
//   T4 src/game/combatStance.js   `engaged` forced true                                           RED the first stage: w 1
//   T5 src/game/combatStance.js   away negated (points at the threat)                             RED case 2: target 6.5 m/s
//   T6 src/Components.jsx         the planar camera-BACKWARD vector passed as (awayX, awayZ)      RED case 2b: target 6.5 m/s
//   T7 src/Components.jsx         stanceVelocity called only when input.moveB                     RED case 2b: target 14 m/s
//   T8 src/Components.jsx         the call passes Math.max(stance.w, 0.1) (a w floor)             RED case 3: 10 of 10 frames
//   T9 src/Components.jsx         the target scaled by 0.9 after the stance call                  RED case 3: 10 of 10 frames
// Round-1 review c, observed 2026-10-28 in the lane on a THROWAWAY Playwright config (port 4297, one run each, the
// stance's call sites now in src/game/combatStance.js stanceFrame / stanceWalk, which src/game/combatStance.test.js also
// pins by mutate.sh). Both runs had the chase unjudged (median frame interval over 250 ms), the condition under which
// the review found T10 survived:
//   T10 src/game/combatStance.js  the ramp fed the raw move after the record, in stanceWalk       RED case 2: "the
//                                 velocity fed to the body left the husk at 14 m/s while the target said 2" (303 ms)
//   T0  src/game/combatStance.js  a comment edit (identity)                                      SURVIVED (283 ms)
// The unmutated spec passed twice more locally (163 and 258 ms). STILL OWED TO CI: a run at CI's own frame rate.
//   H1 src/Components.jsx         stanceStep fed currentTrans (the body), not mobSensePoint      RED case 0: 1.200 m apart
//   H2 src/systems/AIWorkerSystem.jsx  playerPos posted as the body centre (sense.y - 1.2)        RED case 0: 1.200 m apart
//   H3 src/game/mobSenses.js      mobSensePoint returns a point 1.2 m lower, for both readers     SURVIVED, as designed
// STILL OWED TO CI: every chase sub-assertion's verdict at CI's own frame rate (locally the retreat chases of cases 2
// and 2b were judged and held in one run of two; the strafe chase and case 3's travel speed were never judged here),
// and CI's median frame interval for the plan's Task 5 Step 0. The mutants above were all killed by the target,
// identity and agreement assertions, none by a chase.

const RETREAT = 2.0; // LITERALS: the yardstick must not move with the subject (the Task 1 lesson)
const STRAFE = 6.5;
const EPS = 1e-6;
// A hold's game time is bounded by the stance clock; this bounds the wall clock, for a page that stops advancing.
const HOLD_WALL_MS = 120000;
// The applied velocity is judged from here on. The ramp (game/gameFeel.js) moves each axis 60 u/s² toward its target,
// so from rest it reaches any stance target (at most 6.8 m/s) within 113 ms of ramp time, and a frame longer than that
// reaches it in one step; before then a per-axis ramp can lean the velocity off the target's direction. (A first draft
// used 300 ms: the touch spec's husk, already walking in during the engage, caught up inside it, leaving no frame.)
const SETTLE_MS = 120;
// On a frame where the target turned faster than the ramp's 60 u/s² x the frame interval, the applied velocity lags it
// by that much. 0.1 m/s is under a hundredth of the 14 m/s a bypassed stance reads.
const APPLIED_TOL = 0.1;
const CAUGHT_GAP_M = 2.6;
// A STRAFE CHASE IS STILL JUDGED ONLY AT A FAST FRAME, now for the MOB's reason, not the player's. Within one frame the
// player moves in a straight line, so a tangential step L at gap g grew the gap by about L²/2g: a leak of STRAFE² · Δ /
// (2g) m/s (measured locally at Δ = 247 ms, 2026-10-27: the gap grew from 3.2 to 6.05 m while every target held the
// caps). Round-1 review b: the stance now pulls the step's end in to gap + 2.0 · Δ (game/combatStance.js, the step
// bound, unit-gated over 8-400 ms frames), so the player's own leak is gone at every frame rate. What remains is the
// husk's aim, which the worker refreshes at 15 Hz (a tick per frame below 15 fps) toward a player 6.5 · Δ further round
// the circle; nothing has measured that. So the old threshold (half the margin at the catch gap) is kept, as a
// conservative bound until CI's frame interval and a judged strafe chase say how far it can widen.
const STRAFE_CHASE_MAX_INTERVAL_MS = Math.floor((1000 * 0.5 * 2 * CAUGHT_GAP_M) / STRAFE ** 2); // 61 ms
const AGREE_M = 0.1;

// Runs in the page before the app (addInitScript), so it must be self-contained.
function installStanceHelpers() {
  // The AI worker's input, observed: the playerPos of every TICK the page posts (case 0).
  const post = Worker.prototype.postMessage;
  window.__aiTick = { n: 0, pos: null };
  Worker.prototype.postMessage = function (msg, ...rest) {
    if (msg && msg.type === 'TICK' && Array.isArray(msg.playerPos)) {
      window.__aiTick.n += 1;
      window.__aiTick.pos = msg.playerPos.slice();
    }
    return post.apply(this, [msg, ...rest]);
  };
  const call = (n, ...a) => window.__craftyTest.call(n, ...a);
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const cam = () => window.__threeCamera.position;
  const store = () => window.useGameStore.getState();
  const fwdOf = (yaw) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });
  const rightOf = (yaw) => ({ x: Math.cos(yaw), z: -Math.sin(yaw) });
  const H = {
    yaw: 0,
    setView(yaw) {
      const c = window.__threeCamera;
      c.rotation.order = 'YXZ';
      c.rotation.y = yaw; // pointerLook keeps no yaw of its own (input/pointerLook.js)
      c.rotation.x = 0;
    },
    heal() { window.useGameStore.setState({ isAlive: true, playerHealth: store().maxHealth }); },
    killHostiles(r) {
      const c = cam();
      for (const m of call('readMobs')) {
        if (!m.passive && m.health > 0 && Math.hypot(m.x - c.x, m.z - c.z) < r) window.GameMethods.damageMob(m.id, 99999, 'physical', 'ally');
      }
    },
    floorAt(x, z) {
      const f = store().getMobFloor;
      const y = f ? f(x, z, cam().y + 3) : null;
      return Number.isFinite(y) ? y : null;
    },
    // The floors along a line: [lowest, highest, missing], so a refusal can say what it saw.
    line(c, dir, from, to) {
      let lo = Infinity, hi = -Infinity, missing = 0;
      for (let s = from; s <= to; s += 1) {
        const y = H.floorAt(c.x + dir.x * s, c.z + dir.z * s);
        if (y === null) { missing++; continue; }
        lo = Math.min(lo, y); hi = Math.max(hi, y);
      }
      return [lo, hi, missing];
    },
    // THE STAND POINT is where the player stands when this runs: the spawn, on the hearth platform (a 15 x 15 m flat
    // pad, world/homeAnchor.js) inside rolling ground. Every case is staged from it (home()), so a husk 5-6.5 m away is
    // on the player's own level in every direction. The paths the cases WALK leave the pad, so each heading's paths are
    // surveyed: flat ones (every floor within one block) let that case's chase be judged; others are reported unjudged.
    async prepare() {
      H.heal();
      store().setTimeOfDay?.(0.5);
      H.killHostiles(40);
      const c = cam();
      const floor = H.floorAt(c.x, c.z);
      if (floor === null) return { why: `SETUP: no floor under the stand point (${c.x.toFixed(1)}, ${c.y.toFixed(1)}, ${c.z.toFixed(1)})` };
      H.stand = { x: c.x, z: c.z, floor };
      const flat = (l) => !l[2] && l[1] - l[0] <= 1;
      const level = (dir, s) => { const y = H.floorAt(c.x + dir.x * s, c.z + dir.z * s); return y !== null && Math.abs(y - floor) <= 1; };
      const survey = [];
      for (let k = 0; k < 8; k++) {
        const yaw = (k * Math.PI) / 4, f = fwdOf(yaw), r = rightOf(yaw);
        const back = H.line(c, f, -8, 0), ahead = H.line(c, f, 0, 8), right = H.line(c, r, 0, 18), back22 = H.line(c, f, -22, 0);
        survey.push({
          k, yaw, any: true, back: flat(back), ahead: flat(ahead), right: flat(right), back22: flat(back22),
          lv5: level(f, 5), lvm5: level(f, -5), lv65: level(f, 6.5),
          note: `${k * 45}deg back ${back[0]}..${back[1]} ahead ${ahead[0]}..${ahead[1]} right ${right[0]}..${right[1]} back22 ${back22[0]}..${back22[1]}`,
        });
      }
      return { floor, survey, stand: { x: c.x, z: c.z } };
    },
    // Put the player back on the stand point, still. (tests/e2e/context-loss.spec.js moves the body the same way.)
    async home() {
      const rb = store().playerRigidBodyRef?.current;
      if (!rb || !H.stand) return false;
      rb.setTranslation({ x: H.stand.x, y: H.stand.floor + 1.2, z: H.stand.z }, true);
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
      for (let i = 0; i < 10; i++) await frame();
      const c = cam();
      return Math.hypot(c.x - H.stand.x, c.z - H.stand.z) < 0.5;
    },
    async frameInterval(n) {
      const d = [];
      let t = performance.now();
      for (let i = 0; i < n; i++) { await frame(); const u = performance.now(); d.push(u - t); t = u; }
      d.sort((a, b) => a - b);
      return { median: Math.round(d[Math.floor(d.length / 2)]), n: d.length };
    },
    // Kill every hostile near, then wait for the stance to leave. That wait is a VERDICT, not a SETUP: a stance that
    // never leaves is mutant T4, and a SETUP here would score it COULD NOT CHECK.
    async idle(medianMs) {
      H.killHostiles(40);
      const t0 = performance.now();
      const deadline = 2000 + 600 + 300 + 2 * medianMs; // CALM_MS + EXIT_S + a margin, plus two frames
      while (performance.now() - t0 < deadline && call('readStance')?.w !== 0) await frame();
      const st = call('readStance');
      return { w: st?.w, engaged: st?.engaged, ms: Math.round(performance.now() - t0) };
    },
    async spawn(where, dist, yaw = H.yaw) {
      H.heal();
      H.setView(yaw);
      const c = cam(), f = fwdOf(yaw), s = where === 'behind' ? -1 : 1;
      const x = c.x + f.x * dist * s, z = c.z + f.z * dist * s;
      const before = new Set(call('readMobs').map((m) => m.id));
      store().spawnMob(x, z, 'zombie', H.floorAt(x, z));
      await frame();
      const added = call('readMobs').filter((m) => !before.has(m.id));
      return added.length === 1 ? { id: added[0].id } : { why: `SETUP: spawnMob added ${added.length} mobs, not one` };
    },
    async engage(id, medianMs) {
      const t0 = performance.now();
      const deadline = Math.max(3000, 15 * medianMs);
      const trace = [];
      for (;;) {
        await frame();
        const st = call('readStance');
        const m = call('readMobs').find((x) => x.id === id), c = cam();
        if (trace.length < 20) trace.push([Math.round(performance.now() - t0), st ? +st.w.toFixed(2) : 'no readStance', st?.engaged, m ? +Math.hypot(m.x - c.x, m.z - c.z).toFixed(2) : 'gone']);
        if (st && st.engaged === true && st.w === 1) return { ok: true, ms: Math.round(performance.now() - t0) };
        if (performance.now() - t0 > deadline) return { ok: false, trace };
      }
    },
    // The stance's recorded player point against the last AI TICK's, standing still (case 0).
    async agreement() {
      const n0 = window.__aiTick.n;
      const d = [];
      for (let i = 0; i < 12; i++) {
        await frame();
        const st = call('readStance'), p = window.__aiTick.pos;
        if (!st || !p) continue;
        d.push([st.playerX - p[0], st.playerY - p[1], st.playerZ - p[2]]);
      }
      const c = cam();
      return { d, ticks: window.__aiTick.n - n0, eyeOverFloor: +(c.y - (H.floorAt(c.x, c.z) ?? NaN)).toFixed(2) };
    },
    key(code, down) { window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true })); },
    // Hold a key through the controller's listener and sample every frame until the husk is caught, `maxS` of game
    // time passes, or (with no husk) `minSamples` matched frames and `minS` have been seen. Game time is the stance's
    // clock: each sample's `a` is the game time, from the key going down, at which the body point it read (where that
    // frame's step started) held, and `g` the game time through that frame.
    // `catchS`: once the husk has caught up, keep sampling until this much game time has passed, so the applied
    // velocity has settled frames to be judged on; the chase is read only up to the catch (caughtFrames below).
    async hold(code, id, { maxS = 8, minS = 0, minSamples = 0, catchS = 0, wallMs = 120000 } = {}) {
      const samples = [];
      const c0 = { x: cam().x, z: cam().z };
      const s0 = call('readStance');
      const g0 = s0 ? s0.atS + s0.stepS : 0;
      const t0 = performance.now();
      let matched = 0, stalled = false;
      H.key(code, true);
      try {
        for (;;) {
          await frame();
          const t = performance.now() - t0;
          const st = call('readStance'), mt = call('readMoveTarget'), c = cam();
          const g = st ? st.atS + st.stepS - g0 : 0, a = st ? st.atS - g0 : 0;
          const m = id == null ? null : call('readMobs').find((x) => x.id === id);
          const gap = m ? Math.hypot(m.x - c.x, m.z - c.z) : null;
          if (st && mt && mt.frame === st.frame) matched++;
          samples.push({ t, g, a, gap, px: c.x, pz: c.z, st, mt });
          if (g >= maxS) break;
          if (t >= wallMs) { stalled = true; break; }
          if (id != null && gap != null && gap <= 2.6 && g >= catchS) break;
          if (id == null && matched >= minSamples && g >= minS) break;
        }
      } finally {
        H.key(code, false);
      }
      const last = samples[samples.length - 1];
      return { samples, stalled, gameS: last ? +last.g.toFixed(2) : 0, wallMs: Math.round(performance.now() - t0), moved: Math.hypot(cam().x - c0.x, cam().z - c0.z) };
    },
  };
  window.__stanceSpec = H;
}

/**
 * The target and the applied velocity on every frame the stance was at full weight, its move target was that frame's,
 * and the key was seen; the applied one only from SETTLE_MS of game time on (the ramp runs on the frame's step).
 */
function judgeTarget(samples) {
  let judged = 0, worstAway = -Infinity, worstTan = 0;
  let applied = 0, worstAppliedAway = -Infinity, worstAppliedTan = 0;
  for (const { g, st, mt } of samples) {
    if (!st || !mt || st.w !== 1 || mt.frame !== st.frame || Math.hypot(mt.rawX, mt.rawZ) < 1) continue;
    const ax = st.playerX - st.threatX, az = st.playerZ - st.threatZ, l = Math.hypot(ax, az);
    if (l < 1e-3) continue;
    const ux = ax / l, uz = az / l;
    worstAway = Math.max(worstAway, mt.targetX * ux + mt.targetZ * uz);
    worstTan = Math.max(worstTan, Math.abs(-mt.targetX * uz + mt.targetZ * ux));
    judged++;
    if (g * 1000 < SETTLE_MS) continue;
    worstAppliedAway = Math.max(worstAppliedAway, mt.appliedX * ux + mt.appliedZ * uz);
    worstAppliedTan = Math.max(worstAppliedTan, Math.abs(-mt.appliedX * uz + mt.appliedZ * ux));
    applied++;
  }
  return {
    judged, worstAway: +worstAway.toFixed(6), worstTan: +worstTan.toFixed(6),
    applied, worstAppliedAway: +worstAppliedAway.toFixed(6), worstAppliedTan: +worstAppliedTan.toFixed(6),
  };
}

/** The samples up to and including the first one at which the husk had caught up (all of them if it never did). */
function caughtFrames(samples) {
  const i = samples.findIndex((s) => s.gap != null && s.gap <= CAUGHT_GAP_M);
  return i < 0 ? samples : samples.slice(0, i + 1);
}

/**
 * The BODY's achieved speed away from the threat over the frames at full weight, m/s of game time; a compact trace; the
 * longest frame and the game time the chase took. Between two samples the body moved by the steps of the frames from
 * the earlier one on, and the stance clock advanced by exactly those steps, so the speed is the body's own whatever the
 * frames cost; the direction is the earlier frame's (the frame that moved it).
 */
function chase(samples) {
  let along = 0, secs = 0, gapMin = Infinity, worstFrameMs = 0;
  const trace = [];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i], p = samples[i - 1];
    worstFrameMs = Math.max(worstFrameMs, s.t - (p ? p.t : 0));
    if (s.gap != null) gapMin = Math.min(gapMin, s.gap);
    const ok = p && p.st && s.st && s.st.atS > p.st.atS;
    const speed = ok ? Math.hypot(s.st.playerX - p.st.playerX, s.st.playerZ - p.st.playerZ) / (s.st.atS - p.st.atS) : 0;
    if (trace.length < 40) trace.push([Math.round(s.t), +s.g.toFixed(2), s.gap == null ? null : +s.gap.toFixed(2), +speed.toFixed(2), s.st ? +s.st.w.toFixed(2) : null]);
    if (!ok || p.st.w !== 1) continue;
    const ax = p.st.playerX - p.st.threatX, az = p.st.playerZ - p.st.threatZ, l = Math.hypot(ax, az);
    if (l < 1e-3) continue;
    along += ((s.st.playerX - p.st.playerX) * ax + (s.st.playerZ - p.st.playerZ) * az) / l;
    secs += s.st.atS - p.st.atS;
  }
  const last = samples[samples.length - 1];
  return {
    retreat: secs > 0 ? +(along / secs).toFixed(2) : null, gapMin: +gapMin.toFixed(2), trace,
    worstFrameMs: Math.round(worstFrameMs), gameS: last ? +last.g.toFixed(2) : 0, spanMs: Math.round(last ? last.t : 0),
  };
}

test.describe('combat stance', () => {
  test.setTimeout(900000);

  test('an aggro\'d husk catches a held S, a held W with it behind, and a strafe; out of combat the target is moveVector\'s', async ({ page }, testInfo) => {
    await page.addInitScript(installStanceHelpers);
    await bootDev(page);
    await startPlayActive(page);
    await page.waitForFunction(() => window.__craftyTest?.call('readMobs') && window.__threeCamera && window.GameMethods?.damageMob
      && window.useGameStore.getState().spawnMob && window.useGameStore.getState().getMobFloor, null, { timeout: 60000 })
      .catch((e) => { throw new Error(`SETUP: the mob hooks, camera and spawner never came up — ${e.message}`); });

    const prep = await page.evaluate(() => window.__stanceSpec.prepare());
    expect(prep.why, prep.why).toBeUndefined();
    console.log(`combat-stance: stand floor ${prep.floor}; ${prep.survey.map((h) => h.note).join('; ')}`);
    const fi = await page.evaluate(() => window.__stanceSpec.frameInterval(30));
    console.log(`combat-stance: median frame interval: ${fi.median} ms (${fi.n} samples)`); // the chase's denominator, every run
    const chaseNotes = [];
    // A heading whose spawn point is on the stand's level (else SETUP), preferring one whose walked path is flat; the
    // chase is judged only on a flat path (and the strafe's only at a frame interval of at most `maxMs`), and an
    // unjudged chase is an annotation, never a verdict.
    const heading = (label, level, flatPath, maxMs = Infinity) => {
      const h = prep.survey.find((x) => x[level] && x[flatPath]) ?? prep.survey.find((x) => x[level]);
      expect(h, `SETUP: ${label}: no heading puts the husk on the player's level — ${prep.survey.map((x) => x.note).join('; ')}`).toBeTruthy();
      const fpsOk = fi.median <= maxMs;
      const judge = fpsOk && h[flatPath];
      if (!judge) {
        testInfo.annotations.push({ type: 'not judged', description: `${label}: the chase (${fpsOk ? `no flat ${flatPath} path at any heading with a level spawn` : `median frame interval ${fi.median} ms > ${maxMs} ms`}); the target assertions carry the verdict` });
      }
      return { yaw: h.yaw, judge, k: h.k };
    };

    const idleFirst = async (label) => {
      const r = await page.evaluate((ms) => window.__stanceSpec.idle(ms), fi.median);
      // Not SETUP: a game with no stance to read is the defect red-first exists to see (observed before the wiring).
      expect(r.w, r.w === undefined
        ? `${label}: readStance returned nothing — the stance is not wired into the running game (App.jsx registers no readStance hook)`
        : `the stance never left before ${label}: w ${r.w} (engaged ${r.engaged}) ${r.ms} ms after every hostile near died`).toBe(0);
      const home = await page.evaluate(() => window.__stanceSpec.home());
      expect(home, `SETUP: ${label}: the player could not be put back on the stand point`).toBe(true);
    };
    const stageAndEngage = async (where, dist, label, yaw) => {
      await idleFirst(label);
      const sp = await page.evaluate(({ where, dist, yaw }) => window.__stanceSpec.spawn(where, dist, yaw), { where, dist, yaw });
      expect(sp.why, sp.why).toBeUndefined();
      const en = await page.evaluate(({ id, ms }) => window.__stanceSpec.engage(id, ms), { id: sp.id, ms: fi.median });
      expect(en.ok, `${label}: the stance never engaged with an aggro'd husk ${dist} m ${where} — ${JSON.stringify(en.trace)}`).toBe(true);
      return sp.id;
    };
    const caught = async (code, id, label, judgeChase, { strafe = false } = {}) => {
      const r = await page.evaluate(({ code, id, catchS, wallMs }) => window.__stanceSpec.hold(code, id, { catchS, wallMs }), { code, id, catchS: SETTLE_MS / 1000 + 0.25, wallMs: HOLD_WALL_MS });
      expect(r.stalled, `SETUP: ${label}: the game advanced ${r.gameS} s in ${r.wallMs} ms of holding, short of the hold's 8 s`).toBe(false);
      expect(r.moved, `SETUP: ${label}: the player moved ${r.moved.toFixed(2)} m (blocked by terrain?)`).toBeGreaterThanOrEqual(0.5);
      const j = judgeTarget(r.samples);
      expect(j.judged, `SETUP: ${label}: no frame at w === 1 with that frame's move target and the key seen (${r.samples.length} sampled)`).toBeGreaterThan(0);
      expect(j.worstAway, `${label}: the target left the husk at ${j.worstAway} m/s (cap ${RETREAT}; ${j.judged} frames judged)`).toBeLessThanOrEqual(RETREAT + EPS);
      if (strafe) expect(j.worstTan, `${label}: the target circled at ${j.worstTan} m/s (cap ${STRAFE}; ${j.judged} frames judged)`).toBeLessThanOrEqual(STRAFE + EPS);
      expect(j.applied, `SETUP: ${label}: no frame at w === 1 from ${SETTLE_MS} ms on with that frame's move target (${r.samples.length} sampled)`).toBeGreaterThan(0);
      expect(j.worstAppliedAway, `${label}: the velocity fed to the body left the husk at ${j.worstAppliedAway} m/s while the target said ${j.worstAway} (cap ${RETREAT}; ${j.applied} settled frames)`).toBeLessThanOrEqual(RETREAT + APPLIED_TOL);
      if (strafe) expect(j.worstAppliedTan, `${label}: the velocity fed to the body circled at ${j.worstAppliedTan} m/s (cap ${STRAFE}; ${j.applied} settled frames)`).toBeLessThanOrEqual(STRAFE + APPLIED_TOL);
      const ch = chase(caughtFrames(r.samples));
      chaseNotes.push(`${label}: ${j.judged} frames judged, worst away ${j.worstAway} (applied ${j.worstAppliedAway} over ${j.applied}), retreat ${ch.retreat} m/s, closest ${ch.gapMin} m in ${ch.gameS} s of game time (${ch.spanMs} ms, worst frame ${ch.worstFrameMs} ms), chase ${judgeChase ? 'judged' : 'not judged'}`);
      if (judgeChase) {
        expect(ch.gapMin, `${label}: the husk never caught up in ${ch.gameS} s of game time (closest ${ch.gapMin} m) — [ms, gameS, gap, bodySpeed, w] ${JSON.stringify(ch.trace)}`).toBeLessThanOrEqual(CAUGHT_GAP_M);
        if (!strafe) {
          expect(ch.retreat, `SETUP: ${label}: no frame at full weight moved the body (${r.samples.length} sampled)`).not.toBeNull();
          expect(ch.retreat, `${label}: the body left the husk at ${ch.retreat} m/s of game time — [ms, gameS, gap, bodySpeed, w] ${JSON.stringify(ch.trace)}`).toBeLessThanOrEqual(2.3);
        }
      }
    };

    // 0. THE HEIGHT REFERENCE: the stance measures the player from the point the worker strikes from.
    {
      const h = heading('case 0', 'lv65', 'ahead');
      await stageAndEngage('ahead', 6.5, 'case 0', h.yaw); // 6.5 m: the husk is still walking in while the point is sampled
      const a = await page.evaluate(() => window.__stanceSpec.agreement());
      expect(a.ticks, 'SETUP: no AI TICK was posted while sampling — the postMessage wrapper saw nothing, so the agreement cannot be judged').toBeGreaterThan(0);
      expect(a.d.length, 'SETUP: no frame had both a stance record and a posted TICK').toBeGreaterThan(0);
      const worst = a.d.map((v) => Math.max(Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2]))).sort((x, y) => x - y);
      const median = worst[Math.floor(worst.length / 2)];
      chaseNotes.push(`case 0: median ${median.toFixed(3)} m over ${worst.length} frames, ${a.ticks} TICKs, eye ${a.eyeOverFloor} m over the floor`);
      expect(median, `the stance measures the player from a point ${median.toFixed(3)} m from the one the AI worker strikes from (median over ${worst.length} frames, ${a.ticks} TICKs; the eye stands ${a.eyeOverFloor} m over the floor) — deltas ${JSON.stringify(a.d.map((v) => v.map((x) => +x.toFixed(3))))}`).toBeLessThanOrEqual(AGREE_M);
    }

    // 1. Engages, and 2. a held S with the husk ahead is caught.
    {
      const h = heading('case 2', 'lv5', 'back');
      const id = await stageAndEngage('ahead', 5, 'case 1', h.yaw);
      await caught('KeyS', id, 'case 2: a held S (husk ahead)', h.judge);
    }
    // 2b. A held W, facing away from a husk BEHIND: the away-from-threat axis, not the camera's backward one.
    {
      const h = heading('case 2b', 'lvm5', 'ahead');
      const id = await stageAndEngage('behind', 5, 'case 2b', h.yaw);
      await caught('KeyW', id, 'case 2b: a held W walked away from an aggro\'d husk behind', h.judge);
    }
    // 2c. A held D with the husk ahead: a straight world-line strafe whose away component grows as it passes.
    {
      const h = heading('case 2c', 'lv5', 'right', STRAFE_CHASE_MAX_INTERVAL_MS);
      const id = await stageAndEngage('ahead', 5, 'case 2c', h.yaw);
      await caught('KeyD', id, 'case 2c: a strafe outran an aggro\'d husk', h.judge, { strafe: true });
    }

    // 3. THE CONTROL: the husk dies, the stance leaves, and the controller's target IS moveVector's output, bit for bit.
    {
      // No husk here: any heading; the travel is judged over the path's first 8 m, which must be flat. (A whole-second
      // window needs a flat 22 m path, and the first local survey found none at any heading from the hearth.)
      const h = heading('case 3', 'any', 'back');
      await idleFirst('case 3');
      await page.evaluate((yaw) => window.__stanceSpec.setView(yaw), h.yaw);
      const r = await page.evaluate((wallMs) => window.__stanceSpec.hold('KeyS', null, { maxS: 20, minS: 1.5, minSamples: 10, wallMs }), HOLD_WALL_MS);
      expect(r.stalled, `SETUP: case 3: the game advanced ${r.gameS} s in ${r.wallMs} ms of holding`).toBe(false);
      const seen = r.samples.filter(({ st, mt }) => st && mt && mt.frame === st.frame && Math.hypot(mt.rawX, mt.rawZ) >= 1);
      expect(seen.length, `SETUP: case 3: ${seen.length} frames had that frame's move target with the key seen (need 10)`).toBeGreaterThanOrEqual(10);
      const off = seen.filter(({ st, mt }) => st.w !== 0 || !Object.is(mt.targetX, mt.rawX) || !Object.is(mt.targetZ, mt.rawZ));
      expect(off.length, `out of combat the controller's target is not moveVector's on ${off.length} of ${seen.length} frames — ${JSON.stringify(off.slice(0, 3).map(({ st, mt }) => ({ w: st.w, mt })))}`).toBe(0);
      // The window, in game time on the body: past the walk ramp (60 u/s² reaches 14 m/s in 0.23 s, game/gameFeel.js) and
      // inside the flat 8 m.
      const win = r.samples.filter((s) => s.st && s.a >= 0.3 && Math.hypot(s.st.playerX - prep.stand.x, s.st.playerZ - prep.stand.z) <= 8);
      const span = win.length >= 2 ? win[win.length - 1].a - win[0].a : 0;
      if (h.judge && span >= 0.1) {
        expect(r.moved, `SETUP: case 3: the player moved ${r.moved.toFixed(2)} m holding S out of combat (blocked?)`).toBeGreaterThanOrEqual(3);
        const a = win[0].st, b = win[win.length - 1].st;
        const speed = Math.hypot(b.playerX - a.playerX, b.playerZ - a.playerZ) / span;
        chaseNotes.push(`case 3: ${seen.length} identity frames, travel ${speed.toFixed(2)} m/s over ${span.toFixed(2)} s of game time (${win.length} frames)`);
        expect(speed, `out of combat a held S moved the body at ${speed.toFixed(2)} m/s of game time (${win.length} frames over ${span.toFixed(2)} s on the flat)`).toBeGreaterThanOrEqual(12);
      } else {
        if (h.judge) testInfo.annotations.push({ type: 'not judged', description: `case 3: travel speed (${win.length} frames on the flat 8 m past the ramp)` });
        chaseNotes.push(`case 3: ${seen.length} identity frames (travel speed not judged: ${win.length} frames in the window)`);
      }
    }
    console.log(`combat-stance: ${chaseNotes.join(' · ')}`);
  });
});
