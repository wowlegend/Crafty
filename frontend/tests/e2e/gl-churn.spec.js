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
// createFramebuffer, createRenderbuffer, texStorage2D) are wrapped before the page loads and counted while the player
// stands still in play through TRIGGERS mana changes, each one followed by a frame the renderer actually DREW. A
// texture UPDATE (texImage2D / texSubImage2D on an existing texture — the minimap, a canvas label) is not an
// allocation and is not counted. PRESENCE CONTROL: every mana write must read back and be followed by a drawn frame
// (the re-render trigger ran and reached the GPU), and the same counters must be seen to move during the boot (the
// wrap is live).
//
// THE TRIGGER IS WRITTEN AND COUNTED, NOT WAITED FOR (CI run 40503389065, shard 2/3, red on all three attempts). The
// first version leaned on the game's own regeneration — a page setInterval of 1 s (GameSystems.jsx) — and sampled it
// from the test side once a second for 12 s, needing 4 changes. On CI's software renderer at this 1280x800 viewport a
// frame is a multi-second main-thread task (the frame-cap spec drew 0.8-3.2 fps in that same run at 480x270, an eighth
// of these pixels). A page timer fires at most once per gap between tasks, and each sample queues behind a frame: the
// three attempts got 3, 2 and 3 samples in 12 s (manaSeen [50,50,60], [50,60], [40,50,70]) — 1, 1 and 2 changes. The
// property was never reached; the window was a wall-clock guess about a renderer this spec does not control.
// So the spec writes mana itself, through the same setMana the regeneration calls (the store change re-renders
// GameApp, GameScene's parent — the path that rebuilt the chain), alternating 0 / 50 so every write is a change
// whatever the regeneration did meanwhile, and after each write waits for R3F to DRAW a frame (FrameCap's DEV hook
// readFrameloop counts frames drawn): three.js sets up a render target's GL storage the first time it is bound for a
// render (WebGLRenderer.setRenderTarget -> setupRenderTarget), so a rebuilt chain allocates on the next drawn frame,
// not at the commit. The count is set by construction; the window lasts as long as the renderer needs; a renderer
// that draws nothing for FRAME_WAIT_MS after a write fails as SETUP, named. The regeneration keeps ticking alongside —
// more re-renders, never fewer — and the in-page change count is printed beside the delta.
// WHAT IT DOES NOT CHECK: a tier step by the governor inside the window is a legitimate rebuild and is not told apart
// (the tier at both ends is printed); and textures are counted, not asserted.
//
// Mutation-Proof: by hand (cp backup, cmp-verified restore), observed RED:
//   P1 the pre-fix GameScene.jsx and App.jsx restored whole (composer inline, GameScene un-memoised) -> depth 37
//      (2026-09-23, on the first version's 12 s window)
//   P2 (2026-10-27, this version) React.memo removed from BOTH PostFX and GameScene -> "allocated 40 DEPTH textures
//      across 5 drawn mana re-renders" (framebuffers 80, 19 frames in 27.9 s); the unmutated tree in the same session
//      -> depth 0, framebuffers 0 (21 frames in 54 s, ~0.4 fps at a load of ~150 — a software renderer as slow as CI's)
const TRIGGERS = 5; // the "after" measurement below saw 5 mana ticks; each rebuild costs several depth allocations
const FRAME_WAIT_MS = 60000;
test.describe('gl churn', () => {
  test.setTimeout(300000);

  test('standing still in play, five mana re-renders — each one drawn — rebuild no post-processing chain (depth allocations <= 4, framebuffers <= 20)', async ({ page }) => {
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

    // `frames`: R3F frames DRAWN (FrameCap's DEV hook), null if the hook is not registered. `manaChanges`: every mana
    // change the store has published since the window opened — the writes below plus any regeneration tick.
    const snap = () => page.evaluate(() => ({
      ...window.__glc,
      mana: window.useGameStore.getState().mana,
      tier: window.useGameStore.getState().qualityTier,
      frames: window.__craftyTest.call('readFrameloop')?.frames ?? null,
      manaChanges: window.__manaChanges ?? 0,
    }));
    const boot = await snap();
    expect(boot.createTexture + boot.createFramebuffer, `the wrap is not live — the boot allocated nothing: ${JSON.stringify(boot)}`).toBeGreaterThan(10);
    expect(typeof boot.frames, `SETUP: the readFrameloop hook (FrameCap, DEV) is not registered — no way to see a frame drawn: ${JSON.stringify(boot)}`).toBe('number');

    // Warm up: let the world, the composer and every first-use shader settle.
    await page.waitForTimeout(6000);
    await page.evaluate(() => {
      const s = window.useGameStore.getState();
      window.useGameStore.setState({ isAlive: true, playerHealth: s.maxHealth });
      window.__manaChanges = 0;
      window.useGameStore.subscribe((now, prev) => { if (now.mana !== prev.mana) window.__manaChanges += 1; });
    });
    const a = await snap();
    const t0 = Date.now();
    const writes = [];
    for (let i = 0; i < TRIGGERS; i++) {
      const w = await page.evaluate(() => {
        const s = window.useGameStore.getState();
        const to = s.mana >= 50 ? 0 : 50; // a change from the current value, whatever regeneration did meanwhile
        window.useGameStore.setState({ isAlive: true, playerHealth: s.maxHealth });
        s.setMana(to);
        return { from: s.mana, to, read: window.useGameStore.getState().mana, frames: window.__craftyTest.call('readFrameloop').frames };
      });
      if (w.read !== w.to) throw new Error(`SETUP: mana write ${i + 1} of ${TRIGGERS} did not land (${w.from} -> ${w.to}, read ${w.read}) — the re-render trigger never fired`);
      const drawn = await page
        .waitForFunction((f) => window.__craftyTest.call('readFrameloop').frames > f, w.frames, { timeout: FRAME_WAIT_MS, polling: 100 })
        .then(() => page.evaluate(() => window.__craftyTest.call('readFrameloop').frames))
        .catch((e) => {
          throw new Error(`SETUP: the renderer drew no frame within ${FRAME_WAIT_MS} ms of mana write ${i + 1} of ${TRIGGERS} — the re-render never reached the GPU, nothing is measurable: ${e.message}`);
        });
      writes.push({ to: w.to, framesAfter: drawn - w.frames });
      await page.waitForTimeout(1000); // the regeneration's own cadence, on a renderer fast enough to keep it
    }
    const b = await snap();
    const counted = Object.keys(a).filter((k) => !['mana', 'tier', 'frames', 'manaChanges'].includes(k));
    const d = Object.fromEntries(counted.map((k) => [k, b[k] - a[k]]));
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const where = JSON.stringify({ delta: d, writes, manaChanges: b.manaChanges, framesDrawn: b.frames - a.frames, tier: [a.tier, b.tier], secs });
    console.log(`[gl-churn] ${writes.length} mana writes, each followed by a drawn frame, ${b.manaChanges} mana changes in all, over ${secs} s idle: ${where}`); // the denominator, every run

    expect(writes.length, `SETUP: ${writes.length} of ${TRIGGERS} mana re-renders were drawn: ${where}`).toBe(TRIGGERS);
    // THE COMPOSER'S SIGNATURE, measured both ways on this spec (2026-09-23, the first version's 12 s, 5 mana ticks):
    //   before (the composer inline in GameScene)  depth allocations 37, framebuffers 57, textures 94
    //   after  (PostFX + GameScene memoised)        depth allocations  3, framebuffers  7, textures 10
    // The residue is the living world (mobs spawning around a standing player bring new materials). The ceilings
    // leave room for one legitimate rebuild — a tier step by the governor — and none for a rebuild per re-render.
    expect(d.depthAlloc, `idle play allocated ${d.depthAlloc} DEPTH textures across ${TRIGGERS} drawn mana re-renders — the post-processing chain is being rebuilt: ${where}`).toBeLessThanOrEqual(4);
    expect(d.createFramebuffer, `idle play created ${d.createFramebuffer} framebuffers across ${TRIGGERS} drawn mana re-renders: ${where}`).toBeLessThanOrEqual(20);
  });
});
