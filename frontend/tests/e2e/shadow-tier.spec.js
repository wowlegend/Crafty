import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';

// A QUALITY-TIER CHANGE REBUILDS THE SUN'S SHADOW (plan 2026-09-23-crafty-perf-heat-ipad, Task 5).
//
// three r172 allocates a light's shadow target only when `shadow.map === null`, and takes the per-frame viewport from
// the CURRENT mapSize. So when the tier governor stepped an iPad up (512 -> 1024 -> 2048), the old 512 target was
// rendered through a larger viewport over a stale frustum: cut and shifted shadows everywhere. This drives the real
// renderer: the tier is stepped through the store hook, and the LIVE shadow target's size is read back after it has
// rendered at least one shadow pass at the new size.
//
// Mutation-Proof: by hand (cp backup, cmp-verified restore), observed RED:
//   T1 Atmosphere: the resetShadowForConfig call removed -> "the shadow target is 2048x2048 under a 512x512 map at
//      tier low" (the boot tier allocated the first target; it never followed a step)
test('stepping the quality tier re-sizes the live shadow target to the new map size, both ways', async ({ page }) => {
  test.setTimeout(240000);
  await bootDev(page);
  await startPlayActive(page);
  const at = async (tier) => {
    await page.evaluate((t) => window.__craftyTest.call('setQualityTier', t), tier);
    await page.waitForTimeout(1500); // several frames: the new map is allocated on the next shadow render
    return page.evaluate(() => ({ tier: window.useGameStore.getState().qualityTier, ...window.__craftyTest.call('readSunShadow') }));
  };
  const seq = [await at('low'), await at('high'), await at('med'), await at('low')];
  const where = JSON.stringify(seq);
  console.log(`[shadow-tier] ${where}`);
  // PRESENCE: the tier really changed the map size the light asks for (else nothing here was exercised). Two sizes,
  // not three: the live governor (PerformanceMonitor, active outside capture) may step a slow runner straight back
  // down — measured: a 'med' request read back 'low'. The verdict below holds at whatever tier each read finds.
  expect(new Set(seq.map((s) => s.mapSize?.[0])).size, `SETUP: the tier changes never changed the shadow map size — ${where}`).toBeGreaterThanOrEqual(2);
  for (const s of seq) {
    expect(s.map, `SETUP: no shadow target at tier ${s.tier} — ${where}`).not.toBeNull();
    expect(s.map, `the shadow target is ${s.map?.join('x')} under a ${s.mapSize?.join('x')} map at tier ${s.tier} — ${where}`).toEqual(s.mapSize);
  }
});
