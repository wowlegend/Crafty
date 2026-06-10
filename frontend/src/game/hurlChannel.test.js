import { describe, it, expect } from 'vitest';
import { requestHurl, consumeHurlRequest, requestSlam, consumeSlamRequest } from './hurlChannel';

describe('hurlChannel (S2-B2-M3)', () => {
  it('hurl request round-trips once and clears', () => {
    requestHurl({ x: 1, y: 2, z: 3 }, { x: 0, y: 0, z: -1 }, '#A9966E');
    const r = consumeHurlRequest();
    expect(r.origin.x).toBe(1);
    expect(r.dir.z).toBe(-1);
    expect(r.color).toBe('#A9966E');
    expect(consumeHurlRequest()).toBeNull();
  });
  it('slam request round-trips once and clears', () => {
    requestSlam({ x: 5, y: 6, z: 7 }, '#ffffff');
    const r = consumeSlamRequest();
    expect(r.center.y).toBe(6);
    expect(r.color).toBe('#ffffff');
    expect(consumeSlamRequest()).toBeNull();
  });
});
