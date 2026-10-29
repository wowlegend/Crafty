import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';

// THE RUNNING GAME'S COMPOSER DRAWS THE HANDS (W2-E; DECISIONS 2026-10-28 item 33).
//
// tests/gates/viewmodel-composer-gates proves GameScene hands its composer the viewmodel's pass first, and
// tests/gates/viewmodel-layer-gates steps the layer through R3F. What neither can see: that @react-three/postprocessing
// turns that child into a pass right after its own RenderPass, and that the game's composer calls it on every frame it
// draws, with the hands mounted, the viewmodel camera on the canvas's aspect and the hand light turned with the view.
// Read in the DEV game through the bridge: readPostFx (the live composer's pass names, render/postFx.jsx), `viewmodel`
// (the live viewmodel, render/ViewmodelLayer.jsx) and readSkyLight (the world key, render/Atmosphere.jsx). The pass's
// render is wrapped in the page to count its calls against R3F's own frame count (readFrameloop), and waits are counted
// in drawn frames: a CI frame can last seconds.
//
// Mutation-Proof: NOT RUN locally (this lane runs no local e2e; CI is the arbiter). Intended, against CI:
//   E1 the pass deleted from GameScene PostFX                    -> RED "the viewmodel pass is not right after the world"
//   E2 the pass disabled (enabled = false in ViewmodelPass)       -> RED "the composer drew N frames and ran the pass on M"
//   E3 the aspect sync removed (ViewmodelLayer.jsx)               -> RED "the viewmodel camera is not on the canvas's aspect"
//   E4 the light mirrored with an identity rotation               -> RED "the sky on the hands is not the world's up"
//   E0 identity (a comment edit in viewmodel.js)                  -> must SURVIVE
// BLIND SPOT: no pixel is read (CI renders in software); how the hands look is the lookbook's hands set.

/** Frames the pass is counted over. */
const FRAMES = 4;
const DEG = Math.PI / 180;

test('the live composer runs the viewmodel pass right after the world on every frame, at the view\'s aspect and light', async ({ page }) => {
  test.setTimeout(300000);
  await bootDev(page);
  await startPlayActive(page);
  await page
    .waitForFunction(() => {
      const vm = window.__craftyTest.call('viewmodel');
      let n = -1;
      vm?.hands.traverse(() => { n += 1; });
      return n > 0;
    }, null, { timeout: 90000, polling: 250 })
    .catch((e) => {
      throw new Error(`SETUP: no hands mounted in the viewmodel within 90 s (the 'viewmodel' hook, render/ViewmodelLayer.jsx) — ${e.message}`);
    });

  const r = await page.evaluate(async ({ n, maxMs }) => {
    const call = (name) => window.__craftyTest.call(name);
    const drawn = () => call('readFrameloop').frames;
    const frame = () => new Promise((res) => requestAnimationFrame(res));
    const vm = call('viewmodel');
    const cam = window.__threeCamera;
    // Turn and tilt the view, so a light mirrored without the camera's turn reads wrong.
    cam.rotation.order = 'YXZ';
    cam.rotation.y += 1.1;
    cam.rotation.x = -0.3;
    let calls = 0;
    const inner = vm.pass.render;
    vm.pass.render = function counted(...a) { calls += 1; return inner.apply(this, a); };
    const f0 = drawn();
    const t0 = performance.now();
    try {
      while (drawn() < f0 + n && performance.now() - t0 < maxMs) await frame();
    } finally {
      delete vm.pass.render;
    }
    const f1 = drawn();
    let hands = -1;
    vm.hands.traverse(() => { hands += 1; });
    const q = cam.getWorldQuaternion(cam.quaternion.clone());
    const sky = vm.rig.hemi.position.clone().normalize().applyQuaternion(q);
    const key = vm.rig.key.position.clone().normalize().applyQuaternion(q);
    const world = call('readSkyLight');
    return {
      passes: call('readPostFx').passes, drawn: f1 - f0, calls, enabled: vm.pass.enabled, hands,
      aspect: vm.camera.aspect, canvasAspect: cam.aspect, skyUp: sky.y, key: key.toArray(), worldKey: world ? world.keyDir : null,
      pitch: cam.rotation.x, lost: window.useGameStore.getState().isWebGLContextLost,
      alive: window.useGameStore.getState().isAlive,
    };
  }, { n: FRAMES, maxMs: 120000 });
  const where = JSON.stringify(r);
  console.log(`viewmodel: ${where}`);

  expect(r.lost, `SETUP: the WebGL context was lost: ${where}`).toBe(false);
  expect(r.drawn, `SETUP: R3F drew fewer than ${FRAMES} frames in 120 s: ${where}`).toBeGreaterThanOrEqual(FRAMES);
  expect(r.hands, `SETUP: no hands mounted in the viewmodel: ${where}`).toBeGreaterThan(0);
  expect(Math.abs(r.pitch + 0.3), `SETUP: the view did not keep the tilt the light check needs: ${where}`).toBeLessThan(0.05);
  expect(r.passes?.[0], `the composer's first pass is not its RenderPass: ${where}`).toBe('RenderPass');
  expect(r.passes?.[1], `the viewmodel pass is not right after the world: ${where}`).toBe('ViewmodelPass');
  expect(r.passes.length, `no effect pass after the hands: ${where}`).toBeGreaterThan(2);
  expect(r.enabled, `the viewmodel pass is disabled: ${where}`).toBe(true);
  expect(r.calls, `the composer drew ${r.drawn} frames and ran the pass on ${r.calls}: ${where}`).toBeGreaterThanOrEqual(r.drawn - 1);
  expect(Math.abs(r.aspect - r.canvasAspect), `the viewmodel camera is not on the canvas's aspect: ${where}`).toBeLessThan(1e-6);
  // The sky's up comes back to the world's up within 3 degrees; without the turn it is off by the 17-degree tilt.
  expect(r.skyUp, `the sky on the hands is not the world's up in this view: ${where}`).toBeGreaterThan(Math.cos(3 * DEG));
  expect(r.worldKey, `SETUP: readSkyLight reports no key: ${where}`).not.toBeNull();
  const dot = r.key[0] * r.worldKey[0] + r.key[1] * r.worldKey[1] + r.key[2] * r.worldKey[2];
  // The key moves with the game's clock between the light's frame and this read: 8 degrees of slack.
  expect(dot, `the key on the hands is not the world's key in this view: ${where}`).toBeGreaterThan(Math.cos(8 * DEG));
});
