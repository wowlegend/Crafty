import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('Biome-ambience gate (interleave)', () => {
  const sm = strip(read('SoundManager.jsx'));
  it('a looping wind bed exists, biome-keyed via climate + biomeAmbience + playerPosition', () => {
    expect(sm).toMatch(/from '\.\/audio\/biomeAmbience\.js'/);
    expect(sm).toMatch(/surfaceBlockAt\(/);
    expect(sm).toMatch(/biomeAmbience\(/);
    expect(sm).toMatch(/playerPosition/);
    expect(sm).toMatch(/windBedRef/);
    expect(sm).toMatch(/loop = true/);
  });
  it('the wind bed is torn down when the pad stops (no leaked looping source)', () => {
    const stop = sm.slice(sm.indexOf('stopSynthPad'), sm.indexOf('stopSynthPad') + 1500);
    expect(stop).toMatch(/wb\.|windBedRef/);
  });
  it('biomeAmbience.js is a pure deterministic map (no Math.random)', () => {
    expect(read('audio/biomeAmbience.js')).not.toMatch(/Math\.random/);
  });
});
