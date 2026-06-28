import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
import { bootDev, startPlay } from './_boot.js';

// The single highest-value gameplay E2E the project never had: boot the REAL game, enter play,
// and assert (a) the WebGL canvas actually renders something (not a blank swiftshader screen),
// and (b) NO runtime error of the crash/throw classes this codebase has repeatedly shipped
// (render-tree hook crashes, undefined symbols from byte-exact extractions, the rapier-2.2
// block-debris TypeError). This is the live net the pinned visual gate could never be.
test('boots, renders a non-blank canvas, and enters play with no runtime errors', async ({ page }) => {
  const errors = await bootDev(page, { withErrors: true });
  await startPlay(page);
  await page.waitForTimeout(1500); // let several frames render + any per-frame throw surface

  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();

  // Non-blank check: decode an element screenshot and assert real tonal range.
  // A dead WebGL context yields a uniform (white/black) frame -> range ~0.
  const png = PNG.sync.read(await canvas.screenshot());
  let min = 255;
  let max = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const l = (png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3;
    if (l < min) min = l;
    if (l > max) max = l;
  }
  expect(max - min, 'canvas appears blank — WebGL is not rendering').toBeGreaterThan(20);

  // crash/throw classes only — pointer-lock rejection + benign warnings are ignored
  const fatal = errors.filter((e) =>
    /TypeError|is not a function|is not defined|Rendered (more|fewer) hooks|Maximum update depth|setTranslation|Cannot read prop/.test(e)
  );
  expect(fatal, `runtime errors during boot+play:\n${errors.join('\n') || '(none)'}`).toEqual([]);
});
