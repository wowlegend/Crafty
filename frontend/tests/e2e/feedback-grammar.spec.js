import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';
import { PNG } from 'pngjs';
import { WINDUP_MS } from '../../src/game/attackTelegraph.js';
import { RIM } from '../../src/render/characterStyle.js';

// THE FEEDBACK GRAMMAR IN THE RUNNING GAME (plan docs/superpowers/plans/2026-10-27-crafty-feedback-grammar.md M1;
// W3-A PR A F1). tests/gates/edge-telegraph-gates.test.js proves the pure decision (render/feedbackGrammar.js mobLook);
// what it cannot see is the component: that MobModel writes the danger colour into the mounted hulls and rims, that it
// writes NO emissive in a windup (the old whole-body flood lived in the component), and that the rim is lit on the
// suite's tier, which is the iPad's low tier (_boot.js pinSuiteTier). So this reads the live materials (the DEV
// readMobLook) and the pixels: a zombie 6 m ahead in a held world, at rest and then 0.8 through a planted windup, shot
// head-on and turned 45 degrees (a box face has no fresnel edge, so a rim flood would show on the turned face first).
//
// Mutation-Proof: via scripts/dev/mutate-e2e.sh, with an identity mutant that SURVIVED, each observed RED:
//   K2a MobModel floods the body emissive again in a windup -> "the body took no emissive" and the interior check
//   K2b MobModel zeroes the rim strength on the low tier (a tier gate put back) -> "the rim is lit on the low tier"
//   K2c MobModel writes no outline colour -> "the live hull heats" and the danger-pixel count
//   K3c the flash term not spliced into the rim program (the uniform still fed) -> "body pixels on the lit band went white"
/** A mob `distance` m along the camera's level facing, at noon, every other mob within 24 m gone, the world held
 *  (one long hitstop: the AI neither moves it nor replaces its windup). Returns its id, or null. */
async function stageZombie(page, distance) {
  await bootGame(page);
  return placeMob(page, distance, 'zombie');
}

async function bootGame(page) {
  await bootDev(page);
  await startPlayActive(page);
  await page.waitForFunction(() => window.__craftyTest?.call('readMobs') && window.__threeCamera && window.GameMethods?.damageMob
    && window.useGameStore.getState().spawnMob && window.__threeScene, null, { timeout: 60000 });
}

async function placeMob(page, distance, type) {
  return page.evaluate(async ([dist, kind]) => {
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    while (Date.now() - (window.useGameStore.getState()._spawnTime || 0) < 5500) await frame();
    const s = window.useGameStore.getState();
    window.useGameStore.setState({ isAlive: true, playerHealth: s.maxHealth });
    s.setTimeOfDay(0.5);
    const cam = window.__threeCamera;
    for (const m of window.__craftyTest.call('readMobs')) {
      if (!m.role && Math.hypot(m.x - cam.position.x, m.z - cam.position.z) < 24) window.GameMethods.damageMob(m.id, 99999, 'physical', 'ally');
    }
    for (let i = 0; i < 60; i++) await frame(); // the death dissolves end
    const d = new cam.position.constructor();
    cam.getWorldDirection(d); d.y = 0; d.normalize();
    const gx = cam.position.x + d.x * dist, gz = cam.position.z + d.z * dist;
    const gy = s.getMobFloor(gx, gz, cam.position.y - 1.6);
    const before = new Set(window.__craftyTest.call('readMobs').map((m) => m.id));
    s.spawnMob(gx, gz, kind, gy);
    const mob = window.__craftyTest.call('readMobs').find((m) => !before.has(m.id));
    s.triggerHitstop(200000);
    if (mob) window.__craftyTest.call('faceMob', mob.id, 0);
    for (let i = 0; i < 4; i++) await frame();
    return mob ? mob.id : null;
  }, [distance, type]);
}

/** The pixels of a 240 x 240 clip around the mob's centre: danger-red (the U1 tone-map predicate), ink (the rest
 *  outline: the presence twin), white, and the body's green; and the 40 x 40 interior's mean luminance. */
async function shoot(page, id) {
  const at = await page.evaluate((mid) => {
    const m = window.__craftyTest.call('readMobs').find((x) => x.id === mid);
    const cam = window.__threeCamera;
    const v = new cam.position.constructor(m.x, m.y + 0.8, m.z).project(cam);
    const r = document.querySelector('canvas').getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }, id);
  const png = PNG.sync.read(await page.screenshot({ clip: { x: Math.max(0, at.x - 120), y: Math.max(0, at.y - 120), width: 240, height: 240 } }));
  let danger = 0, ink = 0, white = 0, green = 0, sum = 0, n = 0;
  const half = 20 * (png.width / 240);
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i] / 255, g = png.data[i + 1] / 255, b = png.data[i + 2] / 255;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (r > 0.6 && g < 0.35 && b < 0.3) danger += 1;
      if (lum < 0.08) ink += 1;
      if (r > 0.9 && g > 0.9 && b > 0.9) white += 1;
      if (g > 0.15 && g > 1.3 * r && g > 1.3 * b) green += 1;
      if (Math.abs(x - png.width / 2) < half && Math.abs(y - png.height / 2) < half) { sum += lum; n += 1; }
    }
  }
  return { danger, ink, white, green, interior: sum / n };
}

const settle = (page) => page.evaluate(async () => { for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(r)); });

test.describe('the feedback grammar', () => {
  test.setTimeout(240000);

  test('a planted windup reddens the edge, not the body, and the rim is lit on the low tier', async ({ page }) => {
    const id = await stageZombie(page, 6);
    expect(id, 'SETUP: the spawner placed no zombie 6 m ahead').not.toBeNull();

    const pre = () => page.evaluate((mid) => {
      const s = window.useGameStore.getState();
      const m = window.__craftyTest.call('readMobs').find((x) => x.id === mid);
      const near = window.__craftyTest.call('readMobs').filter((x) => x.id !== mid && m && Math.hypot(x.x - m.x, x.z - m.z) < 3).length;
      return { active: window.__craftyTest.call('readIntents').active, alive: s.isAlive, frozen: s.hitstopUntil > performance.now(),
        mob: !!m && m.health > 0, near, tier: s.qualityTier };
    }, id);

    const look = () => page.evaluate((mid) => window.__craftyTest.call('readMobLook', mid), id);

    for (const yawDeg of [0, 45]) {
      await page.evaluate(([mid, y]) => window.__craftyTest.call('faceMob', mid, y), [id, yawDeg]);
      await page.evaluate((mid) => window.__craftyTest.call('plantWindup', mid, -1), id); // a windup long past: rest
      await settle(page);
      const p = await pre();
      const why = `SETUP (yaw ${yawDeg}): ${JSON.stringify(p)}`;
      expect(p.active && p.alive && p.frozen && p.mob && p.near === 0, why).toBe(true);
      const rest = await shoot(page, id);
      const restLook = await look();
      expect(rest.ink, `presence: the rest outline is on screen (yaw ${yawDeg})`).toBeGreaterThanOrEqual(200);
      expect(restLook.toon, 'the denominator: the zombie\'s toon parts were read').toBeGreaterThanOrEqual(6);
      expect(restLook.hulls, 'and its hulls').toBeGreaterThanOrEqual(6);

      await page.evaluate(([mid, ms]) => window.__craftyTest.call('plantWindup', mid, ms), [id, 0.2 * WINDUP_MS]);
      await settle(page);
      const held = await shoot(page, id);
      const hot = await look();
      expect(p.tier, 'the suite runs the iPad\'s low tier').toBe('low');
      expect(hot.rimStrength, 'the rim is lit on the low tier').toBe(RIM.strength);
      expect(hot.outline[0], `the live hull heats toward danger (yaw ${yawDeg}): ${JSON.stringify(hot.outline)}`).toBeGreaterThan(3 * hot.outline[1]);
      expect(hot.emissive, `the body took no emissive in the windup (yaw ${yawDeg})`).toBe(0);
      expect(held.danger - rest.danger, `danger-red edge pixels rose (yaw ${yawDeg}): rest ${rest.danger}, held ${held.danger}`).toBeGreaterThanOrEqual(40);
      const change = Math.abs(held.interior - rest.interior) / rest.interior;
      expect(change, `the body's interior kept its light (yaw ${yawDeg}): ${rest.interior.toFixed(3)} -> ${held.interior.toFixed(3)}`).toBeLessThan(0.1);
    }
    await page.evaluate(() => window.useGameStore.setState({ hitstopUntil: performance.now() }));
  });

  // CONTACT (M2, F2): a hit whitens the band facing the key light, not the whole body, and whitens the edge. The camera
  // is turned so the key light (the scene's one directional light) is to its side and the zombie is turned 45 degrees
  // toward it, so one visible face is in the lit band and the other in the shadow band whatever the sun's azimuth. The
  // hit is held by renewing the stamp every frame (the DEV holdHit, the way the lookbook's stage holds it), and the two
  // frames are compared pixel by pixel, so the white outline (also contact) cannot stand in for the lit band.
  test('a held hit whitens the lit band and the edge, and the shadow band keeps the body colour', async ({ page }) => {
    // A boar: its pink is in no terrain, foliage, nametag or HUD colour, so the body mask below is the mob's alone (a
    // green zombie's mask took in the grass behind it).
    await bootGame(page);
    const id = await placeMob(page, 6, 'pig');
    expect(id, 'SETUP: the spawner placed no boar 6 m ahead').not.toBeNull();
    // Turn the boar so one visible face is in the lit band and the other in the shadow band: the faces a camera sees
    // are the front (at the turn) and the side 90 degrees from it; a face is lit when its normal leans toward the key
    // light (the scene's one directional light). If the light is behind the zombie no turn can do it, so the next time
    // of day is tried. `split` is the margin of the worse face.
    const pick = await page.evaluate(async (mid) => {
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      for (const tod of [0.5, 0.4, 0.6, 0.35, 0.65]) {
        window.useGameStore.getState().setTimeOfDay(tod);
        for (let i = 0; i < 3; i++) await frame();
        let key = null;
        window.__threeScene.traverse((o) => { if (o.isDirectionalLight && !key) key = o; });
        const d = key.position.clone().sub(key.target.position);
        d.y = 0; d.normalize();
        const r0 = window.__craftyTest.call('faceMob', mid, 0);
        const toward = (r) => Math.sin(r) * d.x + Math.cos(r) * d.z;
        let best = null;
        for (let y = -75; y <= 75; y += 15) {
          if (y === 0) continue;
          const front = r0 + (y * Math.PI) / 180;
          const side = front + (y > 0 ? -Math.PI / 2 : Math.PI / 2);
          const split = Math.max(Math.min(toward(front), -toward(side)), Math.min(-toward(front), toward(side)));
          if (!best || split > best.split) best = { yaw: y, split, tod };
        }
        if (best.split > 0.25) { window.__craftyTest.call('faceMob', mid, best.yaw); return best; }
      }
      return null;
    }, id);
    expect(pick, 'SETUP: no time of day put the key light to the side of the boar').not.toBeNull();
    const yaw = pick.yaw;
    await settle(page);
    const grab = async () => {
      const at = await page.evaluate((mid) => {
        const m = window.__craftyTest.call('readMobs').find((x) => x.id === mid);
        const cam = window.__threeCamera;
        const v = new cam.position.constructor(m.x, m.y + 0.8, m.z).project(cam);
        const r = document.querySelector('canvas').getBoundingClientRect();
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
      }, id);
      return PNG.sync.read(await page.screenshot({ clip: { x: Math.max(0, at.x - 120), y: Math.max(0, at.y - 120), width: 240, height: 240 } }));
    };
    // Bloom off for the comparison: the white edge (contact too) blooms, and its halo would whiten body pixels near
    // every edge whether or not the lit band flashed (a K3c run without this stayed green).
    await page.evaluate(() => window.__craftyTest.call('passesOff', ['bloom']));
    await settle(page);
    const rest = await grab();
    await page.evaluate((mid) => window.__craftyTest.call('holdHit', mid, true), id);
    await settle(page);
    const hit = await grab();
    const l = await page.evaluate((mid) => window.__craftyTest.call('readMobLook', mid), id);
    await page.evaluate((mid) => window.__craftyTest.call('holdHit', mid, false), id);
    await page.evaluate(() => window.__craftyTest.call('passesOff', []));
    const px = (png, i) => [png.data[i] / 255, png.data[i + 1] / 255, png.data[i + 2] / 255];
    const isPink = ([r, g, b]) => r > 0.5 && g > 0.35 && b > 0.35 && r - g > 0.1 && r - b > 0.05; // the boar's pink, lit or shaded
    // Only the body's INTERIOR counts: a pixel pink at rest whose whole 13 x 13 neighbourhood was pink too. An edge
    // pixel is a blend with the ink line, and the edge turns white on contact (with bloom off, a K3c run stayed green
    // on the edge blend alone).
    const W = rest.width, H = rest.height, R = 6;
    const sat = new Int32Array((W + 1) * (H + 1)); // a summed-area table of the rest frame's green mask
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const g = isPink(px(rest, (y * W + x) * 4)) ? 1 : 0;
        sat[(y + 1) * (W + 1) + x + 1] = g + sat[y * (W + 1) + x + 1] + sat[(y + 1) * (W + 1) + x] - sat[y * (W + 1) + x];
      }
    }
    const boxAllGreen = (x, y) => {
      if (x < R || y < R || x >= W - R || y >= H - R) return false;
      const x0 = x - R, y0 = y - R, x1 = x + R + 1, y1 = y + R + 1;
      return sat[y1 * (W + 1) + x1] - sat[y0 * (W + 1) + x1] - sat[y1 * (W + 1) + x0] + sat[y0 * (W + 1) + x0] === (2 * R + 1) ** 2;
    };
    let body = 0, whitened = 0, kept = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!boxAllGreen(x, y)) continue;
        body += 1;
        const [r, g, b] = px(hit, (y * W + x) * 4);
        if (r > 0.85 && g > 0.85 && b > 0.85) whitened += 1;
        else if (isPink([r, g, b])) kept += 1;
      }
    }
    const juice = await page.evaluate(() => window.useGameStore.getState().juiceIntensity);
    console.log(`[contact] yaw ${yaw} tod ${pick.tod} interior ${body} whitened ${whitened} kept ${kept} uFlash ${l.uFlash}`);
    expect(body, `presence: the body's interior pink at rest (yaw ${yaw})`).toBeGreaterThanOrEqual(400);
    expect(l.uFlash, `the live rim materials took the flash (juice ${juice})`).toBe(juice);
    expect(l.outline, 'the live hull went white').toEqual([1, 1, 1]);
    expect(l.emissive, 'and no emissive: the old 300 ms flood').toBe(0);
    // Measured: 1,790 of 12,928 (14%) whitened, and 309 (2%: the white edge over the head) with the flash term cut (K3c).
    expect(whitened / body, `interior pixels on the lit band went white: ${whitened} of ${body}`).toBeGreaterThanOrEqual(0.06);
    expect(kept / body, `interior pixels in the shadow band kept their pink: ${kept} of ${body}`).toBeGreaterThanOrEqual(0.3);
    await page.evaluate(() => window.useGameStore.setState({ hitstopUntil: performance.now() }));
  });

  // The flash through a REAL click (the window listener, as heavy-melee.spec.js drives it), sampled once per animation
  // frame: a flash frame after the hit, and the flash over within the sample. It proves the wiring; how long the flash
  // lasts is the unit gate's (hit-sequence-gates): on a software renderer a frame can outlast the whole 70 ms.
  test('a real click flashes the struck mob for one beat', async ({ page }) => {
    const id = await stageZombie(page, 2.5);
    expect(id, 'SETUP: the spawner placed no zombie 2.5 m ahead').not.toBeNull();
    await page.evaluate((mid) => {
      window.__fgRows = [];
      const step = () => {
        const l = window.__craftyTest.call('readMobLook', mid);
        if (l) window.__fgRows.push({ t: performance.now(), f: l.uFlash, hit: l.lastHit });
        if (window.__fgRows.length < 45) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, id);
    await page.mouse.move(640, 400);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForFunction(() => window.__fgRows.length >= 45, null, { timeout: 30000 });
    const rows = await page.evaluate(() => window.__fgRows);
    const stamp = rows.reduce((m, r) => Math.max(m, r.hit), 0);
    const pre = await page.evaluate(() => ({ active: window.__craftyTest.call('readIntents').active, alive: window.useGameStore.getState().isAlive }));
    expect(stamp, `SETUP: the click struck nothing (${JSON.stringify(pre)})`).toBeGreaterThan(0);
    const after = rows.filter((r) => r.t >= stamp);
    expect(after.length, 'SETUP: at least 4 frames sampled after the hit').toBeGreaterThanOrEqual(4);
    const flash = after.filter((r) => r.f > 0);
    expect(flash.length, `a flash frame after the hit: ${JSON.stringify(after.slice(0, 8))}`).toBeGreaterThanOrEqual(1);
    expect(after.at(-1).f, `the flash ended within the sample: ${JSON.stringify(after.map((r) => [Math.round(r.t - stamp), r.f]))}`).toBe(0);
    await page.evaluate(() => window.useGameStore.setState({ hitstopUntil: performance.now() }));
  });
});
