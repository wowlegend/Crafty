import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';

// THE HUD AT REST, in a browser (the HUD lane's task script, A2; OPEN_ITEMS:OI-55). jsdom has no layout, so
// tests/gates/hud-at-rest-gates.test.jsx can say what renders and never where; this reads the rects.
//   desktop 1280x800: no side rail; a real grantXP widens the hotbar's XP edge to the share the store holds; the music's
//     hostile count (written by SpawnerSystem from the live mob query, the mirror being gone) matches the ECS.
//   1280x800 and both iPad sizes, with coins granted: the vitals, the hotbar and its XP edge, the quest line, the
//     compass, the objective line, the minimap, the dial, the gear and the coin count, and on the iPads every touch
//     control a player can see at rest (the joystick's ring and each of the touch layer's buttons: Pause, the action,
//     cast, dodge and jump, the tray, the Aspect and spell openers): no two intersect.
//   iPad 820x1180: a finger's tap on the quest line opens the list (the touch layer leaves the tracker its taps).
//   390x844 touch: the same HUD rects and touch controls, no two intersecting; every touch target inside the viewport.
// NOT CHECKED: a toast's place (tests/e2e/dusk-warning.spec.js), the touch tray or a fan opened, the panels, a phone in
// landscape, and anything after the first minute of play.

const RECT_IDS = ['stat-health', 'stat-mana', 'ember-bar', 'hotbar', 'hotbar-xp-row', 'quest-tracker', 'hud-compass',
  'objective-tracker', 'radial-minimap', 'day-phase-dial', 'hud-settings', 'coin-readout'];

/** The touch controls a player sees at rest: the joystick's ring and every hit target the touch layer draws (the
 *  full-screen tap-to-play is not one: it shows only before play). */
const touchControls = (page) => page.evaluate(() => [...document.querySelectorAll('[data-touch-zone="joystick"], [data-touch-btn]')]
  .map((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { id: el.getAttribute('data-testid') || (el.hasAttribute('data-touch-zone') ? 'touch-joystick' : el.getAttribute('aria-label')),
      x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height,
      shown: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' };
  })
  .filter((t) => t.shown && t.id !== 'touch-tap-to-play'));
const TOUCH_AT_REST = ['touch-joystick', 'touch-pause', 'touch-action', 'touch-cast', 'touch-dodge', 'touch-jump', 'touch-panels',
  'touch-aspects', 'touch-spells'];

const rects = (page, ids) => page.evaluate((list) => list.map((id) => {
  const el = document.querySelector(`[data-testid="${id}"]`);
  if (!el) return { id, missing: true };
  const r = el.getBoundingClientRect();
  return { id, x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
}), ids);
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

/** The HUD rects and, on touch, the touch controls, read together: [seen, missing]. */
async function layout(page, touch) {
  const all = await rects(page, RECT_IDS);
  const missing = all.filter((r) => r.missing || !(r.w > 0 && r.h > 0)).map((r) => r.id);
  const seen = all.filter((r) => !r.missing && r.w > 0 && r.h > 0);
  const controls = touch ? await touchControls(page) : [];
  if (touch) missing.push(...TOUCH_AT_REST.filter((id) => !controls.some((c) => c.id === id)));
  return { seen: [...seen, ...controls], missing };
}
const fmt = (list) => JSON.stringify(list.map((r) => [r.id, Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h)]));

for (const vp of [
  { name: 'desktop 1280x800', viewport: { width: 1280, height: 800 }, touch: false },
  { name: 'iPad 1180x820', viewport: { width: 1180, height: 820 }, touch: true },
  { name: 'iPad 820x1180', viewport: { width: 820, height: 1180 }, touch: true },
]) {
  test.describe(vp.name, () => {
    test.use({ viewport: vp.viewport, hasTouch: vp.touch });
    test('the HUD and the touch controls at rest: no two intersect', async ({ page }) => {
      test.setTimeout(240000);
      await enterPlayWithHud(page, vp.touch);
      const { seen, missing } = await layout(page, vp.touch);
      console.log(`hud-at-rest ${vp.name}: ${seen.length} rects ${fmt(seen)}`);
      expect(missing, `SETUP: HUD elements or touch controls not on screen at ${vp.name}`).toEqual([]);
      expect(pairs(seen), `HUD elements or touch controls overlap at ${vp.name}`).toEqual([]);
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

test.describe('phone 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('the HUD and the touch controls: no two intersect, and every touch target lies inside the viewport', async ({ page }) => {
    test.setTimeout(240000);
    await enterPlayWithHud(page, true);
    const { seen, missing } = await layout(page, true);
    const slots = await page.evaluate(() => [...document.querySelectorAll('[data-hotbar-block]')].map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.getAttribute('data-hotbar-block'), x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
    }).filter((t) => t.w > 0 && t.h > 0));
    const vw = 390, vh = 844;
    console.log(`hud-at-rest phone: ${seen.length} rects ${fmt(seen)}; ${slots.length} hotbar slots`);
    expect(missing, 'SETUP: HUD elements or touch controls not on screen on a phone').toEqual([]);
    expect(slots.length, 'SETUP: the hotbar slots are not on screen').toBeGreaterThanOrEqual(9);
    const targets = [...seen.filter((r) => r.id.startsWith('touch-') || r.id === 'hud-settings' || r.id === 'quest-tracker'), ...slots];
    expect(targets.filter((t) => t.x < -0.5 || t.y < -0.5 || t.right > vw + 0.5 || t.bottom > vh + 0.5).map((t) => t.id),
      'a touch target lies outside the viewport').toEqual([]);
    expect(pairs(seen), 'HUD elements or touch controls overlap on a phone').toEqual([]);
    expect(pairs([...seen.filter((r) => r.id.startsWith('touch-')), ...slots]), 'a touch control overlaps a hotbar slot').toEqual([]);
  });
});
