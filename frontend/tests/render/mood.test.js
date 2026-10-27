import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { moodTarget, sampleMood, moodRef, MOOD_GRADE, STORM_FOG, STORM_DESAT } from '../../src/render/mood.js';
import { SCRIPT_KEYS } from '../../src/render/colourScript.js';
import { PALETTE } from '../../src/theme/tokens.js';

// PREMISES REWRITTEN 2026-10-27 (plan 2026-10-27-crafty-light-colour-script, Task 3a). The mood used to BE the palette:
// 0 explore, 1 dusk (which was every night), 2 obsidian. Since Task 3a the base palette is the colour script's, read from
// the clock (render/colourScript.js), and the mood is the danger overlay on it: 0..1 a storm, 1..2 the obsidian boss
// state. So "night = 1" became "night = 0", "mood 0 = explore palette" became "mood 0 at noon = the day key", and
// "mood 1 = dusk palette" became "mood 1 = the storm overlay". mood 2 = obsidian is unchanged.
describe('moodTarget', () => {
  it('day + no danger = 0 (explore)', () => expect(moodTarget({ isDay: true, dangerLevel: 0 })).toBe(0));
  it('night + no danger = 0: night is the clock\'s, not danger (light-colour plan decision 2)', () => expect(moodTarget({ isDay: false, dangerLevel: 0 })).toBe(0));
  it('dangerLevel overrides upward', () => expect(moodTarget({ isDay: true, dangerLevel: 2 })).toBe(2));
  it('takes the max of night and danger', () => expect(moodTarget({ isDay: false, dangerLevel: 2 })).toBe(2));
  it('clamps to [0,2]', () => {
    expect(moodTarget({ isDay: true, dangerLevel: 5 })).toBe(2);
    expect(moodTarget({ isDay: true, dangerLevel: -3 })).toBe(0);
  });
});

describe('sampleMood', () => {
  const hex = (c) => '#' + c.getHexString();
  it('mood 0 at noon = the colour script\'s day key exactly', () => {
    const m = sampleMood(0), day = SCRIPT_KEYS.day;
    expect(hex(m.fog)).toBe(hex(day.fog.color));
    expect(hex(m.sunColor)).toBe(hex(day.sun.color));
    expect(hex(m.skyTop)).toBe(hex(day.sky.top));         // the day key's exposure is 1
    expect(hex(m.skyHorizon)).toBe(hex(day.sky.horizon));
  });
  it('mood 1 at noon = the storm overlay on the day key: the fog keeps its colour and thickens', () => {
    const m = sampleMood(1), day = SCRIPT_KEYS.day;
    expect(hex(m.fog)).toBe(hex(day.fog.color));
    expect(m.fogDensity).toBeCloseTo(day.fog.density * (1 + STORM_FOG), 9);
  });
  it('mood 2 = obsidian palette exactly', () => {
    const m = sampleMood(2);
    expect(hex(m.fog)).toBe(PALETTE.obsidian.fog.toLowerCase());
  });
  it('blends toward the boss (mood 1.5 fog is midway between the day key\'s and obsidian\'s)', () => {
    const a = SCRIPT_KEYS.day.fog.color;
    const b = new THREE.Color(PALETTE.obsidian.fog);
    const m = sampleMood(1.5);
    expect(m.fog.r).toBeCloseTo((a.r + b.r) / 2, 5);
  });
  it('never returns undefined scalars and clamps out-of-range mood', () => {
    for (const v of [-1, 0, 0.7, 1.3, 2, 9]) {
      const m = sampleMood(v);
      expect(typeof m.ambientIntensity).toBe('number');
      expect(typeof m.fogDensity).toBe('number');
      expect(m.sunPos).toHaveLength(3);
    }
  });
  it('moodRef starts at 0', () => expect(moodRef.current).toBe(0));
});

// S1-D-M3: the per-mood magic-hour colour script.
describe('sampleMood.grade (magic-hour colour script)', () => {
  it('mood 0 grade at noon = the day key\'s grade exactly', () => {
    const g = sampleMood(0).grade, d = SCRIPT_KEYS.day.grade;
    expect(g.saturation).toBeCloseTo(d.saturation, 6);
    expect(g.brightness).toBeCloseTo(d.brightness, 6);
    expect(g.contrast).toBeCloseTo(d.contrast, 6);
  });
  it('mood 2 grade = obsidian grade exactly', () => {
    const g = sampleMood(2).grade;
    expect(g.saturation).toBeCloseTo(MOOD_GRADE.obsidian.saturation, 6);
    expect(g.brightness).toBeCloseTo(MOOD_GRADE.obsidian.brightness, 6);
    expect(g.contrast).toBeCloseTo(MOOD_GRADE.obsidian.contrast, 6);
  });
  it('the storm desaturates the grade (mood 0.5 is the day key less half the storm\'s desaturation)', () => {
    const g = sampleMood(0.5).grade;
    expect(g.saturation).toBeCloseTo(SCRIPT_KEYS.day.grade.saturation - STORM_DESAT / 2, 6);
  });
  it('explore is the most saturated + brightest (magic-hour premium-warm)', () => {
    expect(MOOD_GRADE.explore.saturation).toBeGreaterThan(MOOD_GRADE.dusk.saturation);
    expect(MOOD_GRADE.dusk.saturation).toBeGreaterThan(MOOD_GRADE.obsidian.saturation);
    expect(MOOD_GRADE.explore.brightness).toBeGreaterThan(MOOD_GRADE.obsidian.brightness);
  });
  it('obsidian desaturates toward mono + crushes + adds contrast (boss dread)', () => {
    expect(MOOD_GRADE.obsidian.saturation).toBeLessThan(0);   // desaturated
    expect(MOOD_GRADE.obsidian.brightness).toBeLessThan(0);   // crushed shadows
    expect(MOOD_GRADE.obsidian.contrast).toBeGreaterThan(MOOD_GRADE.explore.contrast);
  });
});

import { MOOD_SCALARS } from '../../src/render/mood.js';

describe('W2-T1 warm magic-hour explore grade', () => {
  it('daytime explore fill light is ON (warm) — was 0', () => {
    expect(MOOD_SCALARS.explore.fillIntensity).toBeGreaterThanOrEqual(0.30);
    expect(MOOD_SCALARS.explore.fillIntensity).toBeLessThanOrEqual(0.45);
  });
  it('explore grade is glowier/warmer than the old neutral lock', () => {
    expect(MOOD_GRADE.explore.saturation).toBeGreaterThanOrEqual(0.28);
    expect(MOOD_GRADE.explore.brightness).toBeGreaterThanOrEqual(0.08);
  });
  // REWRITTEN 2026-10-27 (light-colour plan, review amendment 1): sampleMood(0) no longer reads the explore grade or
  // fill. The day's warmth now comes from the colour script's lights (a warm sun, golden keys), because the +0.30
  // global saturation, through the toe of NEUTRAL, is what made the iPad's stone navy. The constants above still hold
  // the W2 values; the frame takes the day key's grade (saturation 0.12) and no fill light.
  it('sampleMood(0) takes the day key\'s grade and no fill light (the W2 warmth moved into the script)', () => {
    const m = sampleMood(0);
    expect(m.fillIntensity).toBe(0);
    expect(m.grade.saturation).toBeCloseTo(SCRIPT_KEYS.day.grade.saturation, 6);
    expect(m.sunColor.r).toBeGreaterThan(m.sunColor.b); // the day sun is warm
  });
});

describe('W2-T1 hemisphere bounce', () => {
  it('sampleMood exposes hemisphere intensity + sky/ground colors', () => {
    const m = sampleMood(0);
    expect(m.hemiIntensity).toBeGreaterThan(0); // daytime sky/ground bounce ON
    expect(m.hemiSky).toBeDefined();
    expect(m.hemiGround).toBeDefined();
    expect(typeof m.hemiSky.getHex).toBe('function'); // a THREE.Color
  });
  it('explore hemisphere is stronger than obsidian (boss dread is darker)', () => {
    expect(sampleMood(0).hemiIntensity).toBeGreaterThan(sampleMood(2).hemiIntensity);
  });
});
