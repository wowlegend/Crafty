import { test, expect } from '@playwright/test';

// E2E PERF coverage -- the audit's #1-gap residual (frame-rate-under-load). The existing dev-only
// perf-probe harness (src/devtest/perfProbe + PerfProbeRunner) drives the REAL game through a
// sustained night-siege (scenario B: deep night, nightCount=6 saturates the spawn ramp -> the
// heaviest steady-state) and publishes window.__craftyPerfResult. We run a SHORT window via the
// ?perfsec override so the gate stays fast.
//
// WHY LIVENESS, NOT AN FPS NUMBER: this runs under headless swiftshader (software WebGL), where
// absolute FPS is meaningless + machine-load-dependent (the same box that timed the visual capture
// out under load avg 7+). So the honest, non-flaky assertion is UNDER-LOAD LIVENESS: across a
// multi-second siege the rAF loop kept running (sampled real frames over the full wall-clock window)
// and threw no fatal runtime error. That catches freezes + per-frame throws that only manifest under
// load (mob AI, spawns, vfx) -- which the 1.5s smoke test cannot. A true freeze yields NO result at
// all (the probe promise never resolves) -> the waitForFunction below times out -> the test fails.
test('survives a sustained night-siege without freezing or throwing (perf probe B)', async ({ page }) => {
  test.setTimeout(150000); // terrain stream + 4s settle + ~12s siege, with swiftshader-under-load headroom
  const PERF_SEC = 12;

  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });

  await page.goto(`/?perf=B&perfsec=${PERF_SEC}`);

  // The probe auto-runs on mount (leaves the menu itself, pins tier, waits stable terrain, settles,
  // then samples). Wait for it to publish -- generously, since terrain streaming dominates the time.
  await page.waitForFunction(() => !!window.__craftyPerfResult, null, { timeout: 130000 });
  const r = await page.evaluate(() => window.__craftyPerfResult);

  expect(r.scenario, 'wrong scenario ran').toBe('B');
  // The loop sampled across (most of) the full wall-clock window -- a stall would cut this short.
  expect(r.seconds, `probe sampled only ${r.seconds}s of the ${PERF_SEC}s window -- loop stalled`).toBeGreaterThan(PERF_SEC * 0.5);
  // Real frames were produced under siege (a frozen loop never resolves -> we'd have timed out above;
  // this floor additionally rejects a degenerate single-frame resolve).
  expect(r.frames, 'too few frames sampled under siege -- render loop is not live').toBeGreaterThanOrEqual(5);
  expect(Number.isFinite(r.fps) && r.fps > 0, `fps not finite/positive: ${r.fps}`).toBe(true);
  expect(Number.isFinite(r.p95Ms) && r.p95Ms > 0, `p95 frame time not finite: ${r.p95Ms}`).toBe(true);
  expect(Number.isFinite(r.maxMs) && r.maxMs > 0, `max frame time not finite: ${r.maxMs}`).toBe(true);

  // No FATAL throw during the siege (the value-add over the short smoke boot). Pointer-lock rejection
  // + benign React dev warnings are ignored -- only the crash/throw classes this codebase has shipped.
  const fatal = errors.filter((e) =>
    /TypeError|is not a function|is not defined|Rendered (more|fewer) hooks|Maximum update depth|setTranslation|Cannot read prop/.test(e)
  );
  expect(fatal, `runtime errors during siege:\n${errors.join('\n') || '(none)'}`).toEqual([]);
});
