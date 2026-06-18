import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('nametags gates', () => {
  const nt = strip(read('render/Nametags.jsx'));
  it('billboards via drei <Billboard> (faces camera) and reads nametagFor', () => {
    expect(nt).toMatch(/Billboard/);
    expect(nt).toMatch(/nametagFor/);
  });
  it('iterates the ECS mobsQuery (live entities) not a stale prop array', () => {
    expect(nt).toMatch(/mobsQuery/);
  });
  it('capture-suppressed (no overlay in the deterministic baselines)', () => {
    expect(nt).toMatch(/isCaptureMode\(\)/);
  });
  it('LOD-culled by distance (uses the nametagFor visible flag)', () => {
    expect(nt).toMatch(/\.visible/);
  });
});
