import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * THE VITE GROUP DIES WITH ITS OWNER (scripts/visual/_serve.mjs, the exit backstop; review of PR #23, item 2).
 *
 * serveVite spawns vite DETACHED, in its own process group, so shutdown() can kill npx and the forked vite together —
 * which also puts the group out of reach of the terminal's Ctrl-C. So the group dies only if something kills it.
 * shutdown() did, when the caller reached it. Ctrl-C on lookbook.mjs with a browser open did not reach it: Playwright's
 * own SIGINT handler (playwright-core 1.64.1 processLauncher) closes its browsers and calls process.exit(130), and the
 * `vite preview` server kept lookbook's port (reproduced by scripts/dev/lookbook-signal-check.mjs --case int).
 *
 * This drives the REAL serveVite in a child node process, serving a one-file build with `vite preview` on a free port,
 * and ends that process the three ways that matter: process.exit() from a signal handler without calling shutdown
 * (Playwright's shape, exactly), an uncaught throw, and the documented shutdown() (the control). After each, the
 * group must be gone and nothing must answer on the port — asserted only after the same instruments saw the group alive
 * and the server answering (presence before absence).
 *
 * SITING: tests/scripts/, beside kill-test-procs.test.js, which also drives a real script on processes it spawns. It
 * reads no source.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh on scripts/visual/_serve.mjs, 3 tests, every RED confirmed against a green baseline:
 *   B1 the backstop never registered (`process.on('exit', killGroup);` deleted) -> "process.exit from a signal handler",
 *      "an uncaught throw" (the control stays green: shutdown() still kills the group)
 *   B2 plausible-wrong: the backstop kills the npx wrapper only (`server.kill('SIGKILL')`, not the group) -> the same two
 *   B3 shutdown() no longer kills the group (`killGroup();` in shutdown deleted, the backstop left on) -> "shutdown()";
 *      the backstop still kills the group at exit, so the control is what catches a shutdown that only unregisters
 *   I0 identity (a comment edit in _serve.mjs) SURVIVED.
 *
 * BLIND SPOT: a signal NO listener handles ends node with no 'exit' event, so the backstop cannot run; a probe that wants
 * Ctrl-C to clean up still installs a handler (lookbook.mjs does). A SIGKILLed owner leaves the group by definition.
 */

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SERVE_URL = pathToFileURL(join(APP, 'scripts/visual/_serve.mjs')).href;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/** A port nothing listens on, on either address family, at the moment of asking. */
function freePort() {
  return new Promise((res, rej) => {
    const s = createServer();
    s.once('error', rej);
    s.listen(0, () => { const { port } = s.address(); s.close(() => res(port)); });
  });
}

/** The child: serve `build` on `port`, print READY <group pid>, then end as `mode` says once told "go" on stdin. */
const FIXTURE = `
const [, port, build, mode, serveUrl] = process.argv; // node -e: argv[0] is node, no script path

const { serveVite } = await import(serveUrl);
const { server, waitReady, shutdown } = serveVite(Number(port), { preview: true, outDir: build });
await waitReady(120);
if (mode === 'exit-from-handler') process.on('SIGINT', () => process.exit(130));
process.stdin.setEncoding('utf8');
process.stdin.on('data', async () => {
  if (mode === 'uncaught') setTimeout(() => { throw new Error('fixture: an uncaught throw'); }, 0);
  if (mode === 'shutdown') { await shutdown(null); process.exit(0); }
});
console.log('READY ' + server.pid);
setInterval(() => {}, 1000);
`;

const groupAlive = (pgid) => { try { process.kill(-pgid, 0); return true; } catch { return false; } };
const answers = async (port) => { try { return (await fetch(`http://localhost:${port}/`)).ok; } catch { return false; } };

let live = null; // { child, pgid, dir } — killed in afterEach whatever happened: anything this test launches, it kills
afterEach(async () => {
  if (!live) return;
  if (live.child.exitCode === null && live.child.signalCode === null) live.child.kill('SIGKILL');
  if (live.pgid && groupAlive(live.pgid)) { try { process.kill(-live.pgid, 'SIGKILL'); } catch { /* gone */ } }
  rmSync(live.dir, { recursive: true, force: true });
  live = null;
});

/** Run the fixture to READY, check the presences, end it the `mode` way; report what is left once it has exited. */
async function runAndEnd(mode, end) {
  const dir = mkdtempSync(join(tmpdir(), 'crafty-serve-backstop-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>backstop fixture</title>');
  const port = await freePort();
  const child = spawn(process.execPath, ['--input-type=module', '-e', FIXTURE, '--', String(port), dir, mode, SERVE_URL],
    { cwd: APP, stdio: ['pipe', 'pipe', 'pipe'] });
  live = { child, pgid: null, dir };
  const exited = new Promise((r) => child.once('exit', (code, signal) => r({ code, signal })));
  let out = '';
  const pgid = await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`fixture never printed READY: ${out}`)), 90000);
    child.stdout.on('data', (d) => { out += d; const m = out.match(/READY (\d+)/); if (m) { clearTimeout(t); res(Number(m[1])); } });
    child.stderr.on('data', (d) => { out += d; });
    exited.then(({ code }) => { clearTimeout(t); rej(new Error(`fixture exited ${code} before READY: ${out}`)); });
  });
  live.pgid = pgid;
  expect(groupAlive(pgid), 'presence: the vite group is not alive at READY — the instrument cannot see it').toBe(true);
  expect(await answers(port), 'presence: the server does not answer at READY').toBe(true);
  end(child);
  const ex = await exited;
  // Reparented to init and reaped: give the dead group a moment to leave the process table.
  for (let i = 0; i < 40 && groupAlive(pgid); i++) await delay(100);
  return { ex, groupLeft: groupAlive(pgid), answering: await answers(port) };
}

describe('serveVite: the vite group dies with the process that owns it', () => {
  it('process.exit from a signal handler, shutdown() never called (Playwright\'s SIGINT shape)', async () => {
    const r = await runAndEnd('exit-from-handler', (c) => c.kill('SIGINT'));
    expect(r.ex.code, 'the fixture did not exit through its handler').toBe(130);
    expect(r.groupLeft, 'the vite group outlived its owner').toBe(false);
    expect(r.answering, 'something still answers on the port').toBe(false);
  }, 120000);

  it('an uncaught throw', async () => {
    const r = await runAndEnd('uncaught', (c) => c.stdin.write('go\n'));
    expect(r.ex.code, 'the fixture did not die of its throw').toBe(1);
    expect(r.groupLeft, 'the vite group outlived its owner').toBe(false);
    expect(r.answering, 'something still answers on the port').toBe(false);
  }, 120000);

  it('shutdown(), the documented path (the control)', async () => {
    const r = await runAndEnd('shutdown', (c) => c.stdin.write('go\n'));
    expect(r.ex.code).toBe(0);
    expect(r.groupLeft, 'shutdown() left the vite group').toBe(false);
    expect(r.answering, 'something still answers on the port').toBe(false);
  }, 120000);
});
