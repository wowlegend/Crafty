import { describe, it, expect } from 'vitest';
import { SEA_LEVEL, BEACH_BAND_TOP, DEEP_FLOOR, OCEAN_CONTINENT_THRESHOLD, OCEAN_FULL_SPAN, oceanBlend, oceanSurfaceY, WAVES, GRAVITY, WAVE_TIME_SCALE, STEEPNESS, gerstnerDisplace, gerstnerHeight } from '../../src/world/oceanProfile.js';

// W2-T7 (2026-06-17) de-island dropped OCEAN_CONTINENT_THRESHOLD -0.15 -> -0.35. The ramp runs
// continent [thr - SPAN, thr]; these helpers express the shore/mid/deep continent values RELATIVE to
// the constants so the assertions stay valid wherever the shore is pinned (no more magic -0.30/-0.24).
const FULL_OCEAN = OCEAN_CONTINENT_THRESHOLD - OCEAN_FULL_SPAN;        // blend === 1 (beyond it clamps)
const MID_OCEAN = OCEAN_CONTINENT_THRESHOLD - OCEAN_FULL_SPAN * 0.5;   // blend === 0.5
const SHALLOW = OCEAN_CONTINENT_THRESHOLD - OCEAN_FULL_SPAN * 0.2;     // blend === 0.2

describe('Ocean + coastline profile (World-M2)', () => {
  it('SEA_LEVEL and BEACH_BAND_TOP are TWO distinct consts forming the shoreline (BEACH_BAND_TOP > SEA_LEVEL >= 1)', () => {
    expect(BEACH_BAND_TOP).toBeGreaterThan(SEA_LEVEL);
    expect(SEA_LEVEL).toBeGreaterThanOrEqual(1);
  });

  it('deep ocean is divable 18-22 voxels across the REAL noise range incl. the ±0.1 overshoot (n clamped)', () => {
    // worldgen `n` overshoots to ~[-0.1,1.1]; the seabed clamp must keep depth strictly 18-22.
    for (const n of [-0.1, 0, 0.25, 0.5, 0.75, 1, 1.1]) {
      const seabed = oceanSurfaceY(30 + n * 40, n, FULL_OCEAN); // continent <= FULL_OCEAN => full ocean
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
    expect(oceanBlend(FULL_OCEAN)).toBe(1);                // full ocean (thr - SPAN)
    expect(oceanBlend(0)).toBe(0);                         // land (origin is fully continent post-W2-T7)
    expect(oceanBlend(-0.9)).toBe(1);                      // clamped well past full ocean
  });

  it('land/at-threshold (blend 0) returns the pure land baseHeight (continuous with the else branch)', () => {
    expect(oceanSurfaceY(50, 0.5, OCEAN_CONTINENT_THRESHOLD)).toBe(50);
    expect(oceanSurfaceY(37, 0.25, OCEAN_CONTINENT_THRESHOLD)).toBe(37);
  });

  it('the shore transition is monotonic: surfaceY only drops as continent falls (land -> deep)', () => {
    const base = 50, n = 0.5;
    const shallow = oceanSurfaceY(base, n, SHALLOW);   // blend 0.2, just past the shore
    const mid = oceanSurfaceY(base, n, MID_OCEAN);     // blend 0.5
    const deep = oceanSurfaceY(base, n, FULL_OCEAN);   // blend 1.0, the deep basin
    expect(shallow).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(deep);
  });

  it('shoreline ordering: a column just below BEACH_BAND_TOP is sand-banded AND above the waterline', () => {
    const justBelowBeachTop = BEACH_BAND_TOP - 1; // 29
    expect(justBelowBeachTop < BEACH_BAND_TOP).toBe(true); // sand override fires
    expect(justBelowBeachTop > SEA_LEVEL).toBe(true);      // foliage allowed; no water column above
  });
});

// --- Ocean look pass (Kevin 2026-08-08: "more tropical and dynamic looking, its waves should be
// moving like real ocean") ---
//
// The surface was a sum of four sines called "Gerstner" that was not one, with the speed column set
// INVERSELY to wavelength. Real deep-water waves disperse as c = sqrt(g/k), so a long swell outruns
// short chop; the old table had 6.5m chop at 1.15 and a 27m swell at 0.40, so the chop raced ahead of
// the swell. That inversion is why it read as noise on top of water rather than as water.
describe('ocean surface: real-ocean wave physics', () => {
  it('disperses like deep water — LONGER waves travel FASTER (the old table had this backwards)', () => {
    const byLen = [...WAVES].sort((a, b) => a[2] - b[2]); // ascending wavelength
    for (let i = 1; i < byLen.length; i++) {
      const [, , shortWl, , shortSpd] = byLen[i - 1];
      const [, , longWl, , longSpd] = byLen[i];
      expect(longSpd, `${longWl}m must outrun ${shortWl}m`).toBeGreaterThan(shortSpd);
    }
  });

  it('each speed matches the deep-water relation c = sqrt(g/k) to within 1%', () => {
    for (const [, , wl, , spd] of WAVES) {
      const k = (Math.PI * 2) / wl;
      expect(spd / (Math.sqrt(GRAVITY / k) * WAVE_TIME_SCALE)).toBeCloseTo(1, 2);
    }
  });

  it('stays below the Gerstner self-intersection limit: sum of Q*k*A <= 1', () => {
    // Above 1 the horizontal displacement folds the surface through itself and the crests render
    // inside-out. This is the invariant that makes steepness safe to tune.
    const total = WAVES.reduce((sum, [, , wl, amp]) => sum + STEEPNESS * ((Math.PI * 2) / wl) * amp, 0);
    expect(total).toBeGreaterThan(0.3); // actually pinching the crests, not a flat sine sum
    expect(total).toBeLessThanOrEqual(1);
  });

  it('displaces HORIZONTALLY — the thing that makes a crest sharp instead of round', () => {
    // A pure sine sum returns the sample point unmoved in x/z. Gerstner pulls water toward the crest.
    let maxShift = 0;
    for (let x = 0; x < 40; x += 3.1) {
      const d = gerstnerDisplace(x, x * 0.7, 2.5);
      maxShift = Math.max(maxShift, Math.hypot(d.x - x, d.z - x * 0.7));
    }
    expect(maxShift).toBeGreaterThan(0.25);
  });

  it('is deterministic — same (x,z,t) gives the same vertex, so capture stays byte-stable', () => {
    const a = gerstnerDisplace(11.3, -4.7, 3.25);
    const b = gerstnerDisplace(11.3, -4.7, 3.25);
    expect(a).toEqual(b);
    expect(gerstnerHeight(11.3, -4.7, 3.25)).toBe(gerstnerHeight(11.3, -4.7, 3.25));
  });

  it('the surface actually MOVES — a frozen clock was the capture bug, not the design', () => {
    const t0 = gerstnerHeight(7, 7, 0);
    const t1 = gerstnerHeight(7, 7, 1.7);
    expect(Math.abs(t1 - t0)).toBeGreaterThan(0.05);
  });

  it('stays within a swimmable band around SEA_LEVEL', () => {
    let lo = Infinity, hi = -Infinity;
    for (let x = 0; x < 120; x += 2.3) for (let z = 0; z < 120; z += 3.7) {
      const h = gerstnerHeight(x, z, 4.2);
      lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    expect(hi - SEA_LEVEL).toBeLessThan(3.5);
    expect(SEA_LEVEL - lo).toBeLessThan(3.5);
  });
});
