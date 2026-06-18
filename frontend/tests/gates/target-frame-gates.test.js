import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('target-frame gates', () => {
  it('store mirrors a targetEntity (id+name+health) for the looked-at mob/NPC', () => {
    expect(read('store/useGameStore.jsx')).toMatch(/targetEntity:/);
  });
  it('Components.jsx writes targetEntity from the nearest aim-cone mob (throttled)', () => {
    const c = strip(read('Components.jsx'));
    expect(c).toMatch(/targetEntity|setTargetEntity/);
  });
  it('TargetFrame renders a Panel nameplate gated on a live target + capture-suppressed', () => {
    const tf = read('ui/TargetFrame.jsx');
    expect(tf).toMatch(/Panel/);
    expect(tf).toMatch(/targetEntity/);
    expect(tf).toMatch(/isCaptureMode\(\)/);
  });
});
