import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';

// THE HUD AT REST, in a browser (the HUD lane's task script, A2; closes OPEN_ITEMS:OI-55 at 390x844). jsdom has no
// layout, so tests/gates/hud-at-rest-gates.test.jsx can say what renders and never where; this reads the rects.
//   desktop 1280x800: no side rail; a real grantXP widens the hotbar's XP edge to the share the store holds; the music's
//     hostile count (written by SpawnerSystem from the live mob query, the mirror being gone) matches the ECS.
//   1280x800 and both iPad sizes: the vitals, the hotbar and its XP edge, the quest line, the compass, the objective
//     line, the minimap, the dial and the gear: no two intersect.
//   390x844 touch: no two touch targets a player can see intersect, and each lies inside the viewport.
// NOT CHECKED: a toast's place (tests/e2e/dusk-warning.spec.js), the panels, and anything after the first minute of play.

const RECT_IDS = ['stat-health', 'stat-mana', 'ember-bar', 'hotbar', 'hotbar-xp-row', 'quest-tracker', 'hud-compass',
  'objective-tracker', 'radial-minimap', 'day-phase-dial', 'hud-settings'];

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

for (const vp of [
  { name: 'desktop 1280x800', viewport: { width: 1280, height: 800 }, touch: false },
  { name: 'iPad 1180x820', viewport: { width: 1180, height: 820 }, touch: true },
  { name: 'iPad 820x1180', viewport: { width: 820, height: 1180 }, touch: true },
]) {
  test.describe(vp.name, () => {
    test.use({ viewport: vp.viewport, hasTouch: vp.touch });
    test('the vitals, hotbar, quest line, compass, minimap, dial and gear do not overlap', async ({ page }) => {
      test.setTimeout(240000);
      await enterPlayWithHud(page, vp.touch);
      const all = await rects(page, RECT_IDS);
      const missing = all.filter((r) => r.missing || !(r.w > 0 && r.h > 0)).map((r) => r.id);
      const seen = all.filter((r) => !r.missing && r.w > 0 && r.h > 0);
      console.log(`hud-at-rest ${vp.name}: ${seen.length} of ${RECT_IDS.length} HUD rects ${JSON.stringify(seen.map((r) => [r.id, Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h)]))}`);
      expect(missing, `SETUP: HUD elements not on screen at ${vp.name}`).toEqual([]);
      expect(pairs(seen), `HUD elements overlap at ${vp.name}`).toEqual([]);
    });
  });
}

test.describe('phone 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('no two visible touch targets overlap, and each lies inside the viewport', async ({ page }) => {
    test.setTimeout(240000);
    await enterPlayWithHud(page, true);
    const targets = await page.evaluate(() => {
      const sel = '[data-touch-btn], [data-hotbar-block], [data-testid="hud-settings"], [data-testid="quest-tracker-line"]';
      return [...document.querySelectorAll(sel)].map((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return { id: el.getAttribute('data-testid') || el.getAttribute('data-hotbar-block') || el.getAttribute('aria-label'),
          slot: el.hasAttribute('data-hotbar-block'),
          x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height,
          shown: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' };
      }).filter((t) => t.shown && t.id !== 'touch-tap-to-play');
    });
    const vw = 390, vh = 844;
    const hotbar = targets.filter((t) => t.slot);
    console.log(`hud-at-rest phone: ${targets.length} touch targets ${JSON.stringify(targets.map((t) => [t.id, Math.round(t.x), Math.round(t.y), Math.round(t.w), Math.round(t.h)]))}`);
    expect(targets.some((t) => t.id === 'touch-jump'), 'SETUP: the touch overlay is not on screen').toBe(true);
    expect(hotbar.length, 'SETUP: the hotbar slots are not on screen').toBeGreaterThanOrEqual(9);
    expect(targets.filter((t) => t.x < -0.5 || t.y < -0.5 || t.right > vw + 0.5 || t.bottom > vh + 0.5).map((t) => t.id),
      'a touch target lies outside the viewport').toEqual([]);
    expect(pairs(targets), 'two touch targets overlap').toEqual([]);

    // OI-55's other half: the vitals clear the hotbar and its XP edge on a phone.
    const vitals = (await rects(page, ['stat-health', 'stat-mana', 'ember-bar', 'hotbar', 'hotbar-xp-row'])).filter((r) => !r.missing);
    expect(vitals.length, 'SETUP: the vitals or the hotbar are not on screen').toBe(5);
    expect(pairs(vitals), 'the vitals overlap the hotbar on a phone').toEqual([]);
  });
});
