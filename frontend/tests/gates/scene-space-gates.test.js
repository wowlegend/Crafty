import { describe, it, expect, vi } from 'vitest';
import { isWorldSpaceParent, warnIfNotWorldSpace } from '../../src/world/sceneSpace.js';

// THE 2026-08-09 AUDIT'S SECOND CLUSTER: world coordinates assigned to a mesh whose parent is MOVING.
//
// HurlSystem and SnareTetherSystem were both mounted inside the player's <RigidBody>, which rapier drives
// to the player's world translation every step. Both then set mesh positions from world-space data — the
// hurl origin from `camera.position` (the camera is a SIBLING of the body, so its position is world), the
// tether midpoint from an ECS mob's world vector. Children of a body at world position P, given world
// coordinate W, render at P + W.
//
// What made it survive review: the tether's LENGTH and ANGLE were right. scale.y comes from
// _from.distanceTo(_to) and the quaternion from the normalized delta — both translation-invariant. So the
// ribbon had the correct shape in the wrong place, which reads as correct in the source.
//
// The fix is architectural (mount world-space effects at the scene root), but the durable part is this
// GUARD: a dev-time check that a component claiming world space actually has an untransformed parent. It
// detects the defect CLASS, not just the two instances the audit happened to find.
describe('isWorldSpaceParent — is this parent actually at the world origin, unrotated and unscaled?', () => {
  const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

  it('accepts an identity matrix', () => {
    expect(isWorldSpaceParent(identity())).toBe(true);
  });

  it('REJECTS a translated parent — the exact defect (player at y=100)', () => {
    const m = identity();
    m[13] = 100; // column-major: elements[12..14] are the translation
    expect(isWorldSpaceParent(m)).toBe(false);
  });

  it('rejects translation on any axis, not just the one that happened to bite', () => {
    for (const i of [12, 13, 14]) {
      const m = identity();
      m[i] = 7;
      expect(isWorldSpaceParent(m), `translation on element ${i} not detected`).toBe(false);
    }
  });

  it('rejects a ROTATED parent — angle-invariant maths would hide it', () => {
    // The tether's quaternion is computed from a normalized delta, so rotation of the parent corrupts
    // the result while leaving length correct. Exactly the class that reads fine in source.
    const m = identity();
    m[0] = 0; m[1] = 1; m[4] = -1; m[5] = 0; // 90 deg about Z
    expect(isWorldSpaceParent(m)).toBe(false);
  });

  it('rejects a SCALED parent', () => {
    const m = identity();
    m[0] = 2; m[5] = 2; m[10] = 2;
    expect(isWorldSpaceParent(m)).toBe(false);
  });

  it('tolerates float noise rather than firing on the last bit', () => {
    // matrixWorld is composed from floats every frame; an exact === would make this warn constantly and
    // train everyone to ignore it — a gate that cries wolf protects nothing.
    const m = identity();
    m[13] = 1e-7;
    expect(isWorldSpaceParent(m)).toBe(true);
  });

  it('treats a missing or malformed matrix as NOT world space, never as fine', () => {
    // Failing open is how a guard reports a clean pass over input it never examined.
    for (const bad of [null, undefined, [], [1, 2, 3], 'identity']) {
      expect(isWorldSpaceParent(bad)).toBe(false);
    }
  });
});

describe('warnIfNotWorldSpace — the dev-time guard that would have caught both instances', () => {
  const obj = (els, hasParent = true) => ({ parent: hasParent ? { matrixWorld: { elements: els } } : null });
  const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

  it('warns, naming the component, when the parent is transformed', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const m = identity();
    m[13] = 100;
    warnIfNotWorldSpace(obj(m), 'HurlSystem');
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0].join(' ')).toContain('HurlSystem');
    spy.mockRestore();
  });

  it('stays silent when the parent is untransformed', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnIfNotWorldSpace(obj(identity()), 'HurlSystem');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('warns at most ONCE per label, so a per-frame caller cannot flood the console', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const m = identity();
    m[12] = 5;
    for (let i = 0; i < 50; i++) warnIfNotWorldSpace(obj(m), 'Repeated');
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it('does not throw when the object has no parent yet', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => warnIfNotWorldSpace(obj(null, false), 'Unmounted')).not.toThrow();
    expect(() => warnIfNotWorldSpace(null, 'Null')).not.toThrow();
    spy.mockRestore();
  });
});
