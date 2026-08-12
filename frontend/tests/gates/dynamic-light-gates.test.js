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
    // MATCH THE VALUE, NOT THE ATTRIBUTE NAME. `/<pointLight[^>]*castShadow/s` terminates at the
    // identifier, so it flagged the defensively-CORRECT `<pointLight castShadow={false}>` as an offender
    // while missing every other way to switch shadows on: the imperative `light.castShadow = true`, and
    // a spread of props carrying it. It reported on spelling rather than on behaviour, in both
    // directions at once.
    const offenders = [];
    let scanned = 0;
    for (const file of walk(SRC)) {
      scanned += 1;
      const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      const why = [];
      // JSX: bare `castShadow` (defaults true) or an explicitly truthy value, on a pointLight tag.
      for (const m of src.matchAll(/<pointLight\b([^>]*)>/gs)) {
        const attrs = m[1];
        if (/\bcastShadow\s*=\s*\{\s*false\s*\}/.test(attrs)) continue;   // explicitly off: correct
        if (/\bcastShadow\s*=\s*\{[^}]*\}/.test(attrs)) why.push('castShadow={<expr>}');
        else if (/\bcastShadow(?![\w-])/.test(attrs)) why.push('bare castShadow (defaults true)');
        if (/\{\s*\.\.\./.test(attrs)) why.push('spread props may carry castShadow');
      }
      // Imperative: a pointLight ref turned on after mount, which the JSX scan cannot see at all.
      if (/pointLight[\w.]*\.castShadow\s*=\s*(?!false)/i.test(src)) why.push('imperative .castShadow =');
      if (why.length) offenders.push(`${file.replace(SRC, 'src')} (${[...new Set(why)].join('; ')})`);
    }
    expect(scanned, 'the walk enumerated nothing — this gate is scanning an empty tree').toBeGreaterThan(50);
    expect(offenders, `shadow-casting pointLight(s) in: ${offenders.join(', ')}`).toEqual([]);
  });
});
