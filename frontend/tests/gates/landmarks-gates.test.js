import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('Landmark gate (World-M6)', () => {
  const t = strip(read('world/Terrain.jsx'));
  // anchor on `function Landmark` (the type bodies — castShadow/Emissive live here) through LandmarksRender
  const block = (() => { const i = t.indexOf('function Landmark'); return i > -1 ? t.slice(i, i + 2600) : ''; })();
  it('LandmarksRender exists, is mounted, and is driven by the in-range chunks set', () => {
    expect(t).toMatch(/const LandmarksRender/);
    expect(t).toMatch(/<LandmarksRender chunks=\{chunks\}/);
    expect(t).toMatch(/from '\.\/landmarks\.js'/);
    expect(block).toMatch(/isLandmarkChunk\(/);
  });
  it('placement is deterministic (no Math.random) + uses the climate height sampler', () => {
    expect(strip(read('world/landmarks.js'))).not.toMatch(/Math\.random/); // strip: the comment says "NEVER Math.random"
    expect(block).not.toMatch(/Math\.random/);
    expect(t).toMatch(/surfaceBlockAt/); // terrain height for the base
  });
  it('tall parts do not cast shadow (shadow-cam clip avoidance) and any glow is capture-null', () => {
    expect(block).toMatch(/castShadow=\{false\}/);
    expect(block).toMatch(/!isCaptureMode\(\)/);
  });
});
