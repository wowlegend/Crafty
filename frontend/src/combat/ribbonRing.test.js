import { describe, it, expect } from 'vitest';
import { makeTrailRing, pushTrailPoint, dropExpiredTrailPoints, TRAIL_LIFE_SEC, TRAIL_CAPACITY } from './ribbonRing.js';
import { fillRibbonIndices, buildRibbonIndices } from './ribbonIndices.js';

// THE SWING TRAIL REBUILT ITSELF FROM SCRATCH EVERY FRAME.
//
// Each swing frame pushed `{ tip, base, time }` with two freshly-allocated and freshly-CLONED Vector3s,
// then `Array.filter` built a whole new array — every frame, whether or not anything had expired, and
// including on frames with no swing at all when the list is empty and there is nothing to do. Downstream,
// the geometry got a new Float32Array pair, a new Uint16Array and three new BufferAttributes per frame,
// plus two bounding-volume recomputes. Swapping a BufferAttribute forces a full GPU re-upload, so the
// allocation was not even buying a cheaper upload than `needsUpdate`.
const V = (x, y, z) => ({ x, y, z });

describe('trail ring — a fixed store of numbers', () => {
  it('records what it was given, in order', () => {
    const r = makeTrailRing(4);
    pushTrailPoint(r, V(1, 2, 3), V(4, 5, 6), 10);
    pushTrailPoint(r, V(7, 8, 9), V(10, 11, 12), 11);
    expect(r.count).toBe(2);
    expect([r.tip[0], r.tip[1], r.tip[2]]).toEqual([1, 2, 3]);
    expect([r.base[3], r.base[4], r.base[5]]).toEqual([10, 11, 12]);
    expect(r.time[1]).toBe(11);
  });

  it('drops the OLDEST at capacity instead of growing or throwing', () => {
    const r = makeTrailRing(3);
    for (let i = 0; i < 5; i++) pushTrailPoint(r, V(i, 0, 0), V(i, 0, 0), i);
    expect(r.count).toBe(3);
    expect(r.time[0], 'the ring kept the oldest points instead of the newest').toBe(2);
    expect(r.time[2]).toBe(4);
  });

  it('expires a PREFIX and keeps the rest, values intact', () => {
    const r = makeTrailRing(8);
    for (let i = 0; i < 5; i++) pushTrailPoint(r, V(i, 0, 0), V(0, 0, 0), i * 0.05);
    const dropped = dropExpiredTrailPoints(r, 0.25, TRAIL_LIFE_SEC);
    expect(dropped, 'nothing expired at all').toBeGreaterThan(0);
    expect(r.count).toBe(5 - dropped);
    // Whatever survived must be the NEWEST, and its data must have moved with it.
    expect(r.time[0]).toBeCloseTo((5 - r.count) * 0.05, 6);
    expect(r.tip[0]).toBeCloseTo(5 - r.count, 6);
  });

  it('expires nothing when nothing is old — the frame that used to rebuild anyway', () => {
    const r = makeTrailRing(8);
    pushTrailPoint(r, V(1, 1, 1), V(2, 2, 2), 100);
    expect(dropExpiredTrailPoints(r, 100.01, TRAIL_LIFE_SEC)).toBe(0);
    expect(r.count).toBe(1);
  });

  it('empties cleanly and can be refilled — a swing after a long pause', () => {
    const r = makeTrailRing(4);
    pushTrailPoint(r, V(1, 1, 1), V(1, 1, 1), 0);
    expect(dropExpiredTrailPoints(r, 99, TRAIL_LIFE_SEC)).toBe(1);
    expect(r.count).toBe(0);
    pushTrailPoint(r, V(5, 5, 5), V(5, 5, 5), 99);
    expect(r.count).toBe(1);
    expect(r.tip[0]).toBe(5);
  });

  it('holds enough for the declared life at 120Hz — a clipped trail is a visible defect', () => {
    expect(TRAIL_CAPACITY).toBeGreaterThan(TRAIL_LIFE_SEC * 120);
  });
});

describe('fillRibbonIndices — same triangles, no allocation', () => {
  it('writes exactly what buildRibbonIndices returns', () => {
    const out = new Uint16Array(39 * 6);
    for (const N of [2, 3, 7, 20]) {
      const ref = buildRibbonIndices(N);
      const live = fillRibbonIndices(out, N);
      expect(live, `index count wrong for N=${N}`).toBe(ref.length);
      expect(Array.from(out.subarray(0, live))).toEqual(Array.from(ref));
    }
  });

  it('reports the LIVE count, which is what makes a fixed buffer draw a variable ribbon', () => {
    const out = new Uint16Array(39 * 6);
    expect(fillRibbonIndices(out, 5)).toBe(24);
    expect(fillRibbonIndices(out, 2)).toBe(6);
  });

  it('a degenerate ribbon writes nothing rather than a torn triangle', () => {
    const out = new Uint16Array(12).fill(9);
    expect(fillRibbonIndices(out, 1)).toBe(0);
    expect(fillRibbonIndices(out, 0)).toBe(0);
    expect(out[0], 'it wrote into the buffer for a ribbon with no quads').toBe(9);
  });

  it('clamps to the target rather than overrunning it', () => {
    const out = new Uint16Array(6); // room for exactly one quad
    expect(fillRibbonIndices(out, 100)).toBe(6);
  });
});
