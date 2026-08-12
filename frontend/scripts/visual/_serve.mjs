// _serve.mjs — shared vite + browser lifecycle for the visual probe scripts (charter §6.4 hygiene).
//
// Fixes the repo-wide probe-hygiene bug class (holistic review): probes spawned `npx vite` NON-detached and
// killed it with `server.kill()`, which only reaps the npx WRAPPER and ORPHANS the forked vite child holding
// the port; and many closed the browser only on the happy path, leaking headless Chromium on a throw. This
// helper encapsulates the pattern already proven in ocean-probe.mjs + capture.mjs (ran to 0 leaked procs):
//   - spawn vite DETACHED (its own process group) so shutdown() can SIGKILL the WHOLE group.
//   - shutdown() closes the browser under an 8s timeout (cleared on settle) + force-kills its process — a
//     GPU-context-lost / crashed headless Chrome leaves close() hanging on an unanswered CDP command forever.
//
// Usage:
//   import { serveVite } from './_serve.mjs';
//   const { url, waitReady, shutdown } = serveVite(PORT);
//   let browser = null, code = 0;
//   try { await waitReady(); browser = await puppeteer.launch(...); /* probe */ }
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
export function serveVite(port, { cwd, preview = false } = {}) {
  const url = `http://localhost:${port}`;
  // `preview: true` serves the BUILT bundle from build/ instead of the dev server. Same lifecycle, same
  // process-group kill — the whole point of this helper is that there is one correct way to do that, and
  // a fourth hand-rolled spawn would be a fourth chance to orphan vite on the port.
  const argv = preview
    ? ['vite', 'preview', '--port', String(port), '--strictPort']
    : ['vite', '--port', String(port), '--strictPort', '--no-open'];
  const server = spawn('npx', argv, { cwd: cwd || process.cwd(), stdio: 'ignore', detached: true });

  const waitReady = async (tries = 60) => {
    for (let i = 0; i < tries; i++) {
      try { const r = await fetch(url); if (r.ok) return; } catch { /* not up yet */ }
      await delay(250);
    }
    throw new Error(`vite did not start on ${port}`);
  };

  const shutdown = async (browser) => {
    if (browser) {
      // race close() against a timeout (cleared on settle so no timer lingers), then force-kill the browser.
      await new Promise((res) => {
        const t = setTimeout(res, 8000);
        browser.close().then(() => { clearTimeout(t); res(); }).catch(() => { clearTimeout(t); res(); });
      });
      try { const p = browser.process && browser.process(); if (p && !p.killed) p.kill('SIGKILL'); } catch { /* already gone */ }
    }
    // kill the whole vite process GROUP (npx wrapper + forked child); fall back to a plain kill.
    try { process.kill(-server.pid, 'SIGKILL'); } catch { try { server.kill('SIGKILL'); } catch { /* already gone */ } }
  };

  return { server, url, waitReady, shutdown };
}

/**
 * ONE PORT PER PROBE, ALLOCATED HERE RATHER THAN IN EACH FILE.
 *
 * Measured 2026-08-12: of the probes under scripts/visual, FIFTEEN shared just six ports — 4196 was
 * claimed by four different files, 4195 by three, 4194/4198/5197/5199 by two each. Every one of them
 * binds with `--strictPort`, so running two that collide does not queue or fall back: the second dies
 * on bind and the failure reads as a broken probe rather than as two probes wanting one socket. This
 * repo has already paid for that exact confusion once, on the capture port.
 *
 * The fix belongs in the shared instrument, not in twenty-five hand-picked constants — a helper is used
 * at the moment of the mistake, a convention is read before it. A probe that forgets to register throws
 * with its own filename in the message instead of silently colliding with whatever 4196 is today.
 *
 * capture.mjs keeps 4178, which is documented as a managed port elsewhere; everything else is
 * reallocated into a contiguous block so a gap is visible.
 */
export const PROBE_PORTS = Object.freeze({
  'capture.mjs': 4178,
  'dayphase-probe.mjs': 4210,
  'death-probe.mjs': 4211,
  'drive-elemancer.mjs': 4212,
  'drive-mobs.mjs': 4213,
  'esc-pause-probe.mjs': 4214,
  'grass-probe.mjs': 4215,
  'grass-swatch-probe.mjs': 4216,
  'hands-probe.mjs': 4217,
  'heldf-probe.mjs': 4218,
  'hub-probe.mjs': 4219,
  'hud-probe.mjs': 4220,
  'look-e2e.mjs': 4221,
  'magic-panel-probe.mjs': 4222,
  'mobdeath-probe.mjs': 4223,
  'ocean-probe.mjs': 4224,
  'pause-resume-probe.mjs': 4225,
  'pov-probe.mjs': 4226,
  'quest-log-probe.mjs': 4227,
  'settings-probe.mjs': 4228,
  'soulbind-eyes-probe.mjs': 4229,
  'spawn-legibility-probe.mjs': 4230,
  'spell-elements-probe.mjs': 4231,
  'storm-probe.mjs': 4232,
  'touch-probe.mjs': 4233
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
