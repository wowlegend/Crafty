import { test, expect } from './_fixtures.js';
import { PNG } from 'pngjs';
import { bootDev, startPlayActive } from './_boot.js';
import { displayed, stoneFaceUnder, oklch } from '../gates/_lightModel.js';

// THE LIGHT SCRIPT, LIVED (plan docs/superpowers/plans/2026-10-27-crafty-light-colour-script.md, Task 3b).
//
// The pure gates (colour-script, key-light, sky-frame) import the modules, so they go red if a module is deleted, but
// not if the running game stops CALLING it. This reads the wiring in the running game, each value from the live object
// it describes: the directional light's own position and intensity, the dome's star uniform, the terrain material's
// sun uniform, the direction the shadow map last rendered from, and the screen itself (the grey card).
//
//   noon      the key is the sun: not the moon, its direction IS the sun's, and it is lit.
//   midnight  the sun is under the ground (sunDirY < 0) and the key is the MOON above it (keyDirY > 0, keyIsMoon, lit);
//             the stars are out; the terrain still reads the SUN (ore glow, leaves and cloud shadows mean the sun,
//             refute F5); and the shadow map was rendered from the moon's key, not from the sun under the ground.
//   moon mask the dome's painted moon shows 0.06 above the horizon and not 0.06 below it (the shader itself, sampled
//             alone with declared uniforms through the DEV hook sampleDome).
//   storm     the overlay hides the stars (one read, then the weather is reset).
//   dawn      THE LIGHT RAMPS (render/skyClock.js): the game clock is a 1 Hz step, and the sky read straight from it
//             stepped once a second (review, HIGH). Sampled every frame for a few seconds from the sun's rise, the live
//             key light must change between two frames inside ONE game-second (the store's gameTime the same for both),
//             with the mood still (|dmood| < 1e-6), by more than the mood's own decay could move it (1e-4). Only a
//             renderer drawing two frames inside one game-second can show this; under ~2 fps (CI's SwiftShader measured
//             0.8-1.9) the read is printed and annotated NOT MEASURED, and the stepped clock's kill is the unit gate's
//             (tests/gates/sky-clock-gates.test.jsx).
//   grey card the colour model (tests/gates/_lightModel.js displayed()) against the real screen, at noon and at
//             midnight: within displayed OKLab L 0.03 and C 0.02. Noon also reads grey (C <= 0.03: the clip IS the
//             card), and midnight also holds the absolute night bounds (L >= 0.30, C <= 0.07), so a change that moves
//             the model and the screen together still fails. The camera is turned to face the key first (a declared
//             view, not the spawn yaw), and the model includes three's direct specular for that view: seen at a
//             grazing 15 deg toward the key, GGX adds about displayed L 0.1, which a diffuse-only model would miss.
//             Read on the LOW tier (pinned for the read, then restored): N8AO and GodRays (med/high) are passes the
//             model does not hold, and moved this card up to L 0.10 either way when measured.
//
// THE WEATHER IS PINNED before every read (review amendment 6): the live weather flips clear and storm every 90 s
// (render/WeatherSystem.jsx) and a storm's boost (about 0.85) scales the stars by (1 - t1). Each read sets the boost to
// 0, polls until the smoothed mood is under 0.02, and reads at once; every message carries mood, weatherBoost, tier,
// isAlive and active (gates-and-probes 4e).
//
// Mutation-Proof: 2026-10-27, mutate-e2e.sh's contract (same verdict rules, SETUP and timeouts COULD NOT CHECK, an
// identity mutant per batch) run through a throwaway copy of the config on port 4297, each observed RED:
//   E1 sunDirRef written from m.keyDir                       -> "midnight: the terrain's uSunDir is not the sun"
//   E2 the light positioned from m.sunPos (the old behaviour)  -> "midnight: the light comes from below the horizon"
//   E3 uStar left at 0                                        -> "midnight: no stars"
//   E4 the shadow schedule fed m.sunPos, the light m.keyDir   -> "midnight: the shadow map last rendered from below"
//   E5 the night exposure back to the draft's 1.15            -> "the moonlit stone is black on screen (L 0.282)",
//      on the away-from-the-moon read; it SURVIVED the facing read (specular), which is why that read exists
//   E6 the weather pin replaced by a forced storm             -> "midnight: no stars" (stars 0.15)
//   E7 the model without the specular term                    -> "noon: model L 0.490 vs screen 0.593"
//   E8 the card's albedo darkened to #5A5A5A (screen != model) -> the noon card's grey/agreement checks
//   E0 identity (a comment edit in Atmosphere.jsx) SURVIVED, in both batches.
//   SC1e Atmosphere renders liveCycle(st.gameTime), the 1 Hz step  -> "dawn: the key light did not move between frames
//        of one game-second" (0 of 2 pairs moved, key steps 0.0000 0.0000; the identities' runs moved 0.0026-0.9136)
//   MTe the moon disc's moonUp horizon mask dropped (skyDome.js)    -> "the painted moon shows under the horizon" (0.702)
//
// BLIND SPOT: SwiftShader on CI is not a GPU, and this reads one patch of one material. The look itself (the night as
// a whole, golden hour, WebKit and the iPad) is the lookbook's (plan Task 9), on a real GPU.

const UP = [0, 1, 0];
const call = (page, name, ...args) => page.evaluate(([n, a]) => window.__craftyTest.call(n, ...a), [name, args]);
const fmt = (o) => JSON.stringify(o, (k, v) => (typeof v === 'number' ? Number(v.toFixed(4)) : v));

async function preconditions(page) {
  return page.evaluate(() => {
    const s = window.useGameStore.getState();
    return { isAlive: s.isAlive, active: window.__craftyTest.call('readIntents')?.active === true, isDay: s.isDay, gameTime: s.gameTime };
  });
}

/** Wait until the game canvas has drawn `n` more frames (readFrameloop counts R3F frames drawn), or `capMs`. */
async function frames(page, n, capMs = 20000) {
  const start = (await call(page, 'readFrameloop'))?.frames ?? 0;
  const t0 = Date.now();
  for (;;) {
    const now = (await call(page, 'readFrameloop'))?.frames ?? 0;
    if (now - start >= n) return now - start;
    if (Date.now() - t0 > capMs) throw new Error(`SETUP: only ${now - start} of ${n} frames drawn in ${capMs} ms`);
    await page.waitForTimeout(100);
  }
}

/** Set the clock (midnight-origin, as the store's setTimeOfDay), let the light follow, and read the sky in clear weather. */
async function skyAt(page, timeOfDay, label) {
  await page.evaluate((t) => window.__craftyTest.call('setTimeOfDay', t), timeOfDay);
  await frames(page, 4);
  return clearRead(page, 'readSkyLight', label);
}

/** Pin the weather clear, wait for the smoothed mood to settle, then read `hook`. Two tries: a 90 s weather flip can
 *  land inside the window, and the read is only taken while the boost is still the pinned 0. */
async function clearRead(page, hook, label) {
  let last = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    await call(page, 'setWeatherMoodBoost', 0);
    const t0 = Date.now();
    while (Date.now() - t0 < 10000) {
      last = await call(page, 'readSkyLight');
      if (last && last.mood < 0.02) break;
      await page.waitForTimeout(150);
    }
    if (last && last.mood < 0.02 && last.weatherBoost === 0) return hook === 'readSkyLight' ? last : call(page, hook);
  }
  throw new Error(`SETUP: ${label}: the weather would not hold clear (mood ${last?.mood}, boost ${last?.weatherBoost}) — ${fmt({ last, ...(await preconditions(page)) })}`);
}

/** Face the camera along the key light's horizontal bearing, pitched 8 deg down. A DECLARED view, so the card's specular
 *  is not left to the spawn yaw: looking toward the key puts the card's view near the mirror of the light, where three's
 *  GGX adds the most (about displayed L 0.1 at noon), so the model's specular term is exercised, not just its absence.
 *  The pitch keeps the sun (and the moon, both at 32 deg) out of the frame, and the card clear of the crosshair.
 *  `away` turns the camera the other way: the card's view is then on the key's side, where the specular is smallest
 *  (about L 0.01), the closest a screen read comes to the diffuse face the night bounds (colour-script B2) are set on. */
async function faceTheKey(page, label, away = false) {
  const k = await call(page, 'readSkyLight');
  if (!k?.keyDir) throw new Error(`SETUP: ${label}: no live key direction to face — ${fmt(k)}`);
  await page.evaluate(([x, z, s]) => {
    const cam = window.__threeCamera;
    const h = (Math.hypot(x, z) || 1) * s;
    cam.lookAt(cam.position.x + (x / h) * 10, cam.position.y - 10 * Math.tan((8 * Math.PI) / 180), cam.position.z + (z / h) * 10);
  }, [k.keyDir[0], k.keyDir[2], away ? -1 : 1]);
  await frames(page, 3);
}

/** The grey card: the model's displayed colour against the median pixel of the card on screen, read on the LOW tier.
 *  The model is the whole chain there (rig, grade, NEUTRAL). Med and high add N8AO and GodRays, screen-space passes the
 *  model does not hold: measured 2026-10-27 on this card, high read up to L 0.10 off the model in both directions while
 *  low agreed within 0.006 at three facings, noon and midnight. The tier the game had is restored after. */
async function greyCard(page, label, away = false) {
  const priorTier = await page.evaluate(() => window.useGameStore.getState().qualityTier);
  await call(page, 'setQualityTier', 'low');
  try {
    // THE WEATHER CAN FLIP INSIDE THE READ: the card waits three frames and the screenshot comes after, and a 90 s storm
    // tick landed there once (measured: mood 0.06, boost 0.85, the screen 0.08 under the model). So the weather is read
    // again AFTER the screenshot, and a read it moved is taken again (two tries, then SETUP).
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      last = await shootCard(page, label, away);
      const after = await call(page, 'readSkyLight');
      if (last.weatherBoost === 0 && after?.weatherBoost === 0 && after.mood < 0.02) return last;
      last.weatherAfter = { mood: after?.mood, weatherBoost: after?.weatherBoost };
    }
    throw new Error(`SETUP: ${label}: the weather moved during both card reads — ${fmt(last.weatherAfter)}`);
  } finally {
    await call(page, 'clearGreyCard');
    await call(page, 'setQualityTier', priorTier);
  }
}

/** One grey-card read: face the key, pin the weather, mount the card, shoot its inner 60%, and model it. */
async function shootCard(page, label, away) {
  { // one read, scoped so its locals cannot leak into the retry loop above
    await frames(page, 3);
    await faceTheKey(page, label, away);
    await call(page, 'setWeatherMoodBoost', 0);
    const card = await clearRead(page, 'readGreyCard', label);
    if (card.tier !== 'low') throw new Error(`SETUP: ${label}: the tier governor stepped off low (${card.tier}) before the card was read`);
    const where = fmt({ label, rect: card.rect, mood: card.mood, weatherBoost: card.weatherBoost, tier: card.tier, ...(await preconditions(page)) });
    const vp = page.viewportSize();
    const r = card.rect;
    expect(r.width >= 12 && r.height >= 8, `SETUP: the card projects to ${r.width.toFixed(1)}x${r.height.toFixed(1)} px — ${where}`).toBe(true);
    expect(r.x >= 0 && r.y >= 0 && r.x + r.width <= vp.width && r.y + r.height <= vp.height, `SETUP: the card is off screen — ${where}`).toBe(true);
    // The inner 60% of the card's rect, so its edges (SMAA, the quad's projection) never enter the sample.
    const clip = { x: Math.round(r.x + r.width * 0.2), y: Math.round(r.y + r.height * 0.2), width: Math.max(4, Math.floor(r.width * 0.6)), height: Math.max(3, Math.floor(r.height * 0.6)) };
    const png = PNG.sync.read(await page.screenshot({ clip }));
    const ch = [[], [], []];
    for (let i = 0; i < png.width * png.height; i++) for (let c = 0; c < 3; c++) ch[c].push(png.data[i * 4 + c]);
    const median = ch.map((a) => a.sort((x, y) => x - y)[a.length >> 1]);
    const lin = median.map((v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
    const screen = oklch(lin);
    // The model WITH the key's direct specular for this view (the card is seen at a grazing 15 deg, where three's GGX
    // adds displayed L 0.01-0.11 by azimuth), and the diffuse-only reading beside it for the record.
    const model = oklch(displayed(stoneFaceUnder(card.frame, { normal: UP, keyDir: card.frame.keyDir, viewDir: card.viewDir }), card.frame.grade));
    const diffuseOnly = oklch(displayed(stoneFaceUnder(card.frame, { normal: UP, keyDir: card.frame.keyDir }), card.frame.grade));
    return {
      screen, model, diffuseOnly, median, pixels: png.width * png.height, where, frame: card.frame, viewDir: card.viewDir,
      weatherBoost: card.weatherBoost,
    };
  }
}

test('the light script in the running game: a sun key at noon, a moon key at midnight, the stars, the shadow map, and the grey card', async ({ page }) => {
  test.setTimeout(300000);
  await bootDev(page);
  await startPlayActive(page);

  // PRESENCE, at noon: the key is the sun, aimed down the sun's own direction, and lit.
  const noon = await skyAt(page, 0.5, 'noon');
  const atNoon = fmt({ ...noon, ...(await preconditions(page)) });
  console.log(`[light-script] noon ${atNoon}`);
  expect(noon.keyIsMoon, `noon: the key is the moon — ${atNoon}`).toBe(false);
  expect(Math.abs(noon.keyDirY - noon.sunDirY), `noon: the light is not aimed down the sun's direction — ${atNoon}`).toBeLessThanOrEqual(1e-6);
  expect(noon.keyIntensity, `noon: the key is unlit — ${atNoon}`).toBeGreaterThan(1);

  const cardNoon = await greyCard(page, 'noon');
  console.log(`[light-script] grey card at noon: screen ${fmt(cardNoon.screen)} model ${fmt(cardNoon.model)} (diffuse only ${fmt(cardNoon.diffuseOnly)}) view ${fmt(cardNoon.viewDir)} median ${cardNoon.median} over ${cardNoon.pixels} px`);
  expect(cardNoon.screen.C, `noon: the card does not read grey on screen, so the clip is not the card — ${cardNoon.where}`).toBeLessThanOrEqual(0.03);
  expect(Math.abs(cardNoon.screen.L - cardNoon.model.L), `noon: model L ${cardNoon.model.L.toFixed(3)} vs screen ${cardNoon.screen.L.toFixed(3)} — ${cardNoon.where}`).toBeLessThanOrEqual(0.03);
  expect(Math.abs(cardNoon.screen.C - cardNoon.model.C), `noon: model C ${cardNoon.model.C.toFixed(3)} vs screen ${cardNoon.screen.C.toFixed(3)} — ${cardNoon.where}`).toBeLessThanOrEqual(0.02);

  // MIDNIGHT: the sun is under the ground, the moon holds the key above it, and everything that means the SUN still does.
  const night = await skyAt(page, 0.0, 'midnight');
  const shadow = await call(page, 'readSunShadow');
  const atNight = fmt({ ...night, schedSun: shadow?.schedSun, ...(await preconditions(page)) });
  console.log(`[light-script] midnight ${atNight}`);
  expect(night.sunDirY, `midnight: the sun is not below the horizon — ${atNight}`).toBeLessThan(0);
  expect(night.keyIsMoon, `midnight: the key is not the moon — ${atNight}`).toBe(true);
  expect(night.keyDirY, `midnight: the light comes from below the horizon — ${atNight}`).toBeGreaterThan(0);
  expect(night.keyIntensity, `midnight: the moon key is unlit — ${atNight}`).toBeGreaterThan(0.2);
  expect(night.stars, `midnight: no stars — ${atNight}`).toBeGreaterThan(0.9);
  expect(night.terrainSunDirY, `midnight: the terrain's uSunDir is not the sun (ore glow, leaves and cloud shadows would follow the moon) — ${atNight}`).toBeLessThan(0);
  expect(shadow?.schedSun?.[1], `midnight: the shadow map last rendered from below the horizon, not from the moon's key — ${atNight}`).toBeGreaterThan(0);

  const cardNight = await greyCard(page, 'midnight');
  console.log(`[light-script] grey card at midnight: screen ${fmt(cardNight.screen)} model ${fmt(cardNight.model)} (diffuse only ${fmt(cardNight.diffuseOnly)}) view ${fmt(cardNight.viewDir)} median ${cardNight.median} over ${cardNight.pixels} px`);
  expect(Math.abs(cardNight.screen.L - cardNight.model.L), `midnight: model L ${cardNight.model.L.toFixed(3)} vs screen ${cardNight.screen.L.toFixed(3)} — ${cardNight.where}`).toBeLessThanOrEqual(0.03);
  expect(Math.abs(cardNight.screen.C - cardNight.model.C), `midnight: model C ${cardNight.model.C.toFixed(3)} vs screen ${cardNight.screen.C.toFixed(3)} — ${cardNight.where}`).toBeLessThanOrEqual(0.02);
  // THE ABSOLUTE NIGHT BOUNDS, on the screen, read with the camera turned AWAY from the moon: facing it, the specular
  // lifts the card about L 0.07, which held a night exposure of 1.15 (the draft's) above 0.30 (mutant E5 survived the
  // facing read: screen 0.331 against a diffuse 0.273). Away, the specular is about 0.01 and the bound means what B2 means.
  const cardAway = await greyCard(page, 'midnight, away from the moon', true);
  console.log(`[light-script] grey card at midnight, away from the moon: screen ${fmt(cardAway.screen)} model ${fmt(cardAway.model)} (diffuse only ${fmt(cardAway.diffuseOnly)}) view ${fmt(cardAway.viewDir)} median ${cardAway.median} over ${cardAway.pixels} px`);
  expect(Math.abs(cardAway.screen.L - cardAway.model.L), `midnight, away: model L ${cardAway.model.L.toFixed(3)} vs screen ${cardAway.screen.L.toFixed(3)} — ${cardAway.where}`).toBeLessThanOrEqual(0.03);
  expect(cardAway.screen.L, `midnight: the moonlit stone is black on screen (L ${cardAway.screen.L.toFixed(3)}) — ${cardAway.where}`).toBeGreaterThanOrEqual(0.30);
  expect(cardAway.screen.C, `midnight: the moonlit stone is navy on screen (C ${cardAway.screen.C.toFixed(3)}) — ${cardAway.where}`).toBeLessThanOrEqual(0.07);

  // THE PAINTED MOON IS MASKED UNDER THE HORIZON (review: mutant MT, the mask dropped from the disc, survived; the mask
  // is GLSL, so only a renderer can read it). The dome's own shader, sampled alone (DEV hook sampleDome: a 2 deg view
  // into a 4x4 target) with DECLARED uniforms: stars full, no clouds, no sun, plain grey-blue gradient stops. The moon
  // 0.06 above the horizon, looked at straight on, must stand far above the sky 40 deg beside it at the same height
  // (presence: the instrument sees the disc); 0.06 below, it must not differ from its neighbour at all.
  {
    const N = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
    const yaw = (v, deg) => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; };
    const DOME = { uStar: 1, uCloudCover: 0, sunColor: [0, 0, 0], sunDir: [0, -1, 0], topColor: [0.05, 0.06, 0.1], midColor: [0.08, 0.1, 0.16], horizonColor: [0.2, 0.22, 0.3] };
    const domeAt = (dir, moon) => call(page, 'sampleDome', { dir, uniforms: { ...DOME, uMoonDir: moon } });
    const up = N([0.284, 0.06, -0.799]), down = N([0.284, -0.06, -0.799]);
    const upMoon = await domeAt(up, up), upSky = await domeAt(yaw(up, 40), up);
    const downMoon = await domeAt(down, down), downSky = await domeAt(yaw(down, 40), down);
    const atMoon = fmt({ upMoon, upSky, downMoon, downSky });
    console.log(`[light-script] the dome's moon: ${atMoon}`);
    expect(upMoon[2] - upSky[2], `SETUP: the dome sampler cannot see the moon disc above the horizon — ${atMoon}`).toBeGreaterThan(0.3);
    const leak = Math.max(...[0, 1, 2].map((c) => Math.abs(downMoon[c] - downSky[c])));
    expect(leak, `the painted moon shows under the horizon (the dome's moonUp mask is gone): ${leak.toFixed(3)} — ${atMoon}`).toBeLessThanOrEqual(0.02);
  }

  // THE OVERLAY, once: a storm hides the stars. Then the weather is reset.
  try {
    await call(page, 'setWeatherMoodBoost', 0.85);
    const t0 = Date.now();
    let storm = null;
    while (Date.now() - t0 < 10000) {
      storm = await call(page, 'readSkyLight');
      if (storm && storm.mood > 0.8) break;
      await page.waitForTimeout(150);
    }
    const atStorm = fmt({ ...storm, ...(await preconditions(page)) });
    console.log(`[light-script] storm at midnight ${atStorm}`);
    expect(storm?.mood, `SETUP: the storm boost never raised the mood — ${atStorm}`).toBeGreaterThan(0.8);
    expect(storm.stars, `storm: the stars still show through the overlay — ${atStorm}`).toBeLessThan(0.3);
  } finally {
    await call(page, 'setWeatherMoodBoost', 0);
  }

  // DAWN: THE LIGHT RAMPS BETWEEN THE CLOCK'S TICKS. On the low tier (more frames per game-second on a software
  // renderer), the weather pinned and the mood settled far below the clear-read bound: the mood lerps every frame, so a
  // mood still decaying would move the key per frame by itself and hide a stepped clock.
  const priorTier = await page.evaluate(() => window.useGameStore.getState().qualityTier);
  await call(page, 'setQualityTier', 'low');
  try {
    await call(page, 'setWeatherMoodBoost', 0);
    const settle = Date.now();
    let calm = null;
    while (Date.now() - settle < 15000) {
      calm = await call(page, 'readSkyLight');
      if (calm && calm.mood < 1e-4) break;
      await page.waitForTimeout(200);
    }
    if (!(calm && calm.mood < 1e-4)) throw new Error(`SETUP: dawn: the mood never settled under 1e-4 — ${fmt({ ...calm, ...(await preconditions(page)) })}`);
    await frames(page, 5); // the tier step recompiles programs; the first frames after it are the slowest
    await page.evaluate(() => window.__craftyTest.call('setTimeOfDay', 0.25)); // the clock's dawn (gameTime 0)
    const samples = await page.evaluate(async (ms) => {
      const out = [];
      const t0 = performance.now();
      await new Promise((resolve) => {
        const tick = () => {
          const s = window.__craftyTest.call('readSkyLight');
          if (s && (!out.length || out[out.length - 1].frame !== s.frame)) {
            out.push({ frame: s.frame, gameTime: s.gameTime, key: s.keyIntensity, mood: s.mood, cycle: s.cycle, t: Math.round(performance.now() - t0) });
          }
          if (performance.now() - t0 < ms) requestAnimationFrame(tick); else resolve();
        };
        tick();
      });
      return out;
    }, 6000);
    const firstTick = samples.findIndex((s) => s.gameTime !== samples[0].gameTime);
    const where = fmt({ frames: samples.length, firstTick, head: samples.slice(0, 4), tail: samples.slice(-2), ...(await preconditions(page)) });
    // Pairs of consecutive frames inside one game-second, after the first tick (until then the sky is AT the clock, which
    // it never passes), with the mood still.
    const pairs = [];
    for (let i = Math.max(1, firstTick + 1); firstTick >= 0 && i < samples.length; i++) {
      const a = samples[i - 1], b = samples[i];
      if (a.gameTime === b.gameTime && Math.abs(a.mood - b.mood) < 1e-6) pairs.push(Math.abs(b.key - a.key));
    }
    console.log(`[light-script] dawn: ${samples.length} frames over 6 s, first tick at sample ${firstTick}, ${pairs.length} same-second pairs after it, key steps ${pairs.slice(0, 8).map((d) => d.toFixed(4)).join(' ')}`);
    // NOT MEASURABLE IS NOT A PASS, AND NOT A FAILURE: it is said. Per-frame interpolation is visible only when frames
    // come faster than the 1 Hz tick; a frame longer than a second catches the sky up to the clock by design, so the
    // smooth and the stepped sky draw the same frames. CI's SwiftShader measured 0.8-1.9 fps (2026-10-27) and a local run
    // at load ~360 drew one frame in 6.2 s. So with no same-second pair the read is RECORDED as not measured (printed
    // and annotated) instead of failing a tree on the machine's speed; the deterministic kill of the stepped clock is
    // tests/gates/sky-clock-gates.test.jsx (Atmosphere's real useFrame, stepped at 60 Hz).
    if (pairs.length === 0) {
      const why = `dawn: NOT MEASURED — no two frames fell inside one game-second after a tick (the renderer draws under ~2 fps here) — ${where}`;
      console.log(`[light-script] ${why}`);
      test.info().annotations.push({ type: 'not-measured', description: why });
    } else {
      const moved = pairs.filter((d) => d > 1e-4).length;
      expect(moved, `dawn: the key light did not move between frames of one game-second (${moved} of ${pairs.length} pairs moved): it steps with the 1 Hz clock — ${where}`).toBeGreaterThan(0);
    }
  } finally {
    await call(page, 'setQualityTier', priorTier);
  }
});
