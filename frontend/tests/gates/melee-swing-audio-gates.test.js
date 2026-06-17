import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
const between = (s, a, b) => { const i = s.indexOf(a); const j = s.indexOf(b, i + 1); return i >= 0 && j > i ? s.slice(i, j) : ''; };

// M6 #4: playAttackSounds (App.jsx -- the swing + delayed attack whoosh) was DEFINED-BUT-NEVER-CALLED, and
// the spatial 'swing' only played on a MISS -- so a connecting melee hit had impact but no whoosh. Now
// every committed swing fires playAttackSounds (the impact 'hit' still adds on connect). This pins the wiring.
describe('M6 #4 connecting-melee swing audio (dead playAttackSounds wired)', () => {
  const app = read('App.jsx');
  const comp = read('Components.jsx');

  it('App still defines the playAttackSounds helper', () => {
    expect(app).toMatch(/playAttackSounds:\s*\(\)\s*=>/);
  });

  it('triggerMeleeAttack fires playAttackSounds on every swing (was never invoked anywhere)', () => {
    const fn = between(comp, 'const triggerMeleeAttack', 'const triggerSpellCast');
    expect(fn).toMatch(/playAttackSounds\?\.\(\)/);
  });

  it('the swing whoosh is no longer miss-only (the miss-branch swing sound is gone)', () => {
    const fn = between(comp, 'const triggerMeleeAttack', 'const triggerSpellCast');
    expect(fn).not.toMatch(/playSpatialSound\('swing'/);
    // the connect impact still plays
    expect(fn).toMatch(/playSpatialSound\('hit'/);
  });
});
