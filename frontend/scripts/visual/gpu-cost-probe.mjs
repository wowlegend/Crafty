#!/usr/bin/env node
/**
 * gpu-cost-probe.mjs — what the render actually COSTS, measured on the PRODUCTION bundle.
 *
 * WHY IT EXISTS. Nothing in this repo could answer "how expensive is a frame". The visual gate compares
 * pixels, prod-smoke counts frames and lost contexts, and `perf-siege.spec.js` runs against dev. So a
 * change that doubled GPU cost would ship green through every gate, and one did: the EffectComposer was
 * mounted with no `multisampling` prop, whose default is 8 (verified in the installed
 * @react-three/postprocessing source, not from memory) on a HalfFloat target — an 8x multisampled RGBA16F
 * buffer at full canvas resolution, resolved with blitFramebuffer every frame, while `<SMAA/>` sat in the
 * same chain doing shader antialiasing. The operator's fans were the only instrument that noticed.
 *
 * WHAT IT REPORTS, and why each number rather than "fps". Frame rate on a 34-session box is a measure of
 * the MACHINE, not the build — the load average moved 232 -> 38 inside one session here. So the headline
 * numbers are the ones a busy machine cannot move:
 *
 *   defaultFboSamples  the CANVAS framebuffer's sample count. NOT the composer's — the composer owns a
 *                      separate FBO this probe cannot reach, so a 0 here is not evidence that nothing is
 *                      multisampled. The first draft labelled it "MSAA samples" and printed
 *                      "(none — SMAA is doing the antialiasing)", which was a false all-clear about the
 *                      exact thing being investigated. The composer's sample count is a STATIC fact: read
 *                      the `multisampling` prop, and the package default if no prop is passed.
 *   driver max samples what this driver will actually grant. SwiftShader reports 4, so a request for 8 is
 *                      clamped — which is one reason this probe cannot settle the MSAA question at all.
 *   drawCalls, tris  renderer.info.render — geometry submitted per frame
 *   textures, geos   renderer.info.memory — what is resident
 *   programs         compiled shader programs (each effect pass adds at least one)
 *   glErrors         getError() drained per frame for N frames. The production console carries
 *                    GL_INVALID_OPERATION: glBlitFramebuffer per frame until Chrome MUTES the context
 *                    ("too many errors"), so a console-scrape undercounts by construction and this polls
 *                    the context directly instead.
 *   fps              reported LAST and labelled load-dependent, with the load average beside it, because
 *                    a number that moves 6x with someone else's build is not evidence about ours.
 *
 * Exit: 0 = measured (always, unless it could not measure) · 3 = COULD NOT MEASURE. It is an INSTRUMENT,
 * not a gate: it prints, it does not judge. The budget that judges is `tests/scripts/gpu-cost-budget`,
 * which reads the JSON this writes — separating the measurement from the verdict so a busy machine cannot
 * redden a push.
 *
 * Usage:  node scripts/visual/gpu-cost-probe.mjs [--json <path>] [--seconds N] [--dpr N]
 */
import puppeteer from 'puppeteer';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { serveVite, probePort } from './_serve.mjs';

const PORT = probePort(import.meta.url);
const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const SECONDS = Number(arg('--seconds', '6'));
// DPR 1 by default. Under SwiftShader (a CPU rasteriser) dpr 2 is 4x the pixels and the bundle renders
// 1-3 frames per SECOND, so it measures the rasteriser rather than the build. The dpr-2 memory figure a
// real Retina player pays is EXTRAPOLATED from the measured sample count instead, and labelled as such.
const DPR = Number(arg('--dpr', '1'));
const JSON_OUT = arg('--json', '');

const loadAvg = () => {
  try {
    return execSync('uptime', { encoding: 'utf8' }).match(/load averages?: ([\d.]+)/)?.[1] ?? '?';
  } catch { return '?'; }
};

async function main() {
  const { url, waitReady, shutdown } = serveVite(PORT, { preview: true });
  let browser;
  try {
    await waitReady();
    browser = await puppeteer.launch({
      headless: true,
      // Matched to prod-smoke, which is the one harness here proven to boot this bundle headless:
      // --use-angle=swiftshader (not --use-gl), and see the goto below.
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: DPR });
    // `networkidle2` never settles here — the game streams chunks continuously, so the first version of
    // this probe died on a 90s navigation timeout against a bundle that was rendering fine. prod-smoke
    // uses domcontentloaded for the same reason; readiness is then proven by entering play and by frames.
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Enter play so the real scene + composer exist. The menu canvas deliberately has no EffectComposer.
    // ENTERING PLAY IN THE *PRODUCTION* BUNDLE. The e2e suite uses
    // `window.__craftyTest.call('forcePlay')`, but that bridge is DEV-ONLY and stripped from the build —
    // so a probe that measures the shipped bundle cannot use it. `markGameStarted()` is the real store
    // action MenuSystem's own enterPlay calls, and `window.useGameStore` is the global prod really
    // exposes (prod-smoke drives sfxVolume through it).
    //
    // An earlier draft called `enterPlay()` on the store. It is not a store action — it is a closure
    // inside MenuSystem — so the probe exited 3 naming it. That honest failure is why this is correct now
    // rather than silently measuring the TITLE screen, whose canvas deliberately has NO EffectComposer.
    const entered = await page.evaluate(() => {
      const s = window.useGameStore?.getState?.();
      if (!s) return 'no window.useGameStore in the prod bundle';
      if (typeof s.markGameStarted !== 'function') return 'useGameStore has no markGameStarted';
      s.markGameStarted();
      return null;
    });
    if (entered) { console.error(`gpu-cost-probe: COULD NOT MEASURE — ${entered}`); process.exitCode = 3; return; }

    // The world must EXIST before the render cost means anything — measuring an empty scene would report
    // a cheap frame and be true about nothing. Strict, like startPlayActive: a world that never builds
    // fails here naming the flag.
    try {
      await page.waitForFunction(
        () => window.useGameStore.getState().isSpawnChunkLoaded === true,
        { timeout: 180000, polling: 1000 },
      );
    } catch {
      console.error(
        'gpu-cost-probe: COULD NOT MEASURE — isSpawnChunkLoaded never became true within 180s.\n' +
        '  Under the SwiftShader CPU rasteriser world-build is slow; this is a MEASUREMENT failure, not a\n' +
        '  verdict about the build. Re-run on an idle machine before drawing any conclusion.',
      );
      process.exitCode = 3;
      return;
    }
    await new Promise((r) => setTimeout(r, 12000));

    const m = await page.evaluate(async (secs) => {
      const gl = document.querySelector('canvas')?.getContext('webgl2');
      if (!gl) return { error: 'no webgl2 context on the canvas' };
      // R3F does not publish the renderer. Reach it through the canvas's fiber store, and if that
      // changes shape say so rather than printing null metrics beside a success line.
      // R3F does not publish the renderer, and the fiber-root shape has moved between versions — so try
      // the known accessors in order and REPORT WHICH ONE WORKED, rather than printing nulls beside a
      // success line. `canvas.__r3f.store` alone returned nothing here, and a probe that says UNMEASURED
      // is worth more than one that says 0.
      const canvasEl = document.querySelector('canvas');
      const f = canvasEl?.__r3f;
      const candidates = [
        ['__r3f.store', f?.store],
        ['__r3f.root', f?.root],
        ['__r3f.root.store', f?.root?.store],
        ['__r3f.container.store', f?.container?.store],
      ];
      let r = null, rVia = null;
      for (const [name, st] of candidates) {
        const gl = typeof st?.getState === 'function' ? st.getState()?.gl : st?.gl;
        if (gl?.info) { r = gl; rVia = name; break; }
      }
      const rWhy = r ? null : `could not reach the R3F renderer — tried ${candidates.map(([n]) => n).join(', ')}; renderer.info is UNMEASURED, not zero`;

      // Drain GL errors across real frames. One getError() per frame, because the queue is drained by
      // reading and a single poll at the end would report at most ONE error for the whole run.
      let glErrors = 0;
      const codes = new Set();
      const t0 = performance.now();
      let frames = 0;
      // Sample the heap on a timer independent of rAF: under SwiftShader rAF can drop to 2/s, and a
      // per-frame sample would then be 12 points over 6s and read as flat by accident.
      window.__heapSeries = [];
      const heapTimer = setInterval(() => {
        if (performance.memory) window.__heapSeries.push([Math.round(performance.now() - t0), Math.round(performance.memory.usedJSHeapSize / 1048576)]);
      }, 500);
      const _stopHeap = () => clearInterval(heapTimer);
      await new Promise((done) => {
        const tick = () => {
          frames++;
          let e;
          while ((e = gl.getError()) !== gl.NO_ERROR) { glErrors++; codes.add(e); }
          if (performance.now() - t0 >= secs * 1000) { _stopHeap(); return done(); }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      const elapsed = (performance.now() - t0) / 1000;

      // HEAP SERIES — a leak is a RATE, and a single reading cannot show one. Sampled across the poll so
      // the output is growth-per-second rather than a point that could be anywhere on a curve.
      const heapSeries = window.__heapSeries || [];

      const c = document.querySelector('canvas');
      const samples = gl.getParameter(gl.SAMPLES) || 0;
      const px = c.width * c.height;
      return {
        canvas: `${c.width}x${c.height}`,
        px,
        // HONESTY: this is the DEFAULT framebuffer's sample count. The EffectComposer renders into its
        // OWN multisampled FBO, which is not reachable from here — so a 0 here does NOT mean the composer
        // is unmultisampled, and the first draft of this probe printed exactly that reassurance. Read
        // `multisampling` off the <EffectComposer> prop in source for that; it is a static fact.
        defaultFboSamples: samples,
        maxSamples: gl.getParameter(gl.MAX_SAMPLES),
        // RGBA16F = 8 bytes per sample
        msaaMB: samples > 1 ? Math.round((px * 8 * samples) / 1048576) : 0,
        drawCalls: r?.info?.render?.calls ?? null,
        tris: r?.info?.render?.triangles ?? null,
        textures: r?.info?.memory?.textures ?? null,
        geometries: r?.info?.memory?.geometries ?? null,
        programs: r?.info?.programs?.length ?? null,
        rWhy,
        rVia,
        glErrors,
        glErrorCodes: [...codes],
        glErrorsPerFrame: frames ? +(glErrors / frames).toFixed(2) : 0,
        frames,
        fps: +(frames / elapsed).toFixed(1),
        heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
        heapSeries,
      };
    }, SECONDS);

    if (m.error) {
      console.error(`gpu-cost-probe: COULD NOT MEASURE — ${m.error}`);
      process.exitCode = 3;
      return;
    }

    const load = loadAvg();
    console.log(`\ngpu-cost-probe  (production bundle, dpr ${DPR}, ${m.canvas} = ${(m.px / 1e6).toFixed(1)} Mpx)`);
    console.log('  ── load-INDEPENDENT (a busy machine cannot move these) ───────────────────');
    console.log(`  default FBO samp. ${m.defaultFboSamples}   (the CANVAS framebuffer — NOT the composer's own render target, which is unreachable from here)`);
    console.log(`  driver max samples ${m.maxSamples}${m.maxSamples < 8 ? '   <- below 8, so a composer asking for 8 is CLAMPED in this environment' : ''}`);
    if (m.rWhy) {
      console.log(`  renderer.info     UNMEASURED — ${m.rWhy}`);
    } else {
      console.log(`  renderer via      canvas.${m.rVia}`);
      console.log(`  shader programs   ${m.programs}`);
      console.log(`  draw calls        ${m.drawCalls}`);
      console.log(`  triangles         ${m.tris}`);
      console.log(`  textures / geos   ${m.textures} / ${m.geometries}`);
    }
    console.log(`  GL errors         ${m.glErrors} over ${m.frames} frames = ${m.glErrorsPerFrame}/frame  codes=[${m.glErrorCodes.join(',')}]`);
    console.log('  ── load-DEPENDENT (evidence about the MACHINE, not the build) ────────────');
    console.log(`  fps               ${m.fps}   (1-min load average right now: ${load})`);
    console.log(`  JS heap           ${m.heapMB} MB`);
    if (m.heapSeries && m.heapSeries.length >= 3) {
      const [t0h, h0] = m.heapSeries[0];
      const [t1h, h1] = m.heapSeries[m.heapSeries.length - 1];
      const secs = Math.max(0.001, (t1h - t0h) / 1000);
      const rate = (h1 - h0) / secs;
      console.log(`  heap SERIES       ${m.heapSeries.map(([, h]) => h).join(' -> ')} MB over ${secs.toFixed(1)}s`);
      console.log(`  heap RATE         ${rate >= 0 ? '+' : ''}${rate.toFixed(1)} MB/s${rate > 1 ? '   <- GROWING. Extrapolated: ' + Math.round(rate * 60) + ' MB/min' : ''}`);
    } else {
      console.log('  heap SERIES       UNMEASURED — fewer than 3 samples; performance.memory may be absent');
    }

    if (JSON_OUT) {
      writeFileSync(JSON_OUT, `${JSON.stringify({ ...m, loadAvg: load, dpr: DPR, at: new Date().toISOString() }, null, 2)}\n`);
      console.log(`\n  wrote ${JSON_OUT}`);
    }
  } finally {
    // Anything you launch, you kill — and the browser closes BEFORE the server, so no page can outlive
    // the port. serveVite's shutdown() SIGKILLs vite's whole process group.
    await shutdown(browser);
  }
}

// Do not run on import. `cli-guard` exists for exactly this, and an `import()` smoke-check of this file
// spawned vite AND puppeteer before the guard was added.
if (process.argv[1] && resolve(process.argv[1]).endsWith('gpu-cost-probe.mjs')) main();
