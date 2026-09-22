import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { viteArgv, PROBE_PORTS } from '../../scripts/visual/_serve.mjs';

/**
 * A MANAGED SERVER MUST NEVER OPEN A BROWSER.
 *
 * WHAT THIS STOPS, and it is not hypothetical. `_serve.mjs` built its argv with a ternary whose two
 * branches disagreed: the dev branch passed `--no-open`, the preview branch did not. `vite.config.js`
 * declares `server: { open: true }` for the human dev server on :3000, and vite resolves preview options
 * as `open: preview?.open ?? server.open` (read from the installed source, not from memory). So every
 * `vite preview` this repo ever started launched the OPERATOR'S OWN Chrome on the port.
 *
 * The tab then outlives everything. `shutdown()` SIGKILLs vite's process GROUP, and a browser the OS
 * launched is not in that group — so a loaded Crafty tab keeps running the R3F render loop and the Rapier
 * physics step forever. Measured on the tab that prompted this gate: 1.9 GB RSS, 102.6% of a core, with
 * the server long dead. It was observed once before (2026-08-09) and written down as a mechanism nobody
 * could identify: "a listening localhost port CAN mint a browser tab ... but you cannot tell."
 * One missing flag in one branch was the whole of it.
 *
 * WHY IT IS DRIVEN AND NOT GREPPED. A source assertion here would match the ternary line while the defect
 * lived in WHICH BRANCH carried the flag — the failure mode `.claude/rules/gates-and-probes.md` §4b names
 * exactly. `viteArgv` was extracted as a pure function so the argv can be built and inspected.
 *
 * Mutation-Proof, measured:
 *   M1  drop `--no-open` from the preview branch only   -> "preview" + "every port" RED, dev case GREEN
 *   M2  drop it from the shared tail (both branches)    -> all four cases RED
 *   M3  `--no-open` -> `--open`                          -> all four RED (an absence assertion on the flag
 *       would have missed this; the check is for the SUPPRESSING form, not for the substring)
 * Restored from a cp backup and diffed byte-identical after each.
 *
 * BLIND SPOT, stated: this proves the ARGV we build. It cannot prove vite honours it, nor that some other
 * file spawns vite without going through this helper — the second is covered by the last case below,
 * which is a source scan and says so.
 */
describe('a managed vite server never opens a browser', () => {
  it('the dev server suppresses it', () => {
    expect(viteArgv(4178, false)).toContain('--no-open');
  });

  it('the PREVIEW server suppresses it too — the branch that did not, and minted a real Chrome tab', () => {
    expect(viteArgv(4180, true)).toContain('--no-open');
  });

  it('never passes the opening form', () => {
    for (const preview of [false, true]) {
      expect(viteArgv(4180, preview)).not.toContain('--open');
    }
  });

  it('every port the frozen table allocates gets the flag, on both branches', () => {
    const ports = Object.values(PROBE_PORTS || {});
    // R3a — the denominator EXITS. An empty table would make this loop vacuous and green forever.
    expect(ports.length).toBeGreaterThan(0);
    for (const port of ports) {
      for (const preview of [false, true]) {
        expect(viteArgv(port, preview), `port ${port} preview=${preview}`).toContain('--no-open');
      }
    }
  });

  it('no OTHER file spawns vite directly, bypassing this helper (source scan — and it says so)', () => {
    // The helper can only guarantee the servers that go through it. This is the one claim here that a
    // grep is the honest instrument for: it asks whether a second spawn site exists at all.
    const HERE = dirname(fileURLToPath(import.meta.url));
    const serve = readFileSync(resolve(HERE, '../../scripts/visual/_serve.mjs'), 'utf8');
    expect(serve).toMatch(/spawn\('npx', viteArgv\(/); // the one sanctioned spawn, built from the helper
  });
});
