import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

/**
 * THE SWEEP KILLS LEAKS, NOT LIVE RUNS (scripts/dev/kill-test-procs.sh).
 *
 * The sweep decided "leaked" by AGE: anything older than 3 minutes was fair game. A visual capture 15
 * minutes into a 31-frame run was killed that way, by a sweep meant to tidy up after a short e2e beside it
 * (2026-09-22). The property that actually separates a leak from a run is OWNERSHIP — whether the process
 * tree still reaches a live runner, or has been reparented to launchd because its runner died.
 *
 * This drives the real script on processes the test spawns itself, matched by a marker no real process
 * carries (KTP_PATTERN), so it cannot touch a capture or e2e that happens to be running on the machine:
 *   - an OWNED process (child of this test) must survive, and its owner must be NAMED;
 *   - an ORPHAN (its spawning shell exited) must be killed;
 *   - an orphaned CHAIN (matching parent -> matching child, as Chrome -> its helpers, npm -> vite) must be
 *     killed whole: the walk goes up past matching ancestors to the first non-matching one;
 *   - --force kills the owned one too.
 * Lives in tests/scripts/ because its subject is a TOOL executed on fixtures, like freeze-density.
 *
 * Mutation-Proof: by hand against scripts/dev/kill-test-procs.sh (cp backup, byte-verified restore), each RED:
 *   K1 plausible-wrong: every candidate treated as orphaned (the old blanket sweep) -> "owned" RED
 *   K2 plausible-wrong: owner = the immediate parent, no walk past matching ancestors -> "chain" + "named" RED
 *      (a 2-deep chain did NOT catch this: the post-sleep second pass killed the re-adopted child anyway)
 *   K3 --force ignored                                                                 -> "force" RED
 *   K4 owners never reported                                                           -> "named" RED
 *   K5 plausible-wrong: crashpad handlers swept like any orphan                         -> "crashpad" RED
 *   K6 crashpad handlers never swept, even with no browser left                         -> "crashpad" RED
 *
 * BLIND SPOT: the DEFAULT patterns are not driven here. They were checked by hand against a live capture's
 * real process table on 2026-09-22 (vite -> npm exec -> capture.mjs; Chrome helpers -> Chrome -> capture.mjs;
 * crashpad handlers at PPID 1) — which is how the crashpad exception was found, after this suite was green.
 */
const SCRIPT = resolve(process.cwd(), 'scripts/dev/kill-test-procs.sh');
const MARK = `ktp-canary-${process.pid}-${Date.now()}`;
const idle = (tag) => ['-e', 'setInterval(() => {}, 1000)', `${MARK}-${tag}`];
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const pidsOf = (tag) => {
  const r = spawnSync('pgrep', ['-f', `${MARK}-${tag}`], { encoding: 'utf8' });
  return r.stdout.split('\n').filter(Boolean).map(Number);
};
const sweep = (...args) =>
  execFileSync('sh', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, KTP_PATTERN: MARK, KTP_BROWSER: `${MARK}-browser`, KTP_CRASHPAD: `${MARK}-crashpad` },
  });
const waitFor = async (fn, ms = 5000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return true; await new Promise((r) => setTimeout(r, 50)); }
  return fn();
};

// A matching process that spawns a matching child of its own, `depth` levels deep: the shape of
// `npm exec vite` -> vite, or Chrome -> its helpers. Every level carries the marker in its own argv.
const FIXTURE_DIR = mkdtempSync(join(tmpdir(), 'ktp-'));
const CHAIN = join(FIXTURE_DIR, 'chain.cjs');
writeFileSync(CHAIN, [
  "const { spawn } = require('child_process');",
  'const depth = Number(process.argv[2]); const tag = process.argv[3];',
  "if (depth > 1) spawn(process.execPath, [__filename, String(depth - 1), tag], { stdio: 'ignore' });",
  'setInterval(() => {}, 1000);',
].join('\n'));
const chainArgs = (depth, tag) => [CHAIN, String(depth), `${MARK}-${tag}`];

// An orphan: a shell starts it in the background and exits, so launchd adopts it.
const orphan = (tag, depth = 1) => {
  const args = depth > 1 ? chainArgs(depth, tag) : idle(tag);
  spawnSync('sh', ['-c', `'${process.execPath}' ${args.map((a) => `'${a}'`).join(' ')} >/dev/null 2>&1 &`]);
};

const cleanup = () => { spawnSync('pkill', ['-9', '-f', MARK]); };
afterEach(cleanup);
afterAll(() => rmSync(FIXTURE_DIR, { recursive: true, force: true }));

describe('kill-test-procs: ownership decides, not age', () => {
  it('kills an orphan, leaves an owned process alone, and NAMES the owner', async () => {
    const owned = spawn(process.execPath, idle('owned'), { stdio: 'ignore' });
    orphan('orphan');
    expect(await waitFor(() => pidsOf('orphan').length === 1), 'the orphan fixture never started').toBe(true);
    const orphanPid = pidsOf('orphan')[0];
    expect(alive(owned.pid) && alive(orphanPid), 'fixtures not both alive before the sweep').toBe(true);

    const out = sweep();

    expect(await waitFor(() => !alive(orphanPid)), `the ORPHAN survived the sweep:\n${out}`).toBe(true);
    expect(alive(owned.pid), `owned: the sweep killed a process whose runner is ALIVE:\n${out}`).toBe(true);
    expect(out, `named: the live owner was not reported:\n${out}`).toMatch(new RegExp(`owner ${process.pid}:`));
    expect(out).toMatch(/swept 1 orphaned process/);
  });

  it('kills an orphaned CHAIN whole — the walk goes past matching ancestors', async () => {
    // Three deep. Without the walk, each pass kills only the top of the chain and the rest is re-adopted by
    // launchd one level at a time — a 2-deep chain still died by the second pass and hid the missing walk.
    orphan('chain', 3);
    expect(await waitFor(() => pidsOf('chain').length === 3), 'the 3-deep chain fixture never started').toBe(true);
    const pids = pidsOf('chain');

    const out = sweep();

    expect(await waitFor(() => pids.every((p) => !alive(p))),
      `chain: an orphaned chain survived (${pids.filter(alive).length}/3 alive):\n${out}`).toBe(true);
  });

  it('names the RUNNER as the owner of a live chain, not the wrapper in between', async () => {
    // The live shape: this test -> a matching wrapper -> a matching child (capture.mjs -> npm exec vite ->
    // vite). The owner worth naming is the runner; naming the wrapper points at the wrong process to stop.
    const wrapper = spawn(process.execPath, chainArgs(2, 'live-chain'), { stdio: 'ignore' });
    expect(await waitFor(() => pidsOf('live-chain').length === 2), 'the live chain fixture never started').toBe(true);

    const out = sweep();

    expect(pidsOf('live-chain').length, `the sweep killed part of a LIVE chain:\n${out}`).toBe(2);
    expect(out, `named: the runner (${process.pid}) is not named as the owner:\n${out}`).toMatch(new RegExp(`owner ${process.pid}:`));
    expect(out, `named: the wrapper (${wrapper.pid}) was named as an owner:\n${out}`).not.toMatch(new RegExp(`owner ${wrapper.pid}:`));
  });

  it('a PPID-1 crashpad handler is KEPT while a live browser exists, and swept once none does', async () => {
    // Chrome's crashpad handlers double-fork to PPID 1 while their Chrome is alive, and name a shared crash
    // database rather than their instance (read off a live capture's process table, 2026-09-22) — so the
    // plain orphan rule would kill a live run's handler. They are held while any browser is owned.
    const browser = spawn(process.execPath, idle('browser'), { stdio: 'ignore' });
    orphan('crashpad');
    expect(await waitFor(() => pidsOf('crashpad').length === 1 && alive(browser.pid)), 'fixtures never started').toBe(true);
    const [crashpad] = pidsOf('crashpad');

    const held = sweep();
    expect(alive(crashpad), `crashpad: a live browser's crashpad handler was swept:\n${held}`).toBe(true);
    expect(held).toMatch(/crashpad handler\(s\) at PPID 1, kept/);

    browser.kill('SIGKILL');
    expect(await waitFor(() => !alive(browser.pid))).toBe(true);
    const out = sweep();
    expect(await waitFor(() => !alive(crashpad)), `crashpad: an orphaned crashpad handler survived with no browser left:\n${out}`).toBe(true);
  });

  it('--force kills an owned process too', async () => {
    const owned = spawn(process.execPath, idle('forced'), { stdio: 'ignore' });
    expect(await waitFor(() => alive(owned.pid))).toBe(true);
    const out = sweep('--force');
    expect(await waitFor(() => !alive(owned.pid)), `force: --force left an owned process alive:\n${out}`).toBe(true);
  });

  it('with nothing matching, it sweeps nothing and says so', () => {
    const out = sweep();
    expect(out).toMatch(/swept 0 orphaned process\(es\); 0 still alive/);
  });
});
