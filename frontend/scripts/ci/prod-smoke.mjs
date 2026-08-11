#!/usr/bin/env node
/**
 * PROD SMOKE — load the artifact that actually ships.
 *
 * THE GAP THIS CLOSES. Every harness in this repo drives `vite` (the DEV server). `npm run build` runs in
 * CI and bundle-budget asserts the output's BYTES, but nothing has ever LOADED it. Vercel auto-deploys
 * that bundle on every push to main. So the coverage was: 100% of visual/e2e testing against a build that
 * never ships, and 0% against the one that does.
 *
 * Not hypothetical. Three of the 31 gated visual frames (`primitives-showcase-en`, `primitives-showcase-zh`,
 * `title-mascot`) render dev-only components behind `import.meta.env.DEV` and CANNOT exist in production —
 * ~10% of the visual gate tests surfaces that ship to nobody. And the failure class this repo keeps
 * shipping is precisely "compiles, gates green, never RUNS": four in one day on 2026-08-05. A production
 * bundle can be byte-perfect and still fail to boot — a DEV-only import tree-shaken to nothing, a
 * `import.meta.env` branch that only existed in dev, a minifier mangling a name something reflects on.
 *
 * DELIBERATELY A SMOKE TEST, NOT A SECOND VISUAL GATE. It asks four questions the build cannot answer:
 * does it boot, does it render, does it log an error, is the GL context alive. No baselines, so it cannot
 * rot and never needs re-approval — the same property that makes the intra-page invariant worth having.
 * A 31-frame production capture would need its own oracle and would double the re-baseline burden for
 * frames that already have one.
 *
 *   node scripts/ci/prod-smoke.mjs        (expects `npm run build` to have run first)
 */
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { serveVite } from '../visual/_serve.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
// A fourth dedicated port. capture=4178, e2e=4179, this=4180. Never an ad-hoc port: the one time a probe
// picked its own, it minted the worst crop of orphan cmux preview surfaces.
const PORT = 4180;

/** PURE: is this console/page message worth failing over? */
export function isFatalMessage(text) {
  if (!text) return false;
  // React dev warnings cannot appear in a production build, so anything here is real. The two exclusions
  // are environment noise with no bearing on whether the app runs.
  // NARROW on purpose. `favicon` alone once excluded "TypeError: cannot read favicon of undefined in
  // renderer boot" — a real error swallowed by a loose pattern, caught by this file's own gate. Each
  // exclusion now matches the full noise string, not a word that can appear inside a real failure.
  if (/favicon\.ico|ERR_CONNECTION_REFUSED|Download the React DevTools/i.test(text)) return false;
  // Pointer Lock without a user gesture. MEASURED, not assumed: the title screen auto-advances into
  // gameplay, and gameplay requests pointer lock. A real visitor gets there by clicking START ADVENTURE,
  // which IS a gesture; a headless page has no way to produce one, so this fires in the harness and
  // cannot fire for a user arriving the normal way. Excluded because it is an artifact of the probe, not
  // of the bundle. (That the app leaves it UNCAUGHT is a real if minor robustness gap — tracked
  // separately; it is not something this smoke test can distinguish.)
  if (/user gesture is required to request Pointer Lock/i.test(text)) return false;
  return true;
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const dist = resolve(ROOT, 'build');
  if (!existsSync(dist)) {
    console.error('✖ prod-smoke: build/ does not exist — run `npm run build` first');
    process.exit(1);
  }

  const { url, waitReady, shutdown } = serveVite(PORT, { cwd: ROOT, preview: true });
  let browser = null;
  const errors = [];
  let code = 0;

  try {
    await waitReady();
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e && e.message ? e.message : e}`));
    page.on('console', (m) => {
      if (m.type() === 'error' && isFatalMessage(m.text())) errors.push(`console.error: ${m.text()}`);
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // 1. DID IT BOOT? The dev test-bridge is stripped in production, so this deliberately asks for a
    //    user-visible surface instead — exactly what a real visitor gets.
    await page.waitForSelector('canvas, [data-testid="title-diorama"]', { timeout: 45000 });

    // 2. DOES IT RENDER? A mounted canvas that never presents is the blank-frame failure the capture
    //    preflight exists for; a production bundle that boots and draws nothing looks identical to
    //    "loaded fine" from the outside.
    // FOUR seconds, and the bar is ONE frame. Measured on this machine: the bundle renders at 1-3 rAF
    // per second under the SwiftShader CPU rasteriser, so a 1.5s window legitimately catches zero and the
    // first version of this check reported a false failure against a bundle that was rendering the whole
    // game correctly. The bar stays at one frame deliberately — the same bar assertBrowserProducesFrames
    // uses — because the question is "does it render at all", not "how fast". A performance budget is a
    // different instrument with a different failure mode.
    const frames = await page.evaluate(
      () => new Promise((res) => {
        let n = 0;
        const stop = Date.now() + 4000;
        const tick = () => { n++; if (Date.now() < stop) requestAnimationFrame(tick); else res(n); };
        requestAnimationFrame(tick);
        setTimeout(() => res(n), 5000); // always resolves, even if rAF never fires
      })
    );
    if (frames === 0) errors.push('the production bundle rendered ZERO frames in 4s — it boots but does not draw');

    // 3. IS THE GL CONTEXT ALIVE? A lost context draws nothing while the DOM looks perfectly healthy.
    const lost = await page.evaluate(() =>
      [...document.querySelectorAll('canvas')].filter((c) => {
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        return gl && gl.isContextLost();
      }).length
    );
    if (lost > 0) errors.push(`${lost} canvas/canvases have a LOST WebGL context`);

    console.log(`prod-smoke: booted, ${frames} frames in 4s, ${lost} lost context(s)`);

    // SETTINGS PERSISTENCE — a PRODUCTION-ONLY defect, which is why it belongs here and nowhere else.
    // `initSettingsPersistence` used to be the last statement of the DEV-only test-bridge effect, behind
    // `if (!import.meta.env.DEV) return;`. So in the build Vercel ships, settings never hydrated and never
    // persisted — while the dev server, the capture harness and the e2e suite all run with DEV true and
    // saw it working. No unit test can see this: the difference IS the build.
    const persistence = await page.evaluate(async () => {
      const KEY = 'crafty_settings';
      if (typeof window.useGameStore !== 'function') return { ok: false, why: 'no window.useGameStore in the prod bundle' };
      try { localStorage.removeItem(KEY); } catch { return { ok: false, why: 'localStorage unavailable' }; }
      const before = localStorage.getItem(KEY);
      // Drive a real, player-editable setting through the real store, as the Settings panel does.
      const start = window.useGameStore.getState().sfxVolume;
      const next = start === 0.42 ? 0.24 : 0.42;
      window.useGameStore.getState().setSfxVolume?.(next);
      await new Promise((r) => setTimeout(r, 400)); // the subscriber writes on change
      const after = localStorage.getItem(KEY);
      return { ok: true, before, after, next, wrote: after !== null };
    });

    if (!persistence.ok) {
      errors.push(`settings persistence unverifiable: ${persistence.why}`);
    } else if (persistence.before !== null) {
      // Instrument check: the key must start absent or the "it appeared" reading is meaningless.
      errors.push('settings key was already present before the write — the round-trip proves nothing');
    } else if (!persistence.wrote) {
      errors.push(
        'changing a setting wrote NOTHING to localStorage in the production bundle — ' +
          'settings do not persist for real players'
      );
    } else {
      console.log(`prod-smoke: settings persisted in prod (sfxVolume -> ${persistence.next})`);
    }
  } catch (e) {
    errors.push(`threw: ${e && e.message ? e.message : e}`);
  } finally {
    await shutdown(browser);
  }

  if (errors.length) {
    console.error(`\n✖ prod-smoke: the PRODUCTION bundle failed to run cleanly (${errors.length} problem(s))\n`);
    for (const e of errors) console.error(`  • ${e}`);
    console.error(
      '\n  This is the artifact Vercel deploys on every push. `npm run build` passing means it COMPILED;\n' +
        '  this is the only check that it RUNS. Reproduce locally with:\n' +
        '    npm run build && npx vite preview --port 4180 --strictPort\n'
    );
    code = 1;
  } else {
    console.log('✓ prod-smoke: the production bundle boots, renders, and logs no errors');
  }
  process.exit(code);
}
