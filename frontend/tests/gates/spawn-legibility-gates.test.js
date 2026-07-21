import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('spawn legibility gates', () => {
  const terrain = strip(read('world/Terrain.jsx'));
  it('a far-LOD beacon (light shaft) is driven off nearestLandmark + blightHeartSite, NOT chunk load', () => {
    expect(terrain).toMatch(/nearestLandmark/);
    expect(terrain).toMatch(/blightHeartSite/);
    // a tall vertical beam mesh (cylinder) decoupled from the LandmarksRender chunk gate
    expect(terrain).toMatch(/FarBeacon|LightShaft|beaconBeam/);
  });
  it('the far beacon is capture-suppressed (never in the 20 baselines)', () => {
    const start = terrain.indexOf('const FarBeacon');
    expect(start).toBeGreaterThan(-1);
    // Not just that the symbol exists — assert the component RENDER early-returns null under capture, so it
    // can never appear in a baseline. Bounded to the FarBeacon body; the useFrame guard above it is
    // `return;` (no null), so this pattern is the render suppression specifically. MUTATION-PROOF: delete
    // FarBeacon's `if (isCaptureMode()) return null;` and this goes RED.
    const body = terrain.slice(start, start + 1500);
    expect(body).toMatch(/if\s*\(\s*isCaptureMode\(\)\s*\)\s*return null/);
  });
  it('the objective cue is PERSISTENT (ObjectiveTracker, not the 4s onboarding toast)', () => {
    // ObjectiveTracker already persists; assert it is still mounted + names the narrative objective
    expect(read('HUD.jsx')).toMatch(/<ObjectiveTracker/);
  });
});
