#!/usr/bin/env node
/**
 * lookbook-signal-check.mjs — drive the REAL scripts/visual/lookbook.mjs through the ways its run ends, against a
 * FAKE production build, and check what it leaves behind. Review of PR #23 (the instruments branch), items 1-3.
 *
 * WHY A FAKE BUILD. What is checked here is lookbook.mjs's own lifecycle — its vite server, its browser, its signal
 * handlers, what it writes — not the game. A build directory holding one index.html that answers the few reads the
 * --hold scenario makes (window.useGameStore, a Start Adventure button, isSpawnChunkLoaded) lets a run reach the hold in
 * seconds, on any machine, with no `npm run build`. The real game's hold is power-ab.sh's, on the operator's Mac.
 *
 * CASES (each one run of lookbook.mjs --hold, headless, --allow-software: the GPU is not what is checked):
 *   int   Ctrl-C while the browser is open: SIGINT after LOOKBOOK HOLD READY. The vite preview server must be gone
 *         from lookbook's port after the exit. Until this fix it was not: Playwright's own SIGINT handler (installed
 *         while a browser is open) closed the browser and called process.exit(130) before lookbook's handler reached
 *         `await shutdown()`, and vite runs in its own process group, out of reach of the terminal's SIGINT.
 *
 * Every case asserts a PRESENCE before the absence it is about: the port has a listener once the hold is READY.
 *
 * Mutation-Proof: int, run on 2026-10-27 against the pre-fix scripts/visual/_serve.mjs (no exit backstop) and the
 *   pre-fix lookbook.mjs -> FAIL "a listener is still on port 4238 after the interrupted run" (the vite preview server,
 *   which the check then killed); with the backstop -> PASS "exit 130, port 4238 free".
 *
 * Usage:  node scripts/dev/lookbook-signal-check.mjs [--case int]   (default: every case)
 * Exit 0 = every case passed · 1 = a case FAILED (named) · 3 = COULD NOT CHECK (named; never a pass).
 *
 * Anything it launches it kills: lookbook.mjs is SIGKILLed if it outlives a case, a listener left on the port is
 * killed by its process group and reported as the failure it is, and the temp build is removed. It binds no port of
 * its own (lookbook.mjs binds its allocated one, scripts/visual/_serve.mjs PROBE_PORTS).
 *
 * BLIND SPOT: Playwright's browser is not looked for after a case (its process carries nothing that ties it to this
 * run); Playwright's own process-exit handler kills it. Sweep with scripts/dev/kill-test-procs.sh after a FAIL.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROBE_PORTS } from '../visual/_serve.mjs';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const LOOKBOOK = join(APP, 'scripts/visual/lookbook.mjs');
const PORT = PROBE_PORTS['lookbook.mjs'];
const READY_TIMEOUT_MS = 120000;
const EXIT_TIMEOUT_MS = 30000;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/** The fake build's page. `seam` adds a window.__craftyLookbook stand-in. */
function fakeIndexHtml({ seam = '' } = {}) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>fake crafty build</title></head><body>
<button id="start">Start Adventure</button>
<canvas id="c" width="2560" height="1600" style="width:1280px;height:800px;display:block"></canvas>
<script>
  window.__started = false;
  document.getElementById('start').onclick = () => {
    window.__started = true;
    const c = document.getElementById('c');
    try { const p = c.requestPointerLock && c.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* refused */ }
  };
  const state = () => ({ isSpawnChunkLoaded: window.__started, qualityTier: 'high', isAlive: true, frameCap: 60 });
  window.useGameStore = Object.assign(function useGameStore() {}, { getState: state });
  ${seam}
</script></body></html>`;
}

/**
 * PIDs holding a LISTEN socket on `port`, any address family, by lsof. The one instrument for both the presence and
 * the absence: vite preview binds localhost as [::1] on this Mac, so a connect to 127.0.0.1 is refused while the server
 * is up — the first draft of this check read "nothing listens" with a live server (a dead instrument, caught by its
 * presence assertion).
 */
function listenerPids(port) {
  const r = spawnSync('lsof', ['-nP', '-t', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
  if (r.error) throw new Error(`lsof could not run (${r.error.message}) — no instrument for the port`);
  return [...new Set((r.stdout || '').split('\n').map(Number).filter((n) => n > 0))];
}
const listening = async (port) => listenerPids(port).length > 0;

/** Kill whatever a failed case left listening on the port, by process group. */
function killListeners(port) {
  for (const pid of listenerPids(port)) {
    const pg = Number(spawnSync('ps', ['-o', 'pgid=', '-p', String(pid)], { encoding: 'utf8' }).stdout.trim());
    try { process.kill(-pg, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
  }
}

/** Start lookbook.mjs --hold on a fresh fake build. Resolves once READY prints, or rejects naming why. */
function startHold({ holdS, seam }) {
  const dir = mkdtempSync(join(tmpdir(), 'crafty-lookbook-check-'));
  const build = join(dir, 'build');
  const out = join(dir, 'out');
  spawnSync('mkdir', ['-p', build]);
  writeFileSync(join(build, 'index.html'), fakeIndexHtml({ seam }));
  const child = spawn(process.execPath, [LOOKBOOK, '--hold', String(holdS), '--build-dir', build, '--out', out, '--allow-software'],
    { cwd: APP, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  const exited = new Promise((res) => child.once('exit', (code, signal) => res({ code, signal })));
  const ready = new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`no LOOKBOOK HOLD READY within ${READY_TIMEOUT_MS / 1000} s`)), READY_TIMEOUT_MS);
    const onData = (d) => {
      log += d;
      if (log.includes('LOOKBOOK HOLD READY')) { clearTimeout(t); res(); }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (d) => { log += d; });
    exited.then(({ code }) => { clearTimeout(t); rej(new Error(`lookbook exited ${code} before READY`)); });
  });
  return { child, dir, out, exited, ready, log: () => log };
}

/** Wait for the child to exit, or SIGKILL it at the deadline. */
async function awaitExit(run) {
  const timeout = delay(EXIT_TIMEOUT_MS).then(() => null);
  const r = await Promise.race([run.exited, timeout]);
  if (r) return r;
  try { run.child.kill('SIGKILL'); } catch { /* gone */ }
  return { code: null, signal: 'SIGKILL (did not exit within the deadline)' };
}

/** Poll the port for up to `ms`; true once nothing listens. */
async function portFreed(ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (!(await listening(PORT))) return true;
    await delay(250);
  }
  return !(await listening(PORT));
}

const CASES = {
  async int() {
    const run = startHold({ holdS: 120 });
    try {
      await run.ready;
      if (!(await listening(PORT))) return { verdict: 3, why: `presence: nothing listens on ${PORT} although the hold is READY — the instrument cannot see the server` };
      run.child.kill('SIGINT');
      const ex = await awaitExit(run);
      const freed = await portFreed();
      const fails = [];
      if (!freed) fails.push(`a listener is still on port ${PORT} after the interrupted run (pids ${listenerPids(PORT).join(', ')})`);
      if (ex.code !== 130) fails.push(`exit ${ex.code}${ex.signal ? ` (${ex.signal})` : ''}, expected 130`);
      return fails.length ? { verdict: 1, why: fails.join('; ') } : { verdict: 0, why: `exit 130, port ${PORT} free` };
    } finally {
      await cleanupRun(run);
    }
  },
};

/**
 * A case that ended early leaves lookbook running: TERM it first (its own handler closes the browser and vite), and
 * SIGKILL only past a deadline — a SIGKILLed lookbook cannot close its browser, so that path says so.
 */
async function cleanupRun(run) {
  if (run.child.exitCode === null && run.child.signalCode === null) {
    try { run.child.kill('SIGTERM'); } catch { /* gone */ }
    const done = await Promise.race([run.exited, delay(15000).then(() => null)]);
    if (!done) {
      try { run.child.kill('SIGKILL'); } catch { /* gone */ }
      await run.exited;
      console.error('  lookbook.mjs ignored SIGTERM for 15 s and was SIGKILLed: its headless Chromium may be orphaned —'
        + ' sweep with scripts/dev/kill-test-procs.sh');
    }
  }
  if (await listening(PORT)) killListeners(PORT);
  rmSync(run.dir, { recursive: true, force: true });
}

const want = (() => {
  const i = process.argv.indexOf('--case');
  return i > 0 ? process.argv[i + 1].split(',') : Object.keys(CASES);
})();
for (const c of want) {
  if (!CASES[c]) { console.error(`lookbook-signal-check: COULD NOT CHECK — unknown case "${c}" (known: ${Object.keys(CASES).join(', ')})`); process.exit(3); }
}
if (await listening(PORT)) {
  console.error(`lookbook-signal-check: COULD NOT CHECK — port ${PORT} is already in use (another lookbook run?); nothing was started`);
  process.exit(3);
}

const results = [];
for (const name of want) {
  let r;
  try { r = await CASES[name](); } catch (e) { r = { verdict: 3, why: e.message }; }
  results.push({ name, ...r });
  const tag = r.verdict === 0 ? 'PASS' : r.verdict === 1 ? 'FAIL' : 'COULD NOT CHECK';
  console.log(`  ${tag.padEnd(15)} ${name}: ${r.why}`);
}
const passed = results.filter((r) => r.verdict === 0).length;
console.log(`lookbook-signal-check: ${passed}/${results.length} case(s) passed`);
process.exit(results.some((r) => r.verdict === 1) ? 1 : results.some((r) => r.verdict === 3) ? 3 : 0);
