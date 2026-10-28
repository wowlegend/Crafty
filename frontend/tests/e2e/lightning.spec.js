import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';

// STORM LIGHTNING, IN THE RUNNING GAME (plan 2026-09-23-crafty-storm-lightning, Task 3; EXTERNAL-BASELINE-R2 #4).
//
// tests/gates/lightning-gates drives the schedule, the envelope and the delay as numbers. What they cannot see: that
// the driver's flash reaches the LIGHT and the SKY in a rendered frame, lets go again, and that the thunder is
// voiced. A 360 ms flash is shorter than a screenshot round trip, so the spec freezes the world clock (a hitstop —
// the flash is held on it like the rest of the world) and plants the strike 40 ms in the past: the peak, held.
//
// Measured on the frame, in two views — the sky straight overhead and the ground at the player's feet, one region
// each, never the whole frame — as an A/B ON THE FROZEN WORLD, taken back to back in each view: dark (a strike planted
// 5 s in the past: flash 0), peak (40 ms: the held peak), dark again. The two dark shots bound whatever drift remains,
// so "peak minus dark" is the flash and nothing else. The sky view is the DOME's flash, the ground view the
// HEMISPHERE's; each mutant removing one must leave the other green.
// The first version compared the peak with a shot taken before the hitstop and asserted a RATIO on the ground: at
// night the ground was black either way (the night grade's black point; the flash then scaled the night sky's blue —
// game/lightning.js hemiWithFlash), and CI read it 6.8 -> 6.4 while the sky flashed.
// CONTROL: capture resets the flash and drops the strike — entered as eleven fixture hooks leave it, the MODULE flag
// on (devtest/captureMode.js) and the store's mirror off, which the driver used to read.
//
// SIZED FOR A RENDERER THAT DRAWS A FRAME A SECOND (2026-10-27). The previous version took 9.8 minutes an attempt on
// CI (run 40551564326, shard 4 cut off) and measured nothing by the end. Where the time went: up to 22 two-view shots
// (a settle loop of dark shots, then the A/B), each view six drawn frames plus a full-page screenshot decoded inside a
// page that was itself drawing a frame a second. And what it measured: the world was frozen for 120 s of WALL time,
// which that run outlived, so the clock ran again under the A/B — the planted peak read flash 0.00 and a dark shot
// 0.30, a natural strike. So here: the world is frozen for longer than the test may run and released explicitly; the
// storm and the night are HELD rather than re-asked (WeatherSystem flips the storm every 90 s, which a long A/B
// straddles); each shot is three drawn frames and one screenshot, its box decoded here; there is no settle
// loop — the sky eases on real time at a rate this renderer cannot outrun (below), and a pair of dark shots that
// disagree retakes that view's A/B, at most twice, rather than failing it.
//
// AND SIZED BY ITS PIXELS (2026-10-28). That version passed once on CI (run 40615468485, 3.1 min, 134 s from play to
// its log line) and then timed out at 300 s on all three attempts in the next two runs — 40622556954 on main, the SAME
// frontend tree as the green run, and 40623104162 with #23 merged — on runners that ran every other spec in the shard
// 1.5-2x slower. The last attempt of the second got through the whole A/B and printed its line at 264 s. Nothing hung; the cost had 1.6x headroom and the runners took it. Where the cost is
// (measured locally, SwiftShader, load 25): the main thread blocks 0-1 ms a frame and an evaluate returns in 2 ms, so
// the time is in the GPU process. A drawn frame took 126-219 ms at 1280x800 and 59-67 ms at 640x400; a screenshot
// 0.59-2.67 s at 1280x800 and 0.34-0.45 s at 640x400, and one clipped to the box measured no cheaper than the whole
// frame. So the window is 640x400 (same aspect, so the camera frames the same sky and ground), and each shot takes
// ONE whole-frame screenshot that serves as both the measurement and the diagnostic image. The extra full-page
// screenshot each view used to take is gone. The HUD is hidden: its panels keep their CSS size, and in this window the
// quest panel, the goal card and the XP bar covered about two thirds of the box (dark sky 29.4 for 8.4, the flash +45
// for +136, in the first run at this size). Hidden, the box sees the 3D frame whatever the HUD's layout.
//
// Mutation-Proof: LH, LD, LC and LT observed RED against a surviving identity run — the RECEIPTS block at the end.
test.use({ viewport: { width: 640, height: 400 } });
const BOX = [0.3, 0.3, 0.4, 0.35];
/** One screenshot of the whole frame, and the mean luminance of its centre box decoded in Node: no round trip into a
 *  page that is drawing a frame a second. Returns the PNG too: the peak's is the diagnostic image. */
const boxLuma = async (page) => {
  const buf = await page.screenshot();
  const png = PNG.sync.read(buf);
  const [fx, fy, fw, fh] = BOX;
  const x0 = Math.round(fx * png.width), y0 = Math.round(fy * png.height), w = Math.round(fw * png.width), h = Math.round(fh * png.height);
  let sum = 0;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = (y * png.width + x) * 4;
      sum += 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2];
    }
  }
  return { v: sum / (w * h), buf };
};
// TWO VIEWS, ONE BOX EACH, both the frame's centre (the HUD hidden, above). SKY: the camera
// pitched almost straight up, so the box is the dome and nothing the hemisphere lights — the first version's sky band
// sat across a tree canopy at spawn, so the hemisphere's flash on the leaves passed it with the dome's flash removed.
// GROUND: pitched 45 degrees down, the box is the up-facing ground at the player's feet, which the hemisphere lights.
const VIEWS = { sky: [1, 10], ground: [10, -10] }; // [ahead, up] of the look-at point, from the camera
/** Longer than the test may run: the world stays frozen until the spec releases it, whatever this renderer's rate. */
const FREEZE_MS = 900000;
/** Drawn frames per shot: two carry a planted strike to the frame, and one more is margin. Atmosphere subscribes its
 *  useFrame before the driver's (it sits earlier in GameScene; R3F runs equal priorities in subscription order), so
 *  the frame the driver takes the strike in still lights the old flash, and the next lights the new one. */
const SHOT_FRAMES = 3;

test('a storm strike lights the sky and the ground, lets go, and thunders; under capture it does nothing', async ({ page }) => {
  test.setTimeout(300000);
  await bootDev(page);
  await startPlayActive(page);
  // SETUP: nothing overhead — the sky view must see the dome, so the columns around the camera top out at most one
  // cell above the eye (getMobGroundLevel: the column's top surface, canopies included).
  const overhead = await page.evaluate(() => {
    const s = window.useGameStore.getState();
    const cam = window.__threeCamera;
    const eye = Math.floor(cam.position.y), cx = Math.floor(cam.position.x), cz = Math.floor(cam.position.z);
    const tops = [];
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) tops.push(s.getMobGroundLevel?.(cx + dx, cz + dz) ?? null);
    return { eye, tops };
  });
  expect(overhead.tops.every((t) => t !== null && t <= overhead.eye + 1), `SETUP: something stands over the camera — the sky view would not see the dome: ${JSON.stringify(overhead)}`).toBe(true);
  const T0 = Date.now();
  const lap = () => ((Date.now() - T0) / 1000).toFixed(1);
  await page.evaluate((freezeMs) => {
    const s = window.useGameStore.getState();
    s.setTimeOfDay?.(0.0); // night: the flash is the brightest thing in the sky
    // A STORM, HELD: the grade WeatherSystem declares for one (stormMoodBoost 0.85), and its 90 s interval no longer
    // able to flip it back to clear through this setter mid-A/B — the driver's `storm` and the sky both read it.
    window.useGameStore.setState({ weatherMoodBoost: 0.85, setWeatherMoodBoost: () => {} });
    // FIXTURE: no clouds and no motes (the sky-studio switch, store captureStudio). The dome's clouds drift on their
    // own clock, and overhead they swung the sky view 10 <-> 56 between consecutive dark shots (2026-10-27).
    s.setCaptureStudio(true);
    // FIXTURE: no HUD (the capture fixtures' own switch, store hudHidden). Its panels are sized in CSS pixels, so in
    // this window they cover the centre (below, AND SIZED BY ITS PIXELS); the subject is the 3D frame under them.
    s.setHudHidden(true);
    window.__voiced = [];
    const play = s.playSpatialSound;
    window.useGameStore.setState({ playSpatialSound: (name, ...rest) => { window.__voiced.push({ name, t: performance.now() }); return play?.(name, ...rest); } });
    // The world frozen in the same task as the storm begins, so no natural strike can come until the release below.
    s.triggerHitstop(freezeMs);
  }, FREEZE_MS);
  const call = (name, ...a) => page.evaluate(([n, args]) => window.__craftyTest.call(n, ...args), [name, a]);
  // `n` game frames DRAWN (FrameCap's DEV count), not page ticks: under the frame cap a tick can draw nothing.
  const frames = (n) => page.evaluate((k) => new Promise((r) => {
    const drawn = () => window.__craftyTest.call('readFrameloop')?.frames ?? 0;
    const until = drawn() + k;
    const f = () => (drawn() >= until ? r() : requestAnimationFrame(f));
    requestAnimationFrame(f);
  }), n);
  // THE SKY EASES ON REAL TIME (Atmosphere: lerp by min(1, 2 x the frame's real delta)), which the hitstop does not
  // hold: 4 s with frames drawn leaves under e^-8 of the step to night and the storm, at any frame rate — a renderer
  // drawing one frame a second takes it in one. What drift remains, the two dark shots bracketing each peak measure.
  await page.waitForTimeout(4000);
  await frames(SHOT_FRAMES);
  // One shot through one view of the frozen world: the night re-pinned (the day clock still ticks), the camera aimed,
  // a strike planted `agoMs` in the past (null: none), SHOT_FRAMES drawn, the box read, and the driver's state beside it.
  // `save` names a file for the frame (the peak's, for a reader of the run).
  const shot = async (view, agoMs, save = null) => {
    await page.evaluate(([[ahead, up], ago]) => {
      window.useGameStore.getState().setTimeOfDay?.(0.0);
      const cam = window.__threeCamera;
      cam.lookAt(cam.position.x + ahead, cam.position.y + up, cam.position.z);
      if (ago !== null) window.__craftyTest.call('strikeLightning', ago);
    }, [VIEWS[view], agoMs]);
    await frames(SHOT_FRAMES);
    const { v, buf } = await boxLuma(page);
    if (save) writeFileSync(test.info().outputPath(save), buf);
    const held = await call('readLightning');
    return { v, flash: held.flash, sinceStrike: held.sinceStrike };
  };
  // dark, peak, dark — back to back in one view. Two dark shots that disagree by 2 or more retake it, at most twice.
  const ab = async (view) => {
    const tries = [];
    for (let i = 0; i < 3; i++) {
      const dark = await shot(view, 5000);
      const peak = await shot(view, 40, i === 0 ? `lightning-peak-${view}.png` : null);
      const dark2 = await shot(view, 5000);
      tries.push({ dark, peak, dark2 });
      if (Math.abs(dark2.v - dark.v) < 2) break;
    }
    return tries;
  };
  const sky = await ab('sky');
  const ground = await ab('ground');
  const S = sky.at(-1), G = ground.at(-1);
  await page.evaluate(() => window.useGameStore.setState({ hitstopUntil: performance.now() }));
  // LET GO: the world running again, the last strike 5 s of world time past, nothing planted.
  const after = await shot('sky', null);
  // The thunder waits for the sound: up to 1400 m / 343 m/s ~ 4.1 s of world time after the strike.
  await page.waitForFunction(() => window.__voiced.some((v) => v.name === 'thunder'), null, { timeout: 15000 }).catch(() => {});
  const voiced = await page.evaluate(() => window.__voiced.map((v) => v.name));
  const where = JSON.stringify({ sky, ground, after, voiced });
  const f1 = (x) => x.toFixed(1);
  const tri = (r) => `${f1(r.dark.v)} -> ${f1(r.peak.v)} -> ${f1(r.dark2.v)} (flash ${r.dark.flash.toFixed(2)}/${r.peak.flash.toFixed(2)}/${r.dark2.flash.toFixed(2)})`;
  console.log(`lightning: sky ${tri(S)} x${sky.length} · ground ${tri(G)} x${ground.length} · after ${f1(after.v)} · thunder ${voiced.includes('thunder')} · ${lap()} s`);

  for (const [k, r] of [['sky', S], ['ground', G]]) {
    expect([r.dark.flash, r.dark2.flash], `SETUP: a strike 5 s past still flashes in the ${k} view — the freeze or the hook did not take: ${where}`).toEqual([0, 0]);
    expect(r.peak.flash, `SETUP: the driver holds no flash at the planted peak in the ${k} view — the freeze or the hook did not take: ${where}`).toBeGreaterThan(1);
    expect(Math.abs(r.dark2.v - r.dark.v), `SETUP: the ${k} drifted ${f1(Math.abs(r.dark2.v - r.dark.v))} between its two dark shots, ${k === 'sky' ? sky.length : ground.length} tries — the A/B is not a held world: ${where}`).toBeLessThan(2);
  }
  const base = (r) => Math.max(r.dark.v, r.dark2.v);
  expect(S.peak.v - base(S), `the flash did not light the sky: ${where}`).toBeGreaterThan(Math.max(4, base(S) * 0.15));
  expect(G.peak.v - base(G), `the flash did not light the ground: ${where}`).toBeGreaterThan(Math.max(4, base(G) * 0.15));
  // A natural strike may land once the world runs again (the storm schedules one 4-18 s of world time after the last):
  // that is a strike, not a flash that failed to let go, so it is named apart.
  expect(after.sinceStrike, `SETUP: a natural strike landed ${f1(after.sinceStrike)} ms before the let-go shot: ${where}`).toBeGreaterThan(400);
  expect(Math.abs(after.v - S.dark2.v), `the sky did not let go after the flash: ${where}`).toBeLessThan(Math.max(3, S.dark2.v * 0.08));
  expect(voiced, `no thunder was voiced after the strike: ${where}`).toContain('thunder');

  // CONTROL: capture resets the flash and drops the strike — the MODULE flag on, the store's mirror off, as the
  // eleven fixture hooks that call enterCaptureMode() directly leave it. Waited on in DRAWN FRAMES: the driver acts
  // only inside one, and a fixed 600 ms on a renderer drawing a frame a second can hold none — a vacuous control.
  // Frozen for FREEZE_MS like the A/B: under a 5 s freeze the frames outlived it at load 80 (sinceStrike 410 ms at the
  // read, the flash already decayed), and once the thunder's delay passes too, a broken reset reads as a working one.
  const capFlag = await call('enterCapture'); // returns the module flag
  await page.evaluate(() => window.useGameStore.setState({ isCaptureMode: false }));
  await frames(SHOT_FRAMES);
  await page.evaluate((freezeMs) => { window.__voiced.length = 0; window.useGameStore.getState().triggerHitstop(freezeMs); }, FREEZE_MS);
  await call('strikeLightning', 40);
  await frames(SHOT_FRAMES);
  const captured = await call('readLightning');
  const mirror = await page.evaluate(() => window.useGameStore.getState().isCaptureMode);
  expect([capFlag, mirror], `SETUP: not the fixture hooks' state (module flag on, store mirror off): ${JSON.stringify(captured)}`).toEqual([true, false]);
  expect(captured.flash, `a strike under capture flashed: ${JSON.stringify(captured)}`).toBe(0);
  expect(captured.thunderPending, `a strike under capture scheduled thunder: ${JSON.stringify(captured)}`).toBe(0);
});

// RECEIPTS (2026-10-28 UTC, local, this spec as committed: 640x400, HUD hidden; a private-port copy of
// scripts/dev/mutate-e2e.sh on 4193, SwiftShader, coverage ON as in CI, E2E_WORLD_TIMEOUT=240000, load 25-170 from other
// sessions; "body" is the time from play to the log line). Six runs in one batch, identities first and last:
//   identity (a comment edit in render/Atmosphere.jsx) SURVIVED: sky 8.3 -> 144.5 -> 8.3, ground 5.7 -> 62.2 -> 5.7
//     (dark, peak, dark; flash 0.00/1.60/0.00 in both views, one take each), let-go 8.3, thunder voiced; body 24.4 s.
//     The same boxes at 1280x800 with the HUD shown read sky 8.4 -> 144.9 -> 8.4, ground 5.1 -> 62.5 -> 5.1.
//   LH the hemisphere's flash dropped (Atmosphere hands hemiWithFlash 0) -> RED "the flash did not light the ground"
//     (ground 5.7 -> 5.7 -> 5.7 while the sky still went 8.3 -> 144.5). The same mutant is the shipped defect's shape:
//     the first version's flash left the ground where this leaves it.
//   LD the dome's flash dropped -> RED "the flash did not light the sky" (sky 8.3 -> 8.3 -> 8.3 while the ground went
//     5.7 -> 62.2). It SURVIVED the version before the last, whose sky band lay across a tree canopy.
//   LT the thunder never voiced (the voice call replaced by a no-op) -> RED "no thunder was voiced after the strike".
//   LC LightningDriver's capture reset reading the store mirror again -> RED "a strike under capture flashed" (flash
//     1.6, sinceStrike 40 — held — and two thunders pending).
//   identity 2 (another comment edit there) SURVIVED: sky 8.3 -> 144.5 -> 8.3, ground 5.7 -> 63.6 -> 5.7; body 22.3 s.
// The 1280x800 version's receipts (the same four RED, two identities SURVIVED) are in 44869aca; it could not finish on
// a slow CI runner. Cost, the two versions interleaved in one window (coverage on, load 40-220), two runs each: the
// screenshots took 9 in 53.6 and 12.6 s at 1280x800, 7 in 4.0 and 6.0 s at 640x400; the whole test 5.3 and 1.5 min
// at 1280x800, 55 and 52 s at 640x400. CI is the measurement that counts; these say only which way it moves.
// NOT CHECKED HERE: how bright the flash reads on a GPU at night or in a day storm (the ground at the peak read like
// daylight in this renderer) — that is a look decision for the light-and-colour lane.
