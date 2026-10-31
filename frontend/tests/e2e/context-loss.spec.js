import { test, expect } from './_fixtures.js';
import { PNG } from 'pngjs';
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
//   E2 the boot's load removed (startGame.jsx)                                                  -> RED expected: "the reload did not resume the world"
//   E3 handleContextLost no longer sets the flag (GameScene.jsx)                                -> RED expected: "no panel after the loss"
//   E4 Terrain publishes the worker with a bare setState again (bypassing setTerrainWorker)     -> RED expected: "did not resume the block"
//   E5 the Player's spawn ignores resumeSpawn (Components.jsx)                                  -> RED expected: "where they stood"
//   E6 the DEV `restore` op dispatches a bare `webglcontextrestored` event instead of restoring the context (GameScene.jsx):
//      the panel goes and the frame loop runs, but the GPU never came back — the case the old frame-count check passed
//                                                                                               -> RED expected: "did not draw after the restore"
//   E7 the boot loads the world after the quest system has mounted (startGame.jsx's order reversed)
//                                                                                               -> RED expected: "the resume wiped the quest log"
//   E8 the dragon hook seeded from BOSS_CONFIG again instead of the store (world/bossSystem.js)  -> RED expected: "the resume woke a slain dragon"
//   E0 identity (a comment edit in contextRecovery.js)                                          -> must SURVIVE
// E4/E5's unit halves are tests/gates/context-loss-gates R1-R6 (run, all RED; identity SURVIVED).
test('a lost context shows the panel; a restore clears it and draws again; a tap reloads into the same world', async ({ page }) => {
  // Two boots (the second after the recovery reload). On CI's software renderer this was still running 5 min in (run
  // 40615649137, shard 1: its post-reload log line at 304 s, then the job's own timeout), so 300 s was its edge.
  test.setTimeout(420000);
  await bootDev(page);
  await startPlayActive(page);
  const panel = page.getByTestId('context-loss-panel');
  await expect(panel, 'SETUP: the panel is up before any loss').toHaveCount(0);
  // WHETHER THE GAME CANVAS IS BEING DRAWN, read from composited pixels (review 2026-10-27 MED 3). The old check counted
  // frame-loop callbacks, which keep running while the context is lost, so it could not fail. A tonal-range check cannot
  // do it either: measured locally 2026-10-27, a LOST canvas keeps showing its last image (range 173, against 242 lit), so
  // "not blank" passes on a frozen canvas. What separates drawing from frozen is CHANGE: two shots 1.5 s apart differ
  // while the world draws (water, motes, grass) and are identical while it does not. Every other element is hidden for
  // the shot (the HUD over the canvas changes on its own); the game canvas is the largest one on the page.
  const canvasShot = async () => {
    await page.evaluate(() => {
      const all = [...document.querySelectorAll('canvas')];
      const game = all.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
      game.setAttribute('data-e2e-game-canvas', '');
      const s = document.createElement('style');
      s.id = 'e2e-only-the-canvas';
      s.textContent = 'body * { visibility: hidden !important; } [data-e2e-game-canvas] { visibility: visible !important; }';
      document.head.appendChild(s);
    });
    const png = PNG.sync.read(await page.locator('[data-e2e-game-canvas]').screenshot());
    await page.evaluate(() => document.getElementById('e2e-only-the-canvas')?.remove());
    return png;
  };
  const lum = (d, i) => (d[i] + d[i + 1] + d[i + 2]) / 3;
  // The share of pixels whose luminance moved by more than 8 between two shots taken 1.5 s apart, and the second's range.
  const liveness = async () => {
    const a = await canvasShot();
    await page.waitForTimeout(1500);
    const b = await canvasShot();
    if (a.width !== b.width || a.height !== b.height) return { moved: 1, range: 255, note: 'resized' };
    let moved = 0;
    let min = 255;
    let max = 0;
    for (let i = 0; i < b.data.length; i += 4) {
      const l = lum(b.data, i);
      if (Math.abs(l - lum(a.data, i)) > 8) moved += 1;
      if (l < min) min = l;
      if (l > max) max = l;
    }
    return { moved: Number((moved / (b.data.length / 4)).toFixed(5)), range: Math.round(max - min) };
  };
  // Calibrated from seven local runs 2026-10-27 (swiftshader, load 35-220): a drawing canvas moved 11.1-83.6% of its
  // pixels in 1.5 s (nine readings); a lost one moved 0% in five runs and 0.447% in two (the same value both times, before
  // the 1 s settle below existed). 2% sits 4.5x above the most a frozen canvas moved and 5.5x below the least a drawing
  // one did. Re-measure, do not re-quote, if the renderer or the scene changes.
  const LIVE = 0.02;
  // Presence first: the instrument sees a drawn, moving world before the loss.
  const lit = await liveness();
  expect(lit.range, `SETUP: the canvas reads blank before any loss: ${JSON.stringify(lit)}`).toBeGreaterThan(20);
  expect(lit.moved, `SETUP: the world does not move between two shots here — liveness cannot be read: ${JSON.stringify(lit)}`).toBeGreaterThan(LIVE);

  // A real loss, then the browser's restore.
  expect(await page.evaluate(() => window.__craftyTest.call('webglContext', 'lose')), 'SETUP: WEBGL_lose_context is unavailable here').toBe(true);
  await expect(panel, 'no panel after the loss').toBeVisible({ timeout: 10000 });
  await expect(panel).toContainText('Graphics were reset by the system');
  // The control: a canvas that is not being drawn reads as frozen to this instrument. A second's settle first, so the pair
  // does not straddle the last frame the compositor presented before the loss.
  await page.waitForTimeout(1000);
  const dark = await liveness();
  expect(dark.moved, `SETUP: the LOST canvas still changes between shots — the instrument cannot tell frozen from drawing: ${JSON.stringify(dark)}`).toBeLessThan(LIVE);
  await page.evaluate(() => window.__craftyTest.call('webglContext', 'restore'));
  // The panel clears once three has drawn since the restore (game/contextRecovery.js whenDrawnAgain): a frame, not an event.
  await expect(panel, 'the panel stayed after the context came back').toHaveCount(0, { timeout: 30000 });
  await page.waitForTimeout(1000);
  const back = await liveness();
  console.log(`context-loss: canvas liveness lit ${JSON.stringify(lit)} · lost ${JSON.stringify(dark)} · restored ${JSON.stringify(back)}`);
  expect(back.moved, `the canvas did not draw after the restore — it is frozen: ${JSON.stringify({ lit, dark, back })}`).toBeGreaterThan(LIVE);
  expect(back.range, `the canvas reads blank after the restore: ${JSON.stringify({ lit, dark, back })}`).toBeGreaterThan(20);

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

  // THE STATE THE HOOKS OWN (deep audit 2026-10-30, lane L12; AUDIT:debt:resume-clobbers-quests-and-boss). Coins, a block and
  // a position are the store's own. The quest log and the dragon fight lived in hook state that the resume's load did not
  // reach, so the recovery came back with both reset, and this spec saw neither. A real kill through the bus (the quest
  // system subscribes to it) gives the log a count a re-seeded log would not have; a slain dragon at tier 1 is a fight a
  // fresh hook would not have. Both are read back once the reloaded game's hooks have mounted.
  await page.evaluate(async (busUrl) => {
    // The dev server's own URL for the module the quest system subscribes through, held in a variable: it is a URL in the
    // page, not a path knip can resolve in this file.
    const bus = await import(busUrl);
    bus.emit(bus.EVENTS.mobKill, 'zombie', [0, 60, 0], 'player');
    window.useGameStore.getState().setBossEncounter({ health: 0, active: false, defeated: true, tier: 1, killNight: 2 });
  }, '/src/game/eventBus.js');
  const killsBefore = await page.waitForFunction(() => {
    const q = window.useGameStore.getState().questState;
    return q?.stats?.kills >= 1 ? q.stats.kills : null;
  }, null, { timeout: 10000 }).then((h) => h.jsonValue(), () => {
    throw new Error('SETUP: the quest system recorded no kill before the loss, so the resume has no log to keep');
  });
  // After the kill, not before: a kill pays coins, and the coins are what the reload is compared against.
  const MARK = 4321;
  await page.evaluate((c) => window.useGameStore.setState({ coins: c }), MARK);
  // A recovery before Start only reloads (review LOW 5): the save needs a STARTED game, and the harness's forcePlay
  // deliberately does not mark one (App.jsx). The player pressed Start in the case this resumes, so set it here.
  await page.evaluate(() => window.useGameStore.getState().markGameStarted());
  await page.evaluate(() => window.__craftyTest.call('webglContext', 'lose'));
  await expect(panel).toBeVisible({ timeout: 10000 });
  await Promise.all([page.waitForEvent('load', { timeout: 60000 }), panel.click()]);
  // NOT bootDev: it navigates (page.goto), a SECOND load of the tab. The first load after the recovery consumed the note
  // and loaded the world; a second one is a plain visit with no note left. Found by the first local run of this spec
  // (2026-10-27): three `[vite] connecting...` in the trace and `world: null, coins: 0` — the check read a page that was
  // not the recovery's. Wait for the reloaded page instead.
  await page.waitForFunction(
    () => typeof window.useGameStore === 'function' && !!window.__craftyTest && typeof window.__craftyTest.ready === 'function' && window.__craftyTest.ready(),
    null, { timeout: 60000 },
  ).catch((e) => { throw new Error(`SETUP: the reloaded page never came up (store + test bridge) — ${e.message}`); });
  const after = await page.evaluate(() => ({
    coins: window.useGameStore.getState().coins,
    world: window.useGameStore.getState()._sessionWorldId,
    crumb: window.sessionStorage.getItem('crafty.boot'),
    lost: window.useGameStore.getState().isWebGLContextLost,
  }));
  console.log(`context-loss: after the recovery reload ${JSON.stringify(after)}`);
  expect(after.world, `the reload did not resume the world (no session world): ${JSON.stringify(after)}`).toBeTruthy();
  expect(after.coins, `the reload did not resume the world (coins ${after.coins}, saved ${MARK}): ${JSON.stringify(after)}`).toBe(MARK);
  expect(after.crumb, 'the boot note survived its use').toBeNull();
  expect(after.lost, 'the fresh page still believes its context is lost').toBe(false);

  // The resumed world's blocks and the player's place. The spawn consumes resumeSpawn once its column has colliders; the
  // wait for THAT is the subject, not a precondition (a spawn that ignores resumeSpawn never consumes it), so only the
  // world build is SETUP.
  await page.waitForFunction(() => {
    const s = window.useGameStore.getState();
    return s.isSpawnChunkLoaded === true && !!s.playerRigidBodyRef?.current;
  }, null, { timeout: 120000 }).catch(() => {
    throw new Error('SETUP: the resumed world never built (isSpawnChunkLoaded / the player body)');
  });
  await page.waitForFunction((st) => {
    const s = window.useGameStore.getState();
    const t = s.playerRigidBodyRef.current.translation();
    return s.resumeSpawn === null && Math.hypot(t.x - st.x, t.z - st.z) < 1.5;
  }, stood, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1000);
  const placed = await page.evaluate(() => {
    const t = window.useGameStore.getState().playerRigidBodyRef.current.translation();
    return { x: t.x, y: t.y, z: t.z, pending: window.useGameStore.getState().resumeSpawn };
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

  // The hooks' state, after the reloaded game's hooks have mounted and mirrored their seeds back to the store: the quest log
  // is the one played, and the dragon is still slain at its tier.
  const hooks = await page.evaluate(() => {
    const s = window.useGameStore.getState();
    return { kills: s.questState?.stats?.kills ?? null, bossDefeated: s.bossDefeated, bossTier: s.bossTier, bossHealth: s.bossHealth, bossActive: s.bossActive };
  });
  console.log(`context-loss: the hooks' state after the resume ${JSON.stringify(hooks)} (kills played ${killsBefore})`);
  expect(hooks.kills, `the resume wiped the quest log (kills ${hooks.kills}, played ${killsBefore}): ${JSON.stringify(hooks)}`).toBe(killsBefore);
  expect(hooks.bossDefeated, `the resume woke a slain dragon: ${JSON.stringify(hooks)}`).toBe(true);
  expect(hooks.bossTier, `the resume reset the dragon's tier: ${JSON.stringify(hooks)}`).toBe(1);
  expect(hooks.bossActive, `the resume left a slain dragon active: ${JSON.stringify(hooks)}`).toBe(false);
});
