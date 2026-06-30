import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(__dirname, '../../src/GameScene.jsx'), 'utf8')
  + readFileSync(resolve(__dirname, '../../src/render/WeatherSystem.jsx'), 'utf8'); // A2.5: WeatherSystem moved -> src/render/

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

describe('weather frustum-cull regression gate (rain/snow vanish-on-turn fix)', () => {
  // The bug: the rain/snow/firefly <instancedMesh> instances are repositioned every frame via
  // setMatrixAt to surround the moving player, but THREE computes the bounding sphere ONCE (from
  // the initial all-at-origin instanceMatrix) and never recomputes it. The stale sphere makes
  // frustum culling misfire -> the cloud only renders from certain angles / near spawn and VANISHES
  // when the camera turns (Kevin-reported). The fix: frustumCulled={false} on ALL THREE meshes.
  const WEATHER = readFileSync(resolve(__dirname, '../../src/render/WeatherSystem.jsx'), 'utf8');

  it('all three weather instancedMeshes set frustumCulled={false}', () => {
    // Every <instancedMesh ...> opening tag in WeatherSystem must carry frustumCulled={false}.
    const tags = WEATHER.match(/<instancedMesh[\s\S]*?>/g) || [];
    expect(tags.length).toBe(3); // rain + snow + fireflies
    tags.forEach((tag) => {
      expect(/frustumCulled=\{false\}/.test(tag)).toBe(true);
    });
  });
});
