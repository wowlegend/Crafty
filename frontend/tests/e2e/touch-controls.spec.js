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
});
