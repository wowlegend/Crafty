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
