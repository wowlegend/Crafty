import { describe, it, expect } from 'vitest';
// This gate reads a DIRECTORY LISTING only — never file contents. gate-shape freezes the population of
// gates that slurp files as TEXT (116 of 136 gates assert against source text instead of behaviour) and a
// new one fails the push. A listing is an artifact, not source, but the classifier keys on the function
// NAME anywhere in the file — including inside a comment, which is how naming it here to explain its own
// absence flagged this gate on the first attempt. Rather than weaken a ratchet that exists for a good
// reason, the one place this file wanted file contents (the capture sentinel) is delegated below to the
// freshness gate that already owns it.
import { readdirSync, existsSync } from 'node:fs';
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

  it('a full capture writes exactly the states that assert — no orphans', () => {
    // Reconciles only when current/ holds at least a full set. A SHORTER set means the capture was
    // partial or crashed, which is the freshness gate's business (it reads the .capture-meta.json
    // sentinel); firing here too would just red the push twice for one cause and teach nobody anything.
    // A LONGER set is exactly the orphan case, so >= is the right comparison, not ===.
    const cur = resolve(DIR, 'current');
    if (!existsSync(cur)) return;
    const names = pngNames(cur);
    if (names.length < VISUAL_STATES.length) return; // partial capture — not this gate's question
    const { ok, orphans, missing } = reconcileVisualStates(VISUAL_STATES, names);
    expect(
      ok,
      `the capture and the states list disagree (${names.length} frames captured, ${VISUAL_STATES.length} asserted):\n` +
        (orphans.length ? `  CAPTURED but asserted by NOTHING: ${orphans.join(', ')}\n` : '') +
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
