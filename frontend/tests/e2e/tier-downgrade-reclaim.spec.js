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
  // The reclaim trims to renderDistance + 1 — one ring of hysteresis — so at `low` (rd 2) the design
  // floor is a ±3 box: 7x7 = 49 chunks. That is an ABSOLUTE, machine-independent target, and it is what
  // this test must judge against.
  //
  // The first version asserted a RELATIVE drop (< 75% of the pre-downgrade count) and CI caught it: on the
  // runner the world only reaches 56-60 chunks at `high`, so a 25% fall is arithmetically impossible when
  // the floor is 49 — the reclaim did exactly the right thing and the test still failed. A relative bar
  // measured the machine's streaming speed, not the code's behaviour.
  const LOW_RENDER_DISTANCE = 2;
  const RECLAIM_BOX = (2 * (LOW_RENDER_DISTANCE + 1) + 1) ** 2; // 49

  const atHigh = await store(page, () => window.useGameStore.getState().getGeneratedChunks().size);
  expect(
    atHigh,
    `this machine only streamed ${atHigh} chunks at "high", which is not above the ${RECLAIM_BOX}-chunk ` +
      `reclaim floor — there would be nothing to reclaim, so the test could not distinguish a working ` +
      `reclaim from a broken one. Not a product failure; the box is too slow to exercise this.`
  ).toBeGreaterThan(RECLAIM_BOX);

  // The exact action PerformanceMonitor.onDecline performs.
  await store(page, () => window.useGameStore.getState().setQualityTier('low'));

  // Give the streamer plenty of ticks to reclaim. The cull runs inside the same pass as the requests, so
  // this is bounded by tick rate, not by worker throughput — a reclaim that is going to happen at all
  // happens well inside this window.
  const samples = [];
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    const n = await store(page, () => window.useGameStore.getState().getGeneratedChunks().size);
    samples.push(n);
    if (n <= RECLAIM_BOX) break; // hit the design floor — no need to burn the rest of the window
    await page.waitForTimeout(2000);
  }
  const atLow = samples[samples.length - 1];

  console.log(`[tier-reclaim] high=${atHigh} -> low=${atLow} (reclaim floor ${RECLAIM_BOX}) samples: ${samples.join(',')}`);

  // Judge against the design floor, not against a percentage of wherever this machine happened to start.
  // The reclaim trims beyond renderDistance + 1, so everything left must fit the ±3 box. Demanding the
  // low tier's own 25-chunk box would be wrong — the +2 hysteresis band is legitimate and stops thrash
  // when the player paces across a chunk boundary.
  expect(
    atLow,
    `downgrading high->low did not reclaim: ${atHigh} chunks before, ${atLow} after.\n` +
      `  The reclaim trims beyond renderDistance+1, so at "low" everything left must fit a\n` +
      `  ${RECLAIM_BOX}-chunk box. Sitting above it means the downgrade's main lever delivered no relief\n` +
      `  on the very machine that triggered it.\n` +
      `  samples: ${samples.join(',')}`
  ).toBeLessThanOrEqual(RECLAIM_BOX);
});
