#!/usr/bin/env node
/**
 * ipad-probe.mjs — the PRODUCTION bundle at an iPad viewport in WebKit (the engine iOS Safari runs), with the same
 * bundle in Chromium beside it as the control.
 *
 * WHY IT EXISTS. Kevin, on the live site (2026-09-23): "on ipad it seems the visuals are very buggy / broken in
 * general". Every harness here drives Chromium, and all but two drive the DEV server — so nothing had ever LOOKED at
 * the shipped bundle in WebKit. This does, the way a player gets there: a real tap on Start Adventure, no pointer lock
 * (iOS has none), an iPad Pro 11 viewport and user agent. Plan: docs/superpowers/plans/2026-09-23-crafty-perf-heat-ipad.md,
 * Tasks 1 and 5.
 *
 * WHAT IT REPORTS, per engine: the GL renderer string, the frames at fixed moments (title; +3 / +10 / +20 s after the
 * world is built) written as PNGs to open, the quality tier over time (the governor oscillating is one of the
 * suspects), console errors and warnings counted by message, page errors, and WebGL context losses. The Chromium
 * control separates "WebKit draws this wrong" from "this is wrong everywhere".
 *
 * An INSTRUMENT, not a gate: it prints and writes frames, it judges nothing. Exit 0 = measured · 3 = COULD NOT MEASURE
 * (named). Frame rate is load-dependent on this machine and is not reported.
 *
 * BLIND SPOT: macOS WebKit is not iPadOS WebKit — same engine and the same ANGLE-on-Metal WebGL path, but not the same
 * GPU, memory ceiling or thermal behaviour. A defect seen here is real in WebKit; a clean run here does not clear
 * the iPad.
 *
 * Needs a production build: `npm run build` first (the probe serves build/ with `vite preview`).
 * Usage:  node scripts/visual/ipad-probe.mjs [--out <dir>] [--engines webkit,chromium]
 */
import { webkit, chromium, devices } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { serveVite, probePort } from './_serve.mjs';

const PORT = probePort(import.meta.url);
const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const OUT = resolve(arg('--out', '/tmp/crafty-ipad'));
const ENGINES = arg('--engines', 'webkit,chromium').split(',');
const LAUNCHERS = { webkit, chromium };
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(resolve('build/index.html'))) {
  console.error('ipad-probe: COULD NOT MEASURE — no production build at build/index.html. Run `npm run build` first.');
  process.exit(3);
}
mkdirSync(OUT, { recursive: true });

async function probe(engine, url) {
  const browser = await LAUNCHERS[engine].launch({ headless: true });
  const report = { engine, gl: null, frames: [], tiers: [], console: {}, pageErrors: [], contextLost: 0, notes: [] };
  try {
    const context = await browser.newContext({ ...devices['iPad Pro 11 landscape'] });
    const page = await context.newPage();
    page.on('console', (m) => {
      if (m.type() !== 'error' && m.type() !== 'warning') return;
      const key = `${m.type()}: ${m.text().slice(0, 160)}`;
      report.console[key] = (report.console[key] || 0) + 1;
    });
    page.on('pageerror', (e) => report.pageErrors.push(e.message.slice(0, 300)));
    // iOS Safari has NO Pointer Lock. Remove it so nothing can pass through a desktop-only path (touch-probe.mjs).
    await page.addInitScript(() => {
      delete Element.prototype.requestPointerLock;
      delete HTMLElement.prototype.requestPointerLock;
      try { Object.defineProperty(document, 'pointerLockElement', { get: () => null }); } catch { /* read-only */ }
      document.exitPointerLock = () => {};
      window.__ipadProbe = { lost: 0 };
      document.addEventListener('webglcontextlost', () => { window.__ipadProbe.lost += 1; }, true);
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });

    const shot = async (label) => {
      const path = `${OUT}/${engine}-${label}.png`;
      await page.screenshot({ path });
      report.frames.push(path);
    };
    const tier = async (label) => {
      const t = await page.evaluate(() => window.useGameStore?.getState?.().qualityTier ?? null);
      report.tiers.push(`${label}:${t}`);
    };

    await page.waitForTimeout(8000);
    await shot('0-title');
    report.gl = await page.evaluate(() => {
      const c = document.createElement('canvas').getContext('webgl2');
      if (!c) return 'no webgl2';
      const ext = c.getExtension('WEBGL_debug_renderer_info');
      return ext ? c.getParameter(ext.UNMASKED_RENDERER_WEBGL) : c.getParameter(c.RENDERER);
    });

    const start = page.getByRole('button', { name: /Start Adventure/i });
    if ((await start.count()) === 0) {
      report.notes.push('COULD NOT MEASURE: no Start Adventure button on the title');
      return report;
    }
    await start.tap();
    try {
      await page.waitForFunction(() => window.useGameStore?.getState?.().isSpawnChunkLoaded === true, null, { timeout: 180000, polling: 1000 });
    } catch {
      report.notes.push('COULD NOT MEASURE: the world never built within 180 s (isSpawnChunkLoaded)');
      await shot('1-world-timeout');
      return report;
    }
    const t0 = Date.now();
    for (const [label, at] of [['1-world+3s', 3000], ['2-world+10s', 10000], ['3-world+20s', 20000]]) {
      await delay(Math.max(0, at - (Date.now() - t0)));
      await tier(label);
      await shot(label);
    }
    report.contextLost = await page.evaluate(() => window.__ipadProbe.lost);
    report.canvases = await page.evaluate(() => [...document.querySelectorAll('canvas')].map((c) => `${c.width}x${c.height}`));
    return report;
  } finally {
    await browser.close().catch(() => {});
  }
}

const { url, waitReady, shutdown } = serveVite(PORT, { preview: true });
let code = 0;
try {
  await waitReady();
  const reports = [];
  for (const engine of ENGINES) {
    if (!LAUNCHERS[engine]) throw new Error(`unknown engine "${engine}"`);
    console.log(`\n── ${engine} ─────────────────────────────`);
    const r = await probe(engine, url);
    reports.push(r);
    console.log(`  GL renderer   ${r.gl}`);
    console.log(`  canvases      ${(r.canvases || []).join(', ')}`);
    console.log(`  tiers         ${r.tiers.join('  ')}`);
    console.log(`  context lost  ${r.contextLost}`);
    console.log(`  page errors   ${r.pageErrors.length}${r.pageErrors.length ? '\n    ' + r.pageErrors.join('\n    ') : ''}`);
    const msgs = Object.entries(r.console).sort((a, b) => b[1] - a[1]);
    console.log(`  console       ${msgs.length} distinct error/warning message(s)`);
    for (const [m, n] of msgs.slice(0, 15)) console.log(`    ${String(n).padStart(4)}x  ${m}`);
    for (const n of r.notes) console.log(`  ${n}`);
    console.log(`  frames        ${r.frames.join('\n                ')}`);
    if (r.notes.some((n) => n.startsWith('COULD NOT MEASURE'))) code = 3;
  }
  writeFileSync(`${OUT}/report.json`, JSON.stringify(reports, null, 2));
  console.log(`\nreport: ${OUT}/report.json`);
} catch (e) {
  console.error(`ipad-probe: COULD NOT MEASURE — ${e.message}`);
  code = 3;
} finally {
  await shutdown(null);
}
process.exit(code);
