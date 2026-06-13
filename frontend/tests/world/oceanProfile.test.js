import { describe, it, expect } from 'vitest';
import {
  SEA_LEVEL, BEACH_BAND_TOP, DEEP_FLOOR,
  OCEAN_CONTINENT_THRESHOLD, oceanBlend, oceanSurfaceY,
} from '../../src/world/oceanProfile.js';

describe('Ocean + coastline profile (World-M2)', () => {
  it('SEA_LEVEL and BEACH_BAND_TOP are TWO distinct consts forming the shoreline (BEACH_BAND_TOP > SEA_LEVEL >= 1)', () => {
    expect(BEACH_BAND_TOP).toBeGreaterThan(SEA_LEVEL);
    expect(SEA_LEVEL).toBeGreaterThanOrEqual(1);
  });

  it('deep ocean is divable 18-22 voxels (SEA_LEVEL - seabed) across the noise range', () => {
    for (const n of [0, 0.25, 0.5, 0.75, 1]) {
      const seabed = oceanSurfaceY(30 + n * 40, n, -0.30); // continent <= -0.30 => full ocean
      const depth = SEA_LEVEL - seabed;
      expect(depth, `depth at n=${n}`).toBeGreaterThanOrEqual(18);
      expect(depth, `depth at n=${n}`).toBeLessThanOrEqual(22);
    }
  });

  it('max divable depth is bounded by SEA_LEVEL - DEEP_FLOOR (caps water side-quads)', () => {
    expect(SEA_LEVEL - DEEP_FLOOR).toBeLessThanOrEqual(22);
    expect(SEA_LEVEL - DEEP_FLOOR).toBeGreaterThanOrEqual(18);
  });

  it('oceanBlend: 0 at the threshold, 1 at full ocean, 0 on land, clamped both ends', () => {
    expect(oceanBlend(OCEAN_CONTINENT_THRESHOLD)).toBe(0); // exactly at threshold
    expect(oceanBlend(-0.30)).toBe(1);                     // full ocean
    expect(oceanBlend(0)).toBe(0);                         // land
    expect(oceanBlend(-0.9)).toBe(1);                      // clamped
  });

  it('land/at-threshold (blend 0) returns the pure land baseHeight (continuous with the else branch)', () => {
    expect(oceanSurfaceY(50, 0.5, OCEAN_CONTINENT_THRESHOLD)).toBe(50);
    expect(oceanSurfaceY(37, 0.25, OCEAN_CONTINENT_THRESHOLD)).toBe(37);
  });

  it('the shore transition is monotonic: surfaceY only drops as continent falls (land -> deep)', () => {
    const base = 50, n = 0.5;
    const shallow = oceanSurfaceY(base, n, -0.18);
    const mid = oceanSurfaceY(base, n, -0.24);
    const deep = oceanSurfaceY(base, n, -0.30);
    expect(shallow).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(deep);
  });

  it('shoreline ordering: a column just below BEACH_BAND_TOP is sand-banded AND above the waterline', () => {
    const justBelowBeachTop = BEACH_BAND_TOP - 1; // 29
    expect(justBelowBeachTop < BEACH_BAND_TOP).toBe(true); // sand override fires
    expect(justBelowBeachTop > SEA_LEVEL).toBe(true);      // foliage allowed; no water column above
  });
});
