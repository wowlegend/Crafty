import { describe, it, expect } from 'vitest';
import { maxWindowDensity } from '../../src/devtest/diffDensity.js';

// The measure the whole-frame ratio cannot express. 6% of a 1280x800 frame is 61,440 pixels — a 248x248
// block can change completely and PASS — while 13 of the 31 frames reproduce byte-identically. Measured
// on a real capture pair, local density runs 7.3x-62.5x the global ratio, which is exactly why a
// threshold cannot be reasoned across from one to the other and why this reports rather than asserts.
//
// Every claim below is checked against a HAND-COMPUTABLE fixture, so the helper cannot pass by returning
// something plausible. A density function that always answered "0" would look identical to a clean frame.
const mask = (w, h, on) => {
  const m = new Uint8Array(w * h * 4);
  for (const [x, y] of on) m[(y * w + x) * 4 + 3] = 255;
  return m;
};

describe('maxWindowDensity — localised change, and proof it can see it', () => {
  it('reports zero for an untouched frame', () => {
    const r = maxWindowDensity(mask(64, 64, []), 64, 64, 16, 8);
    expect(r.density).toBe(0);
    expect(r.changed).toBe(0);
    expect(r.windows, 'no window was ever evaluated — the scan is vacuous').toBeGreaterThan(0);
  });

  it('finds a fully-saturated window and reports density 1', () => {
    // A solid 16x16 block at the origin, inside a 16x16 window, is 100% dense.
    const on = [];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) on.push([x, y]);
    const r = maxWindowDensity(mask(64, 64, on), 64, 64, 16, 8);
    expect(r.density).toBe(1);
    expect(r.changed).toBe(256);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
  });

  it('LOCATES the concentration rather than just scoring it', () => {
    const on = [];
    for (let y = 32; y < 48; y++) for (let x = 16; x < 32; x++) on.push([x, y]);
    const r = maxWindowDensity(mask(64, 64, on), 64, 64, 16, 16);
    expect(r.density).toBe(1);
    expect([r.x, r.y], 'the worst window is reported in the wrong place').toEqual([16, 32]);
  });

  it('separates a concentrated change from an equally-large scattered one — the whole point', () => {
    // Same number of changed pixels, same global ratio, wildly different local density.
    const solid = [];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) solid.push([x, y]);
    const scattered = [];
    for (let i = 0; i < 256; i++) scattered.push([(i * 13) % 64, (i * 7) % 64]);
    const a = maxWindowDensity(mask(64, 64, solid), 64, 64, 16, 8);
    const b = maxWindowDensity(mask(64, 64, scattered), 64, 64, 16, 8);
    expect(a.changed).toBe(256);
    expect(b.changed).toBeGreaterThan(0);
    expect(a.density, 'a concentrated block did not outscore scattered noise').toBeGreaterThan(b.density * 2);
  });

  it('clamps a window larger than the frame instead of scanning nothing', () => {
    const r = maxWindowDensity(mask(8, 8, [[0, 0]]), 8, 8, 128, 32);
    expect(r.windows, 'an oversized window silently skipped the whole frame').toBeGreaterThan(0);
    expect(r.density).toBeCloseTo(1 / 64, 10);
  });
});
