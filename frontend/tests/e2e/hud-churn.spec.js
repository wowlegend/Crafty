import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';

// THE COMPASS REWRITES ITSELF ONLY WHEN IT CHANGES (plan 2026-09-23-crafty-perf-heat-ipad, Task 6).
//
// The compass strip rebuilt its markers with innerHTML on every display frame — ~20 elements re-parsed, then style
// and layout re-run — 120 times a second on a ProMotion panel, while the player stood still and nothing on it moved.
// The instrument: a MutationObserver on the strip counts every rewrite, and a rewrite whose markup is IDENTICAL to the
// one before it is waste. Standing still, there should be none.
//
// PRESENCE CONTROL: the camera is then turned, and the strip must be seen to rewrite (with DIFFERENT markup) — so a
// dead observer, or a compass that stopped updating altogether, cannot pass as "no waste".
//
// Mutation-Proof: via scripts/dev/mutate-e2e.sh, observed RED:
//   H1 the dedupe removed (the write made unconditional) -> "rewrote itself N times with identical markup"
//   H2 plausible-wrong: the dedupe keyed on a value that never changes (the compass freezes) -> "did not update when
//      the camera turned"
//   and an identity mutant (a comment edit in HUD.jsx) in the same batch SURVIVED.
test('standing still the compass writes nothing; turning, it updates', async ({ page }) => {
  test.setTimeout(300000);
  await bootDev(page);
  await startPlayActive(page);
  await page.waitForTimeout(2000); // let the spawn settle: the player lands, the camera stops easing
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="compass-track"]');
    const c = { writes: 0, identical: 0, last: el ? el.innerHTML : null, found: !!el };
    window.__compass = c;
    if (!el) return;
    new MutationObserver(() => {
      const now = el.innerHTML;
      c.writes += 1;
      if (now === c.last) c.identical += 1;
      c.last = now;
    }).observe(el, { childList: true });
  });
  const read = () => page.evaluate(() => ({ ...window.__compass, last: undefined }));

  await page.waitForTimeout(3000);
  const still = await read();
  expect(still.found, 'SETUP: no compass strip on screen — the HUD is not mounted').toBe(true);

  // Turn the camera to face east, then south (the way the other specs aim it); the strip must follow.
  for (const [dx, dz] of [[10, 0], [0, 10]]) {
    await page.evaluate(([x, z]) => {
      const cam = window.__threeCamera;
      cam.lookAt(cam.position.x + x, cam.position.y, cam.position.z + z);
    }, [dx, dz]);
    await page.waitForTimeout(700);
  }
  const turned = await read();
  console.log(`hud-churn: standing 3 s — ${still.writes} rewrites, ${still.identical} identical; turning — ${turned.writes - still.writes} more`); // the denominator
  expect(turned.writes - still.writes, `the compass did not update when the camera turned — a dead observer or a frozen compass: ${JSON.stringify({ still, turned })}`).toBeGreaterThan(0);
  expect(still.identical, `the compass rewrote itself ${still.identical} times with identical markup in 3 s of standing still: ${JSON.stringify(still)}`).toBe(0);
});
