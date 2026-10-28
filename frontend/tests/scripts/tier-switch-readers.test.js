import { describe, it, expect } from 'vitest';
import { TIERS } from '../../src/render/quality.js';
import { sourceTexts } from '../gates/_srcWalk.js';

/**
 * Every quality-tier switch has a reader. `outlineWorldEdge` sat on all three tiers from S1-A until 2026-10-28 with no
 * reader anywhere (plan 2026-10-28-crafty-sota-reset item #16, unit W2-A), and the tier table read as if the high tier
 * drew world-edge outlines. A switch nothing reads is a claim about the renderer that the renderer does not make.
 *
 * Sited in tests/scripts because its subject is the source tree's content (which property names some file reads),
 * not behaviour.
 *
 * Mutation-Proof: recorded on the commit that added this file.
 *
 * BLIND SPOT: a reader is any `.name` access in comment-stripped src outside quality.js, so a same-named property on
 * an unrelated object counts as one. It proves a switch is named in code, not that the renderer honours it.
 */
const switches = [...new Set(Object.values(TIERS).flatMap((t) => Object.keys(t)))].sort();
const code = sourceTexts().filter((t) => t.file !== 'render/quality.js');

describe('every quality-tier switch is read somewhere in src', () => {
  it('reads the real population', () => {
    expect(Object.keys(TIERS).sort()).toEqual(['high', 'low', 'med']);
    expect(switches.length, 'the tier table has no switches').toBeGreaterThanOrEqual(10);
    expect(code.length, 'the src walk found almost nothing').toBeGreaterThanOrEqual(250);
  });

  it('no switch is declared without a reader', () => {
    const unread = switches.filter((k) => !code.some((t) => new RegExp(`\\.${k}\\b`).test(t.code)));
    console.log(`[tier-switches] ${switches.length} switches, ${code.length} files; unread: ${unread.join(', ') || 'none'}`);
    expect(unread, `tier switches no file reads: ${unread.join(', ')}`).toEqual([]);
  });
});
