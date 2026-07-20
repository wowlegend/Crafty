import { test, expect } from '@playwright/test';
import { bootDev } from './_boot.js';

// B7 (18-domain review, "touch is visually broken"): the on-screen touch controls used the theme color
// TOKENS as bare CSS colors. `cssVars.js` emits every `--ui-*` color as SPACE-SEPARATED RGB CHANNELS
// (e.g. `--ui-accent: 201 168 106`) so Tailwind's `rgb(var(--x) / <a>)` opacity modifier works. But
// TouchControlsSurface did `const GOLD = 'var(--ui-accent, #C9A86A)'` and used it bare as
// `background: GOLD` -> the resolved value is `201 168 106`, which is an INVALID CSS color (the hex
// fallback only fires when the var is UNDEFINED, and it is always defined) -> the property is dropped and
// the joystick knob renders 100% TRANSPARENT. Same for `INK` on every touch-button border: `border: 4px
// solid <invalid>` -> the whole shorthand is invalid -> border-style resets to none -> the 4px border
// vanishes. (The lucide GLYPHs survived because they use a LITERAL hex, which is why the icons showed but
// the buttons had no fill/border.)
//
// Fix: wrap the tokens in rgb() -> `rgb(var(--ui-accent, 201 168 106))`, a valid color that also keeps the
// runtime mood-tint reactivity. This spec drives the REAL game on a touch viewport (chromium + hasTouch,
// so navigator.maxTouchPoints > 0 -> isTouchUIMode() true) and reads the knob's COMPUTED style.
//
// MUTATION-PROOF: revert GOLD/INK to bare `var(--ui-*)` and both assertions go RED (bg -> rgba(0,0,0,0),
// border width -> 0px).

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

// Boot on the touch viewport and enter play (forcePlay bridges menu->play; no pointer lock on touch),
// re-asserting until `sel` attaches (the optimistic `active` can be reset by the mount-time sync).
// NB: inline the boot wait with a generous 90s timeout rather than bootDev's 30s -- a swiftshader R3F
// boot is legitimately slow on a loaded box, and 30s flakes at app-ready under load. This only widens the
// SETUP patience; the actual assertions (geometry) are unchanged.
async function enterTouchPlay(page, sel) {
  await page.goto('/');
  await page.waitForFunction(
    () => typeof window.useGameStore === 'function' && !!window.__craftyTest && window.__craftyTest.ready?.(),
    null,
    { timeout: 90000 }
  );
  await page.waitForFunction(() => window.useGameStore.getState().isSpawnChunkLoaded === true, null, { timeout: 90000 });
  for (let i = 0; i < 25; i++) {
    await page.evaluate(() => window.__craftyTest.call('forcePlay'));
    await page.waitForTimeout(600);
    if (await page.evaluate((s) => !!document.querySelector(s), sel)) break;
  }
}
const rectOf = (page, sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
  }, sel);
const overlaps = (a, b) => !(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y);

test.describe('B7 — the touch joystick knob renders a visible fill + border', () => {
  test('the resting knob has a gold fill and a 4px ink border (not transparent/dropped)', async ({ page }) => {
    test.setTimeout(150000); // world-build is load-sensitive in headless swiftshader
    await bootDev(page);
    await page.waitForFunction(() => window.useGameStore.getState().isSpawnChunkLoaded === true, null, { timeout: 90000 });
    // On touch there is no pointer lock; forcePlay bridges menu->play and mounts the in-game HUD +
    // the touch overlay (isTouchUIMode() is true because maxTouchPoints > 0). Re-assert until the knob
    // attaches (the optimistic `active` can be reset by the input controller's mount-time sync).
    let attached = false;
    for (let i = 0; i < 25 && !attached; i++) {
      await page.evaluate(() => window.__craftyTest.call('forcePlay'));
      await page.waitForTimeout(600);
      attached = await page.evaluate(() => !!document.querySelector('[data-touch-knob]'));
    }

    const style = await page.evaluate(() => {
      const k = document.querySelector('[data-touch-knob]');
      if (!k) return null;
      const cs = getComputedStyle(k);
      return { bg: cs.backgroundColor, borderWidth: cs.borderTopWidth, borderColor: cs.borderTopColor };
    });
    console.log('knob computed style:', JSON.stringify(style));

    expect(style, 'the touch joystick knob must render').not.toBeNull();
    // (1) FILL: bare `var(--ui-accent)` = "201 168 106" is an invalid color -> transparent on HEAD.
    expect(style.bg, 'the knob fill is transparent (invalid bare-channel color)').not.toBe('rgba(0, 0, 0, 0)');
    expect(style.bg, 'the knob fill should be the gold accent').toBe('rgb(201, 168, 106)');
    // (2) BORDER: `border: 4px solid <invalid-channels>` drops the whole shorthand -> width 0 on HEAD.
    expect(style.borderWidth, 'the knob ink border was dropped (invalid bare-channel color)').toBe('4px');
  });

  // B7 (18-domain review): the Pause TOUCH hit-target was disjoint from the visible Pause glyph and
  // instead sat on top of the GameHud Settings gear, so tapping the visible Pause did nothing and tapping
  // Settings PAUSED the game. The transparent hit-target (`button[aria-label="Pause"]`) was at `right: 8`
  // while the glyph is at `right: 64`. Fix: align the hit-target to the glyph (the pattern the code's own
  // comment states: "hit-target geometry mirrors the visible glyphs").
  //
  // MUTATION-PROOF: move the Pause hit-target back to `right: 8, width: 44` and both assertions go RED
  // (it no longer overlaps its glyph, and it overlaps the Settings gear again).
  test('the Pause hit-target sits under its glyph and clear of the Settings gear', async ({ page }) => {
    test.setTimeout(150000);
    await enterTouchPlay(page, 'button[aria-label="Pause"]');

    const glyph = await rectOf(page, '[data-testid="touch-pause-glyph"]');
    const hit = await rectOf(page, 'button[aria-label="Pause"]');
    const gear = await rectOf(page, 'button[aria-label="Settings"]');
    console.log('B7 pause rects:', JSON.stringify({ glyph, hit, gear }));

    expect(glyph, 'the pause glyph must render').not.toBeNull();
    expect(hit, 'the pause hit-target must render').not.toBeNull();
    expect(gear, 'the settings gear must render').not.toBeNull();

    // (1) the pause hit-target must overlap its own visible glyph (so tapping the icon actually pauses)
    expect(overlaps(hit, glyph), 'the pause hit-target is disjoint from its glyph').toBe(true);
    // (2) the pause hit-target must NOT overlap the Settings gear (so tapping Settings does not pause)
    expect(overlaps(hit, gear), 'the pause hit-target covers the Settings gear').toBe(false);
  });

  // B7 (18-domain review): the 9-slot block hotbar (`w-[62px]` slots + gaps + padding ≈ 642px, centered)
  // overflowed a phone viewport -- ~2 slots ran off EACH edge on a 390px screen, so the player could not
  // see or reach them (a voxel BUILDING game with unreachable blocks). Fix: a viewport-responsive scale on
  // narrow screens (tablets keep full size). This measures every slot on a 390px viewport.
  //
  // MUTATION-PROOF: remove the `max-[430px]:scale-...` from the hotbar container and the off-screen
  // assertion goes RED (the outer slots have x < 0 / right > viewport width again).
  test('all 9 hotbar slots fit within the phone viewport', async ({ page }) => {
    test.setTimeout(150000);
    await enterTouchPlay(page, '[data-hotbar-block]');

    const { slots, vw } = await page.evaluate(() => {
      const els = [...document.querySelectorAll('[data-hotbar-block]')];
      return {
        vw: window.innerWidth,
        slots: els.map((el) => {
          const r = el.getBoundingClientRect();
          return { block: el.getAttribute('data-hotbar-block'), x: Math.round(r.x), right: Math.round(r.right) };
        }),
      };
    });
    console.log('B7 hotbar slots (vw=' + vw + '):', JSON.stringify(slots));

    expect(slots.length, 'all 9 hotbar slots must render').toBe(9);
    const offscreen = slots.filter((s) => s.x < 0 || s.right > vw);
    expect(offscreen, `slots off the ${vw}px viewport: ${offscreen.map((s) => s.block).join(', ')}`).toEqual([]);
  });
});
