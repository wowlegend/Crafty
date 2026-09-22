import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceFiles } from './_srcWalk.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const cfg = readFileSync(resolve(HERE, '../../tailwind.config.cjs'), 'utf8');

// M6 #6: `animate-fade-in` was referenced by 8 panels (Credits/Quest/Crafting/GamePanels) but NO fadeIn
// keyframe/animation existed -> the class silently did nothing (panels popped in). This pins the definition
// so the class resolves; the visual gate proves the capture baselines stay byte-identical (fade < 900ms delay).
/*
 * ENHANCED 2026-09-22, selected by `gate-census.mjs` at 0/5.
 *
 * The original defect: `animate-fade-in` was used by eight panels and NO matching keyframe existed, so
 * the class silently did nothing and panels popped in. The gate written for it pinned that one animation
 * by name — fixing the instance and calling it the class. The next `animate-*` class someone writes
 * without defining it fails exactly the same way, silently, and this gate would have been green.
 *
 * So it now asserts the PROPERTY: every `animate-<name>` class used anywhere in src/ resolves to an
 * animation defined in the tailwind config. A CSS class that does not exist produces no error, no
 * warning and no visual change — it is the quietest failure in the stack.
 *
 * BLIND SPOT, stated (R7): it matches class names in source text, so a class assembled at runtime
 * (`animate-${kind}`) is invisible, and it proves the animation is DEFINED, not that it looks right or
 * that its duration is sane.
 *
 * Mutation-Proof: 3 mutations, recorded on the commit.
 */
describe('M6 #6 animate-fade-in keyframe defined (was a silent no-op)', () => {
  it('EVERY animate-* class used in src resolves to a defined animation — the class, not one instance', () => {
    const used = new Set();
    for (const f of sourceFiles()) {
      for (const m of readFileSync(f, 'utf8').matchAll(/\banimate-([a-z][a-z0-9-]*)\b/g)) used.add(m[1]);
    }
    // R3a: an empty set resolves trivially and would report every animation healthy.
    expect(used.size, 'no animate-* classes found — this passes over an empty set').toBeGreaterThan(2);
    // Tailwind's own built-ins need no config entry.
    const BUILTIN = new Set(['spin', 'ping', 'pulse', 'bounce', 'none']);
    const unresolved = [...used].filter((n) => !BUILTIN.has(n) && !new RegExp(`'${n}':`).test(cfg));
    expect(unresolved, 'an animate-* class has no animation defined — it silently does nothing')
      .toEqual([]);
  });

  it('tailwind config defines the fadeIn keyframe', () => {
    expect(cfg).toMatch(/fadeIn:\s*\{/);
  });

  it('tailwind config defines the fade-in animation (so animate-fade-in resolves)', () => {
    expect(cfg).toMatch(/'fade-in':\s*'fadeIn/);
  });
});
