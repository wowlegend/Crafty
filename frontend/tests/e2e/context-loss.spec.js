import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';

// A LOST WEBGL CONTEXT HAS A WAY BACK, AND THE WAY BACK LANDS IN THE SAME WORLD (plan 2026-10-27-crafty-steady-cool,
// item e).
//
// tests/gates/context-loss-gates renders the panel against the store and drives the recovery with an injected reload.
// What it cannot see: that GameScene's `webglcontextlost` listener sets the flag when the browser really drops the
// context, that a restore clears it and the canvas draws again, and that the real reload resumes the world.
// The loss is real: WEBGL_lose_context on the game canvas (the DEV `webglContext` hook took the extension at creation).
//
// Mutation-Proof: NOT YET RUN — this lane does not run e2e (port 4179 and the browser belong to the command session).
// Intended batch, via scripts/dev/mutate-e2e.sh:
//   E1 the panel never shows (`if (!lost) return null;` -> `return null;`, ContextLossPanel.jsx) -> RED expected: "no panel after the loss"
//   E2 the boot resume effect removed (ContextLossPanel.jsx)                                    -> RED expected: "the reload did not resume the world"
//   E3 handleContextLost no longer sets the flag (GameScene.jsx)                                -> RED expected: "no panel after the loss"
//   E4 Terrain publishes the worker with a bare setState again (bypassing setTerrainWorker)     -> RED expected: "did not resume the block"
//   E5 the Player's spawn ignores resumeSpawn (Components.jsx)                                  -> RED expected: "where they stood"
//   E0 identity (a comment edit in contextRecovery.js)                                          -> must SURVIVE
// E4/E5's unit halves are tests/gates/context-loss-gates R1-R6 (run, all RED; identity SURVIVED).
test('a lost context shows the panel; a restore clears it and draws again; a tap reloads into the same world', async ({ page }) => {
  test.setTimeout(300000);
  await bootDev(page);
  await startPlayActive(page);
  const frames = () => page.evaluate(() => window.__craftyTest.call('readFrameloop').frames);
  const panel = page.getByTestId('context-loss-panel');
  await expect(panel, 'SETUP: the panel is up before any loss').toHaveCount(0);

  // A real loss, then the browser's restore.
  expect(await page.evaluate(() => window.__craftyTest.call('webglContext', 'lose')), 'SETUP: WEBGL_lose_context is unavailable here').toBe(true);
  await expect(panel, 'no panel after the loss').toBeVisible({ timeout: 10000 });
  await expect(panel).toContainText('Graphics were reset by the system');
  await page.evaluate(() => window.__craftyTest.call('webglContext', 'restore'));
  await expect(panel, 'the panel stayed after the context came back').toHaveCount(0, { timeout: 10000 });
  const f0 = await frames();
  await page.waitForTimeout(3000);
  const f1 = await frames();
  expect(f1, `the canvas did not draw after the restore (${f0} -> ${f1} frames)`).toBeGreaterThan(f0);

  // Lose it again and take the way back: the world must be the one that was being played — its progress, the blocks its
  // player placed, and where the player stood (review 2026-10-27 HIGH 2: coins alone came back; the edits and the
  // position did not, and this spec checked coins only). The block is read by PHYSICS: the ground probe hits its collider.
  const probe = (c) => page.evaluate((p) => {
    const g = window.useGameStore.getState().getMobGroundLevel;
    const y = g ? g(p.x, p.z) : null;
    return Number.isFinite(y) ? y : null;
  }, c);
  const landAt = async (c) => {
    const h = await page.waitForFunction((p) => {
      const g = window.useGameStore.getState().getMobGroundLevel;
      const y = g ? g(p.x, p.z) : null;
      return Number.isFinite(y) && y > 15 ? y : null;
    }, c, { timeout: 60000 }).catch(() => null);
    if (!h) throw new Error(`SETUP: the column ${JSON.stringify(c)} never loaded a collider`);
    return h.jsonValue();
  };
  // Off the origin column (the old spawn) and in another chunk (x 16..31 / z -32..-1 is chunks (1, -2) and (1, -1)), on
  // LAND (above the sea at 28), so the player stands still where it is put.
  await landAt({ x: 24.5, z: -20.5 });
  const land = await page.evaluate(() => {
    const g = window.useGameStore.getState().getMobGroundLevel;
    for (const x of [22.5, 26.5, 18.5, 30.5]) {
      for (const z of [-22.5, -18.5, -26.5, -14.5, -10.5]) {
        const y = g(x, z);
        if (Number.isFinite(y) && y > 30) return { x, z, y };
      }
    }
    return null;
  });
  if (!land) throw new Error('SETUP: no land column among the candidates in chunks (1,-2)/(1,-1) — the seed changed');
  const STAND = { x: land.x, z: land.z };
  const MARKER = { x: Math.floor(land.x) + 3, z: Math.floor(land.z) + 3 };
  const standGround = land.y;
  const markerTop = Math.max(Math.floor(await landAt(MARKER)), 30) + 7; // a floating block, clear of the ground and the sea
  await page.evaluate(({ m, top }) => {
    const s = window.useGameStore.getState();
    const y = top - 1;
    const cx = Math.floor(m.x / 16);
    const cz = Math.floor(m.z / 16);
    // What Terrain's place() does: the worker's edit, then the store's record of it (the save serialises the record).
    s.terrainWorker.postMessage({ type: 'update_block', payload: { cx, cz, x: m.x - cx * 16, y, z: m.z - cz * 16, blockType: 3 } });
    const blocks = new Map(s.worldBlocks);
    blocks.set(`${m.x}_${y}_${m.z}`, 3);
    s.setWorldBlocks(blocks);
  }, { m: MARKER, top: markerTop });
  // Presence first: the instrument sees the block before the loss.
  await page.waitForFunction(({ m, top }) => Math.abs((window.useGameStore.getState().getMobGroundLevel(m.x, m.z) ?? -1) - top) < 0.05,
    { m: MARKER, top: markerTop }, { timeout: 60000 }).catch(async () => {
    throw new Error(`SETUP: the placed block never got a collider before the loss (probe ${await probe(MARKER)}, top ${markerTop})`);
  });
  await page.evaluate(({ c, y }) => {
    const rb = window.useGameStore.getState().playerRigidBodyRef.current;
    rb.setTranslation({ x: c.x, y, z: c.z }, true);
    rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }, { c: STAND, y: standGround + 1.2 });
  await page.waitForTimeout(1500);
  const stood = await page.evaluate(() => {
    const t = window.useGameStore.getState().playerRigidBodyRef.current.translation();
    return { x: t.x, y: t.y, z: t.z };
  });
  expect(Math.hypot(stood.x - STAND.x, stood.z - STAND.z), `SETUP: the player did not stay where it was put: ${JSON.stringify(stood)}`).toBeLessThan(1.5);

  const MARK = 4321;
  await page.evaluate((c) => window.useGameStore.setState({ coins: c }), MARK);
  await page.evaluate(() => window.__craftyTest.call('webglContext', 'lose'));
  await expect(panel).toBeVisible({ timeout: 10000 });
  await Promise.all([page.waitForEvent('load', { timeout: 60000 }), panel.click()]);
  await bootDev(page);
  await page.waitForTimeout(1500); // the boot effect that consumes the breadcrumb
  const after = await page.evaluate(() => ({
    coins: window.useGameStore.getState().coins,
    world: window.useGameStore.getState()._sessionWorldId,
    crumb: window.sessionStorage.getItem('crafty.resumeWorldId'),
    lost: window.useGameStore.getState().isWebGLContextLost,
  }));
  console.log(`context-loss: after the recovery reload ${JSON.stringify(after)}`);
  expect(after.world, `the reload did not resume the world (no session world): ${JSON.stringify(after)}`).toBeTruthy();
  expect(after.coins, `the reload did not resume the world (coins ${after.coins}, saved ${MARK}): ${JSON.stringify(after)}`).toBe(MARK);
  expect(after.crumb, 'the breadcrumb survived its use').toBeNull();
  expect(after.lost, 'the fresh page still believes its context is lost').toBe(false);

  // The resumed world's blocks and the player's place. The spawn consumes resumeSpawn once its column has colliders.
  await page.waitForFunction(() => {
    const s = window.useGameStore.getState();
    return s.isSpawnChunkLoaded === true && s.resumeSpawn === null && !!s.playerRigidBodyRef?.current;
  }, null, { timeout: 120000 }).catch(() => {
    throw new Error('SETUP: the resumed world never built, or its spawn never resolved (isSpawnChunkLoaded / resumeSpawn)');
  });
  await page.waitForTimeout(1000);
  const placed = await page.evaluate(() => {
    const t = window.useGameStore.getState().playerRigidBodyRef.current.translation();
    return { x: t.x, y: t.y, z: t.z };
  });
  const blockBack = await page.waitForFunction(({ m, top }) => {
    const y = window.useGameStore.getState().getMobGroundLevel?.(m.x, m.z);
    return Number.isFinite(y) && Math.abs(y - top) < 0.05;
  }, { m: MARKER, top: markerTop }, { timeout: 60000 }).then(() => true, () => false);
  const resumed = JSON.stringify({ stood, placed, markerTop, markerProbe: await probe(MARKER) });
  console.log(`context-loss: the resumed world ${resumed}`);
  expect(blockBack, `the reload did not resume the block the player placed (its collider is not there): ${resumed}`).toBe(true);
  expect(Math.hypot(placed.x - stood.x, placed.z - stood.z), `the reload did not put the player where they stood: ${resumed}`).toBeLessThan(1.5);
  expect(Math.abs(placed.y - stood.y), `the reload put the player at another height: ${resumed}`).toBeLessThan(3);
});
