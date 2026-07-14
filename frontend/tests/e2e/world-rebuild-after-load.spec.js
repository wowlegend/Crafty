import { test, expect } from '@playwright/test';
import { bootDev, startPlay, store } from './_boot.js';

// B2d — "LOAD WORLD" PERMANENTLY DESTROYS THE TERRAIN. (18-domain review, CRITICAL.)
//
// `load_modifications_done` wipes the live chunks (`setChunks({})` + `chunksRef.current.clear()`) so the
// worker can re-stream them with the save's block edits applied. But the streamer's dedup bookkeeping —
// `requestedChunks` — is NEVER cleared. Its guard is `!requestedChunks.has(key)`, so every chunk key is
// still marked "already requested" and can never be requested again. The cull path that WOULD drain the
// set iterates the loaded-chunk list... which was just emptied. Nothing drains it, ever.
//
// Result: click Load World and the world is gone. No meshes, no colliders, no ground. The player
// free-falls forever. The save system's one job is to be loaded, and loading it deletes the world.
//
// THIS TEST MUST BE AN E2E. The bug is not in any pure function — it is in the WIRING between a worker
// message handler and a streamer closure, and the only thing that proves the world came back is the world
// coming back. A unit test here would assert code-presence, which is the exact failure class this project
// keeps paying for. So: boot the real game, drive the real save path, and count real chunks.
test('the world REBUILDS after Load — chunks come back and the ground is solid again', async ({ page }) => {
  // Per-test budget, not a global one. This spec boots a voxel world, streams it in, saves, loads, and
  // waits for the whole neighbourhood to re-stream AND its Rapier colliders to rebuild — that is minutes
  // of honest work, not a slack threshold hiding a failing assertion. The suite's 60s default stands for
  // every other spec; nothing here is loosened to make a check pass.
  test.setTimeout(180000);

  await bootDev(page);
  await startPlay(page);

  // 1. Wait for the world to FINISH streaming, not merely to start.
  //
  //    Waiting on `size > 0` makes the baseline a RACE — it can resolve at 3 chunks or at 81 — and a
  //    small baseline makes every downstream threshold trivially satisfiable by the handful of in-flight
  //    chunks that survive a load. That is exactly how the first version of this test passed with the bug
  //    deliberately reintroduced. The baseline must be the SETTLED world (~81 chunks at default render
  //    distance), so wait for the count to stop growing.
  await page.waitForFunction(
    () => {
      const g = window.useGameStore.getState();
      if (!g.getGeneratedChunks) return false;
      const n = g.getGeneratedChunks().size;
      const settled = window.__prevChunkCount === n && n > 40;
      window.__prevChunkCount = n;
      return settled;
    },
    null,
    { timeout: 90000, polling: 1000 }
  );
  const before = await store(page, () => window.useGameStore.getState().getGeneratedChunks().size);
  expect(before, 'the world should be fully streamed before we load over it').toBeGreaterThan(40);

  // 2. Drive the REAL save path: serialize -> localStorage -> read back -> loadWorldData.
  //    (This is exactly what the World Manager's Load button does: MenuSystem.jsx -> loadWorldData.)
  await store(page, () => {
    const g = () => window.useGameStore.getState();
    g().saveActiveWorld({ x: 0, y: 18, z: 0 });
    const id = localStorage.getItem('crafty_active_world');
    const blob = JSON.parse(localStorage.getItem('crafty_world_save_' + id));
    g().loadWorldData(blob);
  });

  // 3. The world must come BACK — not merely be non-empty.
  //
  //    `> 0` is a VACUOUS assertion here and I nearly shipped it: the load clears chunksRef, but a few
  //    `generate` requests are already in flight and their replies land afterwards and re-add themselves.
  //    So the count creeps off zero on stale in-flight chunks while the real world (dozens of chunks)
  //    never re-streams — and a `> 0` gate goes green on a world the player is falling through. Demand
  //    the streamer actually recover the neighbourhood it had.
  //    Wait for the count to SETTLE, then assert — do not race a deadline. "Did it recover 80% within
  //    25 seconds" is a wall-clock race, and under machine load it fails for reasons that have nothing to
  //    do with the bug (that is how flaky gates are born; this project has already paid for one). The
  //    streamer is deliberately throttled to 2 chunks per 150ms tick, so settle-then-compare measures the
  //    thing we actually care about: where does the world END UP. With the bug it settles at 0. Without
  //    it, it climbs back to the full neighbourhood.
  //    A "has it stopped growing" settle-detector is NOT safe here either: the worker plateaus for a
  //    beat while requests are in flight, and under machine load the detector fires on that plateau and
  //    reports a half-streamed world. Wait for the RECOVERY TARGET itself, with a window generous enough
  //    that only a genuinely broken streamer misses it. (Unloaded, the world is back in ~7s; the bug
  //    parks it at 0 forever.) The 80% assertion is unchanged — nothing is loosened to go green.
  const target = Math.ceil(before * 0.8);
  await page
    .waitForFunction(
      (t) => window.useGameStore.getState().getGeneratedChunks().size >= t,
      target,
      { timeout: 60000, polling: 500 }
    )
    .catch(() => {}); // fall through so the assertion reports the real numbers

  const after = await store(page, () => window.useGameStore.getState().getGeneratedChunks().size);
  expect(
    after,
    `the chunk streamer must re-request chunks after a load (had ${before}, settled at ${after})`
  ).toBeGreaterThanOrEqual(target);

  // 4. And the ground must be SOLID — chunks existing is not the same as standing on them. The meshes
  //    and the Rapier colliders rebuild independently, so poll rather than single-sample: a mesh you can
  //    see but fall through is still a destroyed world.
  await page
    .waitForFunction(
      () => {
        const g = window.useGameStore.getState();
        return !!g.getMobGroundLevel && g.getMobGroundLevel(0, 0) !== null;
      },
      null,
      { timeout: 20000 }
    )
    .catch(() => {});

  const ground = await store(page, () => {
    const g = window.useGameStore.getState();
    return g.getMobGroundLevel ? g.getMobGroundLevel(0, 0) : null;
  });
  expect(ground, 'the player must not be free-falling through a hollow world').not.toBeNull();
});
