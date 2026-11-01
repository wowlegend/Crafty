import { test, expect } from './_fixtures.js';
import { bootDev } from './_boot.js';

// THE LOOKBOOK SEAM AND THE DIAGNOSTICS READOUT, IN THE RUNNING GAME (plan docs/superpowers/plans/
// 2026-10-27-crafty-instruments.md). The unit gates drive the seam (tests/gates/lookbook-seam-gates) and the readout's
// lines and listener (tests/gates/diagnostics-readout-gates) against the real modules. What only the running game can
// show, and this spec asserts:
//
//   1. the seam is ABSENT without ?lookbook=1 and PRESENT with it — index.jsx really installs it, and only then;
//   2. pose() moves the LIVE R3F camera and keeps it there across frames — the Player useFrame applies it and returns
//      before the follow-cam can pull it back — and the first-person hands unmount while posed (counted in the
//      viewmodel scene, info().handNodes);
//      clear() hands the camera back to the player rig;
//   2b. the eye level the probe shoots from: stand() moves the LIVE body, look() turns the LIVE camera and the Player rig
//      leaves it facing that way frame after frame, and clearHostiles() removes a hostile spawned beside the player
//      through the real ECS (index.jsx hands the seam ecs.remove and the mob query), counting no kill;
//   3. setCycle(0.75) puts the sun below the horizon and setCycle(0.30) brings it back (Atmosphere reads the store's
//      gameTime: the seam's dawn-origin conversion is right in the running sky, not only in arithmetic);
//   4. F3 shows the readout with the tier, the dpr IN FORCE (equal to the live renderer's pixel ratio), the frame cap
//      and the GPU string (equal to the live renderer's), and a REAL WEBGL_lose_context.loseContext() on the game canvas
//      moves both the seam's count and the readout's to 1 — GameScene's onCreated really wired watchContextLoss.
//
// This runs on the DEV server (port 4179) because every e2e here does; the seam is not DEV-gated, so the same code
// path runs in production. The lookbook probe (scripts/visual/lookbook.mjs) is the production-build user.
//
// Mutation-Proof: PENDING — no mutant has been run against this spec yet. The instruments lane that wrote it may not
// start a browser; the command session runs it and this batch via scripts/dev/mutate-e2e.sh, then replaces this line:
//   E1 the Player's pose branch deleted (Components.jsx) -> "the camera did not move to the pose"
//   E2 plausible-wrong: the pose applied but no early return -> "the pose did not HOLD"
//   E3 the index.jsx install deleted -> "the seam is missing with ?lookbook=1"
//   E4 GameScene's watchContextLoss call deleted -> "the seam did not count a real context loss"
//   E5 plausible-wrong: FrameStats not handed capActive -> "the readout's frame cap disagrees with the store"
//   E6 the hands not hidden while posed -> "the hands stayed mounted while posed"
//   E7 BossEntity ignores the lookbook hold -> "the held dragon moved"
//   E8 GameScene mounts no dragon (the LazyDragon line deleted) -> "never mounted its group in the live scene"
//   plus an identity mutant (a comment edit in render/lookbookSeam.js) that must SURVIVE.
//
// BLIND SPOT: this is Chromium on the DEV server with the CI software renderer. Whether the probe gets a REAL GPU, and
// what WebKit does, is the probe's own JSON (it records the renderer per shot) — not a gate.

const DEFAULT_WORLD_TIMEOUT_MS = 90000;
const WORLD_TIMEOUT_MS = Number(process.env.E2E_WORLD_TIMEOUT) > 0 ? Number(process.env.E2E_WORLD_TIMEOUT) : DEFAULT_WORLD_TIMEOUT_MS;
const HEARTH = { position: [13, 81, 13], lookAt: [0, 51, 0] };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const offBearing = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };

test('lookbook seam: absent without the parameter; pose pins the live camera, setCycle moves the sun, Show Stats reads the live renderer and counts a real context loss', async ({ page }) => {
  test.setTimeout(WORLD_TIMEOUT_MS + 150000);

  // 1. Closed without the parameter.
  await bootDev(page);
  expect(await page.evaluate(() => typeof window.__craftyLookbook), 'the seam is installed WITHOUT ?lookbook=1').toBe('undefined');

  // ...and open with it. The store and bridge coming up is a precondition; the seam itself is the subject.
  await page.goto('/?lookbook=1');
  try {
    await page.waitForFunction(() => typeof window.useGameStore === 'function' && window.__craftyTest?.ready?.(), null, { timeout: 30000 });
  } catch (e) {
    throw new Error(`SETUP: the dev app never came up with ?lookbook=1 — ${e.message}`);
  }
  expect(await page.evaluate(() => typeof window.__craftyLookbook?.pose), 'the seam is missing with ?lookbook=1').toBe('function');

  try {
    await page.waitForFunction(() => window.useGameStore.getState().isSpawnChunkLoaded === true, null, { timeout: WORLD_TIMEOUT_MS });
  } catch (e) {
    throw new Error(`SETUP: the world never built (isSpawnChunkLoaded) within ${WORLD_TIMEOUT_MS} ms — ${e.message}`);
  }
  // Input live through the seam, HELD past the world-ready pointer-lock refusal (tests/e2e/_boot.js startPlayActive).
  let held = 0;
  for (let i = 0; i < 40 && held < 2; i++) {
    const live = await page.evaluate(() => window.__craftyLookbook.info().active === true);
    if (live) held += 1;
    else { held = 0; await page.evaluate(() => window.__craftyLookbook.play()); }
    await page.waitForTimeout(250);
  }
  expect(held, 'SETUP: the seam\'s play() never held the input gate live').toBeGreaterThanOrEqual(2);

  // 2. The pose pins the live camera and holds; the hands unmount; clear() hands it back. The hands live in the
  // viewmodel scene (render/viewmodel.js), so they are counted there through the seam, not on the camera.
  const cam = () => page.evaluate(() => {
    const c = window.__threeCamera;
    return { p: c.position.toArray(), nodes: window.__craftyLookbook.info().handNodes };
  });
  const free = await cam();
  expect(free.nodes, `SETUP: no hands mounted before the pose, so their leaving cannot be seen: ${JSON.stringify(free)}`).toBeGreaterThan(0);
  await page.evaluate((p) => window.__craftyLookbook.pose(p), HEARTH);
  await page.waitForTimeout(800);
  const posed = await cam();
  expect(dist(posed.p, HEARTH.position), `the camera did not move to the pose: ${JSON.stringify({ free, posed })}`).toBeLessThan(0.01);
  await page.waitForTimeout(1200);
  const later = await cam();
  expect(dist(later.p, HEARTH.position), `the pose did not HOLD — the follow-cam pulled it back: ${JSON.stringify({ posed, later })}`).toBeLessThan(0.01);
  expect(later.nodes, `the hands stayed mounted while posed (${free.nodes} nodes free, ${later.nodes} posed)`).toBe(0);

  await page.evaluate(() => window.__craftyLookbook.clear());
  await page.waitForTimeout(1200);
  const back = await cam();
  expect(dist(back.p, HEARTH.position), `clear() did not hand the camera back to the player: ${JSON.stringify(back)}`).toBeGreaterThan(5);
  // More than while posed, not equal to before: the held item can change the hands' node count between reads.
  expect(back.nodes, `the hands did not come back after clear() (${later.nodes} posed, ${back.nodes} after)`).toBeGreaterThan(later.nodes);

  // 2b. The eye level. Four metres due south of where the body rests is open plains (scripts/visual/_lookbook.mjs,
  // the walking clips' bearing), so the stand lands on ground, not inside a tree.
  const lb = (verb, arg) => page.evaluate(([v, a]) => window.__craftyLookbook[v](a), [verb, arg]);
  const home = (await lb('info')).body;
  expect(home, 'SETUP: the seam reads no player body').not.toBeNull();
  const spot = [home[0], home[1] + 0.5, home[2] + 4];
  await lb('stand', { position: spot });
  await page.waitForTimeout(1000);
  const stood = await lb('info');
  expect(flat(stood.body, spot), `stand() did not move the live body: ${JSON.stringify({ home, spot, body: stood.body })}`).toBeLessThan(0.25);
  for (const heading of [90, 270]) {
    await lb('look', { heading, pitch: 0 });
    await page.waitForTimeout(800);
    const h = (await lb('info')).heading;
    expect(offBearing(h, heading), `look() faced ${heading} and the camera faces ${h} 800 ms later: the Player rig turned it`).toBeLessThan(1);
  }
  const spawned = await page.evaluate(() => {
    const s = window.useGameStore.getState();
    const cam = window.__threeCamera;
    const x = cam.position.x + 2, z = cam.position.z;
    const before = new Set(window.__craftyTest.call('readMobs').map((m) => m.id));
    s.spawnMob(x, z, 'zombie', s.getMobFloor ? s.getMobFloor(x, z, cam.position.y - 1.6) : null);
    const added = window.__craftyTest.call('readMobs').filter((m) => !before.has(m.id));
    return added.length === 1 ? added[0].id : null;
  });
  expect(spawned, 'SETUP: spawnMob did not add exactly one zombie beside the player').not.toBeNull();
  const near = (await lb('info')).hostiles;
  expect(near?.nearestM, `SETUP: the seam does not see the zombie spawned 2 m away: ${JSON.stringify(near)}`).toBeLessThan(4);
  const xp = await page.evaluate(() => window.useGameStore.getState().totalXP);
  const cleared = await lb('clearHostiles', { radius: 12 });
  const left = await page.evaluate((id) => window.__craftyTest.call('readMobs').some((m) => m.id === id), spawned);
  expect(cleared, 'clearHostiles() removed nothing with a zombie 2 m away').toBeGreaterThanOrEqual(1);
  expect(left, 'clearHostiles() reported a removal but the zombie is still in the ECS').toBe(false);
  expect(await page.evaluate(() => window.useGameStore.getState().totalXP), 'clearing granted XP, as a kill does').toBe(xp);
  await lb('stand', { position: home });

  // 2c. The dragon (DECISIONS 2026-10-30 item 122): dragon() wakes it through the boss system's lookbook spawn (only on a
  // ?lookbook=1 page), its lazy chunk mounts the 'crafty:dragon-chunk' group in the live scene, and the hold keeps it
  // where it was woken. Released, it flies, so the hold is what kept it still. An unknown pose is refused by name.
  const dragonAt = [home[0] + 14, home[1] + 4, home[2]];
  const refused = await page.evaluate(() => {
    try { window.__craftyLookbook.dragon({ pose: 'cartwheel' }); return null; } catch (e) { return `${e.name}: ${e.message}`; }
  });
  expect(refused, 'an unknown dragon pose was not refused by name').toMatch(/TypeError: .*cartwheel/);
  expect(await page.evaluate(() => window.useGameStore.getState().bossActive), 'SETUP: a fight was already on').toBe(false);
  await lb('dragon', { pose: 'rest', position: dragonAt });
  const dragonGroup = () => page.evaluate(() => {
    const g = window.__threeScene?.getObjectByName('crafty:dragon-chunk');
    return g ? { at: g.children[0]?.position.toArray() ?? null } : null;
  });
  await page.waitForFunction(() => !!window.__threeScene?.getObjectByName('crafty:dragon-chunk'), null, { timeout: 30000 }).catch(() => {});
  const woke = await dragonGroup();
  expect(woke, `the dragon's chunk never mounted its group in the live scene: ${JSON.stringify((await lb('info')).dragon)}`).not.toBeNull();
  await page.waitForTimeout(1500);
  const heldDragon = await dragonGroup();
  expect(dist(heldDragon.at, dragonAt), `the held dragon moved: ${JSON.stringify({ dragonAt, heldDragon })}`).toBeLessThan(0.01);
  expect((await lb('info')).dragon).toMatchObject({ active: true, hold: 'rest' });
  await lb('dragon', { pose: null });
  await page.waitForTimeout(2000);
  const flying = await dragonGroup();
  expect(dist(flying.at, dragonAt), `released, the dragon did not move, so the hold read nothing: ${JSON.stringify(flying)}`).toBeGreaterThan(0.5);
  await page.evaluate(() => window.useGameStore.getState().suspendBossEncounter());

  // 3. The time of day, read back from the running sky.
  await page.evaluate(() => window.__craftyLookbook.setCycle(0.75));
  await page.waitForFunction(() => window.useGameStore.getState().sunAboveHorizon === false, null, { timeout: 15000 })
    .catch(() => {});
  const night = await page.evaluate(() => ({ sun: window.useGameStore.getState().sunAboveHorizon, cycle: window.__craftyLookbook.info().cycle }));
  expect(night.sun, `setCycle(0.75) — midnight — left the sun above the horizon: ${JSON.stringify(night)}`).toBe(false);
  await page.evaluate(() => window.__craftyLookbook.setCycle(0.30));
  await page.waitForFunction(() => window.useGameStore.getState().sunAboveHorizon === true, null, { timeout: 15000 })
    .catch(() => {});
  const day = await page.evaluate(() => ({ sun: window.useGameStore.getState().sunAboveHorizon, cycle: window.__craftyLookbook.info().cycle }));
  expect(day.sun, `setCycle(0.30) — early afternoon — left the sun below the horizon: ${JSON.stringify(day)}`).toBe(true);

  // 4. The readout, against the live renderer.
  const readout = async () => page.evaluate(() => document.querySelector('[data-testid="frame-stats"]')?.textContent ?? null);
  await page.keyboard.press('F3');
  await page.waitForTimeout(1500);
  const shown = await readout();
  const info = await page.evaluate(() => window.__craftyLookbook.info());
  expect(shown, 'the Show Stats readout is not on screen after F3').not.toBeNull();
  expect(info.gl, 'the seam has no tracked renderer — GameScene did not call trackRenderer').not.toBeNull();
  expect(shown, `the readout's first line: ${shown}`).toMatch(/^\d+ FPS drawn/);
  expect(shown, `the readout does not name the live renderer's pixel ratio (${info.gl.dpr}): ${shown}`).toContain(`DPR ${info.gl.dpr.toFixed(2)}`);
  expect(shown, `the readout does not name the live GPU (${info.gl.renderer}): ${shown}`).toContain(`GPU ${info.gl.renderer}`);
  const tierName = { low: 'Low', med: 'Medium', high: 'High' }[info.tier];
  expect(shown, `the readout's tier disagrees with the store (${info.tier}): ${shown}`).toContain(`Tier ${tierName}`);
  // In a DEV non-capture run the cap is in force exactly when frameCap > 0 (GameScene capActive).
  expect(shown, `the readout's frame cap disagrees with the store (frameCap ${info.frameCap}): ${shown}`)
    .toContain(info.frameCap > 0 ? `Frame cap ${info.frameCap} FPS` : 'Frame cap Unlimited');
  expect(shown, `a context loss was counted before any happened: ${shown}`).toContain('GL context losses 0');

  // A REAL context loss on the game canvas (the one whose size the tracked renderer reports).
  const lost = await page.evaluate(() => {
    const [w, h] = window.__craftyLookbook.info().gl.canvas;
    const canvas = [...document.querySelectorAll('canvas')].find((c) => c.width === w && c.height === h);
    const ctx = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
    const ext = ctx && ctx.getExtension('WEBGL_lose_context');
    if (!ext) return { ok: false, why: canvas ? 'no WEBGL_lose_context' : 'no canvas of the tracked size' };
    window.__lbLose = ext;
    ext.loseContext();
    return { ok: true };
  });
  expect(lost.ok, `SETUP: could not lose the context: ${lost.why}`).toBe(true);
  await page.waitForFunction(() => window.__craftyLookbook.info().contextLosses >= 1, null, { timeout: 10000 }).catch(() => {});
  const losses = await page.evaluate(() => window.__craftyLookbook.info().contextLosses);
  expect(losses, 'the seam did not count a real context loss — GameScene did not wire watchContextLoss').toBe(1);
  await page.evaluate(() => window.__lbLose.restoreContext());
  await page.waitForFunction(() => /GL context losses 1/.test(document.querySelector('[data-testid="frame-stats"]')?.textContent || ''), null, { timeout: 15000 })
    .catch(() => {});
  const after = await readout();
  expect(after, `the readout did not count the loss: ${after}`).toContain('GL context losses 1');
  await page.keyboard.press('F3');
});

// 5. night() (the W3-A task script's U0; DECISIONS 2026-11-01 (W3-A PR C) item 483): the First Night probe's one read of
// the night, from the live store in the production build. Each field it carries is the store's own, or null while the
// store holds no such field (the night's fields arrive with W3-A U1). Read-only: reading it writes nothing.
test('lookbook seam: night() reads the night from the live store and writes nothing', async ({ page }) => {
  await page.goto('/?lookbook=1');
  try {
    await page.waitForFunction(() => typeof window.useGameStore === 'function' && window.__craftyTest?.ready?.(), null, { timeout: 30000 });
  } catch (e) {
    throw new Error(`SETUP: the dev app never came up with ?lookbook=1 — ${e.message}`);
  }
  expect(await page.evaluate(() => typeof window.__craftyLookbook?.setCycle), 'SETUP: the seam is missing with ?lookbook=1').toBe('function');
  expect(await page.evaluate(() => typeof window.__craftyLookbook.night), 'the seam has no night()').toBe('function');
  const read = (cycle) => page.evaluate((c) => {
    window.__craftyLookbook.setCycle(c);
    const s = window.useGameStore.getState();
    const before = JSON.stringify(Object.keys(s).filter((k) => typeof s[k] !== 'function').map((k) => [k, s[k]]), (key, v) => (v instanceof Set ? [...v] : v));
    const n = window.__craftyLookbook.night();
    const after = window.useGameStore.getState();
    const same = before === JSON.stringify(Object.keys(after).filter((k) => typeof after[k] !== 'function').map((k) => [k, after[k]]), (key, v) => (v instanceof Set ? [...v] : v));
    const own = (k) => (after[k] === undefined ? null : after[k]);
    return {
      n, same,
      want: {
        gameTime: after.gameTime, isDay: after.isDay, nightCount: after.nightCount, alive: after.isAlive, health: after.playerHealth,
        maxHealth: after.maxHealth, ember: after.ember, hearthLit: own('hearthLit'), hearthFlame: own('hearthFlame'), siege: own('siege'),
        dawnRush: own('dawnRush'), lastNightfall: own('lastNightfall'), lastHurtAt: own('lastHurtAt'),
      },
    };
  }, cycle);
  for (const cycle of [0.75, 0.3]) {
    const { n, same, want } = await read(cycle);
    expect(n, `night() at cycle ${cycle} disagrees with the store: ${JSON.stringify({ n, want })}`).toMatchObject(want);
    expect(n.isDay, `presence: night() at cycle ${cycle} reads ${n.isDay ? 'day' : 'night'}`).toBe(cycle === 0.3);
    expect(same, `reading night() at cycle ${cycle} changed the store`).toBe(true);
  }
});
