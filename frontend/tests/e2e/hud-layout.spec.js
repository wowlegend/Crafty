import { test, expect } from './_fixtures.js';
import { bootDev } from './_boot.js';

// B5 (18-domain review, "the HUD lies"): the player health/mana stat bars had two layout defects that
// NO jsdom unit test can catch -- jsdom has no layout engine, so only a real browser lays out the CSS.
//   (1) COLLISION: the stat stack lived at `top-16 left-4 z-20`, directly beneath the QuestTracker panel
//       (`top-4 left-4 z-20`, LATER in the DOM, opaque Panel) -> the expanded quest panel painted OVER
//       the health bar, so it was effectively invisible during normal play.
//   (2) RIBBON: StatBar's root is `inline-flex`, so the stack container's `space-y-2` (margin-top on
//       inline-level boxes) could not stack the bars vertically -> they laid out as a horizontal ribbon.
// Fix: move the stat stack to the free bottom-left corner (conventional RPG placement, clear of the
// top-left quest panel) AND make the container a real `flex flex-col` column. This spec drives the REAL
// booted game (forcePlay, no pointer-lock) and measures the rendered geometry.
//
// MUTATION-PROOF: revert the stat-stack container to `absolute top-16 left-4 ... space-y-2` and BOTH the
// no-collision assertion (1) and the vertical-stack assertion (2) go RED.

const boxOf = (page, testid) =>
  page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
  }, testid);

// axis-aligned rectangle overlap
const intersects = (a, b) =>
  !(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y);

test.describe('B5 — the HUD health/mana bars are visible and vertically stacked', () => {
  test('health bar clears the quest panel and the bars stack vertically', async ({ page }) => {
    test.setTimeout(150000); // world-build is load-sensitive in headless swiftshader
    await bootDev(page);
    // Wait for the world to FULLY build first (the HUD mounts on active+alive+worldBuilt, and the
    // input controller's mount-time pointer-lock sync can reset the optimistic `active` — so build
    // the world, THEN flip active, and re-assert it until the HUD actually attaches).
    await page.waitForFunction(() => window.useGameStore.getState().isSpawnChunkLoaded === true, null, { timeout: 90000 });
    let attached = false;
    for (let i = 0; i < 25 && !attached; i++) {
      await page.evaluate(() => window.__craftyTest.call('forcePlay'));
      await page.waitForTimeout(600);
      attached = await page.evaluate(() => !!document.querySelector('[data-testid="stat-health"]'));
    }
    console.log('stat-health attached after forcePlay polling:', attached);

    const health = await boxOf(page, 'stat-health');
    const mana = await boxOf(page, 'stat-mana');
    const quest = await boxOf(page, 'quest-tracker');
    console.log('B5 boxes:', JSON.stringify({ health, mana, quest }));

    expect(health, 'health bar must render').not.toBeNull();
    expect(mana, 'mana bar must render').not.toBeNull();
    expect(quest, 'quest tracker must render').not.toBeNull();

    // (1) COLLISION: the health bar must NOT overlap the quest panel (it did on HEAD -> invisible).
    expect(intersects(health, quest), 'the health bar overlaps the quest panel (it is being covered)').toBe(false);

    // (2) RIBBON: mana must sit clearly BELOW health (a vertical stack), sharing the left edge --
    //     NOT beside it on the same row (the inline-flex ribbon).
    expect(mana.y, 'mana should be below health (vertical stack, not a horizontal ribbon)').toBeGreaterThan(health.y + health.height / 2);
    expect(Math.abs(mana.x - health.x), 'health and mana should share a left edge').toBeLessThan(8);
  });
});
