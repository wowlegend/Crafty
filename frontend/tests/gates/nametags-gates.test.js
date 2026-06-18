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
  // Static-source presence check only — the LOD range / showBar / danger-color BEHAVIOR is
  // genuinely exercised in tests/data/nametagData.test.js (M-HUD.5). Here we assert the render
  // layer WIRES the tag.visible flag to group visibility, and gates BOTH the bar fill AND its
  // dark background with tag.showBar (so name-only tags never leave a stray empty rectangle).
  it('wires tag.visible to group visibility and gates bar fill + background by tag.showBar', () => {
    expect(nt).toMatch(/g\.visible\s*=\s*tag\.visible/);
    expect(nt).toMatch(/bgRef\.current\.visible\s*=\s*tag\.showBar/);
    expect(nt).toMatch(/barRef\.current\.visible\s*=\s*tag\.showBar/);
  });
});
