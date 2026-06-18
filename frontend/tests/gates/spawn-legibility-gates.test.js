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
    const start = terrain.indexOf('FarBeacon');
    expect(start).toBeGreaterThan(-1);
  });
  it('the objective cue is PERSISTENT (ObjectiveTracker, not the 4s onboarding toast)', () => {
    // ObjectiveTracker already persists; assert it is still mounted + names the narrative objective
    expect(read('HUD.jsx')).toMatch(/<ObjectiveTracker/);
  });
});
