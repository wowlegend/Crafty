import { describe, it, expect } from 'vitest';
import { weatherDummy } from './_sceneScratch';

// RAIN AND FIREFLIES WORE THE LAST SNOWFLAKE'S ROTATION.
//
// Three instancing loops in WeatherSystem share one Object3D scratch, and only the SNOW loop ever writes
// `rotation` — seeded at `r() * 100` radians, i.e. arbitrary. Nothing reset it. So rain instances in
// frame N composed their matrix from the rotation snow left in frame N-1, and the firefly loop, which
// runs after snow in the SAME frame, tumbled its low-poly spheres the instant it started snowing at
// night. Object3D.updateMatrix composes from the quaternion, and three keeps that synced on
// `rotation.set`, so there is no path by which the leak is harmless.
//
// The fix is structural rather than a reset statement in three places: the scratch is no longer
// exported, so the only way to get it is through an accessor that hands it back in a declared state.
describe('weatherDummy — the shared scratch is handed back in a declared state', () => {
  it('clears a rotation left by a previous loop', () => {
    const d = weatherDummy();
    d.rotation.set(1.234, 5.678, 0.9); // what the snow loop leaves behind
    const next = weatherDummy();
    expect(next.rotation.x).toBe(0);
    expect(next.rotation.y).toBe(0);
    expect(next.rotation.z).toBe(0);
  });

  it('clears the QUATERNION too, which is what updateMatrix actually reads', () => {
    // Asserting on `rotation` alone would pass against a fix that assigned the Euler without going
    // through the setter three syncs from. This is the assertion that matches the mechanism.
    const d = weatherDummy();
    d.rotation.set(0.5, 0.5, 0.5);
    d.updateMatrix();
    const next = weatherDummy();
    next.updateMatrix();
    expect(next.quaternion.x).toBeCloseTo(0, 12);
    expect(next.quaternion.y).toBeCloseTo(0, 12);
    expect(next.quaternion.z).toBeCloseTo(0, 12);
    expect(next.quaternion.w).toBeCloseTo(1, 12);
  });

  it('clears position and scale as well — a hidden loop leaves scale at 0', () => {
    // The rain/snow loops set scale to (0,0,0) to hide instances while the weather is off. A later loop
    // inheriting that draws nothing at all, which is the same class of bug wearing a worse costume.
    const d = weatherDummy();
    d.scale.set(0, 0, 0);
    d.position.set(99, 99, 99);
    const next = weatherDummy();
    expect(next.scale.toArray()).toEqual([1, 1, 1]);
    expect(next.position.toArray()).toEqual([0, 0, 0]);
  });

  it('still returns THE SAME object every call — the zero-allocation reason it is a singleton', () => {
    // Returning a fresh Object3D would satisfy every assertion above and quietly allocate once per loop
    // per frame in three hot instancing paths.
    expect(weatherDummy()).toBe(weatherDummy());
  });
});
