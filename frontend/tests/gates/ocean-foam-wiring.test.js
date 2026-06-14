import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Ocean S2 foam WIRING gate (the pure kernel is covered by ocean-foam-kernel.test.js). The foam pipeline
// spans the worker (bake color.g) + the shader (read vFoam). This locks that wiring so a refactor can't
// silently sever it (the greedy mesher would re-merge water-top faces and the foam would vanish).
const __dir = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(__dir, '../../src', p), 'utf8');

describe('ocean shore-foam wiring', () => {
  it('the mesher bakes the foam factor into color.g on un-merged water-top faces', () => {
    const w = read('world/terrain.worker.js');
    expect(w).toMatch(/import\s*\{[^}]*shoreFoamFactor[^}]*\}\s*from\s*['"]\.\/oceanProfile\.js['"]/);
    // water-top faces must opt OUT of greedy merge (so each surface cell can carry its own foam)
    expect(w).toMatch(/isWaterTopFace\s*=\s*\(d === 1 && dirFlag === 1 && blockType === 9\)/);
    expect(w).toMatch(/while \(!isWaterTopFace &&/); // both the w and h merge loops are guarded
    expect(w).toMatch(/foamG\s*=\s*shoreFoamFactor\(/);
    expect(w).toMatch(/blockType, foamG, depthB/); // foam->color.g (S2) + seabed-depth->color.b (S3)
  });

  it('the water shader reads color.g as vFoam and renders a foam band', () => {
    const t = read('world/Terrain.jsx');
    expect(t).toMatch(/varying float vFoam/);
    expect(t).toMatch(/vFoam = color\.g/);
    expect(t).toMatch(/vFoam/); // consumed in the fragment foam mix
    expect(t).toMatch(/mix\(gl_FragColor\.rgb, vec3\([^)]*\), clamp\(vFoam/);
  });
});
