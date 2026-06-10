import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

// #72 verb-router seam gates: exactly ONE mousedown verb path. Terrain must never re-grow its
// own mouse listener (the double-fire defect); Components must route through the pure router;
// the router must stay pure (importable by node tests + future touch layer).
describe('verb-router seam gates (#72)', () => {
  it('Terrain.jsx registers NO mousedown listener (the deleted double-fire path)', () => {
    expect(read('world/Terrain.jsx')).not.toMatch(/addEventListener\(\s*['"]mousedown['"]/);
  });
  it('Components.jsx consumes the router', () => {
    expect(read('Components.jsx')).toMatch(/routeMouseVerb/);
  });
  it('verbRouter.js stays pure (no react/three/rapier/store imports)', () => {
    const src = read('input/verbRouter.js');
    expect(src).not.toMatch(/from\s+['"](react|three|@react-three|@dimforge)/);
    expect(src).not.toMatch(/useGameStore|postMessage|update_block/);
  });
});
