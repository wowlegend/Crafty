import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { bearingToMarker } from '../../src/game/compass.js';

// Hearth-on-compass (2026-06-14, next-levers #17). The Hearth (home anchor at world origin) was unfindable:
// the Compass showed boss + chest markers but never home, so a player who built a base couldn't navigate
// back (a real survival frustration — get home before night). Adds a pure bearing helper + a HOME marker.
const __dir = dirname(fileURLToPath(import.meta.url));
const hud = readFileSync(resolve(__dir, '../../src/HUD.jsx'), 'utf8');

describe('bearingToMarker (pure compass math)', () => {
  it('a target dead ahead (north, facing north) sits at compass center (~50%) and is in view', () => {
    const m = bearingToMarker(0, -10, 0, 0, 0); // target due north, player at origin, heading north
    expect(m.inView).toBe(true);
    expect(m.pct).toBeCloseTo(50, 5);
    expect(m.dist).toBeCloseTo(10, 5);
  });
  it('a target directly behind is NOT in view', () => {
    const m = bearingToMarker(0, 10, 0, 0, 0); // due south while facing north
    expect(m.inView).toBe(false);
  });
  it('a target to the right maps to the right half (pct > 50)', () => {
    const m = bearingToMarker(10, 0, 0, 0, 0); // due east while facing north
    expect(m.pct).toBeGreaterThan(50);
  });
  it('distance is the planar euclidean distance (independent of heading)', () => {
    expect(bearingToMarker(3, 4, 0, 0, 1.23).dist).toBeCloseTo(5, 5);
  });
});

describe('the Hearth HOME marker is wired into the Compass', () => {
  it('Compass imports + uses bearingToMarker for a HOME marker at world origin', () => {
    expect(hud).toMatch(/bearingToMarker/);
    expect(hud).toMatch(/HOME \(/);
  });
  it('the HOME marker is capture-suppressed (like boss/chest -> no baseline churn)', () => {
    // the home block must be guarded by an isCaptureMode check
    expect(hud).toMatch(/isCaptureMode\(\)[\s\S]{0,800}HOME \(/);
  });
});
