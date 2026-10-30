import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';

// THE HUD AT REST, in a browser (the HUD lane's task script, A2; OPEN_ITEMS:OI-55). jsdom has no layout, so
// tests/gates/hud-at-rest-gates.test.jsx can say what renders and never where; this reads the rects.
//   desktop 1280x800: no side rail; a real grantXP widens the hotbar's XP edge to the share the store holds; the music's
//     hostile count (written by SpawnerSystem from the live mob query, the mirror being gone) matches the ECS.
//   1280x800, both iPad sizes, a phone upright (390x844) and on its side (844x390), with ember and coins banked: the
//     vitals, the hotbar and its XP edge, the quest line, the compass, the objective line, the minimap, the dial, the gear
//     and the coin count, and on touch the joystick's ring and each of the eight buttons the touch layer draws at rest
//     (Pause, the action, cast, dodge and jump, the tray, the Aspect and spell openers). Four states, every pair read in
//     each: at rest; a target nameplate up (a brute along the camera's facing, frozen by a hitstop as it spawns, named
//     by the real aim cone); the nameplate and the boss bar together (the dragon woken far off); the boss bar alone (the
//     brute killed). With the nameplate up, the one the cone named is raised again if something clears it while the read
//     waits, and the log says so. Each state's rects are read in one page task. On the phones every touch target lies
//     inside the viewport.
//   iPad 820x1180: a finger's tap on the quest line opens the list (the touch layer leaves the tracker its taps).
// NOT CHECKED: a toast's place (tests/e2e/dusk-warning.spec.js), the level-up banner, the touch tray or a fan opened,
// the panels, a phone shorter than 390 px on its side (Safari's toolbars), and anything after the first minute of play.

const RECT_IDS = ['stat-health', 'stat-mana', 'ember-bar', 'hotbar', 'hotbar-xp-row', 'quest-tracker', 'hud-compass',
  'objective-tracker', 'radial-minimap', 'day-phase-dial', 'hud-settings', 'coin-readout'];

const TOUCH_AT_REST = ['touch-joystick', 'touch-pause', 'touch-action', 'touch-cast', 'touch-dodge', 'touch-jump', 'touch-panels',
  'touch-aspects', 'touch-spells'];

/** In the page, in ONE task once every `extra` element is on screen: the HUD rects for `ids` and, on touch, the touch
 *  controls a player sees at rest (the joystick's ring and every hit target the touch layer draws; the full-screen
 *  tap-to-play is not one: it shows only before play). One task, so nothing comes or goes between one rect and the
 *  next. `plate`: the nameplate the real aim cone raised (window.__hudPlate) is raised again whenever something has
 *  cleared it while the reader waits, and the reader says how often (the first draft read the nameplate and the boss
 *  bar in separate calls, and on 1180x820 and 1280x800 the nameplate was gone by the time the dragon's bar was up: CI
 *  runs 40982943803 and 40986921601, shard 4). */
async function readPage({ ids, extra, touch, plate }) {
  const t0 = performance.now();
  let reraised = 0;
  const present = () => extra.every((id) => document.querySelector(`[data-testid="${id}"]`));
  while (!present() && performance.now() - t0 < 5000) {
    if (plate && !window.useGameStore.getState().targetEntity && window.__hudPlate) {
      window.useGameStore.setState({ targetEntity: window.__hudPlate });
      reraised += 1;
    }
    await new Promise((r) => setTimeout(r, 16));
  }
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height }; };
  const hud = ids.map((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    return el ? { id, ...box(el) } : { id, missing: true };
  });
  const controls = touch ? [...document.querySelectorAll('[data-touch-zone="joystick"], [data-touch-btn]')].map((el) => {
    const cs = getComputedStyle(el);
    const b = box(el);
    return { id: el.getAttribute('data-testid') || (el.hasAttribute('data-touch-zone') ? 'touch-joystick' : el.getAttribute('aria-label')),
      ...b, shown: b.w > 0 && b.h > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' };
  }).filter((t) => t.shown && t.id !== 'touch-tap-to-play') : [];
  return { hud, controls, reraised };
}

const intersects = (a, b) => !(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y);
const pairs = (list) => {
  const out = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (intersects(list[i], list[j])) out.push(`${list[i].id} x ${list[j].id}`);
  return out;
};

/** Enter play and wait until the HUD's vitals are on screen (forcePlay re-asserted, as hud-layout.spec.js does). */
async function enterPlayWithHud(page, touch) {
  await bootDev(page);
  await page.waitForFunction(() => window.useGameStore.getState().isSpawnChunkLoaded === true, null, { timeout: 90000 })
    .catch((e) => { throw new Error(`SETUP: the world never built — ${e.message}`); });
  if (!touch) await startPlayActive(page);
  let attached = false;
  for (let i = 0; i < 25 && !attached; i++) {
    await page.evaluate(() => window.__craftyTest.call('forcePlay'));
    await page.waitForTimeout(600);
    attached = await page.evaluate(() => !!document.querySelector('[data-testid="stat-health"]'));
  }
  if (!attached) throw new Error('SETUP: the in-game HUD never mounted after forcePlay');
  // The ember bar shows only with ember banked (ui/EmberBar.jsx) and the coin count only with coins (HUD.jsx
  // CoinReadout); bank both, so the layout read includes them.
  await page.evaluate(() => { window.useGameStore.setState({ ember: 25 }); window.useGameStore.getState().addCoins(120); });
  await page.waitForTimeout(1500); // the compass, the dial and the minimap draw on their first ticks
}

test.describe('desktop 1280x800', () => {
  test('no side rail; the XP edge tracks the store; the hostile count reads the live mobs', async ({ page }) => {
    test.setTimeout(240000);
    await enterPlayWithHud(page, false);

    const rail = await page.evaluate(() => [...document.querySelectorAll('button')]
      .filter((b) => ['Inventory', 'Magic', 'Building tools'].includes(b.getAttribute('aria-label')) && b.getBoundingClientRect().width > 0)
      .map((b) => b.getAttribute('aria-label')));
    expect(await page.locator('[data-testid="hud-settings"]').count(), 'SETUP: the HUD top row is not on screen').toBe(1);
    expect(rail, 'a panel rail button is on screen').toEqual([]);

    const edge = () => page.evaluate(() => {
      const fill = document.querySelector('[data-testid="hotbar-xp"]');
      const s = window.useGameStore.getState();
      const xp = s.getPlayerXP();
      return { fill: fill ? fill.getBoundingClientRect().width / fill.parentElement.getBoundingClientRect().width : null,
        level: document.querySelector('[data-testid="hotbar-level"]')?.textContent, xp };
    });
    const before = await edge();
    expect(before.fill, 'SETUP: no XP edge on the hotbar').not.toBeNull();
    expect(before.level).toBe(`Lv ${before.xp.level}`);
    // A real grant through the store's own action, to about half the level, then the edge must have widened to the share.
    await page.evaluate(() => {
      const s = window.useGameStore.getState();
      const xp = s.getPlayerXP();
      s.grantXP(Math.max(1, Math.floor(xp.required / 2) - xp.current), 'e2e');
    });
    await page.waitForTimeout(700);
    const after = await edge();
    const want = after.xp.current / after.xp.required;
    expect(after.xp.level, `SETUP: the grant crossed a level (${JSON.stringify({ before, after })})`).toBe(before.xp.level);
    expect(after.fill, `the XP edge did not widen after a grant: ${JSON.stringify({ before, after })}`).toBeGreaterThan(before.fill);
    expect(Math.abs(after.fill - want), `the XP edge reads ${after.fill}, the store ${want}`).toBeLessThan(0.03);

    // The hostile count the music reads, against the ECS itself (readMobs), polled while both settle.
    let last = null;
    await expect.poll(async () => {
      last = await page.evaluate(() => ({
        store: window.useGameStore.getState().activeHostilesCount,
        ecs: window.__craftyTest.call('readMobs').filter((m) => m.health > 0 && !m.passive).length,
      }));
      return last.ecs > 0 && last.store === last.ecs;
    }, { timeout: 20000, message: 'the store\'s hostile count never matched the live mobs' }).toBe(true);
    console.log(`hud-at-rest: hostiles ${JSON.stringify(last)}; xp edge ${before.fill.toFixed(3)} -> ${after.fill.toFixed(3)}`);
  });
});

/** The HUD rects (with `extra`: the nameplate, the boss bar) and, on touch, the touch controls, read together
 *  (readPage): [seen, missing, reraised]. */
async function layout(page, touch, extra = [], { plate = false } = {}) {
  const { hud, controls, reraised } = await page.evaluate(readPage, { ids: [...RECT_IDS, ...extra], extra, touch, plate });
  const missing = hud.filter((r) => r.missing || !(r.w > 0 && r.h > 0)).map((r) => r.id);
  const seen = hud.filter((r) => !r.missing && r.w > 0 && r.h > 0);
  if (touch) missing.push(...TOUCH_AT_REST.filter((id) => !controls.some((c) => c.id === id)));
  return { seen: [...seen, ...controls], missing, reraised };
}
const fmt = (list) => JSON.stringify(list.map((r) => [r.id, Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h)]));

/** Put a living brute 2.5 m along the camera's facing (every other hostile within 24 m killed first) and hold the
 *  world with a hitstop in the same call, so it cannot walk out of the aim cone first (on 390x844 it did: CI run
 *  40986921601); then wait for the real aim cone to name it, and keep what it named (window.__hudPlate). Three
 *  spawns at most, for a spawn the floor refuses. */
async function raiseTarget(page) {
  let last = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.evaluate((m) => {
      const s = window.useGameStore.getState();
      const cam = window.__threeCamera;
      for (const mob of window.__craftyTest.call('readMobs')) {
        if (!mob.passive && Math.hypot(mob.x - cam.position.x, mob.z - cam.position.z) < 24) window.GameMethods.damageMob(mob.id, 99999, 'physical', 'ally');
      }
      const d = new cam.position.constructor();
      cam.getWorldDirection(d); d.y = 0; d.normalize();
      const gx = cam.position.x + d.x * m, gz = cam.position.z + d.z * m;
      const before = new Set(window.__craftyTest.call('readMobs').map((mob) => mob.id));
      s.spawnMob(gx, gz, 'moss_brute', s.getMobFloor ? s.getMobFloor(gx, gz, cam.position.y - 1.6) : null);
      s.triggerHitstop(120000);
      window.__hudBrute = window.__craftyTest.call('readMobs').find((mob) => !before.has(mob.id))?.id ?? null;
    }, 2.5 + attempt * 0.5);
    const up = await page.waitForFunction(() => {
      const t = window.useGameStore.getState().targetEntity;
      if (!t || !document.querySelector('[data-testid="target-frame"]')) return null;
      window.__hudPlate = t;
      return { brute: window.__hudBrute, target: t.id, name: t.name };
    }, null, { timeout: 8000, polling: 50 }).then((h) => h.jsonValue(), () => null);
    if (up) return up;
    last = await page.evaluate(() => ({ brute: window.__hudBrute, target: window.useGameStore.getState().targetEntity?.id ?? null }));
  }
  throw new Error(`SETUP: no nameplate rose for a brute in three spawns: ${JSON.stringify(last)}`);
}

for (const vp of [
  { name: 'desktop 1280x800', viewport: { width: 1280, height: 800 }, touch: false },
  { name: 'iPad 1180x820', viewport: { width: 1180, height: 820 }, touch: true },
  { name: 'iPad 820x1180', viewport: { width: 820, height: 1180 }, touch: true },
  { name: 'phone 390x844', viewport: { width: 390, height: 844 }, touch: true, mobile: true },
  { name: 'phone on its side 844x390', viewport: { width: 844, height: 390 }, touch: true, mobile: true },
]) {
  test.describe(vp.name, () => {
    test.use({ viewport: vp.viewport, hasTouch: vp.touch, isMobile: !!vp.mobile });
    test('the HUD and the touch controls at rest, with a nameplate, with the boss bar, and both: no two intersect', async ({ page }) => {
      test.setTimeout(240000);
      await enterPlayWithHud(page, vp.touch);
      const check = async (state, extra, opts) => {
        const { seen, missing, reraised } = await layout(page, vp.touch, extra, opts);
        console.log(`hud-at-rest ${vp.name} ${state}: ${seen.length} rects ${fmt(seen)}${reraised ? `; the nameplate raised again ${reraised}x` : ''}`);
        expect(missing, `SETUP: HUD elements or touch controls not on screen at ${vp.name}, ${state}`).toEqual([]);
        expect(pairs(seen), `HUD elements or touch controls overlap at ${vp.name}, ${state}`).toEqual([]);
        if (vp.mobile) {
          const slots = await page.evaluate(() => [...document.querySelectorAll('[data-hotbar-block]')].map((el) => {
            const r = el.getBoundingClientRect();
            return { id: el.getAttribute('data-hotbar-block'), x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
          }).filter((t) => t.w > 0 && t.h > 0));
          const { width: vw, height: vh } = vp.viewport;
          expect(slots.length, 'SETUP: the hotbar slots are not on screen').toBeGreaterThanOrEqual(9);
          const targets = [...seen.filter((r) => r.id.startsWith('touch-') || r.id === 'hud-settings' || r.id === 'quest-tracker'), ...slots];
          expect(targets.filter((t) => t.x < -0.5 || t.y < -0.5 || t.right > vw + 0.5 || t.bottom > vh + 0.5).map((t) => t.id),
            `a touch target lies outside the viewport at ${vp.name}`).toEqual([]);
          expect(pairs([...seen.filter((r) => r.id.startsWith('touch-')), ...slots]), `a touch control overlaps a hotbar slot at ${vp.name}`).toEqual([]);
        }
      };
      await check('at rest', []);

      const named = await raiseTarget(page);
      console.log(`hud-at-rest ${vp.name}: the aim cone named ${JSON.stringify(named)}`);
      await check('with a nameplate', ['target-frame'], { plate: true });

      const woke = await page.evaluate(() => {
        const s = window.useGameStore.getState();
        if (typeof s.forceBossSpawn !== 'function') return false;
        const p = window.__threeCamera.position;
        s.forceBossSpawn([p.x + 120, p.y + 60, p.z + 120]);
        return true;
      });
      expect(woke, 'SETUP: no forceBossSpawn on the dev store').toBe(true);
      await expect(page.locator('[data-testid="boss-health-bar"]'), 'SETUP: the boss bar never showed').toHaveCount(1, { timeout: 10000 });
      await check('with the nameplate and the boss bar', ['target-frame', 'boss-health-bar'], { plate: true });

      await page.evaluate(() => { window.__hudPlate = null; window.GameMethods.damageMob(window.__hudBrute, 99999, 'physical', 'ally'); });
      await expect(page.locator('[data-testid="target-frame"]'), 'SETUP: the nameplate stayed up after the brute died').toHaveCount(0, { timeout: 10000 });
      await check('with the boss bar alone', ['boss-health-bar']);
    });
  });
}

test.describe('iPad 820x1180, a finger on the quest line', () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true });
  test('a tap on the one-line tracker opens the quest list', async ({ page }) => {
    test.setTimeout(240000);
    await enterPlayWithHud(page, true);
    const line = page.locator('[data-testid="quest-tracker-line"]');
    await expect(line, 'SETUP: the quest line rests closed').toHaveAttribute('aria-expanded', 'false');
    await line.tap({ timeout: 30000 });
    // The subject and its gates together: what the finger landed on, and whether the touch layer was live.
    const state = async () => page.evaluate(() => {
      const el = document.querySelector('[data-testid="quest-tracker-line"]');
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { expanded: el.getAttribute('aria-expanded'), list: !!document.querySelector('[data-testid="quest-tracker-list"]'),
        hitIsLine: !!hit && el.contains(hit), active: window.__craftyTest.call('readIntents').active };
    });
    let last = null;
    await expect.poll(async () => { last = await state(); return last.expanded === 'true' && last.list; },
      { timeout: 5000, message: `the tap did not open the list: ${JSON.stringify(last)}` }).toBe(true);
    console.log(`hud-at-rest tracker tap: ${JSON.stringify(last)}`);
  });
});
