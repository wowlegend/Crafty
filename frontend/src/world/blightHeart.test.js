import { describe, it, expect } from 'vitest';
import { blightHeartSite, blightHeartChunk, BLIGHT_RADIUS } from './blightHeart.js';

describe('blightHeart site + chunk', () => {
  it('the site sits at >= BLIGHT_RADIUS on the NE diagonal', () => {
    const { x, z } = blightHeartSite();
    expect(x).toBe(z);
    expect(Math.hypot(x, z)).toBeGreaterThanOrEqual(BLIGHT_RADIUS);
  });
  it('blightHeartChunk is the chunk (size 16) that CONTAINS the site', () => {
    const { x, z } = blightHeartSite();
    const { cx, cz } = blightHeartChunk();
    expect(cx).toBe(Math.floor(x / 16));
    expect(cz).toBe(Math.floor(z / 16));
    // the site lies within that chunk's world span
    expect(x).toBeGreaterThanOrEqual(cx * 16);
    expect(x).toBeLessThan(cx * 16 + 16);
  });
});
