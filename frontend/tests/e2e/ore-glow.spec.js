import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';
import { idForBlock } from '../../src/world/blockIds.js';

// THE ORE GLOW, IN A RENDERED FRAME (plan 2026-09-23-crafty-emissive-ores, Task 3; EXTERNAL-BASELINE-R2 #3).
//
// tests/gates/ore-glow-gates drives the maths over the real tile bytes; far-field-gates pins the splice by source
// shape (weak). Neither sees a pixel. This does: a row of three blocks placed through the real build verb ahead of
// and above the camera — STONE . DIAMOND . COAL, two apart — each face measured over its own screen region (a control
// region, never the whole frame), with the glow ON, OFF and ON again inside ONE settled lighting state, at noon and at
// midnight, with no clouds or motes (the sky-studio fixture).
//   - TREATMENT: at night the diamond face is brighter with the glow on than off.
//   - DAY CONTROL: at noon the same switch changes nothing (the glow is gated on the night).
//   - DRIFT CONTROL: stone and coal carry no glow, so they must not move across the three shots; if they do, the
//     lighting moved between shots and the treatment measured that.
// The first version failed on correct code for two reasons. It compared ratios ACROSS noon and midnight (diamond/stone
// must rise, coal/stone must not), and the night grade and the tone-mapping toe are not a power law, so a ratio of two
// surfaces moves with the light level; on/off within one state cancels the curve. And it never measured the blocks:
// it aimed place() at the cell below eye level, which place() fills (it does not stack on top), then measured the
// eye-level cell above it — sky and far terrain. Found 2026-10-27 when an identity run read the diamond patch 85.0
// with the glow on and 85.3 with it off, while the same table at x40 moved the whole frame 42 -> 76.
//
// Mutation-Proof: G1, G2, G3 and C1b observed RED against two surviving identity runs — the RECEIPTS block at the end.
test.describe('ore glow', () => {
  test.setTimeout(480000);

  test('at night the glow lifts a diamond face; at noon it does nothing; stone and coal hold still', async ({ page }) => {
    await bootDev(page);
    await startPlayActive(page);
    await page.waitForFunction(() => window.GameMethods?.terrainVerbs?.place && window.__threeCamera && window.useGameStore.getState().getMobGroundLevel, null, { timeout: 60000 });

    // The row: 4 blocks ahead of the camera and RAISED 3 above the eye, two apart, the camera turned to face it — along
    // an axis with no terrain in the way. Spawn is a village: at eye level a wall stood in front of the stone cell and
    // an NPC with a glowing marker walked through the coal patch (two runs, 2026-10-27). Raised, the row sits against
    // the sky, above anything that walks; and every column between the eye and the row, three cells either side, must
    // top out at most one cell above the eye (getMobGroundLevel: the column's top surface, roofs and canopies
    // included), under the line of sight. The camera's own heading is tried first, then the other three.
    const RAISE = 3;
    const row = await page.evaluate((RAISE) => {
      const s = window.useGameStore.getState();
      const cam = window.__threeCamera;
      const V = cam.position.constructor;
      const d = new V(); cam.getWorldDirection(d); d.y = 0; d.normalize();
      const facing = Math.abs(d.x) > Math.abs(d.z) ? [Math.sign(d.x), 0] : [0, Math.sign(d.z)];
      const cx = Math.floor(cam.position.x), cz = Math.floor(cam.position.z);
      // The row's cell height. place() fills the cell that CONTAINS the hit point (it steps 0.01 along the normal, so
      // a hit at a cell's centre stays in that cell). The first version aimed at the cell below eye level and measured
      // the one above it, where nothing was placed: its patches read sky and far terrain, never the three faces.
      const eye = Math.floor(cam.position.y);
      const by = eye + RAISE;
      const tried = [];
      let ax = null;
      for (const a of [facing, [facing[1], -facing[0]], [-facing[0], -facing[1]], [-facing[1], facing[0]]]) {
        const sd = [-a[1], a[0]];
        let open = true;
        for (let dist = 1; dist <= 4 && open; dist++) {
          for (let k = -3; k <= 3 && open; k++) {
            const top = s.getMobGroundLevel(cx + a[0] * dist + sd[0] * k, cz + a[1] * dist + sd[1] * k);
            if (top === null || top > eye + 1) open = false;
          }
        }
        tried.push({ a, open });
        if (open) { ax = a; break; }
      }
      if (!ax) return { cells: [], ax: null, tried, by };
      const side = [-ax[1], ax[0]];
      const bx = cx + ax[0] * 4, bz = cz + ax[1] * 4;
      window.useGameStore.setState({ buildingMode: 'single', buildSize: 1 });
      const cells = [];
      // Two blocks apart, not adjacent: the diamond's bloom halo must not reach the stone and coal patches.
      for (const [k, block] of [[-2, 'stone'], [0, 'diamond'], [2, 'coal']]) {
        const x = bx + side[0] * k, z = bz + side[1] * k;
        s.setSelectedBlock(block);
        s.addToInventory(block, 4);
        window.GameMethods.terrainVerbs.place({ hitPoint: new V(x + 0.5, by + 0.5, z + 0.5), normal: { x: 0, y: 1, z: 0 } });
        cells.push({ block, x, y: by, z, placed: window.useGameStore.getState().worldBlocks.get(`${x}_${by}_${z}`) ?? null });
      }
      // face the row square: look at the middle block's near face centre
      cam.lookAt(bx + 0.5 - ax[0] * 0.5, by + 0.5, bz + 0.5 - ax[1] * 0.5);
      return { cells, ax, tried, by };
    }, RAISE);
    console.log(`[ore-glow] row along ${JSON.stringify(row.ax)} at y ${row.by} (directions tried: ${JSON.stringify(row.tried)})`);
    expect(row.ax, `SETUP: no direction from spawn is open for 4 cells — every row would be occluded: ${JSON.stringify(row)}`).not.toBeNull();
    // PRESENCE: each cell holds the block named for it — the faces measured below are the blocks placed here.
    expect(row.cells.length).toBe(3);
    for (const c of row.cells) {
      expect(c.placed, `SETUP: the ${c.block} cell holds ${c.placed}, not ${idForBlock(c.block)}: ${JSON.stringify(row.cells)}`).toBe(idForBlock(c.block));
    }

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
    // THE GLOW ON AND OFF, IN ONE LIGHTING STATE. Every chunk shares one material whose uOreGlow uniform IS the
    // module's Float32Array (world/Terrain.jsx), and three re-uploads a float-array uniform each time it binds the
    // material (WebGLUniforms setValueV1fArray, no cache) — so zeroing the table in place switches the glow off for the
    // next frame, and restoring it switches it back, with nothing else in the frame touched.
    const glow = (on) => page.evaluate((on) => {
      let t = null;
      window.__threeScene.traverse((o) => { t ??= o.material?.userData?.shader?.uniforms?.uOreGlow?.value ?? null; });
      if (!t) return false;
      window.__oreGlowShipped ??= Float32Array.from(t);
      if (on) t.set(window.__oreGlowShipped); else t.fill(0);
      return true;
    }, on);
    // `n` game frames DRAWN (FrameCap's DEV count), not page ticks: under the frame cap a tick can draw nothing.
    const frames = (n) => page.evaluate((k) => new Promise((r) => {
      const drawn = () => window.__craftyTest.call('readFrameloop')?.frames ?? 0;
      const until = drawn() + k;
      const f = () => (drawn() >= until ? r() : requestAnimationFrame(f));
      requestAnimationFrame(f);
    }), n);
    // The weather is pinned clear every shot: the storm toggles on a 90 s wall clock and grades the frame toward night.
    const shot = async (frac, on) => {
      await page.evaluate((f) => { const s = window.useGameStore.getState(); s.setTimeOfDay(f); s.setWeatherMoodBoost(0); }, frac);
      const found = await glow(on);
      expect(found, 'SETUP: no terrain material with a uOreGlow table in the scene').toBe(true);
      await frames(6);
      return (await measure()).lum;
    };
    // on, off, on again: the glow is the on/off difference; the second on bounds the drift between shots.
    const pair = async (frac) => {
      await page.evaluate((f) => { const s = window.useGameStore.getState(); s.setTimeOfDay(f); s.setWeatherMoodBoost(0); }, frac);
      // SETTLE, MEASURED: the sky and the sun ease on real time, at whatever rate this renderer draws — a fixed 2.5 s
      // left a noon "on" shot 25 darker on every face than the "off" after it (2026-10-27). Glow on, until stone and
      // coal each move under 1 across two consecutive shots, at most 20.
      let prev = await shot(frac, true);
      let settled = 0;
      const settling = [];
      for (let i = 0; i < 20 && settled < 2; i++) {
        const next = await shot(frac, true);
        settled = ['stone', 'coal'].every((b) => Math.abs(next[b] - prev[b]) < 1) ? settled + 1 : 0;
        settling.push(`${next.stone.toFixed(1)}/${next.coal.toFixed(1)}`);
        prev = next;
      }
      expect(settled, `SETUP: the light never settled at time ${frac} — stone/coal per shot: ${settling.join(' ')}`).toBe(2);
      const on = await shot(frac, true);
      const off = await shot(frac, false);
      const on2 = await shot(frac, true);
      return { on, off, on2 };
    };
    // FIXTURE: no clouds and no light motes (the sky-studio switch, store captureStudio — it zeroes the cloud cover the
    // terrain's cloud shadows obey, and unmounts the motes). With them, a cloud shadow drifting over the raised row
    // took every face from 26 to 13 and back between consecutive noon shots (2026-10-27).
    await page.evaluate(() => window.useGameStore.getState().setCaptureStudio(true));
    const noon = await pair(0.5);
    const night = await pair(0.0);
    await page.screenshot({ path: test.info().outputPath('ore-glow-night.png') });
    const where = JSON.stringify({ noon, night });
    const f1 = (x) => x.toFixed(1);
    const line = (p) => ['stone', 'diamond', 'coal'].map((b) => `${b} ${f1(p.on[b])}/${f1(p.off[b])}/${f1(p.on2[b])}`).join(' ');
    console.log(`[ore-glow] on/off/on — noon: ${line(noon)} · night: ${line(night)}`); // the denominator, every run

    expect(noon.on.stone, `SETUP: the stone face is not in frame — ${where}`).toBeGreaterThan(8);
    // At night the raised stone and coal faces fall under the night grade's black point (~3 measured), so there the
    // live drift instrument is the diamond's own glow-on pair (on, on2), which must be well above black.
    expect(night.on.diamond, `SETUP: the diamond face is crushed to black at night — no drift instrument is live: ${where}`).toBeGreaterThan(8);
    // DRIFT CONTROL, FIRST, so a light that moved between shots is named as that and never read as a glow verdict.
    // Stone and coal carry no glow (strength 0, and coal's grey nuggets mask to 0), so nothing in the glow path can
    // move them; nor can it move the diamond between two glow-on shots. Coal is a DRIFT control, not a glow control.
    for (const [when, p] of [['noon', noon], ['night', night]]) {
      for (const b of ['stone', 'coal']) {
        const spread = Math.max(p.on[b], p.off[b], p.on2[b]) - Math.min(p.on[b], p.off[b], p.on2[b]);
        expect(spread, `DRIFT: the ${b} face moved ${f1(spread)} across the ${when} shots — the light changed between them: ${where}`).toBeLessThan(3);
      }
      expect(Math.abs(p.on.diamond - p.on2.diamond), `DRIFT: the diamond face did not return with the glow at ${when}: ${where}`).toBeLessThan(3);
    }
    // TREATMENT: at night the diamond face brightens when the glow is on.
    const lift = night.on.diamond - night.off.diamond;
    expect(lift, `the diamond face did not brighten with the glow on at night (+${f1(lift)}): ${where}`).toBeGreaterThan(Math.max(8, 0.25 * night.off.diamond));
    // DAY CONTROL: the glow is gated on the night — at noon the table changes nothing.
    expect(Math.abs(noon.on.diamond - noon.off.diamond), `the glow moved the diamond face at noon: ${where}`).toBeLessThan(3);
  });
});

// RECEIPTS (2026-10-27, local, this spec as committed, one at a time via a private-port copy of
// scripts/dev/mutate-e2e.sh, load average 35-250, SwiftShader):
//   identity (a comment edit in world/oreGlow.js), two runs, each SURVIVED: noon on/off/on stone 26.5/26.6/26.4 and
//     26.7/26.7/26.6, diamond 82.7/82.7/82.8 and 82.1/82.3/81.9; night diamond 110.7/35.1/110.7 and 109.9/35.0/110.0
//     (a +75 lift); night stone and coal ~3 (under the night grade's black point, hence the diamond's own on/on2 as
//     the night drift instrument).
//   G1 diamond's strength 0 (oreGlow.js) -> RED "did not brighten ... (+-0.0)"
//   G2 the splice dropped from Terrain.jsx -> RED "did not brighten ... (+-0.0)"
//   G3 plausible-wrong: the night factor inverted -> RED "did not brighten ... (+-0.1)" (noon diamond 140.6 on, 82.6 off)
//   C1b the off shot taken a tenth of a day earlier (a light change between the shots, this spec mutated) -> RED
//     "DRIFT: the stone face moved 14.7 across the noon shots"
//   C1 as the diagnosis wrote it — setWeatherMoodBoost(0.85) and 2.5 s before the off shot — SURVIVED, and is not a
//     hole: the light did not move (noon stone 26.4/26.3/26.7). The mood eases on real time and each shot re-pins the
//     weather, so the injection never reached the frame; C1b injects a change that does.
// NOT CHECKED HERE: how the glow looks on a GPU, or in a cave. On CI this spec's own first run is the verdict.
