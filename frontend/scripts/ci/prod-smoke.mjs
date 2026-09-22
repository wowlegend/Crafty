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
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { serveVite } from '../visual/_serve.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
// A fourth dedicated port. capture=4178, e2e=4179, this=4180. Never an ad-hoc port: the one time a probe
// picked its own, it minted the worst crop of orphan cmux preview surfaces.
const PORT = 4180;

/**
 * THE GL ERROR LEDGER — the error class this gate exists to watch and structurally could not see.
 *
 * `.claude/rules/gates-and-probes.md` records that the production console carries
 * `GL_INVALID_OPERATION: glBlitFramebuffer` in two alternating forms, PER FRAME, until Chrome emits
 * "too many errors, no more errors will be reported to the context" and stops. Two consequences, and the
 * second is why a console scrape is the wrong instrument:
 *
 *   1. any console-message count is a FLOOR, not a count — the browser stops reporting;
 *   2. once muted, a genuine GL error later in that context is silenced too, so the noise disables the
 *      very channel this file's `page.on('console')` handler watches.
 *
 * `gl.getError()` is immune to both: it drains a queue on the context itself, with no console involved and
 * no muting. One call per frame, because reading DRAINS — a single poll at the end reports at most ONE
 * error for the whole run, which is how a count like this reads as clean.
 *
 * RATCHETED, NOT THRESHOLDED. Nobody knows the post-fix number, so the first run RECORDS and later runs
 * may FALL and never RISE — the same shape as the opsec, killability and source-grep ledgers here. That
 * makes the number falsifiable without pretending to know it.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────
 * WHAT THIS LEDGER CANNOT SETTLE, AND IT IS THE QUESTION IT WAS BUILT FOR
 *
 * CI's first seeded reading was `GL errors: 0 over 8 frames`. That is NOT evidence that the
 * `glBlitFramebuffer` storm is gone, and it must not be quoted as if it were.
 *
 * This probe launches with `--use-angle=swiftshader` — in CI exactly as locally. SwiftShader is a CPU
 * rasteriser: it reports MAX_SAMPLES 4, it does not implement the driver-side validation that emits
 * `GL_INVALID_OPERATION: glBlitFramebuffer: Read and write depth stencil attachments cannot be the same
 * image`, and the storm was only ever OBSERVED in a real Chrome on a real GPU. So a 0 here means "this
 * rasteriser raised nothing", which is the reading a driver that cannot raise it would always give.
 *
 * The ledger is therefore a REGRESSION GUARD FOR THE SWIFTSHADER PATH and nothing more. It will catch a
 * new GL error class that even SwiftShader validates; it cannot confirm the real-driver storm is fixed.
 * A real reading has to come from a real GPU — the operator's own Chrome, which is where the original
 * ~256-per-load observation came from (.claude/rules/gates-and-probes.md).
 *
 * This limit is stated here rather than discovered later because a ledger seeded at 0 reads like an
 * all-clear, and an all-clear from an instrument that cannot see the thing is the DEGRADED shape — the
 * most dangerous of the three, because it looks like success.
 */
export const GL_LEDGER_PATH = resolve(ROOT, 'frontend/tests/gates/.gl-error-ledger.json');

/** PURE: the verdict on a GL error count against the ledger, separated from I/O so a test can drive it. */
export function glVerdict(count, frames, ledger) {
  // R3a — zero frames means the poll never ran, and "0 errors over 0 frames" is the reading a dead
  // instrument gives. That is a control failure, not good news.
  if (!frames) {
    return { ok: false, control: true, line: 'GL errors: COULD NOT CHECK — polled over 0 frames; the instrument did not run.' };
  }
  const cap = ledger?.count;
  if (cap === undefined || cap === null) {
    return { ok: true, seed: true, line: `GL errors: ${count} over ${frames} frames — NO LEDGER YET, recording this as the ceiling. Re-freeze with --write-gl.` };
  }
  if (count > cap) {
    return {
      ok: false,
      line:
        `GL errors ROSE: ${count} over ${frames} frames, ceiling is ${cap}.\n` +
        '  A per-frame GL error is a real cost and it MUTES the console channel this gate watches for\n' +
        '  everything else. Find it before raising the ceiling; the ratchet may fall, never rise.',
    };
  }
  return { ok: true, line: `GL errors: ${count} over ${frames} frames (ceiling ${cap}${count < cap ? ' — FELL, re-freeze with --write-gl' : ''})` };
}

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

    // GL ERROR POLL — see the GL_LEDGER docblock above for why this, and not the console handler.
    const gl = await page.evaluate(
      () => new Promise((res) => {
        const c = document.querySelector('canvas');
        const ctx = c && (c.getContext('webgl2') || c.getContext('webgl'));
        if (!ctx) return res({ count: 0, frames: 0, codes: [] });
        let count = 0, n = 0;
        const codes = new Set();
        const stop = Date.now() + 3000;
        const tick = () => {
          n++;
          let e;
          // Drain EVERY error this frame: getError pops one per call, so a single read per frame would
          // undercount a storm by exactly the factor that makes a storm a storm.
          while ((e = ctx.getError()) !== ctx.NO_ERROR) { count++; codes.add(e); }
          if (Date.now() < stop) requestAnimationFrame(tick);
          else res({ count, frames: n, codes: [...codes] });
        };
        requestAnimationFrame(tick);
        setTimeout(() => res({ count, frames: n, codes: [...codes] }), 4000); // always resolves
      })
    );
    let glLedger = null;
    try { glLedger = JSON.parse(readFileSync(GL_LEDGER_PATH, 'utf8')); } catch { /* absent -> seed */ }
    const gv = glVerdict(gl.count, gl.frames, glLedger);
    console.log(`prod-smoke: ${gv.line}${gl.codes.length ? `  codes=[${gl.codes.join(',')}]` : ''}`);
    if (!gv.ok) errors.push(gv.line.split('\n')[0]);
    if (process.argv.includes('--write-gl')) {
      writeFileSync(GL_LEDGER_PATH, `${JSON.stringify({ count: gl.count, frames: gl.frames, at: new Date().toISOString() }, null, 2)}\n`);
      console.log(`prod-smoke: froze the GL ceiling at ${gl.count}`);
    }

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
