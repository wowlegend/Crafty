import { test, expect } from '@playwright/test';
import { bootDev, startPlay, store } from './_boot.js';

// A QUALITY-TIER DOWNGRADE MUST ACTUALLY FREE SOMETHING.
//
// GameScene mounts a drei <PerformanceMonitor> (GameScene.jsx:185) whose onDecline steps the tier down
// high->med->low. The lever it pulls is TIERS.renderDistance = 4/3/2, i.e. a load box of 9x9=81, 7x7=49 or
// 5x5=25 chunks. The intent is obvious: the machine is struggling, so hold less world.
//
// It did not do that. The streamer culls at `cullDist = renderDistance + 2` (Terrain.jsx:708), a band that
// is always +2 regardless of tier — so at `low` it retains a ±4 box, which is 81 chunks, which is EXACTLY
// the high-tier load box. Downgrading from high to low therefore culled NOTHING: the streamer stopped
// asking for new chunks, but every mesh and every Rapier collider already resident stayed resident. On
// precisely the machine the downgrade exists to protect, draw calls and physics bodies stayed at high-tier
// levels and the only relief arrived if the player happened to walk far enough to push chunks out of the
// old band.
//
// Found while diagnosing an unrelated CI failure: a run logged `baseline 81 @low` — tier low, whose box is
// 25, with 81 chunks resident. That is the signature.
//
// THIS TEST DRIVES A REAL TIER TRANSITION rather than asserting on source text. It streams the world at
// high, forces the tier down through the same store action PerformanceMonitor uses, and then requires the
// resident chunk count to actually fall toward the new tier's box. A source-grep gate here would prove a
// constant changed and nothing about whether memory is released.
test('a high->low tier downgrade actually releases chunks', async ({ page }) => {
  test.setTimeout(180000);

  await bootDev(page);
  await startPlay(page);

  // Force `high` and let the full 9x9 neighbourhood settle, so the starting point is unambiguous.
  await store(page, () => window.useGameStore.getState().setQualityTier('high'));
  await page
    .waitForFunction(
      () => {
        const n = window.useGameStore.getState().getGeneratedChunks?.().size ?? 0;
        const settled = window.__tierPrev === n && n > 40;
        window.__tierPrev = n;
        return settled;
      },
      null,
      { timeout: 90000, polling: 1000 }
    )
    .catch(() => {});
  const atHigh = await store(page, () => window.useGameStore.getState().getGeneratedChunks().size);
  expect(atHigh, 'need a meaningfully-streamed world before downgrading').toBeGreaterThan(40);

  // The exact action PerformanceMonitor.onDecline performs.
  await store(page, () => window.useGameStore.getState().setQualityTier('low'));

  // Give the streamer plenty of ticks to reclaim. The cull runs inside the same pass as the requests, so
  // this is bounded by tick rate, not by worker throughput — a reclaim that is going to happen at all
  // happens well inside this window.
  const samples = [];
  const deadline = Date.now() + 45000;
  const LOW_BOX = 25; // (2*2+1)^2
  while (Date.now() < deadline) {
    const n = await store(page, () => window.useGameStore.getState().getGeneratedChunks().size);
    samples.push(n);
    if (n <= LOW_BOX * 1.6) break; // comfortably reclaimed — no need to burn the rest of the window
    await page.waitForTimeout(2000);
  }
  const atLow = samples[samples.length - 1];

  console.log(`[tier-reclaim] high=${atHigh} -> low=${atLow} (low box ${LOW_BOX}) samples: ${samples.join(',')}`);

  // The bar is deliberately generous: the +2 hysteresis band is legitimate (it stops thrash when the player
  // walks back and forth over a chunk boundary), so demanding an exact 25 would be wrong. What must NOT
  // happen is the count sitting at its high-tier value, having freed nothing at all.
  expect(
    atLow,
    `downgrading high->low freed nothing: ${atHigh} chunks before, ${atLow} after.\n` +
      `  The low tier asks for a ${LOW_BOX}-chunk box. Retaining the high-tier set means the downgrade's\n` +
      `  main lever delivers no relief on the machine that triggered it.\n` +
      `  samples: ${samples.join(',')}`
  ).toBeLessThan(atHigh * 0.75);
});
