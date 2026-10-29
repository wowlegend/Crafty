import { describe, it, expect } from 'vitest';
import { swingOrigin, steadyEye, EYE_HEIGHT_M, SWING_DROP_M } from './swingOrigin.js';
import { isPointInCone } from './cone.js';
import { FINISHER_ARC_RAD } from '../game/meleeString.js';

describe('swingOrigin: a swing is aimed from the body, whatever the camera is doing', () => {
  it('the apex is the body\'s eye dropped to the chest, and the steady eye is the camera follow\'s height', () => {
    const body = { x: 3, y: 10, z: -2 };
    expect(swingOrigin(body, {})).toEqual({ x: 3, y: 10 + EYE_HEIGHT_M - SWING_DROP_M, z: -2 });
    expect(swingOrigin(body, {}).y).toBeCloseTo(10.4, 9);
    expect(steadyEye(body, {}).y).toBeCloseTo(10.67, 9);
    expect(steadyEye(body, {})).toMatchObject({ x: 3, z: -2 });
  });

  it('the eye sits at human height on the body, under the top of the head, clear of a two-block ceiling', () => {
    // The body's centre rests 0.95 m over the ground and its capsule reaches 1.85 m (Components.jsx).
    const eyeOverGround = 0.95 + EYE_HEIGHT_M;
    expect(eyeOverGround).toBeGreaterThan(1.5);
    expect(eyeOverGround).toBeLessThan(1.85);
    // The near plane (0.1 m, up to 85 degrees of FOV) must not reach into the block over a 2 m passage.
    expect(eyeOverGround + 0.1 * Math.SQRT2).toBeLessThan(2);
  });

  it('the finisher reaches a brute 2.2 m ahead of the body that a cone from a camera shaken 2.43 m would miss', () => {
    // Measured in tests/e2e/melee-string.spec.js: in the frame a dodge started, the camera stood 2.43 m off the body and
    // 1.14 m from a brute 2.2 m ahead of the body. Here the shake has carried the camera past the brute and to its side.
    const body = { x: 0, y: 10, z: 0 };
    const look = { x: 0, y: 0, z: 1 };
    const brute = { x: 0, y: 9.6, z: 2.2 };
    const shakenCamera = { x: 1.0, y: body.y + EYE_HEIGHT_M, z: 2.2 + 0.6 };
    const shakenApex = { x: shakenCamera.x, y: shakenCamera.y - SWING_DROP_M, z: shakenCamera.z };
    expect(Math.hypot(shakenCamera.x - body.x, shakenCamera.y - (body.y + EYE_HEIGHT_M), shakenCamera.z - body.z)).toBeGreaterThan(2.4);
    expect(isPointInCone(shakenApex, look, brute, 4.5, FINISHER_ARC_RAD), 'the shaken camera\'s cone reaches the brute: the case shows nothing').toBe(false);
    expect(isPointInCone(swingOrigin(body, {}), look, brute, 4.5, FINISHER_ARC_RAD)).toBe(true);
  });
});
