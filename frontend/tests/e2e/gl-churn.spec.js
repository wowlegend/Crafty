import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';

// IDLE PLAY ALLOCATES NOTHING ON THE GPU (plan 2026-09-23-crafty-perf-heat-ipad, Tasks 1-2).
//
// Kevin, on the live site: an M3 Max "heating up the laptop and turning the fans up into overdrive"; an iPad's visuals
// "very buggy / broken". Read in source first (the plan's "Verified so far"): @react-three/postprocessing rebuilds
// every EffectPass whenever its <EffectComposer>'s children re-render, and the composer sat inline in GameScene, which
// re-rendered on every hunger tick (5 s) and every mana tick (1 s while regenerating) — each rebuild deleting and
// re-creating the composer's depth textures and depth render target, and constructing new passes.
//
// The instrument reads what the GPU is actually asked to do: the WebGL2 calls that ALLOCATE (createTexture,
// createFramebuffer, createRenderbuffer, texStorage2D) are wrapped before the page loads and counted over 12 s of
// standing still in play, with mana drained so its regeneration tick fires every second. A texture UPDATE
// (texImage2D / texSubImage2D on an existing texture — the minimap, a canvas label) is not an allocation and is not
// counted. PRESENCE CONTROL: the mana ticks must be seen to fire (the re-render trigger ran), and the same counters
// must be seen to move at all during the boot (the wrap is live).
//
// Mutation-Proof: by hand (cp backup, cmp-verified restore), observed RED:
//   P1 the pre-fix GameScene.jsx and App.jsx restored whole (composer inline, GameScene un-memoised) -> depth 37
test.describe('gl churn', () => {
  test.setTimeout(240000);

  test('standing still in play for 12 s — mana regenerating every second — allocates no GPU textures or framebuffers', async ({ page }) => {
    await page.addInitScript(() => {
      const c = { createTexture: 0, createFramebuffer: 0, createRenderbuffer: 0, texStorage2D: 0, texStorage3D: 0, linkProgram: 0, depthAlloc: 0 };
      window.__glc = c;
      // DEPTH-FORMAT allocations: the post-processing composer's depth texture and depth target — the churn under test.
      // Mobs, labels and particles spawning around a standing player allocate colour textures and link programs; they
      // almost never allocate depth storage, so this count isolates the composer from the living world.
      const DEPTH = new Set([0x81a5, 0x81a6, 0x8cac, 0x88f0, 0x8cad, 0x1902, 0x84f9]); // DEPTH_COMPONENT16/24/32F, DEPTH24_STENCIL8, DEPTH32F_STENCIL8, DEPTH_COMPONENT, DEPTH_STENCIL
      for (const Ctx of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
        if (!Ctx) continue;
        for (const name of Object.keys(c)) {
          if (name === 'depthAlloc') continue;
          const orig = Ctx.prototype[name];
          if (typeof orig !== 'function') continue;
          Ctx.prototype[name] = function (...args) {
            c[name]++;
            if (name === 'texStorage2D' && DEPTH.has(args[2])) c.depthAlloc++;
            return orig.apply(this, args);
          };
        }
        const ti = Ctx.prototype.texImage2D;
        Ctx.prototype.texImage2D = function (...args) { if (DEPTH.has(args[2])) c.depthAlloc++; return ti.apply(this, args); };
        const rs = Ctx.prototype.renderbufferStorage;
        if (rs) Ctx.prototype.renderbufferStorage = function (...args) { if (DEPTH.has(args[1])) c.depthAlloc++; return rs.apply(this, args); };
      }
    });
    await bootDev(page);
    await startPlayActive(page);

    const snap = () => page.evaluate(() => ({ ...window.__glc, mana: window.useGameStore.getState().mana }));
    const boot = await snap();
    expect(boot.createTexture + boot.createFramebuffer, `the wrap is not live — the boot allocated nothing: ${JSON.stringify(boot)}`).toBeGreaterThan(10);

    // Warm up: let the world, the composer and every first-use shader settle, then drain mana so it regenerates.
    await page.waitForTimeout(6000);
    await page.evaluate(() => {
      const s = window.useGameStore.getState();
      window.useGameStore.setState({ isAlive: true, playerHealth: s.maxHealth });
      s.setMana(0);
    });
    await page.waitForTimeout(1500);
    const a = await snap();
    const manaSeen = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 12000) {
      await page.waitForTimeout(1000);
      manaSeen.push((await snap()).mana);
    }
    const b = await snap();
    const d = Object.fromEntries(Object.keys(a).filter((k) => k !== 'mana').map((k) => [k, b[k] - a[k]]));
    const manaTicks = manaSeen.filter((m, i) => i > 0 && m !== manaSeen[i - 1]).length;
    const where = JSON.stringify({ delta: d, manaSeen });
    console.log(`[gl-churn] over 12 s idle: ${where}`);

    expect(manaTicks, `SETUP: mana did not regenerate — the re-render trigger never fired: ${where}`).toBeGreaterThanOrEqual(4);
    // THE COMPOSER'S SIGNATURE, measured both ways on this spec (2026-09-23, 12 s, 5 mana ticks):
    //   before (the composer inline in GameScene)  depth allocations 37, framebuffers 57, textures 94
    //   after  (PostFX + GameScene memoised)        depth allocations  3, framebuffers  7, textures 10
    // The residue is the living world (mobs spawning around a standing player bring new materials). The ceilings
    // leave room for one legitimate rebuild — a tier step by the governor — and none for a rebuild per tick.
    expect(d.depthAlloc, `idle play allocated ${d.depthAlloc} DEPTH textures in 12 s — the post-processing chain is being rebuilt (${manaTicks} mana ticks): ${where}`).toBeLessThanOrEqual(4);
    expect(d.createFramebuffer, `idle play created ${d.createFramebuffer} framebuffers in 12 s: ${where}`).toBeLessThanOrEqual(20);
  });
});
