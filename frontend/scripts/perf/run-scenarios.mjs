// run-scenarios.mjs — S2-B2-M2: drive the five perf scenarios (A..E) through a HEADED Chrome
// (real GPU — SwiftShader numbers would be meaningless) and collect window.__craftyPerfResult
// per scenario. Writes the report JSON to <repo-root>/memory/perf/ (committed evidence) and
// prints the C−B gate verdict using the same tested budget module the app uses.
// Usage: node scripts/perf/run-scenarios.mjs [--scenarios=A,B,C]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import os from 'node:os';
import puppeteer from 'puppeteer';
import { compareScenarios, withinBudget, M2_BUDGET } from '../../src/devtest/frameStats.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');         // frontend/
const OUT_DIR = resolve(ROOT, '../memory/perf');  // repo-root memory/perf/
const PORT = 4179;
const URL = `http://localhost:${PORT}`;
const arg = process.argv.find((a) => a.startsWith('--scenarios='));
const IDS = (arg ? arg.split('=')[1].split(',') : ['A', 'B', 'C', 'D', 'E']).map((s) => s.trim().toUpperCase());
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch {}
    await delay(250);
  }
  throw new Error('dev server did not start');
}

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--no-open'], { cwd: ROOT, stdio: 'ignore' });
process.on('exit', () => { try { server.kill('SIGTERM'); } catch {} });

try {
  await waitForServer(URL);
  // HEADLESS 'new': a headed window launched from an agent/CI context gets macOS-occlusion-
  // suspended (rAF starves -> CDP timeouts; observed 2x on 2026-06-10), while headless runs a
  // 60Hz begin-frame clock reliably. GPU is requested explicitly; the ACTUAL WebGL renderer
  // string is captured into the report — if it says SwiftShader the run is a CPU-raster proxy
  // (overstates render cost -> conservative gate), and the report says so honestly. The C−B
  // DELTA methodology holds either way (both sides of every delta use the same renderer).
  const browser = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 300000, // a 60s rAF sample must never trip the default CDP timeout
    args: ['--window-size=1380,1100', '--enable-gpu', '--use-angle=metal'],
    defaultViewport: { width: 1366, height: 1024 }, // iPad-ish canvas aspect
  });
  const results = {};
  let renderer = null;
  for (const id of IDS) {
    const page = await browser.newPage();
    await page.goto(`${URL}/?perf=${id}`, { waitUntil: 'domcontentloaded' });
    if (!renderer) {
      renderer = await page.evaluate(() => {
        const gl = document.createElement('canvas').getContext('webgl2');
        const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
        return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
      });
      console.log(`WebGL renderer: ${renderer}`);
    }
    process.stdout.write(`scenario ${id}: running…`);
    await page.waitForFunction('Boolean(window.__craftyPerfResult)', { timeout: 240000, polling: 1000 });
    results[id] = await page.evaluate(() => window.__craftyPerfResult);
    const r = results[id];
    console.log(` done — fps ${r.fps.toFixed(1)} · median ${r.medianMs.toFixed(2)}ms · p95 ${r.p95Ms.toFixed(2)}ms · long ${r.longFrames}`);
    await page.close();
  }
  await browser.close();

  const report = { host: os.hostname(), platform: `${os.type()} ${os.arch()}`, renderer, when: new Date().toISOString(), budget: M2_BUDGET, results, deltas: {} };
  if (results.B) {
    for (const id of Object.keys(results)) {
      if (id !== 'B' && id !== 'A') report.deltas[`${id}-B`] = compareScenarios(results.B, results[id]);
    }
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const file = resolve(OUT_DIR, `m2-${os.hostname().split('.')[0]}-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(`\nwrote ${file}`);
  if (Object.keys(report.deltas).length) console.table(report.deltas);
  const cb = report.deltas['C-B'];
  if (cb) console.log(`M2 gate C−B vs budget ${JSON.stringify(M2_BUDGET)}: ${withinBudget(cb) ? 'PASS ✅' : 'FAIL ❌'}`);
} finally {
  try { server.kill('SIGTERM'); } catch {}
}
