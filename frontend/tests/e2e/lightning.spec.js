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
// each, never the whole frame — as an A/B ON THE FROZEN WORLD: dark (a strike planted 5 s in the past: flash 0), peak
// (40 ms: the held peak), dark again, the night re-pinned and six frames drawn per view. The sky's mood eases on REAL
// time, which the hitstop does not hold, so the night is first SETTLED by measurement, and the two dark shots bound
// what drift remains — "peak minus dark" is the flash and nothing else. The sky view is the DOME's flash, the ground
// view the HEMISPHERE's; each mutant removing one must leave the other green.
// The first version compared the peak with a shot taken before the hitstop and asserted a RATIO on the ground: at
// night the ground was black either way (the night grade's black point; the flash then scaled the night sky's blue —
// game/lightning.js hemiWithFlash), and CI read it 6.8 -> 6.4 while the sky flashed.
// CONTROL: capture resets the flash and drops the strike — entered as eleven fixture hooks leave it, the MODULE flag
// on (devtest/captureMode.js) and the store's mirror off, which the driver used to read.
//
// Mutation-Proof: LH, LD, LC and LT observed RED against a surviving identity run — the RECEIPTS block at the end.
const region = async (page, boxes) => {
  const png = await page.screenshot();
  return page.evaluate(async ({ b64, boxes }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const g = cv.getContext('2d');
    g.drawImage(img, 0, 0);
    const out = {};
    for (const [name, [fx, fy, fw, fh]] of Object.entries(boxes)) {
      const px = g.getImageData(Math.round(fx * img.width), Math.round(fy * img.height), Math.round(fw * img.width), Math.round(fh * img.height)).data;
      let sum = 0;
      for (let i = 0; i < px.length; i += 4) sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      out[name] = sum / (px.length / 4);
    }
    return out;
  }, { b64: png.toString('base64'), boxes });
};
// TWO VIEWS, ONE BOX EACH, both the frame's centre (clear of the HUD's panels, compass and hotbar). SKY: the camera
// pitched almost straight up, so the box is the dome and nothing the hemisphere lights — the first version's sky band
// sat across a tree canopy at spawn, so the hemisphere's flash on the leaves passed it with the dome's flash removed.
// GROUND: pitched 45 degrees down, the box is the up-facing ground at the player's feet, which the hemisphere lights.
const BOX = [0.3, 0.3, 0.4, 0.35];
const VIEWS = { sky: [1, 10], ground: [10, -10] }; // [ahead, up] of the look-at point, from the camera

test('a storm strike lights the sky and the ground, lets go, and thunders; under capture it does nothing', async ({ page }) => {
  test.setTimeout(600000);
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
  await page.evaluate(() => {
    const s = window.useGameStore.getState();
    s.setTimeOfDay?.(0.0); // night: the flash is the brightest thing in the sky
    s.setWeatherMoodBoost(0.85); // a storm, as the WeatherSystem declares one
    // FIXTURE: no clouds and no motes (the sky-studio switch, store captureStudio). The dome's clouds drift on their
    // own clock, and overhead they swung the sky view 10 <-> 56 between consecutive dark shots (2026-10-27).
    s.setCaptureStudio(true);
    window.__voiced = [];
    const play = s.playSpatialSound;
    window.useGameStore.setState({ playSpatialSound: (name, ...rest) => { window.__voiced.push({ name, t: performance.now() }); return play?.(name, ...rest); } });
  });
  await page.waitForTimeout(3000); // the sky eases to night and to the storm grade
  const call = (name, ...a) => page.evaluate(([n, args]) => window.__craftyTest.call(n, ...args), [name, a]);
  // `n` game frames DRAWN (FrameCap's DEV count), not page ticks: under the frame cap a tick can draw nothing.
  const frames = (n) => page.evaluate((k) => new Promise((r) => {
    const drawn = () => window.__craftyTest.call('readFrameloop')?.frames ?? 0;
    const until = drawn() + k;
    const f = () => (drawn() >= until ? r() : requestAnimationFrame(f));
    requestAnimationFrame(f);
  }), n);
  // The centre box through one view: the camera re-aimed, six frames drawn.
  const look = async (view) => {
    await page.evaluate(([ahead, up]) => {
      const cam = window.__threeCamera;
      cam.lookAt(cam.position.x + ahead, cam.position.y + up, cam.position.z);
    }, VIEWS[view]);
    await frames(6);
    return (await region(page, { [view]: BOX }))[view];
  };
  // One shot of the frozen world with a strike planted `agoMs` in the past: the night re-pinned, both views.
  const shot = async (agoMs) => {
    await page.evaluate(() => { const s = window.useGameStore.getState(); s.setTimeOfDay?.(0.0); s.setWeatherMoodBoost(0.85); });
    await call('strikeLightning', agoMs);
    const sky = await look('sky');
    const ground = await look('ground');
    const held = await call('readLightning');
    return { sky, ground, flash: held.flash };
  };

  const pre = { sky: await look('sky'), ground: await look('ground') }; // before the freeze, logged
  await page.evaluate(() => window.useGameStore.getState().triggerHitstop(120000)); // ended explicitly below
  // SETTLE, MEASURED: the sky eases to night on REAL time, which the hitstop does not hold, at whatever rate this
  // renderer draws — 3 s left the sky drifting ~2 a shot on a loaded machine (2026-10-27). Dark shots until sky and
  // ground each move under 1 across two consecutive shots, at most 20.
  let prevDark = await shot(5000);
  let settled = 0;
  const settling = [];
  for (let i = 0; i < 20 && settled < 2; i++) {
    const next = await shot(5000);
    settled = Math.abs(next.sky - prevDark.sky) < 1 && Math.abs(next.ground - prevDark.ground) < 1 ? settled + 1 : 0;
    settling.push(`${next.sky.toFixed(1)}/${next.ground.toFixed(1)}`);
    prevDark = next;
  }
  expect(settled, `SETUP: the night sky never settled — sky/ground per dark shot: ${settling.join(' ')}`).toBe(2);
  const dark = await shot(5000);
  const peak = await shot(40);
  await page.screenshot({ path: test.info().outputPath('lightning-peak-ground.png') });
  await look('sky');
  await page.screenshot({ path: test.info().outputPath('lightning-peak-sky.png') });
  const dark2 = await shot(5000);
  await page.evaluate(() => window.useGameStore.setState({ hitstopUntil: performance.now() }));
  await page.waitForTimeout(1500);
  const after = { sky: await look('sky'), ground: await look('ground') };
  // The thunder waits for the sound: up to 1400 m / 343 m/s ~ 4.1 s of world time after the strike.
  await page.waitForFunction(() => window.__voiced.some((v) => v.name === 'thunder'), null, { timeout: 15000 }).catch(() => {});
  const voiced = await page.evaluate(() => window.__voiced.map((v) => v.name));
  const where = JSON.stringify({ pre, dark, peak, dark2, after, voiced });
  const f1 = (x) => x.toFixed(1);
  console.log(`lightning: sky ${f1(dark.sky)} -> ${f1(peak.sky)} -> ${f1(dark2.sky)} · ground ${f1(dark.ground)} -> ${f1(peak.ground)} -> ${f1(dark2.ground)} · flash ${dark.flash.toFixed(2)}/${peak.flash.toFixed(2)}/${dark2.flash.toFixed(2)} · after ${f1(after.sky)}/${f1(after.ground)} · thunder ${voiced.includes('thunder')}`);

  expect([dark.flash, dark2.flash], `SETUP: a strike 5 s past still flashes — the freeze or the hook did not take: ${where}`).toEqual([0, 0]);
  expect(peak.flash, `SETUP: the driver holds no flash at the planted peak — the freeze or the hook did not take: ${where}`).toBeGreaterThan(1);
  for (const k of ['sky', 'ground']) {
    expect(Math.abs(dark2[k] - dark[k]), `SETUP: the ${k} drifted ${f1(Math.abs(dark2[k] - dark[k]))} between the two dark shots — the A/B is not a held world: ${where}`).toBeLessThan(2);
  }
  const base = (k) => Math.max(dark[k], dark2[k]);
  expect(peak.sky - base('sky'), `the flash did not light the sky: ${where}`).toBeGreaterThan(Math.max(4, base('sky') * 0.15));
  expect(peak.ground - base('ground'), `the flash did not light the ground: ${where}`).toBeGreaterThan(Math.max(4, base('ground') * 0.15));
  // Against the LAST dark shot, not `pre`: the night keeps easing darker on real time (~1 a shot measured here), so a
  // reading from before the A/B drifted past the bound on correct code (pre 32.0, after 28.9, 2026-10-27).
  expect(Math.abs(after.sky - dark2.sky), `the sky did not let go after the flash: ${where}`).toBeLessThan(Math.max(3, dark2.sky * 0.08));
  expect(voiced, `no thunder was voiced after the strike: ${where}`).toContain('thunder');

  // CONTROL: capture resets the flash and drops the strike — the MODULE flag on, the store's mirror off, as the
  // eleven fixture hooks that call enterCaptureMode() directly leave it.
  const capFlag = await call('enterCapture'); // returns the module flag
  await page.evaluate(() => window.useGameStore.setState({ isCaptureMode: false }));
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__voiced.length = 0; window.useGameStore.getState().triggerHitstop(5000); });
  await call('strikeLightning', 40);
  await page.waitForTimeout(600);
  const captured = await call('readLightning');
  const mirror = await page.evaluate(() => window.useGameStore.getState().isCaptureMode);
  expect([capFlag, mirror], `SETUP: not the fixture hooks' state (module flag on, store mirror off): ${JSON.stringify(captured)}`).toEqual([true, false]);
  expect(captured.flash, `a strike under capture flashed: ${JSON.stringify(captured)}`).toBe(0);
  expect(captured.thunderPending, `a strike under capture scheduled thunder: ${JSON.stringify(captured)}`).toBe(0);
});

// RECEIPTS (2026-10-27, local, this spec as committed, one batch via a private-port copy of scripts/dev/mutate-e2e.sh,
// SwiftShader, load average ~40-60):
//   identity (a comment edit in render/Atmosphere.jsx) SURVIVED: sky 8.4 -> 144.9 -> 8.4, ground 5.1 -> 63.4 -> 5.1
//     (dark, peak, dark), after the release 8.4 / 5.1, thunder voiced.
//   LH the hemisphere's flash dropped (Atmosphere hands hemiWithFlash 0) -> RED "the flash did not light the ground"
//     (ground 5.07 -> 5.07 while the sky still went 8.4 -> 144.9). The same mutant is the shipped defect's shape: the
//     first version's flash left the ground where this leaves it.
//   LD the dome's flash dropped -> RED "the flash did not light the sky" (sky 8.5 -> 8.5 while the ground went
//     5.1 -> 62.9). It SURVIVED the previous version of this spec, whose sky band lay across a tree canopy at spawn.
//   LC LightningDriver's capture reset reading the store mirror again -> RED "a strike under capture flashed"
//     (flash 1.6, a thunder pending).
//   LT the thunder never voiced -> RED "no thunder was voiced after the strike".
// NOT CHECKED HERE: how bright the flash reads on a GPU at night or in a day storm (the ground at the peak read like
// daylight in this renderer) — that is a look decision for the light-and-colour lane.
