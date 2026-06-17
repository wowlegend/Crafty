import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const cfg = readFileSync(resolve(HERE, '../../tailwind.config.cjs'), 'utf8');

// M6 #6: `animate-fade-in` was referenced by 8 panels (Credits/Quest/Crafting/GamePanels) but NO fadeIn
// keyframe/animation existed -> the class silently did nothing (panels popped in). This pins the definition
// so the class resolves; the visual gate proves the capture baselines stay byte-identical (fade < 900ms delay).
describe('M6 #6 animate-fade-in keyframe defined (was a silent no-op)', () => {
  it('tailwind config defines the fadeIn keyframe', () => {
    expect(cfg).toMatch(/fadeIn:\s*\{/);
  });

  it('tailwind config defines the fade-in animation (so animate-fade-in resolves)', () => {
    expect(cfg).toMatch(/'fade-in':\s*'fadeIn/);
  });
});
