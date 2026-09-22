import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sunArcDirection, sampleMood, MOOD_SCALARS, SUN_ARC_SWING } from '../../src/render/mood.js';
import { CAPTURE_SOLAR_FRACTION, SUN_HORIZON_EPS } from '../../src/render/Atmosphere.jsx';

/**
 * THE SUN ARC — QUEUE.md B1, "the biggest one and it is mostly already written".
 *
 * WHAT WAS WRONG. `game/dayPhase.js` has exported `cycleFraction(gameTime)` all along (0 = dawn,
 * 0.25 = noon, 0.5 = dusk, 0.75 = midnight) and its own comment says it "drives the day-phase dial's
 * sun/moon orbit angle" — but its only references were inside dayPhase.js itself. `MOOD_SCALARS` held
 * `sunPos` as three fixed constants. So the HUD dial showed a sun travelling dawn to dusk while the sun
 * in the sky did not move: the game contradicted its own instrument.
 *
 * WHY THE MAPPING IS NOT A GREAT-CIRCLE ROTATION, which is the obvious construction and is wrong here.
 * Rodrigues-rotating the noon vector about a horizontal axis overshoots: the moods sit at ~33 degrees of
 * elevation, so a 90-degree rotation puts the sun well BELOW the horizon, and it would set less than a
 * quarter of the way through the day. `isDayAtUnit` makes fraction 0..0.5 the DAY, so the sun must be up
 * across exactly that span. Elevation and azimuth are therefore driven separately.
 *
 * THE HAZARD THIS ALSO HAD TO HANDLE, found by searching before building rather than after. three.js#18446
 * records that the OFFICIAL godrays example flips its shaft downwards when "the signs of the sun's screen
 * space position vector components change" — which an arcing sun crosses at every dawn and dusk by
 * construction. An arc shipped without a horizon gate would have introduced a visible defect at exactly
 * the two moments the arc exists to create. Hence the gate, and hence a positive epsilon rather than 0:
 * exactly at the horizon is where that projection is least stable.
 *
 * Mutation-Proof: 6 mutations, denominator asserted (8/8 cases collected on every run).
 *   M1 elevation ignores the fraction (fixed at noon)      -> arc + day-span cases RED
 *   M2 azimuth ignores the fraction                         -> opposite-horizons case RED
 *   M3 SUN_ARC_SWING -> 0                                   -> opposite-horizons case RED (it would rise
 *      and set on the SAME bearing, which still "arcs" and is the defect a naive check would pass)
 *   M4 noon no longer returns the mood's own bearing         -> noon-preservation case RED (this is what
 *      keeps every committed baseline's sun direction exact)
 *   M5 sampleMood applies the arc even when cycle is omitted -> additive case RED
 *   M6 CAPTURE_SOLAR_FRACTION -> 0.0 (dawn)                  -> capture case RED
 * mood.js / Atmosphere.jsx restored from cp backups and diffed byte-identical after each.
 *
 * BLIND SPOT, stated (R7): nothing here proves the sun LOOKS right moving, nor that the god rays stop
 * cleanly at the horizon in a real frame. Both need the re-baseline already owed since postprocessing
 * 6.39.1 -> 6.39.5, which this change adds to. What is executed is the GEOMETRY and the gating decision.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const unit = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const elevDeg = (d) => (Math.asin(Math.max(-1, Math.min(1, d[1]))) * 180) / Math.PI;

describe('sun arc geometry', () => {
  it('rises at dawn, peaks at noon, sets at dusk, and is below at midnight', () => {
    const noon = MOOD_SCALARS.explore.sunPos;
    expect(elevDeg(sunArcDirection(noon, 0))).toBeCloseTo(0, 6);      // dawn: on the horizon
    expect(elevDeg(sunArcDirection(noon, 0.5))).toBeCloseTo(0, 6);    // dusk: on the horizon
    expect(elevDeg(sunArcDirection(noon, 0.25))).toBeGreaterThan(20); // noon: up
    expect(elevDeg(sunArcDirection(noon, 0.75))).toBeLessThan(-20);   // midnight: down
  });

  it('is above the horizon across the whole DAY half and below across the night half', () => {
    // The property that rules out the great-circle construction. `isDayAtUnit` makes 0..0.5 the day.
    const noon = MOOD_SCALARS.explore.sunPos;
    let daySamples = 0;
    for (let f = 0.02; f < 0.5; f += 0.02) { daySamples++; expect(sunArcDirection(noon, f)[1], `f=${f}`).toBeGreaterThan(0); }
    expect(daySamples).toBeGreaterThan(10); // R3a — the loop must actually have run
    for (let f = 0.52; f < 1; f += 0.02) expect(sunArcDirection(noon, f)[1], `f=${f}`).toBeLessThan(0);
  });

  it('rises and sets on OPPOSITE horizons (a swing of zero would still "arc")', () => {
    const noon = MOOD_SCALARS.explore.sunPos;
    const dawn = sunArcDirection(noon, 0);
    const dusk = sunArcDirection(noon, 0.5);
    // Horizontal bearings must be roughly antiparallel: dot of the xz components clearly negative.
    const dot = dawn[0] * dusk[0] + dawn[2] * dusk[2];
    expect(dot).toBeLessThan(-0.5);
    expect(SUN_ARC_SWING).toBeGreaterThan(0);
  });

  it('at NOON returns the mood bearing unchanged — every existing look is preserved', () => {
    // This is what makes the arc a strict addition rather than a re-tune, and what keeps the committed
    // baselines' sun direction exact (capture pins the fraction to noon).
    for (const key of Object.keys(MOOD_SCALARS)) {
      const noon = MOOD_SCALARS[key].sunPos;
      const got = sunArcDirection(noon, 0.25);
      const want = unit(noon);
      for (let i = 0; i < 3; i++) expect(got[i], `${key}[${i}]`).toBeCloseTo(want[i], 9);
    }
  });

  it('always returns a unit vector, and survives junk input', () => {
    for (const f of [0, 0.3, 0.999, NaN, -2.5, 7.25]) {
      expect(Math.hypot(...sunArcDirection(MOOD_SCALARS.dusk.sunPos, f))).toBeCloseTo(1, 9);
    }
    for (const bad of [null, undefined, [1, 2], [NaN, 1, 2]]) {
      expect(Math.hypot(...sunArcDirection(bad, 0.3))).toBeCloseTo(1, 9);
    }
  });

  it('sampleMood is ADDITIVE — omitting the cycle leaves the historical fixed bearing', () => {
    const noArc = [...sampleMood(0).sunPos];
    expect(noArc).toEqual(MOOD_SCALARS.explore.sunPos); // byte-equal to the constant, not merely close
    const arced = [...sampleMood(0, 0).sunPos];          // dawn
    expect(arced[1]).toBeCloseTo(0, 6);                  // and the arc really did apply
  });

  it('capture pins the solar angle to a DECLARED constant, and that constant is noon', () => {
    // AGENTS.md: "a capture guard must RESET to a declared value, never early-return." Noon is the one
    // fraction that leaves the mood bearing untouched, so committed baselines keep their sun direction.
    expect(CAPTURE_SOLAR_FRACTION).toBe(0.25);
    const noon = MOOD_SCALARS.explore.sunPos;
    const pinned = sunArcDirection(noon, CAPTURE_SOLAR_FRACTION);
    expect(pinned.map((x, i) => Math.abs(x - unit(noon)[i]) < 1e-9).every(Boolean)).toBe(true);
  });

  it('the GodRays pass is gated on the sun being above the horizon (three.js#18446 sign flip)', () => {
    expect(SUN_HORIZON_EPS).toBeGreaterThan(0); // not exactly 0: the horizon is the unstable region
    const scene = readFileSync(resolve(HERE, '../../src/GameScene.jsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(scene).toMatch(/q\.godRays && sunMesh && sunAboveHorizon &&/);
  });
});
