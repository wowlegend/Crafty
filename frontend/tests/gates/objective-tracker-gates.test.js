import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { bearingDeg } from '../../src/game/compass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hud = readFileSync(path.resolve(__dirname, '../../src/HUD.jsx'), 'utf8');

// Spawn-direction fix (Kevin 2026-06-16: "I spawn with no guide/direction; where do I go?"). The verified
// gap: a RETURNING player has NO persistent directional cue -- the goal toast is localStorage-once, the
// Compass markers are FOV-gated (vanish when facing away), the QuestTracker text has no bearing. The fix is
// a PERSISTENT, capture-suppressed, facing-INDEPENDENT ObjectiveTracker that names the objective + points to
// it with a rotating arrow + distance. This gate locks the load-bearing invariants of that fix.
describe('spawn-direction ObjectiveTracker', () => {
  const i = hud.indexOf('const ObjectiveTracker');
  const block = i > -1 ? hud.slice(i, i + 2200) : '';

  it('the ObjectiveTracker component exists', () => {
    expect(i).toBeGreaterThan(-1);
  });

  it('is capture-suppressed BEFORE any landmark scan (never leaks into the deterministic baselines)', () => {
    const guard = block.indexOf('isCaptureMode()');
    expect(guard).toBeGreaterThan(-1);
    expect(/if\s*\(\s*isCaptureMode\(\)\s*\)\s*return null/.test(block)).toBe(true);
    const scan = Math.min(
      ...['nearestLandmark(', 'blightHeartSite('].map(s => { const x = block.indexOf(s); return x === -1 ? Infinity : x; })
    );
    expect(guard).toBeLessThan(scan); // the capture guard precedes the scan
  });

  it('is mounted in the HUD after the Compass', () => {
    const compassMount = hud.indexOf('<Compass');
    const trackerMount = hud.indexOf('<ObjectiveTracker');
    expect(compassMount).toBeGreaterThan(-1);
    expect(trackerMount).toBeGreaterThan(compassMount);
  });

  it('is PERSISTENT, not localStorage-once (the load-bearing fix vs the dead onboarding toast)', () => {
    expect(block.includes('localStorage')).toBe(false);
    expect(block.includes('crafty_onboarded')).toBe(false);
  });

  it('points facing-INDEPENDENTLY via a full-circle bearing (Math.PI * 2), unlike the FOV=PI compass', () => {
    expect(/Math\.PI\s*\*\s*2/.test(block)).toBe(true);
    expect(block.includes('bearingDeg')).toBe(true);
  });
});

describe('bearingDeg — full-circle bearing -> arrow rotation (pure)', () => {
  it('maps pct (50=ahead) to degrees [-180,180]', () => {
    expect(bearingDeg(50)).toBe(0);     // dead ahead
    expect(bearingDeg(0)).toBe(-180);   // directly behind (left edge)
    expect(bearingDeg(100)).toBe(180);  // directly behind (right edge)
    expect(bearingDeg(75)).toBe(90);    // 90deg to the right
    expect(bearingDeg(25)).toBe(-90);   // 90deg to the left
  });
});
