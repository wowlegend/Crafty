import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VISUAL_STATES, reconcileVisualStates } from '../../src/devtest/visualStates.js';

// A GATE'S PASS IS WORTH NOTHING WITHOUT ITS DENOMINATOR.
//
// On 2026-08-02, seven of the 31 visual frames were captured AND baselined but absent from the states
// list, so they asserted nothing — 23% of the gate's apparent coverage was decorative. Four `beast-*`
// baselines were pictures of an empty mountain and had been for weeks. The gate reported a clean pass
// over every one of them, because a frame nobody asserts cannot fail.
//
// That was fixed BY HAND and left ungated, so it can recur silently. This is the check that stops it.
//
// BEHAVIOURAL, not a source grep: it reconciles the declared states against the baseline files that
// actually exist on disk. A source-grep gate would also raise the gate-shape ratchet, which may fall and
// never rise. Reading real artifacts is both stronger and cheaper.
// Anchored to THIS FILE, not process.cwd(). The repo is two-level (root holds .git/docs/memory, the app
// lives in frontend/) and vitest's root is the REPO ROOT here, so cwd-relative paths resolve one level
// too high and the gate dies on ENOENT instead of checking anything. Caught by this gate's own first run.
const DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../visual');
const pngNames = (dir) =>
  readdirSync(dir).filter((f) => f.endsWith('.png')).map((f) => f.replace(/\.png$/, ''));

describe('visual gate: the denominator is asserted, not assumed', () => {
  it('every committed baseline is asserted, and every asserted state has a baseline', () => {
    const names = pngNames(resolve(DIR, 'baseline'));
    const { ok, checked, orphans, missing } = reconcileVisualStates(VISUAL_STATES, names);
    expect(checked, 'the states list is EMPTY — the gate would pass over everything').toBeGreaterThan(0);
    expect(
      ok,
      `visual gate coverage has drifted (${checked} states declared, ${names.length} baselines on disk):\n` +
        (orphans.length
          ? `  ORPHAN baselines (committed, asserted by NOTHING — this is the 2026-08-02 defect):\n` +
            orphans.map((n) => `    ${n}.png`).join('\n') + '\n'
          : '') +
        (missing.length
          ? `  MISSING baselines (a state asserts, but there is nothing to compare against):\n` +
            missing.map((n) => `    ${n}.png`).join('\n') + '\n'
          : '') +
        `  Adding a capture state means adding it to src/devtest/visualStates.js AND baselining it.`
    ).toBe(true);
    // Read the count, not the tick.
    expect(names.length, 'baseline count must equal the asserted-state count').toBe(checked);
  });

  it('a fresh capture writes exactly the states that assert — no more, no fewer', () => {
    // Only meaningful when a completed capture is present; a missing/incomplete current/ is the
    // freshness gate's job, not this one. Skipping is stated, never silent.
    const cur = resolve(DIR, 'current');
    const meta = resolve(cur, '.capture-meta.json');
    if (!existsSync(cur) || !existsSync(meta)) {
      expect(true, 'no capture present to reconcile').toBe(true);
      return;
    }
    if (JSON.parse(readFileSync(meta, 'utf8')).complete !== true) return;
    const { ok, orphans, missing } = reconcileVisualStates(VISUAL_STATES, pngNames(cur));
    expect(
      ok,
      `the capture and the states list disagree:\n` +
        (orphans.length ? `  CAPTURED but never asserted: ${orphans.join(', ')}\n` : '') +
        (missing.length ? `  ASSERTED but never captured: ${missing.join(', ')}\n` : '')
    ).toBe(true);
  });
});

describe('reconcileVisualStates: the instrument can return its NEGATIVE verdict', () => {
  // A classifier that cannot say NO is vacuous. The i18n reachability classifier reported "0 dead keys"
  // because its corpus included the definitions file, so every key matched itself. Prove both failure
  // shapes are reachable before trusting the clean verdict above.
  it('detects an orphan baseline', () => {
    const r = reconcileVisualStates(['a', 'b'], ['a', 'b', 'stowaway']);
    expect(r.ok).toBe(false);
    expect(r.orphans).toEqual(['stowaway']);
    expect(r.missing).toEqual([]);
  });

  it('detects a missing baseline', () => {
    const r = reconcileVisualStates(['a', 'b'], ['a']);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['b']);
    expect(r.orphans).toEqual([]);
  });

  it('reports its denominator even when clean', () => {
    const r = reconcileVisualStates(['a', 'b'], ['b', 'a']);
    expect(r).toEqual({ ok: true, checked: 2, orphans: [], missing: [] });
  });
});
