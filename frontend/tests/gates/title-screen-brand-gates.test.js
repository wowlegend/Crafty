import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const SRC = readFileSync(resolve(process.cwd(), 'src/MenuSystem.jsx'), 'utf8');
describe('W2-T3 title screen is the cinematic 3D vista on bold-flat tokens', () => {
  it('mounts the full-bleed TitleDiorama', () => { expect(SRC).toMatch(/TitleDiorama/); });
  it('drops the off-brand purple gradient + confetti + shimmer/glow', () => {
    expect(SRC).not.toMatch(/radial-gradient\(ellipse at 50% 30%, #1a1040/);
    expect(SRC).not.toMatch(/menu-particle/);
    expect(SRC).not.toMatch(/shimmer-text/);
    expect(SRC).not.toMatch(/glow-button/);
    expect(SRC).not.toMatch(/pixel-font/);
    expect(SRC).not.toMatch(/bg-purple-600/);
  });
  it('uses the bold-flat Button primitive for the CTA', () => { expect(SRC).toMatch(/<Button/); });
});
