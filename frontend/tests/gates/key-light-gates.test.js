import { describe, it, expect } from 'vitest';
import { MOON_NOON, HORIZON_FADE, moonArcDirection, resolveKeyLight } from '../../src/render/keyLight.js';
import { sampleScript, SCRIPT_KEYS } from '../../src/render/colourScript.js';
import { sunArcDirection, MOOD_SCALARS } from '../../src/render/mood.js';

/**
 * THE MOON TAKES THE KEY LIGHT.
 *
 * One directional light: the sun's vector by day, the moon's by night, faded to 0 within HORIZON_FADE of the horizon so
 * the direction swaps only under a dark key. `sunDir` stays the SUN at every hour, because ore glow, leaves, cloud
 * shadows and the GodRays gate read it and mean the sun.
 *
 * DENOMINATORS, each asserted: 3600 fractions around the clock per case; 3600 consecutive pairs, the wrap included;
 * exactly 2 swaps (one at dawn, one at dusk).
 *
 * BLIND SPOT: nothing here renders or wires. Whether Atmosphere positions the light from `keyDir`, writes `sunDirRef`
 * from `sunDir`, and feeds the shadow schedule the key is the e2e's (tests/e2e/light-script.spec.js).
 */
const NOON = MOOD_SCALARS.explore.sunPos;
const ring = (n) => Array.from({ length: n }, (_, i) => i / n);
const pairs = (a) => a.map((x, i) => [x, a[(i + 1) % a.length]]);
const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
const close = (v) => v.map((x) => expect.closeTo(x, 6));
const rgb = (c) => [c.r, c.g, c.b];
const key = (f) => resolveKeyLight(NOON, f, sampleScript(f));
// resolveKeyLight returns a shared scratch: copy what a case compares across two calls.
const held = (k) => ({ keyIsMoon: k.keyIsMoon, keyIntensity: k.keyIntensity, keyDir: [...k.keyDir], radiance: rgb(k.keyColor).map((c) => c * k.keyIntensity) });

describe('the key light: the sun by day, the moon by night', () => {
  it('never-from-below: a lit key always comes from above the horizon', () => {
    let lit = 0;
    for (const f of ring(3600)) { const k = key(f); if (k.keyIntensity > 1e-3) { expect(k.keyDir[1], `f ${f}`).toBeGreaterThan(0); lit++; } }
    expect(lit).toBeGreaterThan(3000); // the key is lit nearly all the time; a dead key would pass vacuously
  });

  it('the world always has a key away from the horizon', () => {
    let n = 0;
    for (const f of ring(3600)) {
      if (Math.abs(Math.sin(2 * Math.PI * f)) >= 0.1) { expect(key(f).keyIntensity, `f ${f}`).toBeGreaterThanOrEqual(0.05); n++; }
    }
    expect(n).toBeGreaterThan(3000);
  });

  it('sunDir is the SUN at every hour: ore glow, leaves, cloud shadows and GodRays read it (F5)', () => {
    let n = 0;
    for (const f of ring(3600)) { expect(key(f).sunDir, `f ${f}`).toEqual(close(sunArcDirection(NOON, f))); n++; }
    expect(n).toBe(3600);
    expect(key(0.75).sunDir[1]).toBeLessThan(0);
  });

  it('midnight is moonlit', () => {
    const k = key(0.75);
    expect(k.keyIsMoon).toBe(true);
    expect(k.keyDir).toEqual(close(unit(MOON_NOON)));
    expect(k.keyColor.getHexString()).toBe(SCRIPT_KEYS.night.moon.color.getHexString());
    expect(k.keyColor.getHexString()).not.toBe(SCRIPT_KEYS.night.sun.color.getHexString()); // the two are distinguishable
  });

  it('swap-under-zero: sun and moon trade places only where the key is dark', () => {
    let swaps = 0;
    for (const [a, b] of pairs(ring(3600))) {
      const ka = held(key(a)), kb = held(key(b));
      if (ka.keyIsMoon !== kb.keyIsMoon) {
        swaps++;
        expect(ka.keyIntensity, `f ${a}`).toBeLessThanOrEqual(1e-3);
        expect(kb.keyIntensity, `f ${b}`).toBeLessThanOrEqual(1e-3);
      }
    }
    expect(swaps).toBe(2); // one at dawn, one at dusk
  });

  it('the moon rises as the sun sets', () => {
    expect(moonArcDirection(0.6)[1]).toBeGreaterThan(0);
    expect(moonArcDirection(0.4)[1]).toBeLessThan(0);
    expect(moonArcDirection(0.75)).toEqual(close(unit(MOON_NOON))); // the moon's noon is the sun's midnight
  });

  it('key radiance is continuous: 0.03 per step outside the horizon fade, 0.10 inside it (a ramp, not a pop)', () => {
    let inside = 0, outside = 0, worstIn = 0, worstOut = 0;
    for (let i = 0; i < 3600; i++) {
      const a = i / 3600, b = (i + 1) / 3600;
      const ka = held(key(a)), kb = held(key(b));
      const d = Math.max(...[0, 1, 2].map((c) => Math.abs(ka.radiance[c] - kb.radiance[c])));
      const inFade = Math.min(Math.abs(Math.sin(2 * Math.PI * a)), Math.abs(Math.sin(2 * Math.PI * b))) < HORIZON_FADE;
      expect(d, `f ${a} (${inFade ? 'in' : 'out of'} the fade)`).toBeLessThanOrEqual(inFade ? 0.1 : 0.03);
      if (inFade) { inside++; worstIn = Math.max(worstIn, d); } else { outside++; worstOut = Math.max(worstOut, d); }
    }
    console.log(`  key light: ${inside} steps in the fade (worst ${worstIn.toFixed(3)}), ${outside} outside (worst ${worstOut.toFixed(3)})`);
    expect(inside).toBeGreaterThan(0);
    expect(inside + outside).toBe(3600);
  });
});
