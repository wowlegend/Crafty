import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.resolve(__dirname, '../../src/HUD.jsx'), 'utf8');

// S9b: the BLIGHT HEART compass marker (the fixed far-frontier climax lair, the campaign north star).
// Locks the capture-suppression invariant -> a future edit can't leak a run-varying "BLIGHT HEART (Nm)"
// label into the deterministic explore baselines. The block (between the "2d." and "3." comment anchors)
// MUST be inside a `!isCaptureMode()` guard, before the blightHeartSite() call.
describe('S9b Blight Heart compass marker', () => {
  it('imports blightHeartSite from world/blightHeart', () => {
    expect(/import\s*\{\s*blightHeartSite\s*\}\s*from\s*'\.\/world\/blightHeart\.js'/.test(src)).toBe(true);
  });
  it('renders a BLIGHT HEART marker', () => {
    expect(src.includes('BLIGHT HEART (')).toBe(true);
  });
  it('the marker block is CAPTURE-SUPPRESSED (guard precedes the blightHeartSite call)', () => {
    const start = src.indexOf('2d. Render the BLIGHT HEART');
    const end = src.indexOf('3. Render Chest');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = src.slice(start, end);
    expect(block.includes('!isCaptureMode()')).toBe(true);
    expect(block.indexOf('!isCaptureMode()')).toBeLessThan(block.indexOf('blightHeartSite('));
  });
});
