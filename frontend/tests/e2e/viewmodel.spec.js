import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';
import { FRAMES, viewmodelVerdict } from './_viewmodelVerdict.js';

// THE RUNNING GAME'S COMPOSER DRAWS THE HANDS (W2-E; DECISIONS 2026-10-28 item 33).
//
// tests/gates/viewmodel-composer-gates proves GameScene hands its composer the viewmodel's pass first, and
// tests/gates/viewmodel-layer-gates steps the layer through R3F. What neither can see: that @react-three/postprocessing
// turns that child into a pass right after its own RenderPass, and that the game's composer calls it on every frame it
// draws, with the hands mounted, the viewmodel camera on the canvas's aspect and the hand light turned with the view.
// Read in the DEV game through the bridge: readPostFx (the live composer's pass names, render/postFx.jsx), `viewmodel`
// (the live viewmodel, render/ViewmodelLayer.jsx) and readSkyLight (the world key, render/Atmosphere.jsx). The pass's
// render is wrapped in the page to count its calls against R3F's own frame count (readFrameloop), and waits are counted
// in drawn frames: a CI frame can last seconds. The verdict on the reading is tests/e2e/_viewmodelVerdict.js, which
// tests/gates/viewmodel-verdict-gates.test.js drives with the readings a deleted, disabled, unsynced or unturned pass
// produces; this file's own share is the reading in the page.
// BLIND SPOT: no pixel is read (CI renders in software); how the hands look is the lookbook's hands set.

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

  expect(viewmodelVerdict(r, FRAMES).map((f) => f.line), `viewmodel: ${where}`).toEqual([]);
});
