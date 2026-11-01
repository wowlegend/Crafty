// _serve.mjs — shared vite + browser lifecycle for the visual probe scripts (the hygiene rule in .claude/rules/gates-and-probes.md).
//
// Fixes the repo-wide probe-hygiene bug class (holistic review): probes spawned `npx vite` NON-detached and
// killed it with `server.kill()`, which only reaps the npx WRAPPER and ORPHANS the forked vite child holding
// the port; and many closed the browser only on the happy path, leaking headless Chromium on a throw. This
// helper encapsulates the pattern first proven in ocean-probe.mjs (ran to 0 leaked procs):
//   - spawn vite DETACHED (its own process group) so shutdown() can SIGKILL the WHOLE group.
//   - shutdown() closes the browser under an 8s timeout (cleared on settle) + force-kills its process — a
//     GPU-context-lost / crashed headless Chrome leaves close() hanging on an unanswered CDP command forever.
//
// Usage:
//   import { serveVite } from './_serve.mjs';
//   const { url, waitReady, shutdown } = serveVite(PORT);
//   let browser = null, code = 0;
//   try { await waitReady(); browser = await chromium.launch(...); /* probe */ }
//   catch (e) { console.error(e); code = 1; }
//   finally { await shutdown(browser); }
//   process.exit(code);
import { spawn } from 'node:child_process';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Spawn `vite` on `port` in its OWN process group.
 * @param {number} port
 * @param {{cwd?: string}} [opts]
 * @returns {{ server: import('node:child_process').ChildProcess, url: string,
 *            waitReady: (tries?: number) => Promise<void>, shutdown: (browser?: any) => Promise<void> }}
 */
/**
 * PURE. The argv for one managed vite process. Extracted from `serveVite` so it can be DRIVEN by a test
 * rather than grepped — a text assertion on the ternary that used to live here would have matched the
 * line while the defect sat in which branch carried a flag.
 *
 * ── `--no-open` ON BOTH BRANCHES, and why it was missing from one ───────────────────────────────────
 * The preview branch omitted it until 2026-09-22, and that single missing flag is the whole mechanism
 * behind a bug this repo had recorded as unexplainable ("a listening localhost port CAN mint a browser
 * tab ... but you cannot tell", .claude/rules/gates-and-probes.md).
 *
 * The chain, each link verified rather than inferred:
 *   1. `vite.config.js` declares `server: { open: true }` (for the human dev server on :3000).
 *   2. vite resolves preview options as `open: preview?.open ?? server.open` — read from the INSTALLED
 *      source, `resolvePreviewOptions` in dist/node/chunks. There is no `preview` block in our config.
 *   3. So `vite preview` inherited `open: true` and launched the SYSTEM DEFAULT BROWSER — the operator's
 *      own Chrome, not a harness browser — on a tab pointed at the port.
 *   4. `shutdown()` SIGKILLs vite's process GROUP. A browser the OS launched is not in that group, so the
 *      tab survives, and a loaded Crafty tab keeps running the R3F render loop and the Rapier physics
 *      step at ~100% of a core indefinitely. Measured today: 1.9 GB RSS, 102.6% CPU, server long dead.
 *
 * That is also why only :4180 ever did it — it was the one preview port; every dev server (e2e's 4179 and
 * the frozen table below) took the other branch and passed the flag. The asymmetry WAS the bug.
 *
 * Never let a managed server open a browser. The harness brings its own; anything else is the operator's.
 */
export function viteArgv(port, preview = false, outDir = null) {
  const base = preview ? ['vite', 'preview'] : ['vite'];
  // `outDir` (preview only): serve a build kept elsewhere — the power A/B's other arm (scripts/dev/power-ab.sh
  // --build-dir) — instead of build/. `vite preview --outDir <dir>` (vite 6.4.5 `vite preview --help`).
  const out = preview && outDir ? ['--outDir', String(outDir)] : [];
  return [...base, '--port', String(port), '--strictPort', '--no-open', ...out];
}

export function serveVite(port, { cwd, preview = false, outDir = null } = {}) {
  const url = `http://localhost:${port}`;
  // `preview: true` serves the BUILT bundle from build/ instead of the dev server. Same lifecycle, same
  // process-group kill — the whole point of this helper is that there is one correct way to do that, and
  // a fourth hand-rolled spawn would be a fourth chance to orphan vite on the port.
  const server = spawn('npx', viteArgv(port, preview, outDir), { cwd: cwd || process.cwd(), stdio: 'ignore', detached: true });

  const waitReady = async (tries = 60) => {
    for (let i = 0; i < tries; i++) {
      try { const r = await fetch(url); if (r.ok) return; } catch { /* not up yet */ }
      await delay(250);
    }
    throw new Error(`vite did not start on ${port}`);
  };

  // kill the whole vite process GROUP (npx wrapper + forked child); fall back to a plain kill. Synchronous, so it can
  // run inside a process 'exit' listener.
  const killGroup = () => {
    try { process.kill(-server.pid, 'SIGKILL'); } catch { try { server.kill('SIGKILL'); } catch { /* already gone */ } }
  };
  // THE EXIT BACKSTOP (review of PR #23, item 2). shutdown() runs only if the caller gets to it, and a process can end
  // without that: Playwright installs its own SIGINT handler while a browser is open (playwright-core 1.64.1
  // processLauncher `sigintHandler`: gracefullyCloseAll(), then process.exit(130)), so Ctrl-C on lookbook.mjs exited
  // before lookbook's own handler reached `await shutdown()` — and this group, detached and therefore out of reach of
  // the terminal's SIGINT by design, kept the port. node runs 'exit' listeners on every process.exit and on an uncaught
  // throw, so the group dies with its owner on all of those. It cannot cover a signal no listener handles (node's
  // default action ends the process with no 'exit' event): a probe that wants Ctrl-C to clean up still installs one.
  process.on('exit', killGroup);

  const shutdown = async (browser) => {
    if (browser) {
      // race close() against a timeout (cleared on settle so no timer lingers), then force-kill the browser.
      await new Promise((res) => {
        const t = setTimeout(res, 8000);
        browser.close().then(() => { clearTimeout(t); res(); }).catch(() => { clearTimeout(t); res(); });
      });
      try { const p = browser.process && browser.process(); if (p && !p.killed) p.kill('SIGKILL'); } catch { /* already gone */ }
    }
    killGroup();
    process.off('exit', killGroup);
  };

  return { server, url, waitReady, shutdown };
}

/**
 * ONE PORT PER PROBE, ALLOCATED HERE RATHER THAN IN EACH FILE.
 *
 * Measured 2026-08-12: of the probes under scripts/visual, FIFTEEN shared just six ports — 4196 was
 * claimed by four different files, 4195 by three, 4194/4198/5197/5199 by two each. Every one of them
 * binds with `--strictPort`, so running two that collide does not queue or fall back: the second dies
 * on bind and the failure reads as a broken probe rather than as two probes wanting one socket.
 *
 * The fix belongs in the shared instrument, not in twenty-five hand-picked constants — a helper is used
 * at the moment of the mistake, a convention is read before it. A probe that forgets to register throws
 * with its own filename in the message instead of silently colliding with whatever 4196 is today.
 *
 * The block holds every server a script under scripts/visual or scripts/perf starts, and is contiguous so a gap
 * is visible. The e2e (4179) and prod-smoke (4180) servers are managed outside it.
 */
export const PROBE_PORTS = Object.freeze({
  'gpu-cost-probe.mjs': 4210,
  'ipad-probe.mjs': 4211,
  'look-e2e.mjs': 4212,
  'lookbook.mjs': 4213,
  'ocean-probe.mjs': 4214,
  'pov-probe.mjs': 4215,
  'touch-probe.mjs': 4216,
  'run-scenarios.mjs': 4217,
  'media.mjs': 4218,
  'first-night.mjs': 4219
});

/** Resolve THIS probe's port from its own `import.meta.url`. Throws if the file is unregistered. */
export function probePort(metaUrl) {
  const base = String(metaUrl).split('/').pop();
  const port = PROBE_PORTS[base];
  if (!port) {
    throw new Error(
      `probePort: "${base}" is not in PROBE_PORTS (scripts/visual/_serve.mjs). Add it with an unused ` +
      `port rather than copying another probe's constant — every probe binds --strictPort, so a shared ` +
      `port makes the second one die on bind and look broken.`
    );
  }
  return port;
}
