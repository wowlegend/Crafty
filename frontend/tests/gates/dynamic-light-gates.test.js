import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../src');

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.jsx?$/.test(name)) out.push(p);
  }
  return out;
};

// Perf gate (STATE-REVIEW-2026-06-10 #5): a shadow-casting POINT light renders SIX cube-map
// shadow passes of the scene per frame while mounted — catastrophic for transient combat lights
// on the iPad envelope, and each mount/unmount also changes the light count (full lit-material
// program re-link hitch). The directional sun owns shadows; point lights must never cast.
describe('dynamic-light gate', () => {
  it('no pointLight in src/ casts shadows', () => {
    const offenders = [];
    for (const file of walk(SRC)) {
      const m = readFileSync(file, 'utf8').match(/<pointLight[^>]*castShadow/s);
      if (m) offenders.push(file.replace(SRC, 'src'));
    }
    expect(offenders, `shadow-casting pointLight(s) in: ${offenders.join(', ')}`).toEqual([]);
  });
});
