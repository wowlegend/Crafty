import { mkdirSync } from 'node:fs';
import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';

// CONTINUE: A RETURNING PLAYER STANDS WHERE THEY SAVED (deep audit 2026-10-30, lane L2; AUDIT:persistence:returning-
// player-never-resumed and AUDIT:desync:load-drops-player-out-of-world; DECISIONS 2026-10-30 items 200-203).
//
// The real page in the real browser: play, stand on land more than three chunks from the origin, save, reload the tab (a
// plain visit, no note), and the title offers Continue with the world's name and level; it is clicked while the world
// builds, as a player would. From the reload until 30 drawn frames after the body stands at the save, it is sampled every drawn
// frame. It must reach the save's column, never be more than 1 m under the saved height there, still stand there at the
// end, and the autosave after Continue must write that spot. The
// far column is the point: the page boots over the origin, so the save's chunks are not there when the world is first
// built, and a hold that lets go early drops the player through the gap (the verifier's sim: 0 of 52 runs within 1 m).
// Every pageerror is recorded and must be none (the verifier's node-only Rapier crash after a wipe was a lead to settle).
// The reload's boot must leave its attempt at the world before the first render, and the running world must take it
// back (game/worldBoot.js BOOT_ATTEMPT_KEY, systems/BootSettle.jsx): an attempt left behind holds the world on the next
// visit's title, the crash-loop breaker misfiring on a world that ran.
//
// THE TITLE'S LOOK. The title with no save (Start Adventure) and with one (Continue, its caption, New World) is shot to
// frontend/test-results/title-shots/, which CI uploads from every shard as the artifact title-shots-shard-<n> (.github/
// workflows/ci.yml); the shard that ran this spec holds the two frames.
//
// WHAT THIS DOES NOT CHECK: the World Manager's Load and Create, the context-loss resume and the dragon after a switch
// (tests/gates/world-switch-boot-gates.test.jsx, the real App in jsdom; tests/e2e/context-loss.spec.js drives the real
// context-loss reload); touch and WebKit (the title's buttons are the same elements there); the pointer lock itself,
// which this page grants only to a request made inside a trusted input event (lockOnGestureOnly); the input gate is
// also held as the other specs hold it.
//
// Mutation-Proof: red on dispatched CI runs, each with one line of the game reverted (the run ids are in DECISIONS
// 2026-10-30 items 205 and 220); no local browser run.

const SHOTS = 'test-results/title-shots';

/** In the page, before any of its scripts: a pointer lock is granted to a request made while a trusted input event is
 *  being dispatched (the Continue click's handler asks for it) or by the element already holding one, and refused
 *  otherwise, as a player's browser refuses one asked for with no gesture. App asks once the world is built, from a
 *  timer, and CI's headless Chromium granted that: play began on its own and the title, with Continue, was gone before
 *  the spec could click it (dispatched runs 41154002602, 41158525305; navigator.userActivation did not tell the two
 *  apart, and a flag armed just before the click let the timer's request through while the click waited for the button
 *  to settle, run 41162831435 attempt 1). Refusing every request paused the world from the click until the spec held
 *  the input gate, and in that pause the save's ground streamed in under a hold that had let go too early, so the hold
 *  mutant passed (run 41157732564): a player's click locks the pointer and the world runs at once. A refusal is a
 *  rejected promise and a pointerlockerror, as the browser gives. */
function lockOnGestureOnly() {
  const real = HTMLCanvasElement.prototype.requestPointerLock;
  const GESTURES = new Set(['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'keydown', 'touchend']);
  HTMLCanvasElement.prototype.requestPointerLock = function gated(...args) {
    const ev = window.event;
    if (document.pointerLockElement === this || (ev && ev.isTrusted && GESTURES.has(ev.type))) return real.apply(this, args);
    setTimeout(() => document.dispatchEvent(new Event('pointerlockerror')), 0);
    return Promise.reject(new DOMException('pointer lock refused (e2e: no lock without a gesture)', 'NotAllowedError'));
  };
}
const FRAMES_AFTER_ARRIVAL = 30; // drawn frames, each up to 0.25 s of world time (game/frameStep.js MAX_FRAME_STEP_SEC)
const FAR = 48; // three chunks (CHUNK_SIZE 16): nothing at the origin's render distance reaches past this
const CANDIDATES = [[60.5, -44.5], [-60.5, 52.5], [56.5, 60.5], [-52.5, -60.5], [72.5, 8.5], [8.5, 72.5]];
const MARK = 4321;

/** In the page: what the loop reads, for every failure message (rule 4e). */
function gates() {
  const s = window.useGameStore.getState();
  const rb = s.playerRigidBodyRef?.current;
  const t = rb ? rb.translation() : null;
  return {
    body: t && [t.x, t.y, t.z].map((v) => Math.round(v * 100) / 100), resumeSpawn: s.resumeSpawn, worldReloading: s.worldReloading,
    built: s.isSpawnChunkLoaded, started: s.gameStarted, active: window.__craftyTest?.call('readIntents').active, alive: s.isAlive,
    locked: !!document.pointerLockElement,
  };
}

/** In the page: hold the body high over each candidate until its chunk streams in, then find land there (ground above
 *  the sea at 28, the four capsule corners within 0.5 m of it) and stand the body on it, still for 20 drawn frames.
 *  Hostiles within 60 m are swept every frame. Returns where it stands, or why it could not. */
async function standFar({ candidates, far }) {
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const s = () => window.useGameStore.getState();
  s().setTimeOfDay?.(0.5);
  const sweep = () => {
    const cam = window.__threeCamera?.position;
    if (!cam) return;
    for (const m of window.__craftyTest.call('readMobs')) {
      if (!m.passive && m.health > 0 && Math.hypot(m.x - cam.x, m.z - cam.z) < 60) window.GameMethods.damageMob(m.id, 99999, 'physical', 'ally');
    }
  };
  const hold = (x, y, z) => {
    const rb = s().playerRigidBodyRef.current;
    rb.setTranslation({ x, y, z }, true);
    rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
  };
  const tried = [];
  for (const [cx, cz] of candidates) {
    if (Math.max(Math.abs(cx), Math.abs(cz)) < far) continue;
    let ground = null;
    for (let i = 0; i < 3600 && !Number.isFinite(ground); i++) {
      hold(cx, 110, cz);
      sweep();
      await frame();
      ground = s().getMobGroundLevel?.(cx, cz);
    }
    tried.push([cx, cz, ground]);
    if (!Number.isFinite(ground)) continue;
    const probe = s().getMobGroundLevel;
    for (let dx = -4; dx <= 4; dx += 1.5) {
      for (let dz = -4; dz <= 4; dz += 1.5) {
        const x = cx + dx, z = cz + dz;
        const y = probe(x, z);
        if (!Number.isFinite(y) || y <= 30) continue;
        const corners = [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]].map(([a, b]) => probe(x + a, z + b));
        if (!corners.every((c) => Number.isFinite(c) && Math.abs(c - y) < 0.5)) continue;
        let still = 0, last = null;
        for (let i = 0; i < 600 && still < 20; i++) {
          if (i < 3) hold(x, y + 1.2, z);
          sweep();
          await frame();
          const t = s().playerRigidBodyRef.current.translation();
          still = last !== null && Math.abs(t.y - last) < 0.002 ? still + 1 : 0;
          last = t.y;
        }
        const t = s().playerRigidBodyRef.current.translation();
        if (still >= 20 && Math.hypot(t.x - x, t.z - z) < 0.5) return { at: { x: t.x, y: t.y, z: t.z }, ground: y };
      }
    }
  }
  return { why: `SETUP: no land to stand on among the far candidates ${JSON.stringify(tried)}` };
}

test('a returning player continues from the title, and stands where they saved, three chunks out', async ({ page }) => {
  test.setTimeout(600000); // two boots, a far column streamed in twice, on CI's software renderer
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  mkdirSync(SHOTS, { recursive: true });
  await page.addInitScript(lockOnGestureOnly);

  // 1. A first visit: the title starts a world.
  await bootDev(page);
  await expect(page.getByTestId('title-start'), 'a first visit\'s title has no Start').toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('title-continue'), 'a first visit offers Continue with nothing saved').toHaveCount(0);
  await page.getByTestId('title-start').click({ trial: true }); // visible and stable: the entrance tweens have finished
  await page.screenshot({ path: `${SHOTS}/title-no-save.png` });
  await startPlayActive(page);

  // 2. Stand far out and save there, through the store's save action (the one the autosave and every switch call).
  const stood = await page.evaluate(standFar, { candidates: CANDIDATES, far: FAR });
  if (stood.why) throw new Error(stood.why);
  const saved = await page.evaluate((mark) => {
    const s = window.useGameStore.getState();
    window.useGameStore.setState({ coins: mark });
    const t = s.playerRigidBodyRef.current.translation();
    s.saveActiveWorld({ x: t.x, y: t.y, z: t.z });
    const index = JSON.parse(localStorage.getItem('crafty_world_saves') || '[]');
    return { at: { x: t.x, y: t.y, z: t.z }, id: index[0]?.id, name: index[0]?.name, level: s.level, worlds: index.length, savedAt: index[0]?.saved_at };
  }, MARK);
  console.log(`continue: stood and saved ${JSON.stringify({ stood, saved })}`);
  expect(saved.id, 'SETUP: the save wrote no world').toBeTruthy();
  expect(Math.max(Math.abs(saved.at.x), Math.abs(saved.at.z)), 'SETUP: the save is not three chunks out').toBeGreaterThanOrEqual(FAR);

  // 3. Reload the tab: a plain visit. Every drawn frame of the new page is sampled from its first one.
  await page.addInitScript(() => {
    window.__bodySamples = [];
    const tick = () => {
      const s = window.useGameStore?.getState?.();
      const rb = s?.playerRigidBodyRef?.current;
      if (rb) {
        const t = rb.translation();
        window.__bodySamples.push([performance.now(), t.x, t.y, t.z, s.gameStarted ? 1 : 0]);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  // The boot's attempt at the world (game/worldBoot.js BOOT_ATTEMPT_KEY): the reload's boot leaves one before the first
  // render, and the world's first frame takes it back (systems/BootSettle.jsx, mounted in GameScene). If it were never
  // taken back, the next plain visit would hold this world on the title. Every write and removal of it is recorded.
  await page.addInitScript(() => {
    window.__attemptLog = [];
    const proto = Storage.prototype;
    const set = proto.setItem;
    const remove = proto.removeItem;
    proto.setItem = function setItem(k, v) {
      if (k === 'crafty.bootAttempt' && this === window.sessionStorage) window.__attemptLog.push(['set', String(v)]);
      return set.call(this, k, v);
    };
    proto.removeItem = function removeItem(k) {
      if (k === 'crafty.bootAttempt' && this === window.sessionStorage) window.__attemptLog.push(['remove']);
      return remove.call(this, k);
    };
  });
  await page.reload();
  await page.waitForFunction(
    () => typeof window.useGameStore === 'function' && !!window.__craftyTest && typeof window.__craftyTest.ready === 'function' && window.__craftyTest.ready(),
    null, { timeout: 60000 },
  ).catch((e) => { throw new Error(`SETUP: the reloaded page never came up (store + test bridge) — ${e.message}`); });

  // 4. The title continues the saved world.
  const cont = page.getByTestId('title-continue');
  await expect(cont, `the title offers no Continue after the reload: ${JSON.stringify(await page.evaluate(gates))}`).toBeVisible({ timeout: 30000 });
  const meta = await page.getByTestId('title-continue-meta').textContent();
  expect(meta, 'the Continue caption does not name the world').toContain(saved.name);
  expect(meta, 'the Continue caption does not say its level').toContain(`Level ${saved.level}`);
  await expect(page.getByTestId('title-new-world'), 'no New World beside Continue').toBeVisible();
  expect(await page.evaluate(() => window.useGameStore.getState().coins), 'the reload did not load the saved world').toBe(MARK);
  await cont.click({ trial: true }); // visible and stable: the title's entrance tweens have finished
  await page.screenshot({ path: `${SHOTS}/title-with-save.png` });

  // 5. Continue, as a player does once it shows, whether or not the world behind the title has finished building. The click
  // locks the pointer, as a player's does.
  await cont.click();
  expect(await page.evaluate(() => window.useGameStore.getState().gameStarted), 'Continue did not start play').toBe(true);
  console.log(`continue: after the click ${JSON.stringify(await page.evaluate(gates))}`);
  await startPlayActive(page); // a headless page may refuse the pointer: hold the input gate the way a lock would

  // 6. The boot stands the body at the save once that column's ground is in (the subject, not a precondition), then
  // FRAMES_AFTER_ARRIVAL drawn frames of play.
  const arrived = await page.waitForFunction((at) => {
    const s = window.useGameStore.getState();
    const t = s.playerRigidBodyRef?.current?.translation();
    return !!t && s.resumeSpawn === null && Math.hypot(t.x - at.x, t.z - at.z) < 1.5;
  }, saved.at, { timeout: 180000 }).then(() => true, () => false);
  expect(arrived, `the boot never stood the player at the save: ${JSON.stringify(await page.evaluate(gates))}`).toBe(true);
  const t0 = await page.evaluate(() => performance.now());
  await page.waitForFunction(({ t0, n }) => window.__bodySamples.filter((row) => row[0] >= t0).length >= n,
    { t0, n: FRAMES_AFTER_ARRIVAL }, { timeout: 180000 }).catch(() => {}); // a short count fails below, as SETUP

  const r = await page.evaluate(({ at, t0, id }) => {
    const rows = window.__bodySamples;
    const near = (row) => Math.hypot(row[1] - at.x, row[3] - at.z) < 1.5;
    const first = rows.findIndex(near);
    const atCol = first < 0 ? [] : rows.slice(first).filter(near);
    const low = atCol.reduce((m, row) => (row[2] < m[2] ? row : m), atCol[0] || [0, 0, Infinity, 0]);
    const left = first < 0 ? [] : rows.slice(first).filter((row) => !near(row));
    const blob = JSON.parse(localStorage.getItem(`crafty_world_save_${id}`) || 'null');
    return {
      samples: rows.length, atColumn: atCol.length, afterArrival: rows.filter((row) => row[0] >= t0).length,
      minY: low[2], minAt: low[0], leftColumn: left.length, last: rows.at(-1), slot: blob?.player_data?.position ?? null, slotSavedAt: blob?.saved_at,
      worlds: JSON.parse(localStorage.getItem('crafty_world_saves') || '[]').length,
      attempt: { log: window.__attemptLog, left: sessionStorage.getItem('crafty.bootAttempt') },
    };
  }, { at: saved.at, t0, id: saved.id });
  console.log(`continue: after the reload ${JSON.stringify({ ...r, saved: saved.at, pageErrors })}`);
  const why = JSON.stringify({ ...r, saved: saved.at, gates: await page.evaluate(gates) });
  // CI's software renderer draws this page at 0.4 to 1.3 frames a second (control runs 41157054333, 41158525305), and the
  // body moves only on a drawn frame, so the window after the arrival is counted in frames, not seconds.
  expect(r.afterArrival, `SETUP: fewer than ${FRAMES_AFTER_ARRIVAL} frames drawn after the arrival: ${why}`).toBeGreaterThanOrEqual(FRAMES_AFTER_ARRIVAL);
  expect(r.atColumn, `the body was never sampled at the save's column: ${why}`).toBeGreaterThan(0);
  expect(r.minY, `the body dropped more than 1 m under the saved height at the save's column: ${why}`).toBeGreaterThanOrEqual(saved.at.y - 1);
  expect(Math.hypot(r.last[1] - saved.at.x, r.last[3] - saved.at.z), `the player did not stay at the save: ${why}`).toBeLessThan(1.5);
  expect(r.leftColumn, `the body left the save's column (a fall through the world comes back at the origin): ${why}`).toBe(0);
  expect(r.slotSavedAt, `no autosave ran after Continue (the slot cannot show what one writes): ${why}`).not.toBe(saved.savedAt);
  expect(r.slot && Math.hypot(r.slot.x - saved.at.x, r.slot.z - saved.at.z), `the autosave after Continue wrote another place: ${why}`).toBeLessThan(1.5);
  expect(r.slot && Math.abs(r.slot.y - saved.at.y), `the autosave after Continue wrote another height: ${why}`).toBeLessThan(1);
  expect(r.worlds, `the visit minted another slot: ${why}`).toBe(saved.worlds);
  expect(r.attempt.log[0], `the reload's boot left no attempt at the world before it mounted: ${why}`)
    .toEqual(['set', JSON.stringify({ world: saved.id })]);
  expect(r.attempt.left, `the world ran and its boot's attempt was not taken back, so the next visit would hold it: ${why}`).toBeNull();
  // A refused pointer lock is the headless browser's answer to the click, not the game's throw.
  expect(pageErrors.filter((e) => !/pointer ?lock/i.test(e)), 'the page threw').toEqual([]);
});
