import { test, expect } from '@playwright/test';

// B5 (18-domain review, "HUD lies"): the Progression panel (SpellUpgradePanel) put flex-centering AND
// `overflow-y-auto` on the SAME element (`absolute inset-0 flex items-center justify-center overflow-y-auto`).
// When the panel is taller than the viewport, `align-items: center` clips the TOP and the browser will not
// let you scroll up past the centered position -- so the header (title + Talent Points + the CLOSE X) sits
// ABOVE the viewport and is unreachable. On a 1280x800 screen the 4-column panel overflows, so you cannot
// close it without a keyboard.
//
// Fix: the standard scrollable-modal pattern -- the OUTER element is the scroll container (overflow-y-auto,
// no flex), and an INNER `min-h-full flex items-center justify-center` wrapper centers when it fits and
// grows (so the top stays reachable) when it overflows.
//
// MUTATION-PROOF: collapse the fix back to a single `flex items-center justify-center overflow-y-auto` on the
// outer element and the header-within-viewport assertion goes RED (headerTop < 0).

async function bootAndPlay(page) {
  await page.goto('/');
  await page.waitForFunction(
    () => typeof window.useGameStore === 'function' && !!window.__craftyTest && window.__craftyTest.ready?.(),
    null,
    { timeout: 90000 }
  );
  await page.waitForFunction(() => window.useGameStore.getState().isSpawnChunkLoaded === true, null, { timeout: 90000 });
  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => window.__craftyTest.call('forcePlay'));
    await page.waitForTimeout(500);
    if (await page.evaluate(() => window.useGameStore.getState().isAlive)) break;
  }
}

test.describe('B5 — the Progression panel header + close button are reachable', () => {
  test('the panel header is within the viewport at default scroll (not clipped above)', async ({ page }) => {
    test.setTimeout(150000);
    await bootAndPlay(page);
    // Open the talents + Spell-Mastery panel via the same dev hook the capture harness uses.
    await page.evaluate(() => window.__craftyTest.call('openModal', 'spellUpgrades'));
    await page.waitForSelector('[data-testid="progression-header"]', { timeout: 15000 });

    const m = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="progression-panel"]');
      const header = document.querySelector('[data-testid="progression-header"]');
      const pr = panel.getBoundingClientRect();
      const hr = header.getBoundingClientRect();
      return { vh: window.innerHeight, panelH: Math.round(pr.height), headerTop: Math.round(hr.top), headerBottom: Math.round(hr.bottom) };
    });
    console.log('B5 progression:', JSON.stringify(m));

    // Precondition: the panel must overflow the viewport, else the clip bug can't manifest (test inconclusive).
    expect(m.panelH, 'the panel should be taller than the viewport (the overflow case this guards)').toBeGreaterThan(m.vh);
    // The header (title + close X) must be reachable at default scroll -> its top is within the viewport.
    expect(m.headerTop, 'the progression header is clipped ABOVE the viewport (the close X is unreachable)').toBeGreaterThanOrEqual(0);
    expect(m.headerBottom, 'the progression header is below the viewport').toBeLessThanOrEqual(m.vh);
  });

  // NB: the 18-domain review's B5 also claimed the Inventory attribute "+" buttons were "below the fold with
  // no scroll". VERIFIED STALE 2026-07-14 (lived @1280x800): the inventory modal was refactored to a fixed
  // h-[440px] body inside a ~505px panel that FITS the viewport (grid-centered), with Column 1 (the "+"
  // buttons) on its own overflow-y-auto -- the "+" measured at top=572, hittable=true, and stayed reachable
  // through two layout mutations (taller body; smaller body + no column scroll). No permanent gate is kept
  // for it: a reachability assertion here could not be made to fail (the design is robustly reachable + a
  // scrollIntoView masks any break), so per the charter it would be decoration. The registry is corrected.
});
