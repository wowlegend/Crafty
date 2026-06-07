import { describe, it, expect, beforeAll } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { BASE_CAPSULE, BEAST_FORMS, setColliderToForm, restoreBaseCollider } from '../../src/game/beasts.js';

// S2-B1-M2: REAL-Rapier integration for the beast-form collider hot-swap. M1's tests used a mock
// collider; this drives the actual @dimforge/rapier3d-compat WASM (the same build the app ships) to
// PROVE the transactional-swap invariant the M1 review flagged as untested:
//   (1) 1000-cycle HANDLE-STABILITY — setShape mutates IN PLACE; the collider handle/index never
//       changes (no remove+re-add), so the KCC's per-frame collider(0) read + collision groups stay valid.
//   (2) every form (incl. the largest, the boulder-bull) is KCC-compatible (computeColliderMovement
//       returns finite movement; the swap never breaks the sweep).
//   (3) the real M1 helpers (setColliderToForm / restoreBaseCollider) drive a real collider correctly.
// The GPU FPS number stays a real-device task (see memory/S2B1-M2-PERF.md); this locks the engine-side
// correctness + bounds the broad-phase footprint deterministically.

let world, rb, col, controller, baseHandle, rbHandle;

beforeAll(async () => {
  await RAPIER.init();
  world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  rb = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 5, 0)
  );
  col = world.createCollider(RAPIER.ColliderDesc.capsule(BASE_CAPSULE.halfHeight, BASE_CAPSULE.radius), rb);
  controller = world.createCharacterController(0.05);
  controller.enableAutostep(1.05, 0.2, true);
  controller.enableSnapToGround(0.5);
  baseHandle = col.handle;
  rbHandle = rb.handle;
  // a small static floor so the KCC sweep has something to resolve against
  const floor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(50, 0.5, 50), floor);
});

const FORMS = Object.values(BEAST_FORMS);

describe('M2 · transactional collider hot-swap (real Rapier)', () => {
  it('setShape preserves the collider + rigid-body handle (in-place mutate, no re-bind)', () => {
    setColliderToForm(col, RAPIER, BEAST_FORMS.ice);
    expect(col.handle).toBe(baseHandle);
    expect(rb.handle).toBe(rbHandle);
    expect(world.getCollider(baseHandle)).toBe(col); // handle still resolves to the same collider
    expect(col.halfHeight()).toBeCloseTo(BEAST_FORMS.ice.halfHeight, 4);
    expect(col.radius()).toBeCloseTo(BEAST_FORMS.ice.radius, 4);
    restoreBaseCollider(col, RAPIER, controller);
    expect(col.halfHeight()).toBeCloseTo(BASE_CAPSULE.halfHeight, 4);
  });

  it('1000 enter/exit cycles: handle is STABLE + the shape is exact every cycle (no re-mesh, no re-bind)', () => {
    for (let i = 0; i < 1000; i++) {
      const form = FORMS[i % FORMS.length];
      setColliderToForm(col, RAPIER, form);
      expect(col.handle).toBe(baseHandle);
      expect(col.halfHeight()).toBeCloseTo(form.halfHeight, 4);
      restoreBaseCollider(col, RAPIER, controller);
      expect(col.handle).toBe(baseHandle);
      expect(col.halfHeight()).toBeCloseTo(BASE_CAPSULE.halfHeight, 4);
    }
    // collider count never grew (no remove+re-add leaked a collider)
    expect(world.colliders.len()).toBe(2); // player + floor
  });

  it('every beast form is KCC-compatible: computeColliderMovement returns finite movement', () => {
    for (const form of FORMS) {
      setColliderToForm(col, RAPIER, form);
      controller.computeColliderMovement(col, { x: 0, y: -0.1, z: 0 });
      const m = controller.computedMovement();
      expect(Number.isFinite(m.x) && Number.isFinite(m.y) && Number.isFinite(m.z)).toBe(true);
    }
    restoreBaseCollider(col, RAPIER, controller);
  });

  it('the boulder-bull (largest form) footprint is bounded — broad-phase load stays sane', () => {
    // The bull is the FPS-de-risk target (widest radius). Assert its footprint is a bounded multiple
    // of the base so the swept AABB / broad-phase candidate growth is bounded (a deterministic proxy
    // for the engine-side cost; the absolute GPU FPS is the real-device check).
    const bull = BEAST_FORMS.ice;
    expect(bull.radius).toBeGreaterThanOrEqual(BASE_CAPSULE.radius); // it IS bigger...
    expect(bull.radius / BASE_CAPSULE.radius).toBeLessThanOrEqual(2.0); // ...but bounded (<=2x)
    const maxHH = Math.max(...FORMS.map((f) => f.halfHeight));
    expect(maxHH / BASE_CAPSULE.halfHeight).toBeLessThanOrEqual(2.0);
  });

  it('restoreBaseCollider drives a REAL collider back to base + leaves it KCC-usable', () => {
    setColliderToForm(col, RAPIER, BEAST_FORMS.arcane); // tallest/most-massive
    restoreBaseCollider(col, RAPIER, controller);
    expect(col.halfHeight()).toBeCloseTo(BASE_CAPSULE.halfHeight, 4);
    expect(col.radius()).toBeCloseTo(BASE_CAPSULE.radius, 4);
    controller.computeColliderMovement(col, { x: 0.1, y: -0.1, z: 0 });
    const m = controller.computedMovement();
    expect(Number.isFinite(m.y)).toBe(true);
  });
});
