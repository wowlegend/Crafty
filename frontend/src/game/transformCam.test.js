import { describe, it, expect } from 'vitest';
import { TRANSFORM_CAM_SEC, transformCamEnvelope, transformCamPose } from './transformCam.js';

// S2-B1-M7a: the third-person transform-cam is PURE geometry+timing -> the pull-back/return envelope
// and the FPV<->TPV blended pose are unit-testable. Components owns the ref-timer + applies the pose.

describe('transformCamEnvelope (pull-back -> hold -> return)', () => {
  it('starts and ends at 0 (full FPV at both ends), peaks at 1 mid-window (the reveal hold)', () => {
    expect(transformCamEnvelope(0)).toBe(0);
    expect(transformCamEnvelope(1)).toBe(0);
    expect(transformCamEnvelope(0.5)).toBe(1);
  });
  it('clamps out-of-range progress', () => {
    expect(transformCamEnvelope(-1)).toBe(0);
    expect(transformCamEnvelope(2)).toBe(0);
  });
  it('rises monotonically over the pull-back, falls monotonically over the return', () => {
    expect(transformCamEnvelope(0.1)).toBeGreaterThan(transformCamEnvelope(0.05));
    expect(transformCamEnvelope(0.25)).toBeGreaterThan(transformCamEnvelope(0.1));
    expect(transformCamEnvelope(0.85)).toBeLessThan(transformCamEnvelope(0.78));
    expect(transformCamEnvelope(0.99)).toBeLessThan(transformCamEnvelope(0.85));
  });
});

describe('transformCamPose (FPV f=0 identity -> third-person f=1)', () => {
  const playerPos = [10, 50, -20];
  const forward = [0, 0, 1]; // facing +Z

  it('at progress 0 = EXACT FPV head pose (byte-identical to first-person — no camera move)', () => {
    const { position, lookAt } = transformCamPose(playerPos, forward, 0);
    expect(position).toEqual([10, 51.2, -20]);     // head = py + 1.2
    expect(lookAt).toEqual([10, 51.2, -19]);       // head + forward
  });

  it('at the reveal hold (progress 0.5) the camera is BEHIND (-forward) + ABOVE, looking at mid-body', () => {
    const { position, lookAt } = transformCamPose(playerPos, forward, 0.5);
    // behind: forward is +Z, so the camera sits at -Z (z decreases by MAX_DIST 4.5)
    expect(position[2]).toBeLessThan(playerPos[2]);
    expect(position[0]).toBe(10);                  // no x offset (forward has no x)
    expect(position[1]).toBeGreaterThan(50 + 1.2); // risen above the head
    // looks at the player's mid-body
    expect(lookAt).toEqual([10, 50.6, -20]);
  });

  it('the camera is always strictly BEHIND the player for f>0 (dot(camera-player, forward) < 0)', () => {
    for (const p of [0.15, 0.3, 0.5, 0.85]) {
      const { position } = transformCamPose(playerPos, forward, p);
      const behind = (position[0] - playerPos[0]) * forward[0] + (position[2] - playerPos[2]) * forward[2];
      expect(behind).toBeLessThan(0);
    }
  });

  it('respects an arbitrary facing direction (camera sits opposite the forward vector)', () => {
    const fwd = [1, 0, 0]; // facing +X
    const { position } = transformCamPose(playerPos, fwd, 0.5);
    expect(position[0]).toBeLessThan(playerPos[0]); // behind along -X
    expect(position[2]).toBe(-20);                  // no z offset
  });

  it('TRANSFORM_CAM_SEC is a sane positive window', () => {
    expect(TRANSFORM_CAM_SEC).toBeGreaterThan(0.5);
    expect(TRANSFORM_CAM_SEC).toBeLessThan(3);
  });
});
