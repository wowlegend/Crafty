import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.resolve(__dirname, '../../src/HUD.jsx'), 'utf8');

// S8b: the nearest-shrine compass marker. Locks the load-bearing invariant that the marker is
// CAPTURE-SUPPRESSED (like HOME/boss/chest) -> a future edit can't leak a run-varying "SHRINE (Nm)"
// label into the deterministic explore baselines. The shrine logic block (between the "2c." and
// "3." comment anchors) MUST be inside a `!isCaptureMode()` guard, before the nearestLandmark scan.
describe('S8b nearest-shrine compass marker', () => {
  it('imports the pure nearestLandmark finder from world/shrines', () => {
    expect(/import\s*\{\s*nearestLandmark\s*\}\s*from\s*'\.\/world\/shrines\.js'/.test(src)).toBe(true);
  });

  it('renders a SHRINE marker', () => {
    expect(src.includes('SHRINE (')).toBe(true);
  });

  it('the shrine block is CAPTURE-SUPPRESSED (guard precedes the nearestLandmark scan)', () => {
    const start = src.indexOf('2c. Render nearest-SHRINE');
    const end = src.indexOf('3. Render Chest');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = src.slice(start, end);
    expect(block.includes('!isCaptureMode()')).toBe(true);
    expect(block.indexOf('!isCaptureMode()')).toBeLessThan(block.indexOf('nearestLandmark('));
  });
});
