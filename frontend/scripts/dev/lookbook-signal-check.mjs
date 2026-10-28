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
 *   term  power-ab.sh's TERM, mid-hold: SIGTERM shortly after READY. lookbook must exit 143, free the port, and write
 *         hold.json with what it has — the timeline so far — marked `partial: true`, `stoppedBy: "SIGTERM"`. Until this
 *         fix its TERM handler wrote nothing.
 *   complete  a short hold that runs out: exit 0 and a hold.json marked `partial: false`, held for the time asked.
 *   arm   one power-ab.sh ARM end to end, with `sudo` on PATH replaced by a stand-in that prints powermetrics-shaped
 *         samples (no root is used; /usr/bin/powermetrics is never run). The arm must wait out the hold instead of
 *         TERMing it, so its hold.json is complete (`partial: false`), and still exit 0 with a summary. Until this fix
 *         every normal arm TERMed the driver ~37 s before its hold ended, and no hold.json was written at all.
 *
 * Every case asserts a PRESENCE before the absence it is about: the port has a listener once the hold is READY.
 *
 * Mutation-Proof: int, run on 2026-10-27 against the pre-fix scripts/visual/_serve.mjs (no exit backstop) and the
 *   pre-fix lookbook.mjs -> FAIL "a listener is still on port 4238 after the interrupted run" (the vite preview server,
 *   which the check then killed); with the backstop -> PASS "exit 130, port 4238 free".
 * Mutation-Proof: term, complete, arm, run on 2026-10-27 against the pre-fix lookbook.mjs and power-ab.sh -> FAIL "no
 *   hold.json was written" (term), "hold.partial is undefined" (complete), "the arm left no hold.json" (arm). After the
 *   fix, one mutant at a time, each case re-run: the signal handler writing no record -> FAIL term; the signalled record
 *   marked partial: false -> FAIL term; the normal end writing no record -> FAIL complete; the arm TERMing the driver
 *   right after sampling -> FAIL arm ("the scenario exited 143", "hold.json is marked partial (SIGTERM, 13 s of 51)");
 *   identity (a comment edit in lookbook.mjs) -> PASS. SURVIVED: the held-seconds clock running on through the browser
 *   close (complete's upper bound catches it only when the close takes over 2 s, as it did once under load: 18 s for a
 *   3 s hold).
 *
 * Usage:  node scripts/dev/lookbook-signal-check.mjs [--case int,term,complete,arm]   (default: every case; ~2 min,
 *         macOS: the arm case runs power-ab.sh, which refuses anything else)
 * Exit 0 = every case passed · 1 = a case FAILED (named) · 3 = COULD NOT CHECK (named; never a pass).
 *
 * Anything it launches it kills: a lookbook.mjs that outlives its case is TERMed, and SIGKILLed past 15 s; a listener
 * left on the port is killed by its process group and reported as the failure it is; the temp builds are removed. It
 * binds no port of its own (lookbook.mjs binds its allocated one, scripts/visual/_serve.mjs PROBE_PORTS).
 *
 * BLIND SPOT: Playwright's browser is not looked for after a case (its process carries nothing that ties it to this
 * run); Playwright's own process-exit handler kills it. Sweep with scripts/dev/kill-test-procs.sh after a FAIL.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync, readdirSync, chmodSync } from 'node:fs';
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

  async term() {
    const HOLD_S = 120;
    const run = startHold({ holdS: HOLD_S });
    try {
      await run.ready;
      if (!(await listening(PORT))) return { verdict: 3, why: `presence: nothing listens on ${PORT} although the hold is READY` };
      await delay(1500); // inside the hold loop: its first timeline sample is taken at t=0
      run.child.kill('SIGTERM');
      const ex = await awaitExit(run);
      const freed = await portFreed();
      const fails = [];
      if (ex.code !== 143) fails.push(`exit ${ex.code}${ex.signal ? ` (${ex.signal})` : ''}, expected 143`);
      if (!freed) fails.push(`a listener is still on port ${PORT}`);
      const h = readHold(run.out);
      if (!h) fails.push('no hold.json was written');
      else {
        if (h.hold?.partial !== true) fails.push(`hold.partial is ${JSON.stringify(h.hold?.partial)}, expected true`);
        if (h.hold?.stoppedBy !== 'SIGTERM') fails.push(`hold.stoppedBy is ${JSON.stringify(h.hold?.stoppedBy)}`);
        if (!(h.hold?.timeline?.length >= 1)) fails.push(`the timeline so far was not kept (${h.hold?.timeline?.length ?? 'none'} samples)`);
        if (!(h.hold?.heldS < HOLD_S)) fails.push(`heldS ${h.hold?.heldS} is not short of the ${HOLD_S} s asked`);
        if (h.hold?.requestedS !== HOLD_S) fails.push(`requestedS ${h.hold?.requestedS}, expected ${HOLD_S}`);
      }
      return fails.length ? { verdict: 1, why: fails.join('; ') }
        : { verdict: 0, why: `exit 143, port free, hold.json partial after ${h.hold.heldS} s of ${HOLD_S} (${h.hold.timeline.length} sample(s))` };
    } finally {
      await cleanupRun(run);
    }
  },

  async complete() {
    const HOLD_S = 3;
    const run = startHold({ holdS: HOLD_S });
    try {
      await run.ready;
      const ex = await awaitExit(run);
      const freed = await portFreed();
      const fails = [];
      if (ex.code !== 0) fails.push(`exit ${ex.code}${ex.signal ? ` (${ex.signal})` : ''}, expected 0: ${run.log().slice(-300)}`);
      if (!freed) fails.push(`a listener is still on port ${PORT}`);
      const h = readHold(run.out);
      if (!h) fails.push('no hold.json was written');
      else {
        if (h.hold?.partial !== false) fails.push(`hold.partial is ${JSON.stringify(h.hold?.partial)}, expected false`);
        // Held for the time asked, and not credited with the browser close that follows it.
        if (!(h.hold?.heldS >= HOLD_S && h.hold?.heldS <= HOLD_S + 2)) fails.push(`heldS ${h.hold?.heldS}, expected ${HOLD_S}..${HOLD_S + 2}`);
      }
      return fails.length ? { verdict: 1, why: fails.join('; ') } : { verdict: 0, why: `exit 0, hold.json complete (${h.hold.heldS} s)` };
    } finally {
      await cleanupRun(run);
    }
  },

  async arm() {
    const dir = mkdtempSync(join(tmpdir(), 'crafty-power-arm-check-'));
    const build = join(dir, 'build');
    const bin = join(dir, 'bin');
    const outRoot = join(dir, 'arms');
    spawnSync('mkdir', ['-p', build, bin, outRoot]);
    writeFileSync(join(build, 'index.html'), fakeIndexHtml());
    writeFileSync(join(bin, 'sudo'), FAKE_SUDO);
    chmodSync(join(bin, 'sudo'), 0o755);
    const SAMPLES = 10;
    const child = spawn('sh', ['scripts/dev/power-ab.sh', 'check', '--samples', String(SAMPLES), '--warmup', '1', '--headless',
      '--build-dir', build, '--out-root', outRoot], { cwd: APP, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
    let log = '';
    child.stdout.on('data', (d) => { log += d; });
    child.stderr.on('data', (d) => { log += d; });
    const exited = new Promise((r) => child.once('exit', (code, signal) => r({ code, signal })));
    try {
      const ex = await Promise.race([exited, delay(300000).then(() => null)]);
      if (!ex) { child.kill('SIGTERM'); await exited; return { verdict: 1, why: 'the arm did not finish within 300 s' }; }
      const armDir = readdirSync(outRoot).map((d) => join(outRoot, d)).find((d) => existsSync(join(d, 'meta.txt')));
      const fails = [];
      if (ex.code !== 0) fails.push(`the arm exited ${ex.code}: ${log.split('\n').filter(Boolean).slice(-4).join(' | ')}`);
      if (!armDir) return { verdict: 3, why: `the arm made no run directory under ${outRoot}: ${log.slice(-300)}` };
      const h = readHold(armDir);
      if (!h) fails.push('the arm left no hold.json — the driver was stopped before its hold ended and wrote nothing');
      else if (h.hold?.partial !== false) fails.push(`hold.json is marked partial (${h.hold?.stoppedBy}, ${h.hold?.heldS} s of ${h.hold?.requestedS})`);
      if (!/GPU\s+\d/.test(log)) fails.push('no GPU row in the printed summary');
      if (await listening(PORT)) fails.push(`a listener is still on port ${PORT}`);
      return fails.length ? { verdict: 1, why: fails.join('; ') }
        : { verdict: 0, why: `arm exit 0, summary printed, hold.json complete (${h.hold.heldS} s of ${h.hold.requestedS})` };
    } finally {
      if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; }
      if (await listening(PORT)) killListeners(PORT);
      rmSync(dir, { recursive: true, force: true });
    }
  },
};

/** hold.json in `dir`, parsed, or null. */
function readHold(dir) {
  const p = join(dir, 'hold.json');
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

/**
 * The `sudo` stand-in for the arm case: `sudo -v` succeeds, `sudo powermetrics ... -n N` prints N samples in the shape
 * scripts/dev/power-summary.mjs parses, one a second, and anything else is refused. Nothing runs as root.
 */
const FAKE_SUDO = `#!/bin/sh
[ "$1" = "-v" ] && exit 0
[ "$1" = "powermetrics" ] || { echo "fake sudo: refusing $*" >&2; exit 1; }
n=10
while [ $# -gt 0 ]; do [ "$1" = "-n" ] && n="$2"; shift; done
i=0
while [ "$i" -lt "$n" ]; do
  sleep 1
  printf '*** Sampled system activity (fake) (1000.0ms elapsed) ***\\n\\nCPU Power: 1000 mW\\nGPU Power: 2000 mW\\n'
  printf 'Combined Power (CPU + GPU + ANE): 3000 mW\\nCurrent pressure level: Nominal\\n\\n'
  i=$((i + 1))
done
`;

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
