import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';

// THE ORE GLOW, IN A RENDERED FRAME (plan 2026-09-23-crafty-emissive-ores, Task 3; EXTERNAL-BASELINE-R2 #3).
//
// tests/gates/ore-glow-gates drives the maths over the real tile bytes; far-field-gates pins the splice by source
// shape (weak). Neither sees a pixel. This does: a row of three blocks placed through the real build verb in front of
// the camera — STONE | DIAMOND | COAL — shot at noon and at midnight, each face measured over its own screen region
// (a control region, never the whole frame), and the ore faces read RELATIVE to the stone beside them, so whatever
// the night does to lighting it does to both.
//   - DIAMOND / STONE must rise by night: the nuggets give light the stone does not.
//   - COAL / STONE must NOT: coal is an ore tile on the same stone matrix, under the same light, with a glow of 0 —
//     the PRESENCE CONTROL. A lighting change that moved every ore face (a fog, a tint, the moon) moves coal too.
//
// Mutation-Proof: PENDING — to run via scripts/dev/mutate-e2e.sh before this commits: G1 diamond's strength 0;
//   G2 the splice dropped from Terrain.jsx; G3 plausible-wrong, the night factor inverted; and an identity mutant.
test.describe('ore glow', () => {
  test.setTimeout(240000);

  test('at night a diamond face brightens against the stone beside it; a coal face (no glow) does not', async ({ page }) => {
    await bootDev(page);
    await startPlayActive(page);
    await page.waitForFunction(() => window.GameMethods?.terrainVerbs?.place && window.__threeCamera && window.useGameStore.getState().getMobGroundLevel, null, { timeout: 60000 });

    // The row: 4 blocks ahead of the camera, at eye level, one block apart, the camera turned to face it square.
    const row = await page.evaluate(() => {
      const s = window.useGameStore.getState();
      const cam = window.__threeCamera;
      const V = cam.position.constructor;
      const d = new V(); cam.getWorldDirection(d); d.y = 0; d.normalize();
      // snap to the nearest axis so the faces are square to the view
      const ax = Math.abs(d.x) > Math.abs(d.z) ? [Math.sign(d.x), 0] : [0, Math.sign(d.z)];
      const side = [-ax[1], ax[0]];
      const bx = Math.floor(cam.position.x) + ax[0] * 4, bz = Math.floor(cam.position.z) + ax[1] * 4;
      const by = Math.floor(cam.position.y) - 1; // the block BELOW the placed one: place() puts it on top (normal +y)
      window.useGameStore.setState({ buildingMode: 'single', buildSize: 1 });
      const cells = [];
      for (const [k, block] of [[-1, 'stone'], [0, 'diamond'], [1, 'coal']]) {
        const x = bx + side[0] * k, z = bz + side[1] * k;
        s.setSelectedBlock(block);
        s.addToInventory(block, 4);
        window.GameMethods.terrainVerbs.place({ hitPoint: new V(x + 0.5, by + 0.5, z + 0.5), normal: { x: 0, y: 1, z: 0 } });
        cells.push({ block, x, y: by + 1, z });
      }
      // face the row square: look at the middle block's near face centre
      cam.lookAt(bx + 0.5 - ax[0] * 0.5, by + 1.5, bz + 0.5 - ax[1] * 0.5);
      return { cells, ax };
    });

    // Each face's centre on screen, and the mean luminance of a small square there, from one screenshot.
    const measure = async () => {
      const centres = await page.evaluate(({ cells, ax }) => {
        const cam = window.__threeCamera;
        const V = cam.position.constructor;
        return cells.map((c) => {
          const p = new V(c.x + 0.5 - ax[0] * 0.5, c.y + 0.5, c.z + 0.5 - ax[1] * 0.5).project(cam);
          return { block: c.block, x: Math.round((p.x + 1) / 2 * window.innerWidth), y: Math.round((1 - p.y) / 2 * window.innerHeight) };
        });
      }, row);
      const png = await page.screenshot();
      return page.evaluate(async ({ b64, centres }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const cv = document.createElement('canvas');
        cv.width = img.width; cv.height = img.height;
        const g = cv.getContext('2d');
        g.drawImage(img, 0, 0);
        const out = {};
        for (const c of centres) {
          const R = 12, px = g.getImageData(c.x - R, c.y - R, 2 * R, 2 * R).data;
          let sum = 0;
          for (let i = 0; i < px.length; i += 4) sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
          out[c.block] = sum / (px.length / 4);
        }
        return { lum: out, centres };
      }, { b64: png.toString('base64'), centres });
    };
    const at = async (frac) => {
      await page.evaluate((f) => window.useGameStore.getState().setTimeOfDay(f), frac);
      await page.waitForTimeout(2500); // the sky and the sun ease to the new time
      return measure();
    };
    const noon = await at(0.5);
    const night = await at(0.0);
    await page.screenshot({ path: test.info().outputPath('ore-glow-night.png') });
    const ratio = (m, b) => m.lum[b] / Math.max(1, m.lum.stone);
    const where = JSON.stringify({ noon, night });
    console.log(`[ore-glow] diamond/stone noon ${ratio(noon, 'diamond').toFixed(2)} night ${ratio(night, 'diamond').toFixed(2)} · coal/stone noon ${ratio(noon, 'coal').toFixed(2)} night ${ratio(night, 'coal').toFixed(2)}`);

    expect(noon.lum.stone, `SETUP: the stone face is not in frame — ${where}`).toBeGreaterThan(8);
    expect(night.lum.stone, `SETUP: the stone face is black at night — nothing to compare against: ${where}`).toBeGreaterThan(1);
    expect(ratio(night, 'diamond') / ratio(noon, 'diamond'), `the diamond face did not brighten against the stone by night — ${where}`).toBeGreaterThan(1.5);
    expect(Math.abs(ratio(night, 'coal') / ratio(noon, 'coal') - 1), `the COAL face moved against the stone by night too — the change is lighting, not glow: ${where}`).toBeLessThan(0.25);
  });
});
