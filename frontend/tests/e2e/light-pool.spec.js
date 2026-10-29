import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';

// CASTS AND CHESTS NO LONGER CHANGE THE LIGHT COUNT, SO NO LIT SHADER RE-LINKS (plan 2026-10-27-crafty-steady-cool,
// item i; refute F3).
//
// tests/gates/light-pool-gates drives the pool's per-frame assignment over real three objects. What it cannot see: that
// every site in the running game (each projectile and impact, each chest beacon) now borrows from the
// pool and none mounts a raw pointLight — which is exactly what keeps three's NUM_POINT_LIGHTS, and so the linked
// program set, constant. The instrument: renderer.info.programs (DEV readPostFx) and the scene's point-light count,
// across 20 real casts (the F key) and chests added and removed through the store list TreasureChestsRender draws.
// The cast hand carries no light: the first-person hands draw in the viewmodel scene, which this does not
// count, and their ember is an HDR colour the bloom carries (render/viewmodel.js).
//
// THE TIER IS HELD: the pool size is per tier, and on CI's software renderer the governor would decline mid-run, which
// changes the light count for a reason this spec is not about. So the governor is settled first (two declines through
// governorSignal: high -> med -> low, then no further step is possible), and the run happens at a fixed tier.
//
// Mutation-Proof: NOT YET RUN — this lane does not run e2e (port 4179 and the browser belong to the command session).
// Intended batch, via scripts/dev/mutate-e2e.sh:
//   E1 a projectile's light back on a raw <pointLight> (spellVfx.jsx)       -> RED expected: "the point-light count changed"
//   E2 the chest beacon back on a raw <pointLight> (Terrain.jsx)            -> RED expected: "the point-light count changed"
//   E3 the impact light back on a raw <pointLight ref={lightRef}> (spellVfx) -> RED expected: "programs changed"
//   E0 identity (a comment edit in lightPool.jsx)                           -> must SURVIVE
test('20 casts and chest spawns leave renderer.info.programs and the point-light count unchanged', async ({ page }) => {
  test.setTimeout(300000);
  await bootDev(page);
  await startPlayActive(page);
  await page.evaluate(() => window.__craftyTest.call('setQualityTier', 'high'));
  await page.evaluate(() => { window.__craftyTest.call('governorSignal', 'decline'); window.__craftyTest.call('governorSignal', 'decline'); });
  const gov = await page.evaluate(() => window.__craftyTest.call('readGovernor'));
  expect(gov.settled, `SETUP: the governor did not settle — the tier could move mid-run: ${JSON.stringify(gov)}`).toBe(true);

  const pointLights = () => page.evaluate(() => {
    let n = 0;
    window.__threeScene.traverse((o) => { if (o.isPointLight) n += 1; });
    return n;
  });
  const programs = () => page.evaluate(() => window.__craftyTest.call('readPostFx').programs);
  const cast = async () => {
    await page.evaluate(() => { const s = window.useGameStore.getState(); s.setMana(s.maxMana); });
    await page.keyboard.press('KeyF');
    await page.waitForTimeout(700);
  };
  const chests = (n) => page.evaluate((count) => {
    const p = window.useGameStore.getState().playerPosition;
    const list = Array.from({ length: count }, (_, i) => ({ id: `e2e-chest-${i}`, position: [p.x + 3 + i, p.y, p.z + 3], opened: false }));
    window.useGameStore.setState({ treasureChestsList: list });
  }, n);

  // WARM-UP: one of everything, so every first-use program has linked.
  await cast();
  await chests(3);
  await page.waitForTimeout(1500);
  await chests(0);
  await page.waitForTimeout(1500);
  const p0 = await programs();
  const l0 = await pointLights();
  expect(p0, 'SETUP: readPostFx reports no program count').toBeGreaterThan(0);

  const samples = [];
  let projectilesSeen = 0;
  let requestsPeak = 0;
  for (let i = 0; i < 20; i++) {
    if (i % 4 === 0) await chests(i % 8 === 0 ? 4 : 0);
    await cast();
    projectilesSeen += (await page.evaluate(() => window.__craftyTest.call('readProjectiles').length)) > 0 ? 1 : 0;
    requestsPeak = Math.max(requestsPeak, (await page.evaluate(() => window.__craftyTest.call('readLightPool'))).requests);
    samples.push(await pointLights());
  }
  await chests(0);
  await page.waitForTimeout(1500);
  const p1 = await programs();
  const where = JSON.stringify({ p0, p1, l0, samples, projectilesSeen, requestsPeak });
  console.log(`light-pool: ${where}`);

  // PRESENCE: the casts and the chests really happened, or nothing above was exercised.
  expect(projectilesSeen, `SETUP: no cast produced a projectile — the F key never cast: ${where}`).toBeGreaterThan(0);
  expect(requestsPeak, `SETUP: no light was ever requested from the pool — no chest beacon or spell light mounted: ${where}`).toBeGreaterThan(0);
  expect(new Set(samples).size === 1 && samples[0] === l0, `the point-light count changed during play: ${where}`).toBe(true);
  expect(p1, `renderer.info.programs changed across 20 casts and chest spawns: ${where}`).toBe(p0);
});
