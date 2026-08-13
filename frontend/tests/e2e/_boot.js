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
 *
 *  DELIBERATELY LENIENT, and NOT sufficient if your spec drives real input — use `startPlayActive`
 *  for that. The world wait is best-effort because most callers here are store-driven: they call
 *  store actions directly and read `isAlive` / `mana` / `hunger` back, so a slow spawn chunk is not
 *  their precondition and failing them on it would be a foreign gate, not a caught defect.
 *
 *  The docblock here used to promise something this function cannot deliver — "nothing fires a later
 *  pointerlockchange to clobber it". Something does; see `startPlayActive`. */
export async function startPlay(page) {
  await page
    .waitForFunction(() => window.useGameStore.getState().isSpawnChunkLoaded === true, null, { timeout: 45000 })
    .catch(() => {}); // store-driven specs still assert without it
  await page.evaluate(() => window.__craftyTest.call('forcePlay'));
}

/** Enter play AND PROVE the input gate is live. Use this for any spec that drives a real keyboard or
 *  mouse verb — anything gated on `getInput().active`.
 *
 *  WHY `startPlay` IS NOT ENOUGH, MEASURED RATHER THAN ARGUED. `forcePlay` only WRITES the gate
 *  (App.jsx:313) and returns no receipt. The world-ready path then arms an auto-pointer-lock 100ms
 *  after `isSpawnChunkLoaded` flips (App.jsx:130); headless Chromium REFUSES it, and the resulting
 *  `pointerlockerror` clears the gate again (Components.jsx:519). Instrumented 2026-08-13 against
 *  the real dev build: the flag flipped at t=58959ms and `pointerlockerror` landed at t=59003ms —
 *  44ms later. So whether a spec survives depends on which side of that refusal its `forcePlay`
 *  happens to land on, which is a race decided by how fast the machine built the world.
 *
 *  It is a race with NO second chance. There is no reachable `setActive(true)` afterwards in a
 *  headless run, and `Components.jsx:800` advances `prevImbueRef` unconditionally ABOVE the active
 *  check — so the intent edge is burned on the very next frame and the verb becomes PERMANENTLY
 *  unreachable. That is why CI run 31728827362 failed `imbue-latch` on all three attempts with only
 *  documentation changed, and why it read as a flat 15s timeout that named nothing.
 *
 *  So: re-assert until the gate HOLDS across consecutive samples spanning more than the refusal
 *  window, and throw NAMING the gate if it never does. `hud-layout`, `panel-overflow` and
 *  `touch-controls` each hand-rolled a copy of this loop and each survived that CI run; the two
 *  specs without it are the two that died. This is the shared instrument they should all call. */
export async function startPlayActive(page, { worldTimeout = 90000 } = {}) {
  // STRICT — no `.catch` here, unlike startPlay. A spec that needs the input gate needs the world
  // that arms it, so a world that never builds must fail HERE naming `isSpawnChunkLoaded`, not 15s
  // later inside an assertion about something else.
  await page.waitForFunction(
    () => window.useGameStore.getState().isSpawnChunkLoaded === true,
    null,
    { timeout: worldTimeout }
  );

  // Two consecutive live reads 250ms apart = 250ms of held gate, which outlives the ~100ms refusal.
  // One read cannot distinguish "set" from "about to be cleared" — that is the whole defect.
  let held = 0;
  for (let i = 0; i < 40 && held < 2; i++) {
    const live = await page.evaluate(() => window.__craftyTest.call('readIntents').active === true);
    if (live) {
      held += 1;
    } else {
      held = 0;
      await page.evaluate(() => window.__craftyTest.call('forcePlay'));
    }
    await page.waitForTimeout(250);
  }
  if (held < 2) {
    throw new Error(
      'startPlayActive: getInput().active never held after forcePlay. The world-ready pointer-lock ' +
        'refusal (App.jsx:130 -> Components.jsx:519) is clearing the gate faster than it can be ' +
        're-asserted, so every input-gated verb in this spec is unreachable.'
    );
  }
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
