import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { moodTarget, sampleMood, moodRef, MOOD_GRADE } from '../../src/render/mood.js';
import { PALETTE } from '../../src/theme/tokens.js';

describe('moodTarget', () => {
  it('day + no danger = 0 (explore)', () => expect(moodTarget({ isDay: true, dangerLevel: 0 })).toBe(0));
  it('night + no danger = 1 (dusk)', () => expect(moodTarget({ isDay: false, dangerLevel: 0 })).toBe(1));
  it('dangerLevel overrides upward', () => expect(moodTarget({ isDay: true, dangerLevel: 2 })).toBe(2));
  it('takes the max of night and danger', () => expect(moodTarget({ isDay: false, dangerLevel: 2 })).toBe(2));
  it('clamps to [0,2]', () => {
    expect(moodTarget({ isDay: true, dangerLevel: 5 })).toBe(2);
    expect(moodTarget({ isDay: true, dangerLevel: -3 })).toBe(0);
  });
});

describe('sampleMood', () => {
  const hex = (c) => '#' + c.getHexString();
  it('mood 0 = explore palette exactly', () => {
    const m = sampleMood(0);
    expect(hex(m.fog)).toBe(PALETTE.explore.fog.toLowerCase());
    expect(hex(m.sun)).toBe(PALETTE.explore.sun.toLowerCase());
    expect(hex(m.skyTop)).toBe(PALETTE.explore.skyTop.toLowerCase());
    expect(hex(m.skyHorizon)).toBe(PALETTE.explore.skyHorizon.toLowerCase());
  });
  it('mood 1 = dusk palette exactly', () => {
    const m = sampleMood(1);
    expect(hex(m.fog)).toBe(PALETTE.dusk.fog.toLowerCase());
  });
  it('mood 2 = obsidian palette exactly', () => {
    const m = sampleMood(2);
    expect(hex(m.fog)).toBe(PALETTE.obsidian.fog.toLowerCase());
  });
  it('blends between states (mood 0.5 fog is between explore and dusk)', () => {
    const a = new THREE.Color(PALETTE.explore.fog);
    const b = new THREE.Color(PALETTE.dusk.fog);
    const m = sampleMood(0.5);
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
  it('mood 0 grade = explore grade exactly', () => {
    const g = sampleMood(0).grade;
    expect(g.saturation).toBeCloseTo(MOOD_GRADE.explore.saturation, 6);
    expect(g.brightness).toBeCloseTo(MOOD_GRADE.explore.brightness, 6);
    expect(g.contrast).toBeCloseTo(MOOD_GRADE.explore.contrast, 6);
  });
  it('mood 2 grade = obsidian grade exactly', () => {
    const g = sampleMood(2).grade;
    expect(g.saturation).toBeCloseTo(MOOD_GRADE.obsidian.saturation, 6);
    expect(g.brightness).toBeCloseTo(MOOD_GRADE.obsidian.brightness, 6);
    expect(g.contrast).toBeCloseTo(MOOD_GRADE.obsidian.contrast, 6);
  });
  it('blends grade between states (mood 0.5 saturation is the explore↔dusk midpoint)', () => {
    const g = sampleMood(0.5).grade;
    const mid = (MOOD_GRADE.explore.saturation + MOOD_GRADE.dusk.saturation) / 2;
    expect(g.saturation).toBeCloseTo(mid, 6);
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
