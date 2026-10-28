import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';

// A CHEVRON FOR A WINDUP YOU CANNOT SEE (docs/superpowers/plans/2026-10-27-crafty-combat-stance.md, Task 7).
//
// src/game/windupChevrons.test.js proves which windups are off screen and where a chevron sits, and
// tests/gates/windup-chevrons-gates.test.jsx proves the layer writes the right node from the HUD ticker without a
// re-render. This drives the running game: the layer MOUNTED in the HUD, the real camera's projection, the world clock a
// windup is stamped on, and the chevron's rect against the HUD controls it must not cover.
//
// STAGING. The world is frozen (triggerHitstop(60000)), so the AI worker never ticks: a zombie neither winds up on its
// own nor strikes, and a planted windup (plantWindup, the perfect-dodge hook) holds. The spec then waits until wall
// time has run more than 2.5 s past the world clock: a layer that read performance.now() instead of worldNow() (C4)
// would then see a windup due 2 s out on the world clock as already expired, so C4 is killable here and nowhere else.
//
// CASES, in this order: (2) a zombie 2 m behind and NO windup: no chevron; (1) the same zombie with a planted windup:
// exactly one chevron, pointing behind, inside the viewport and clear of the hotbar, every [data-hud-interactive] and
// the compass; (3) a zombie 2.5 m ahead, in view, with a planted windup: no chevron; (4) the same zombie with the
// camera pitched UP until it leaves the frustum: one chevron at top-centre, clear of the compass. Case 4 is the one
// that can see the top inset (C6): case 1's chevron sits bottom-centre, far from the compass.
// The overlap test is a getBoundingClientRect intersection, not elementsFromPoint: the compass sits inside a
// pointer-events-none wrapper (HUD.jsx), which hit-testing skips, so a point test could never see it.
//
// WHAT THIS DOES NOT CHECK: touch layouts (tests/e2e/combat-touch.spec.js, Task 11); a windup that ramps (the frozen
// windup is due 2 s out, so its ramp stays 0; the ramp is unit-proven); more than one windup at once (unit-proven).
//
// Mutation-Proof: OWED (the Task 7 batch below, observed verdicts to be written here).
//   C1 src/HUD.jsx                   <WindupChevrons /> removed                            -> case 1
//   C2 src/game/windupChevrons.js    the off-screen predicate negated                      -> case 1 and case 3
//   C3 src/game/windupChevrons.js    always off screen                                     -> case 3
//   C4 src/ui/WindupChevrons.jsx     worldNow() -> performance.now()                       -> case 1 (reads expired)
//   C5 src/game/windupChevrons.js    the windupUntil > now test dropped                    -> case 2
//   C6 src/game/windupChevrons.js    TOP_INSET_PX = 40                                     -> case 4 (the compass)
//   C0 src/ui/WindupChevrons.jsx     a comment edit (identity)                             -> must SURVIVE

function installChevronHelpers() {
  const call = (n, ...a) => window.__craftyTest.call(n, ...a);
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const store = () => window.useGameStore.getState();
  const cam = () => window.__threeCamera;
  const fwdOf = (yaw) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });
  const AVOID = ['[data-hotbar-block]', '[data-hud-interactive]', '[data-testid="hud-compass"]'];
  const rectOf = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const meets = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  const H = {
    yaw: 0,
    setView(yaw, pitch = 0) {
      const c = cam();
      c.rotation.order = 'YXZ';
      c.rotation.y = yaw;
      c.rotation.x = pitch;
      c.updateMatrixWorld();
    },
    heal() { window.useGameStore.setState({ isAlive: true, playerHealth: store().maxHealth }); },
    killHostiles(r) {
      const c = cam().position;
      for (const m of call('readMobs')) {
        if (!m.passive && m.health > 0 && Math.hypot(m.x - c.x, m.z - c.z) < r) window.GameMethods.damageMob(m.id, 99999, 'physical', 'ally');
      }
    },
    floorAt(x, z) {
      const f = store().getMobFloor;
      const y = f ? f(x, z, cam().position.y + 3) : null;
      return Number.isFinite(y) ? y : null;
    },
    async frames(n) { for (let i = 0; i < n; i++) await frame(); },
    // Freeze the world, then wait until wall time has run > 2.5 s past the world clock (see the header).
    async freeze() {
      H.heal();
      store().setTimeOfDay?.(0.5);
      H.killHostiles(40);
      H.setView(H.yaw, 0);
      store().triggerHitstop(60000);
      const t0 = performance.now();
      while (performance.now() - call('worldNow') <= 2500 && performance.now() - t0 < 12000) await frame();
      const gap = performance.now() - call('worldNow');
      const left = store().hitstopUntil - performance.now();
      return { gap: Math.round(gap), left: Math.round(left) };
    },
    async spawn(where, dist) {
      H.heal();
      const c = cam().position, f = fwdOf(H.yaw), s = where === 'behind' ? -1 : 1;
      const x = c.x + f.x * dist * s, z = c.z + f.z * dist * s;
      const before = new Set(call('readMobs').map((m) => m.id));
      store().spawnMob(x, z, 'zombie', H.floorAt(x, z));
      await H.frames(3);
      const added = call('readMobs').filter((m) => !before.has(m.id));
      return added.length === 1 ? { id: added[0].id } : { why: `SETUP: spawnMob added ${added.length} mobs, not one` };
    },
    kill(id) { window.GameMethods.damageMob(id, 99999, 'physical', 'ally'); },
    plant(id, dueMs) { return call('plantWindup', id, dueMs); },
    project(id) {
      const m = call('readMobs').find((x) => x.id === id);
      if (!m) return null;
      // The layer judges the body's centre, not its base (game/windupChevrons.js): a husk's 1.6 m body, 0.8 m up.
      const v = cam().position.clone().set(m.x, m.y + 0.8, m.z).project(cam());
      return { x: +v.x.toFixed(3), y: +v.y.toFixed(3), z: +v.z.toFixed(3) };
    },
    chevrons() {
      const all = [...document.querySelectorAll('[data-testid="windup-chevron"]')];
      return { total: all.length, on: all.filter((n) => n.dataset.on === '1').map((n) => ({ angle: Number(n.dataset.angle), mob: n.dataset.mob, rect: rectOf(n) })) };
    },
    // Poll up to `maxFrames` frames until `want(chevrons())` holds; return the last reading and the frames spent.
    async waitChevrons(maxFrames, want) {
      let c = H.chevrons(), n = 0;
      while (!want(c) && n < maxFrames) { await frame(); n++; c = H.chevrons(); }
      return { ...c, frames: n };
    },
    // The HUD controls a chevron must not cover, with a count per selector (the denominator), against a rect.
    clearOf(rect) {
      const counts = {}, hits = [];
      for (const sel of AVOID) {
        const els = [...document.querySelectorAll(sel)].map(rectOf).filter((r) => r.w > 0 && r.h > 0);
        counts[sel] = els.length;
        for (const r of els) if (meets(rect, r)) hits.push({ sel, r });
      }
      const vw = window.innerWidth, vh = window.innerHeight;
      const inside = rect.l >= 0 && rect.t >= 0 && rect.r <= vw && rect.b <= vh;
      return { counts, hits, inside, vw, vh };
    },
    status(id) {
      const m = call('readMobs').find((x) => x.id === id), c = cam().position, st = store();
      return m ? { dist: +Math.hypot(m.x - c.x, m.z - c.z).toFixed(2), dy: +(m.y - c.y).toFixed(2), windup: Math.round(m.windupUntil - call('worldNow')),
        alive: st.isAlive, frozenFor: Math.round(st.hitstopUntil - performance.now()), pitch: +cam().rotation.x.toFixed(3) } : { mob: 'gone' };
    },
    thaw() { H.killHostiles(40); window.useGameStore.setState({ hitstopUntil: performance.now() }); },
  };
  window.__chevronSpec = H;
}

test.describe('windup chevron', () => {
  test.setTimeout(420000);

  test('a windup behind gets a chevron clear of the HUD; none for no windup or one in view; a pitched-up view gets one at the top', async ({ page }) => {
    await page.addInitScript(installChevronHelpers);
    await bootDev(page);
    await startPlayActive(page);
    await page.waitForFunction(() => window.__craftyTest?.call('readMobs') && window.__threeCamera && window.GameMethods?.damageMob
      && window.useGameStore.getState().spawnMob && window.useGameStore.getState().getMobFloor && window.__craftyTest.call('worldNow') > 0,
    null, { timeout: 60000 }).catch((e) => { throw new Error(`SETUP: the mob hooks, camera and spawner never came up — ${e.message}`); });
    await page.evaluate(async () => {
      // the HUD's first frames after play: the spawn grace, as perfect-dodge.spec waits it out
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      while (Date.now() - (window.useGameStore.getState()._spawnTime || 0) < 5500) await frame();
    });

    try {
      const fz = await page.evaluate(() => window.__chevronSpec.freeze());
      expect(fz.gap, `SETUP: wall time ran only ${fz.gap} ms past the world clock in 12 s of freeze — the freeze did not hold`).toBeGreaterThan(2500);
      expect(fz.left, `SETUP: the freeze has only ${fz.left} ms left`).toBeGreaterThan(20000);

      // CASE 2 (control, first): a zombie 2 m behind with NO windup — no chevron.
      const sp = await page.evaluate(() => window.__chevronSpec.spawn('behind', 2));
      expect(sp.why, sp.why).toBeUndefined();
      const none = await page.evaluate(() => window.__chevronSpec.waitChevrons(10, () => false));
      expect(none.total, 'the HUD has no chevron layer: no [data-testid="windup-chevron"] node at all').toBe(4);
      const st2 = await page.evaluate((id) => window.__chevronSpec.status(id), sp.id);
      expect(st2.windup, `SETUP: the control zombie is winding up on its own in a frozen world — ${JSON.stringify(st2)}`).toBeLessThanOrEqual(0);
      expect(none.on.length, `a zombie behind with NO windup got a chevron — ${JSON.stringify(none.on)} ${JSON.stringify(st2)}`).toBe(0);

      // CASE 1: the same zombie, a windup planted 2 s out on the world clock — exactly one chevron, pointing behind.
      const due = await page.evaluate((id) => window.__chevronSpec.plant(id, 2000), sp.id);
      expect(due, 'SETUP: plantWindup refused the zombie').toBeGreaterThan(1900);
      const one = await page.evaluate(() => window.__chevronSpec.waitChevrons(30, (c) => c.on.length > 0));
      const st1 = await page.evaluate((id) => window.__chevronSpec.status(id), sp.id);
      expect(one.on.length, `a windup 2 m behind got ${one.on.length} chevrons in ${one.frames} frames, not 1 — ${JSON.stringify(st1)}`).toBe(1);
      expect(Math.abs(one.on[0].angle), `the chevron for a windup behind points at ${one.on[0].angle} degrees`).toBeGreaterThanOrEqual(160);
      expect(one.on[0].mob).toBe(String(sp.id));
      const clear1 = await page.evaluate((r) => window.__chevronSpec.clearOf(r), one.on[0].rect);
      console.log(`windup-chevron: case 1 chevron at ${JSON.stringify(one.on[0].rect)}; checked against ${JSON.stringify(clear1.counts)}`);
      expect(clear1.counts['[data-hotbar-block]'], 'SETUP: no hotbar slot was on screen to check against').toBeGreaterThan(0);
      expect(clear1.counts['[data-testid="hud-compass"]'], 'the compass frame carries no data-testid="hud-compass"').toBe(1);
      expect(clear1.inside, `the chevron left the ${clear1.vw}x${clear1.vh} viewport — ${JSON.stringify(one.on[0].rect)}`).toBe(true);
      expect(clear1.hits, `the chevron covers a HUD control — ${JSON.stringify(clear1.hits)}`).toEqual([]);

      // CASE 3 (control): a zombie 2.5 m AHEAD, in view, with a planted windup — no chevron.
      await page.evaluate((id) => window.__chevronSpec.kill(id), sp.id);
      const gone = await page.evaluate(() => window.__chevronSpec.waitChevrons(30, (c) => c.on.length === 0));
      expect(gone.on.length, `a killed mob kept its chevron — ${JSON.stringify(gone.on)}`).toBe(0);
      const ah = await page.evaluate(() => window.__chevronSpec.spawn('ahead', 2.5));
      expect(ah.why, ah.why).toBeUndefined();
      // At level pitch a zombie 2.5 m ahead sits low in the frame (the eye is about 1.7 m over its feet), so the view
      // tips down a little to put it well inside the 0.94 on-screen band.
      const p3 = await page.evaluate(async (id) => { const H = window.__chevronSpec; H.setView(H.yaw, -0.25); await H.frames(2); return H.project(id); }, ah.id);
      expect(p3 && p3.z < 1 && Math.abs(p3.x) < 0.9 && Math.abs(p3.y) < 0.9, `SETUP: the zombie ahead is not on screen — ndc ${JSON.stringify(p3)}`).toBe(true);
      await page.evaluate((id) => window.__chevronSpec.plant(id, 2000), ah.id);
      const inView = await page.evaluate(() => window.__chevronSpec.waitChevrons(10, () => false));
      expect(inView.on.length, `a windup in view (ndc ${JSON.stringify(p3)}) got a chevron — ${JSON.stringify(inView.on)}`).toBe(0);

      // CASE 4: the same zombie, the camera pitched UP until it leaves the frustum — one chevron, top-centre.
      const pitched = await page.evaluate(async (id) => {
        const H = window.__chevronSpec;
        for (let p = 0.3; p <= 1.45; p += 0.05) {
          H.setView(H.yaw, p);
          const v = H.project(id);
          if (v && (v.z > 1 || Math.abs(v.y) > 1.1)) { await H.frames(2); return { pitch: +p.toFixed(2), ndc: H.project(id), held: +window.__threeCamera.rotation.x.toFixed(2) }; }
        }
        return null;
      }, ah.id);
      expect(pitched, 'SETUP: no pitch up to 1.45 rad took the zombie ahead out of the frustum').not.toBeNull();
      expect(Math.abs(pitched.held - pitched.pitch), `SETUP: the pitch did not hold (set ${pitched.pitch}, read ${pitched.held})`).toBeLessThan(0.02);
      const top = await page.evaluate(() => window.__chevronSpec.waitChevrons(30, (c) => c.on.length > 0));
      expect(top.on.length, `a windup above a pitched-up view (ndc ${JSON.stringify(pitched.ndc)}) got ${top.on.length} chevrons, not 1`).toBe(1);
      expect(Math.abs(top.on[0].angle), `the pitched-up chevron is not top-centre: ${top.on[0].angle} degrees`).toBeLessThanOrEqual(20);
      const clear4 = await page.evaluate((r) => window.__chevronSpec.clearOf(r), top.on[0].rect);
      console.log(`windup-chevron: case 4 chevron at ${JSON.stringify(top.on[0].rect)} (pitch ${pitched.pitch})`);
      expect(clear4.inside, `the top chevron left the viewport — ${JSON.stringify(top.on[0].rect)}`).toBe(true);
      expect(clear4.hits.filter((h) => h.sel === '[data-testid="hud-compass"]'), `the top chevron covers the compass — ${JSON.stringify(clear4.hits)}`).toEqual([]);
      expect(clear4.hits, `the top chevron covers a HUD control — ${JSON.stringify(clear4.hits)}`).toEqual([]);
    } finally {
      await page.evaluate(() => { window.__chevronSpec?.setView(window.__chevronSpec.yaw, 0); window.__chevronSpec?.thaw(); }).catch(() => {});
    }
  });
});
