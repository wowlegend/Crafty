import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROBE_PORTS, probePort } from '../../scripts/visual/_serve.mjs';

const VISUAL = resolve(dirname(fileURLToPath(import.meta.url)), '../../scripts/visual');

// FIFTEEN PROBES SHARED SIX PORTS, AND EVERY ONE OF THEM BINDS --strictPort.
//
// Measured 2026-08-12, before this gate existed: 4196 was claimed by four separate probes, 4195 by three,
// and 4194 / 4198 / 5197 / 5199 by two each. `--strictPort` means the second one to start does not fall
// back to the next free socket — it dies on bind, and the failure reads as a broken probe rather than as
// two probes wanting one port. The repo has already paid for that exact confusion once on the capture
// port, and the finding notes the compounding case: a leaked vite from a crashed run squats the shared
// port and blocks a DIFFERENT probe, which then looks broken for reasons in nobody's diff.
//
// The fix was to move allocation into `_serve.mjs` — a helper is used at the moment of the mistake, a
// convention is read before it. This gate is what stops the collision from creeping back one
// copy-pasted `const PORT = 4196` at a time.
//
// SITING, stated rather than hidden: this lives in tests/scripts/ next to node-runtime-declared.test.js,
// not in tests/gates/, because the last assertion below must read probe SOURCE and the gate-shape
// ratchet (tests/gates/.source-grep-ledger.json) freezes that population so it may only fall. There is
// no behavioural substitute for "the file calls the allocator" short of executing 25 probes, each of
// which spawns vite plus headless Chromium. The other three assertions ARE behavioural — they drive the
// real exported table and the real function, including its failure path.

/**
 * Every script here that STARTS A SERVER — classified by what the file does, not by its name.
 *
 * This was a filename exclusion list (`!f.startsWith('_') && f !== 'freeze-density.mjs'`), and it broke
 * the first time a non-server script was added to the directory: make-og-image.mjs, which reads a PNG
 * and writes a PNG, was reported as a probe with no port allocation. An exclusion list is a denominator
 * that rots — it has to be edited by whoever adds a file, which is exactly the person not thinking about
 * this gate. Asking whether the file spawns vite cannot go stale that way.
 */
const bindsAPort = (src) => /serveVite\s*\(|['"]vite['"]\s*,\s*'--port'|'--port'/.test(src);

const probeFiles = () =>
  readdirSync(VISUAL)
    .filter((f) => f.endsWith('.mjs') && !f.startsWith('_'))
    .filter((f) => bindsAPort(readFileSync(resolve(VISUAL, f), 'utf8')));

describe('probe ports are allocated centrally, one per probe', () => {
  it('no two probes are assigned the same port', () => {
    const entries = Object.entries(PROBE_PORTS);
    expect(entries.length, 'PROBE_PORTS is empty — every assertion below would be vacuous').toBeGreaterThan(20);

    const byPort = new Map();
    for (const [file, port] of entries) {
      expect(Number.isInteger(port), `${file} is registered with a non-integer port ${port}`).toBe(true);
      if (!byPort.has(port)) byPort.set(port, []);
      byPort.get(port).push(file);
    }
    const shared = [...byPort.entries()].filter(([, files]) => files.length > 1);
    expect(
      shared.map(([port, files]) => `${port}: ${files.join(', ')}`),
      'these probes share a port, and --strictPort makes the second one die on bind',
    ).toEqual([]);
  });

  it('the table and the directory agree in BOTH directions', () => {
    // One direction alone is the classic half-gate: checking only that registered names exist lets an
    // unregistered probe ship, and checking only that files are registered lets the table rot with
    // entries for deleted probes, silently reserving ports.
    const onDisk = probeFiles();
    expect(onDisk.length, 'no probe files found — the path moved and this test is asserting nothing').toBeGreaterThan(20);

    const registered = new Set(Object.keys(PROBE_PORTS));
    const unregistered = onDisk.filter((f) => !registered.has(f));
    expect(unregistered, 'probe files with no port allocation — these would throw at startup').toEqual([]);

    const onDiskSet = new Set(onDisk);
    const orphaned = [...registered].filter((f) => !onDiskSet.has(f));
    expect(orphaned, 'PROBE_PORTS reserves ports for files that no longer exist').toEqual([]);
  });

  it('probePort resolves a real probe and REFUSES an unregistered one', () => {
    // The negative case is the whole value of the helper. Without it a new probe could copy an existing
    // constant and collide silently; with it, forgetting to register is a named error naming your file.
    const [someFile, somePort] = Object.entries(PROBE_PORTS)[0];
    expect(probePort(`file:///anywhere/scripts/visual/${someFile}`)).toBe(somePort);

    expect(() => probePort('file:///anywhere/scripts/visual/not-a-real-probe.mjs')).toThrow(/not-a-real-probe\.mjs/);
    expect(() => probePort('file:///anywhere/scripts/visual/not-a-real-probe.mjs')).toThrow(/PROBE_PORTS/);
  });

  it('every probe takes its port from the allocator, never a literal', () => {
    const files = probeFiles();
    let checked = 0;
    for (const f of files) {
      const src = readFileSync(resolve(VISUAL, f), 'utf8');
      expect(
        /const PORT = probePort\(import\.meta\.url\)/.test(src),
        `${f} does not take its port from probePort(import.meta.url)`,
      ).toBe(true);
      // Anchored to the DECLARATION form, not to a bare number, so a port mentioned in a comment or a
      // timeout of 4000ms cannot red this — and so a real re-hardcoding cannot hide as one.
      const literal = src.match(/const PORT\s*=\s*\d+/);
      expect(literal, `${f} re-hardcodes a port: ${literal?.[0]}`).toBe(null);
      checked++;
    }
    expect(checked, 'the denominator drifted from the directory listing').toBe(files.length);
    expect(checked).toBeGreaterThan(20);
  });
});
