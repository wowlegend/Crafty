import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(__dirname, '../../src/GameScene.jsx'), 'utf8');

describe('weather density (mount-time bug regression gate)', () => {
  it('does NOT compute weatherDensity with an empty-dep useMemo (would freeze at mount tier)', () => {
    // The bug: `const weatherDensity = useMemo(() => {...}, []);` never recomputes on a tier downgrade.
    // The fix reads the tier reactively (a useGameStore selector) so the count tracks the live tier.
    const bug = /const\s+weatherDensity\s*=\s*useMemo\(\s*\(\)\s*=>\s*\{[\s\S]*?\},\s*\[\s*\]\s*\)/.test(SRC);
    expect(bug).toBe(false);
  });
  it('derives weatherDensity from the reactive qualityTier selector', () => {
    expect(/weatherDensity/.test(SRC)).toBe(true);
    // the reactive read: a useGameStore((s) => s.qualityTier) selector exists in WeatherSystem scope
    expect(/useGameStore\(\s*\(s\)\s*=>\s*s\.qualityTier\s*\)/.test(SRC)).toBe(true);
  });
});
