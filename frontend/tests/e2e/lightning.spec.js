import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';

// STORM LIGHTNING, IN THE RUNNING GAME (plan 2026-09-23-crafty-storm-lightning, Task 3; EXTERNAL-BASELINE-R2 #4).
//
// tests/gates/lightning-gates drives the schedule, the envelope and the delay as numbers. What they cannot see: that
// the driver's flash reaches the LIGHT and the SKY in a rendered frame, lets go again, and that the thunder is
// voiced. A 360 ms flash is shorter than a screenshot round trip, so the spec freezes the world clock (a hitstop —
// the flash is held on it like the rest of the world) and plants the strike 40 ms in the past: the peak, held.
//
// Measured on the frame, in two control regions — a patch of sky and a patch of ground — never the whole frame, and
// against the same regions just before the strike. CONTROL: under capture the same strike changes nothing (the flash
// is reset to 0, and no thunder is voiced).
//
// Mutation-Proof: PENDING — to run via scripts/dev/mutate-e2e.sh before this commits: the flash not added to the
// hemisphere light; the flash not added to the sky dome; plausible-wrong, the capture reset dropped; the thunder
// never voiced; and an identity mutant.
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
// Sky: a band across the top, clear of the HUD's compass. Ground: a band below the crosshair, above the hotbar.
const BOXES = { sky: [0.3, 0.14, 0.4, 0.08], ground: [0.3, 0.62, 0.4, 0.1] };

test('a storm strike lights the sky and the ground, lets go, and thunders; under capture it does nothing', async ({ page }) => {
  test.setTimeout(300000);
  await bootDev(page);
  await startPlayActive(page);
  await page.evaluate(() => {
    const s = window.useGameStore.getState();
    s.setTimeOfDay?.(0.0); // night: the flash is the brightest thing in the sky
    s.setWeatherMoodBoost(0.85); // a storm, as the WeatherSystem declares one
    const cam = window.__threeCamera;
    cam.lookAt(cam.position.x + 10, cam.position.y - 1.2, cam.position.z); // sky above the horizon, ground below
    window.__voiced = [];
    const play = s.playSpatialSound;
    window.useGameStore.setState({ playSpatialSound: (name, ...rest) => { window.__voiced.push({ name, t: performance.now() }); return play?.(name, ...rest); } });
  });
  await page.waitForTimeout(3000); // the sky eases to night and to the storm grade
  const call = (name, ...a) => page.evaluate(([n, args]) => window.__craftyTest.call(n, ...args), [name, a]);

  const before = await region(page, BOXES);
  await page.evaluate(() => window.useGameStore.getState().triggerHitstop(20000)); // ended explicitly below
  await call('strikeLightning', 40);
  await page.waitForTimeout(800); // a few frames render the held peak
  const held = await call('readLightning');
  const peak = await region(page, BOXES);
  await page.screenshot({ path: test.info().outputPath('lightning-peak.png') });
  await page.evaluate(() => window.useGameStore.setState({ hitstopUntil: performance.now() }));
  await page.waitForTimeout(1500);
  const after = await region(page, BOXES);
  // The thunder waits for the sound: up to 1400 m / 343 m/s ~ 4.1 s of world time after the strike.
  await page.waitForFunction(() => window.__voiced.some((v) => v.name === 'thunder'), null, { timeout: 15000 }).catch(() => {});
  const voiced = await page.evaluate(() => window.__voiced.map((v) => v.name));
  const where = JSON.stringify({ before, peak, after, held, voiced });
  console.log(`lightning: sky ${before.sky.toFixed(1)} -> ${peak.sky.toFixed(1)} -> ${after.sky.toFixed(1)} · ground ${before.ground.toFixed(1)} -> ${peak.ground.toFixed(1)} -> ${after.ground.toFixed(1)} · flash ${held.flash.toFixed(2)} · thunder ${voiced.includes('thunder')}`);

  expect(held.flash, `SETUP: the driver holds no flash at the planted peak — the freeze or the hook did not take: ${where}`).toBeGreaterThan(1);
  expect(peak.sky, `the flash did not light the sky: ${where}`).toBeGreaterThan(before.sky * 1.15 + 2);
  expect(peak.ground, `the flash did not light the ground: ${where}`).toBeGreaterThan(before.ground * 1.1 + 1);
  expect(Math.abs(after.sky - before.sky), `the sky did not let go after the flash: ${where}`).toBeLessThan(Math.max(3, before.sky * 0.08));
  expect(voiced, `no thunder was voiced after the strike: ${where}`).toContain('thunder');

  // CONTROL: capture resets the flash and drops the strike.
  await call('enterCapture');
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__voiced.length = 0; window.useGameStore.getState().triggerHitstop(5000); });
  await call('strikeLightning', 40);
  await page.waitForTimeout(600);
  const captured = await call('readLightning');
  expect(captured.flash, `a strike under capture flashed: ${JSON.stringify(captured)}`).toBe(0);
  expect(captured.thunderPending, `a strike under capture scheduled thunder: ${JSON.stringify(captured)}`).toBe(0);
});
