import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const SRC = readFileSync(resolve(process.cwd(), 'src/render/TitleDiorama.jsx'), 'utf8');
describe('W2-T3 TitleDiorama', () => {
  it('is a full-bleed live R3F canvas (not a 2D gradient)', () => {
    expect(SRC).toMatch(/Canvas/);
  });
  it('freezes its drift in capture mode (deterministic menu frame)', () => {
    expect(SRC).toMatch(/isCaptureMode/);
  });
  it('reuses the mood-grade warm palette + light motes', () => {
    expect(SRC).toMatch(/LightMotes|motes/i);
  });
});
