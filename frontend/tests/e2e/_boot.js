// Shared boot helpers for the gameplay-flow E2E layer.
// The game's test bridge (window.__craftyTest) + the live zustand store (window.useGameStore)
// are both DEV-only, so these drive the REAL booted game without fighting pointer-lock:
// we read/assert via useGameStore.getState() and drive via store actions / registered hooks.

/** Navigate to the dev app and wait until the store + test bridge are live. Returns a
 *  growing array of captured runtime errors when { withErrors: true }. */
export async function bootDev(page, { withErrors = false } = {}) {
  const errors = [];
  if (withErrors) {
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
    });
  }
  await page.goto('/');
  await page.waitForFunction(
    () =>
      typeof window.useGameStore === 'function' &&
      !!window.__craftyTest &&
      typeof window.__craftyTest.ready === 'function' &&
      window.__craftyTest.ready(),
    null,
    { timeout: 30000 }
  );
  return errors;
}

/** Enter play (mounts the in-game HUD) via the headless-safe `forcePlay` hook (no pointer-lock).
 *  Order matters: the world (GameScene) builds on its own at page-load, and the input controller
 *  runs a mount-time pointer-lock sync that sets active=false. So we wait for the world FIRST,
 *  THEN flip active last — nothing fires a later pointerlockchange to clobber it. */
export async function startPlay(page) {
  await page
    .waitForFunction(() => window.useGameStore.getState().isSpawnChunkLoaded === true, null, { timeout: 45000 })
    .catch(() => {}); // store-driven specs still assert without it
  await page.evaluate(() => window.__craftyTest.call('forcePlay'));
}

/** Wait until the in-game HUD is actually mounted (active + alive + world built). */
export async function waitForHud(page) {
  await page.waitForFunction(
    () => window.useGameStore.getState().isSpawnChunkLoaded === true,
    null,
    { timeout: 45000 }
  );
}

/** Read a value out of the live store. */
export const store = (page, fn) => page.evaluate(fn);

// NOTE: live in-game HUD-DOM assertions (e.g. reading the rendered health bar) are intentionally
// NOT in this suite — the in-game HUD gates on a real pointer-lock `active` state that headless
// chromium cannot hold (the project's documented headless limitation). Those are covered by the
// static wiring gate (tests/gates/hud-stat-wire-gates) + the store-level flow asserts here, and
// the lived look is a Kevin-playtest item.
