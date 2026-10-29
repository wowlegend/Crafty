// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';

/**
 * THE PLAYER'S OWN BEAST, SEEN FROM ITS EYE (render/beastAvatarParts.js SELF_CLEARANCE_M, render/BeastAvatar.jsx).
 *
 * With the eye at the body's centre + EYE_HEIGHT_M (DECISIONS 2026-10-28 item 34), first person in beast form puts the
 * eye inside the hawk's and the golem's heads, 0.07 m over the golem's torso and 0.04 m from the dragon's neck. A part
 * that near fills the view or is cut by the 0.1 m near plane. This checks the box distance against three's own
 * transforms, that every part within the clearance of the first-person eye is drawn into the shadow map only (no colour,
 * no depth, still a caster), and, mounted through R3F (tests/gates/_r3f.jsx), that the avatar applies it each frame and
 * draws every part again when the transform-cam stands off for the reveal.
 * BLIND SPOT: nothing is drawn; how the beast reads in first person on a GPU is not shot.
 */
vi.mock('@react-three/fiber', () => import('@react-three/fiber/dist/react-three-fiber.esm.js'));
const { mountR3F } = await import('./_r3f.jsx');
const { beastAvatarParts, boxDistance, SELF_CLEARANCE_M, BEAST_AVATAR_ELEMENTS } = await import('../../src/render/beastAvatarParts.js');
const { BeastAvatar, FEET_OFFSET } = await import('../../src/render/BeastAvatar.jsx');
const { EYE_HEIGHT_M } = await import('../../src/combat/swingOrigin.js');
const { transformCamPose } = await import('../../src/game/transformCam.js');
const { useGameStore } = await import('../../src/store/useGameStore');

/** The first-person eye in the avatar's own frame: the group sits FEET_OFFSET under the body's centre. */
const EYE_LOCAL_Y = EYE_HEIGHT_M - FEET_OFFSET;

/** three's answer: the point taken into the box's frame by the inverse of its world matrix, then clamped. */
function threeDistance(box, p) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...box.pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(box.rot || [0, 0, 0]))), new THREE.Vector3(1, 1, 1));
  const local = p.clone().applyMatrix4(m.invert());
  const h = new THREE.Vector3(...box.size).multiplyScalar(0.5);
  return new THREE.Vector3(Math.max(Math.abs(local.x) - h.x, 0), Math.max(Math.abs(local.y) - h.y, 0), Math.max(Math.abs(local.z) - h.z, 0)).length();
}

describe('the distance from the eye to each part of the beast', () => {
  it('agrees with three\'s transforms for every box of every form, rotated about each axis', () => {
    let checked = 0;
    const axes = new Set();
    for (const el of BEAST_AVATAR_ELEMENTS) {
      for (const box of beastAvatarParts(el).boxes) {
        (box.rot || []).forEach((r, i) => { if (r) axes.add(i); });
        for (const p of [[0, EYE_LOCAL_Y, 0], [0.3, 1.2, -0.4], [-0.7, 0.5, 0.9], [...box.pos]]) {
          const v = new THREE.Vector3(...p);
          expect(boxDistance(box, v.x, v.y, v.z), `${el} box at ${box.pos}`).toBeCloseTo(threeDistance(box, v), 9);
          checked += 1;
        }
      }
    }
    expect([...axes].sort(), 'SETUP: the boxes must turn about x, y and z, or a wrong rotation order passes').toEqual([0, 1, 2]);
    expect(checked).toBe(4 * BEAST_AVATAR_ELEMENTS.reduce((n, el) => n + beastAvatarParts(el).boxes.length, 0));
  });

  it('at the first-person eye the hawk\'s and the golem\'s heads are inside the clearance, and nothing far is', () => {
    const near = (el) => beastAvatarParts(el).boxes
      .map((b, i) => [i, boxDistance(b, 0, EYE_LOCAL_Y, 0)])
      .filter(([, d]) => d < SELF_CLEARANCE_M).map(([i]) => i);
    expect(boxDistance(beastAvatarParts('lightning').boxes[1], 0, EYE_LOCAL_Y, 0), 'SETUP: the eye is no longer in the hawk\'s head').toBe(0);
    expect(boxDistance(beastAvatarParts('arcane').boxes[1], 0, EYE_LOCAL_Y, 0), 'SETUP: the eye is no longer in the golem\'s head').toBe(0);
    expect(near('lightning')).toContain(1);
    expect(near('arcane')).toEqual([0, 1]); // the torso a hand's width under the eye, and the head around it
    expect(SELF_CLEARANCE_M, 'the clearance must cover the near plane, or a clipped part still draws').toBeGreaterThan(0.1);
    expect(SELF_CLEARANCE_M, 'the clearance would hide the beast the player sees beside them').toBeLessThan(0.4);
  });
});

let r = null;
afterEach(async () => {
  if (r) await r.unmount();
  r = null;
  useGameStore.setState({ beastFormActive: false, activeBeastForm: null });
});

describe('BeastAvatar applies it each frame (mounted through R3F, the body at the origin)', () => {
  it('in first person the golem\'s head and torso write no colour or depth and still cast; in the reveal every part draws', async () => {
    useGameStore.setState({ beastFormActive: true, activeBeastForm: 'arcane' });
    r = await mountR3F(<BeastAvatar />);
    const cam = r.three().camera;
    cam.position.set(0, EYE_HEIGHT_M, 0);
    cam.rotation.set(0, 0.7, 0, 'YXZ');
    cam.updateMatrixWorld(true);
    await r.step(90); // past the entrance pop, so the group is at full scale
    const boxes = [];
    r.three().scene.traverse((o) => { if (o.isMesh && o.castShadow) boxes.push(o); });
    expect(boxes.length, 'SETUP: the golem\'s boxes').toBe(beastAvatarParts('arcane').boxes.length);
    const hidden = boxes.map((m, i) => [i, m.material.colorWrite, m.material.depthWrite]).filter(([, c]) => !c);
    expect(hidden.map(([i]) => i), 'the parts around the first-person eye still draw').toEqual([0, 1]);
    expect(hidden.every(([, , d]) => d === false), 'a hidden part still writes depth and hides the world behind it').toBe(true);
    expect(boxes.every((m) => m.visible && m.castShadow && m.material.visible), 'a hidden part lost its shadow').toBe(true);

    const reveal = transformCamPose([0, 0, 0], [Math.sin(0.7), 0, Math.cos(0.7)], 0.5).position;
    cam.position.set(...reveal);
    cam.updateMatrixWorld(true);
    await r.step(1);
    expect(boxes.filter((m) => !m.material.colorWrite || !m.material.depthWrite).length, 'the reveal hides a part of the beast').toBe(0);
  });
});
