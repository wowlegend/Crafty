import { describe, it, expect } from 'vitest';
import { swingOrigin, steadyEye, EYE_HEIGHT_M, SWING_DROP_M } from './swingOrigin.js';
import { isPointInCone } from './cone.js';
import { FINISHER_ARC_RAD } from '../game/meleeString.js';

// Mutation-Proof: the apex taken 2.43 m off the body (a shaken camera's) -> the finisher case RED; EYE_HEIGHT_M - SWING_DROP_M
// replaced by EYE_HEIGHT_M (no drop) -> the apex case RED; a comment edit (identity) -> SURVIVES.

describe('swingOrigin: a swing is aimed from the body, whatever the camera is doing', () => {
  it('the apex is the body\'s eye dropped to the chest, and the steady eye is the camera follow\'s height', () => {
    const body = { x: 3, y: 10, z: -2 };
    expect(swingOrigin(body, {})).toEqual({ x: 3, y: 10 + EYE_HEIGHT_M - SWING_DROP_M, z: -2 });
    expect(swingOrigin(body, {}).y).toBeCloseTo(10.4, 9);
    expect(steadyEye(body, {})).toEqual({ x: 3, y: 11.2, z: -2 });
  });

  it('the finisher reaches a brute 2.2 m ahead of the body that a cone from a camera shaken 2.43 m would miss', () => {
    // Measured in tests/e2e/melee-string.spec.js: in the frame a dodge started, the camera stood 2.43 m off the body and
    // 1.14 m from a brute 2.2 m ahead of the body. Here the shake has carried the camera past the brute and to its side.
    const body = { x: 0, y: 10, z: 0 };
    const look = { x: 0, y: 0, z: 1 };
    const brute = { x: 0, y: 9.6, z: 2.2 };
    const shakenCamera = { x: 1.0, y: 11.2, z: 2.2 + 0.6 };
    const shakenApex = { x: shakenCamera.x, y: shakenCamera.y - SWING_DROP_M, z: shakenCamera.z };
    expect(Math.hypot(shakenCamera.x - body.x, shakenCamera.y - (body.y + EYE_HEIGHT_M), shakenCamera.z - body.z)).toBeGreaterThan(2.4);
    expect(isPointInCone(shakenApex, look, brute, 4.5, FINISHER_ARC_RAD), 'the shaken camera\'s cone reaches the brute: the case shows nothing').toBe(false);
    expect(isPointInCone(swingOrigin(body, {}), look, brute, 4.5, FINISHER_ARC_RAD)).toBe(true);
  });
});
