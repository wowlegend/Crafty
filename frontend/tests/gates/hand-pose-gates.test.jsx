// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';

/**
 * THE FIST STAYS IN FRAME THROUGH EVERY SWING AND THE HEAVY CHARGE (render/handPose.js).
 *
 * The swing and the charge were authored in metres for the world camera at 75 degrees; the viewmodel draws at 60, and
 * the window runs from a phone in portrait to 32:9. This projects the fist's and the knuckle plate's own boxes
 * (GAUNTLET_PARTS) through the viewmodel camera at every step of each light-string sweep (slashSweep 1, 2 and the
 * finisher) and at every level of the charge, from the anchors handAnchors gives each aspect, and measures how much of
 * each box's projected extent is inside the frame. A gesture fitted to nothing would pass that, so each one must also
 * still move: the sweeps cross a stated share of the frame and the charge draws the fist toward the camera.
 * The second half mounts StableMagicHands through R3F (tests/gates/_r3f.jsx) at an iPad's portrait aspect and reads
 * back the right hand's pose after a swing frame and at full charge, so the component is shown to play these poses.
 * BLIND SPOT: nothing is drawn; how the swing reads on a GPU is the open REVIEW:w2e:hands-in-motion-unseen.
 */
vi.mock('@react-three/fiber', () => import('@react-three/fiber/dist/react-three-fiber.esm.js'));
// drei's own build reaches a second copy of R3F, whose hooks see no Canvas; the ink outline draws nothing here anyway.
vi.mock('@react-three/drei', () => ({ Outlines: () => null }));
const { mountR3F } = await import('./_r3f.jsx');
const { ViewmodelCamera, handAnchors, HAND_REST_ROT, GAUNTLET_PARTS, VIEWMODEL, HAND_VALUE_FLOOR } = await import('../../src/render/viewmodel.js');
const { swingPose, swingFit, chargePose, chargeFit, frameScale, CHARGE } = await import('../../src/render/handPose.js');
const { slashSweep, pressSwing, _resetStringForTest } = await import('../../src/game/meleeString.js');
const { pressHeavy, cancelHeavy, HEAVY_HOLD_MS, HEAVY_CHARGE_MS } = await import('../../src/game/heavyAttack.js');
const { StableMagicHands, HELD_REST } = await import('../../src/render/playerRender.jsx');
const { useGameStore } = await import('../../src/store/useGameStore');

const REST = HAND_REST_ROT.right;
const PARTS = GAUNTLET_PARTS.filter((p) => p.name === 'fist' || p.name === 'knuckles');
const SWEEPS = [1, 2, 3].map((step) => ({ step, sweep: slashSweep(step) }));
const STEPS = 48;

const corners = ({ pos, size }) => {
  const out = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    out.push(new THREE.Vector3(pos[0] + (sx * size[0]) / 2, pos[1] + (sy * size[1]) / 2, pos[2] + (sz * size[2]) / 2));
  }
  return out;
};

/** The smallest share, over the fist and the knuckle plate, of a projected box extent inside the frame. */
function worstShare(pose, cam) {
  const hand = new THREE.Object3D();
  hand.position.copy(pose.position);
  hand.rotation.set(pose.rotation[0], pose.rotation[1], pose.rotation[2]);
  hand.updateMatrixWorld(true);
  let worst = 1;
  for (const p of PARTS) {
    const n = corners(p).map((c) => c.applyMatrix4(hand.matrixWorld).applyMatrix4(cam.projectionMatrix));
    const x0 = Math.min(...n.map((v) => v.x)), x1 = Math.max(...n.map((v) => v.x));
    const y0 = Math.min(...n.map((v) => v.y)), y1 = Math.max(...n.map((v) => v.y));
    const inX = Math.max(0, Math.min(x1, 1) - Math.max(x0, -1)), inY = Math.max(0, Math.min(y1, 1) - Math.max(y0, -1));
    worst = Math.min(worst, (inX * inY) / ((x1 - x0) * (y1 - y0)));
  }
  return worst;
}

function camAt(aspect) {
  const cam = new ViewmodelCamera();
  cam.aspect = aspect;
  cam.updateProjectionMatrix();
  return cam;
}

const halfWidth = (pose, aspect) => -pose.position.z * Math.tan(THREE.MathUtils.degToRad(VIEWMODEL.fov) / 2) * aspect;
const PHONE = 0.46;
const IPAD_PORTRAIT = 820 / 1180;
const ASPECTS = [PHONE, IPAD_PORTRAIT, 0.75, 1.0, 4 / 3, 1.6, 2.4, 3.56];
/** A phone in portrait leaves even the resting fist partly out (its own rest gate allows 90%), so it is held to less. */
const minShare = (aspect) => (aspect < 0.6 ? 0.85 : 0.9);

describe('every step of every swing, and every level of the charge, keeps the fist in frame', () => {
  it('the three sweeps of the light string, at every aspect from a phone in portrait to 32:9', () => {
    let checked = 0;
    for (const aspect of ASPECTS) {
      const cam = camAt(aspect);
      const anchor = handAnchors(aspect).right;
      for (const { step, sweep } of SWEEPS) {
        const fit = swingFit(sweep, anchor, aspect, REST);
        for (let i = 0; i <= STEPS; i++) {
          const pose = swingPose(i / STEPS, sweep, anchor, aspect, fit, undefined, REST);
          const share = worstShare(pose, cam);
          expect(share, `aspect ${aspect.toFixed(2)}, step ${step}, t ${(i / STEPS).toFixed(2)}: ${(share * 100).toFixed(0)}% in frame`)
            .toBeGreaterThanOrEqual(minShare(aspect));
          checked += 1;
        }
      }
    }
    expect(checked).toBe(ASPECTS.length * SWEEPS.length * (STEPS + 1));
  });

  it('the heavy charge from its first level to full, at every aspect', () => {
    let checked = 0;
    for (const aspect of ASPECTS) {
      const cam = camAt(aspect);
      const anchor = handAnchors(aspect).right;
      const fit = chargeFit(anchor, aspect, REST);
      for (let i = 0; i <= STEPS; i++) {
        const share = worstShare(chargePose(i / STEPS, anchor, aspect, fit, undefined, REST), cam);
        expect(share, `aspect ${aspect.toFixed(2)}, charge ${(i / STEPS).toFixed(2)}: ${(share * 100).toFixed(0)}% in frame`)
          .toBeGreaterThanOrEqual(minShare(aspect));
        checked += 1;
      }
    }
    expect(checked).toBe(ASPECTS.length * (STEPS + 1));
  });

  it('still moves: step 1 and the finisher cross the frame, step 2 comes back, the charge draws the fist in', () => {
    const travel = (sweep, aspect) => {
      const anchor = handAnchors(aspect).right;
      const fit = swingFit(sweep, anchor, aspect, REST);
      let most = 0;
      for (let i = 0; i <= STEPS; i++) {
        const pose = swingPose(i / STEPS, sweep, anchor, aspect, fit, undefined, REST);
        most = Math.max(most, Math.abs(pose.position.x - anchor.x) / halfWidth(pose, aspect));
      }
      return most;
    };
    const rows = [];
    for (const aspect of [IPAD_PORTRAIT, 4 / 3, 1.6, 2.4]) {
      rows.push([aspect, travel(SWEEPS[0].sweep, aspect), travel(SWEEPS[1].sweep, aspect), travel(SWEEPS[2].sweep, aspect)]);
      const anchor = handAnchors(aspect).right;
      const full = chargePose(1, anchor, aspect, chargeFit(anchor, aspect, REST), undefined, REST);
      expect(anchor.z - full.position.z, `aspect ${aspect.toFixed(2)}: the charge no longer draws the fist toward the camera`)
        .toBeLessThan(-0.05);
      expect(full.rotation[0] - REST[0], 'the charge keeps its whole turn: only the offset is fitted').toBeCloseTo(CHARGE.turn[0], 9);
    }
    for (const [aspect, s1, s2, s3] of rows) {
      expect(s1, `aspect ${aspect.toFixed(2)}: step 1 crosses ${(s1 * 100).toFixed(0)}% of the half-width`).toBeGreaterThanOrEqual(0.5);
      expect(s3, `aspect ${aspect.toFixed(2)}: the finisher crosses ${(s3 * 100).toFixed(0)}%`).toBeGreaterThan(s1);
      expect(s2, `aspect ${aspect.toFixed(2)}: step 2 moves ${(s2 * 100).toFixed(0)}%`).toBeGreaterThanOrEqual(0.05);
    }
    expect(rows.find(([a]) => a === 1.6)[2], 'landscape: step 2 should come back across a fifth of the half-width').toBeGreaterThanOrEqual(0.2);
    expect(rows.length).toBe(4);
  });

  it('the authored offsets are turned into the same share of the frame at 60 degrees and the window\'s aspect', () => {
    const k = frameScale(1.6);
    const ratio = Math.tan(THREE.MathUtils.degToRad(30)) / Math.tan(THREE.MathUtils.degToRad(37.5));
    expect(k.y).toBeCloseTo(ratio, 9);
    expect(k.x).toBeCloseTo(ratio, 9);
    expect(frameScale(IPAD_PORTRAIT).x).toBeCloseTo((ratio * IPAD_PORTRAIT) / 1.6, 9);
    expect(frameScale(IPAD_PORTRAIT).y).toBeCloseTo(ratio, 9);
  });
});

let r = null;
afterEach(async () => {
  cancelHeavy();
  _resetStringForTest();
  if (r) await r.unmount();
  r = null;
});

describe('StableMagicHands plays the fitted poses (mounted through R3F at an iPad\'s portrait aspect)', () => {
  const findHands = (scene) => {
    const groups = [];
    scene.traverse((o) => { if (o.isGroup && o.children.some((c) => c.isMesh && c.geometry?.parameters?.width === 0.17)) groups.push(o); });
    return groups;
  };

  it('a swing frame puts the right fist where swingPose puts it, and the wand holds its rest pose in the fist', async () => {
    const attackStartTime = { current: 0 };
    r = await mountR3F(<StableMagicHands selectedBlock={null} attackType="melee" attackStartTime={attackStartTime} />, { width: 820, height: 1180 });
    await r.step(30); // the hand's clock must be past zero: a start at 0 or below reads as no attack
    const clock = r.three().clock;
    attackStartTime.current = clock.elapsedTime - 0.02;
    await r.step(6);
    const elapsed = clock.elapsedTime - attackStartTime.current;
    const sweep = slashSweep(1);
    expect(elapsed, 'SETUP: the swing is over before the read').toBeLessThan(sweep.durationS);
    const hands = findHands(r.three().scene);
    expect(hands.length, 'SETUP: the two gauntlets were not found').toBe(2);
    const right = hands.find((h) => h.children.some((c) => c.userData.rest));
    const aspect = 820 / 1180;
    const anchor = handAnchors(aspect).right;
    const want = swingPose(Math.min(1, elapsed / sweep.durationS), sweep, anchor, aspect, swingFit(sweep, anchor, aspect, REST), undefined, REST);
    expect(right.position.distanceTo(want.position), 'the hand is not on the fitted sweep').toBeLessThan(0.012);
    expect(right.position.distanceTo(anchor), 'SETUP: the hand did not swing').toBeGreaterThan(0.05);
    const wand = right.children.find((c) => c.userData.rest);
    expect(wand.userData.rest).toBe(HELD_REST.wand);
    expect(wand.rotation.toArray().slice(0, 3)).toEqual([...HELD_REST.wand.rotation]);
  });

  it('step 2 of the string plays its own fit, and a resize to landscape refits it', async () => {
    const attackStartTime = { current: 0 };
    r = await mountR3F(<StableMagicHands selectedBlock={null} attackType="melee" attackStartTime={attackStartTime} />, { width: 820, height: 1180 });
    await r.step(30);
    const clock = r.three().clock;
    const right = () => findHands(r.three().scene).find((h) => h.children.some((c) => c.userData.rest));
    const sweep = slashSweep(2);
    /** Two presses, the second inside the string window, then a new start on the hand's clock 0.1 s back. */
    const stepTwo = async () => {
      _resetStringForTest();
      const now = performance.now();
      expect(pressSwing(now - 400).step, 'SETUP: the first press did not fire as step 1').toBe(1);
      expect(pressSwing(now - 20).step, 'SETUP: the second press did not fire as step 2').toBe(2);
      attackStartTime.current = clock.elapsedTime - 0.1;
      await r.step(1);
      return clock.elapsedTime - attackStartTime.current;
    };
    const seen = [];
    for (const [w, h] of [[820, 1180], [1280, 800]]) {
      if (w === 1280) {
        r.three().setSize(w, h);
        await r.step(30);
      }
      const elapsed = await stepTwo();
      expect(elapsed, 'SETUP: the swing is over before the read').toBeLessThan(sweep.durationS);
      const aspect = w / h;
      const anchor = handAnchors(aspect).right;
      const fit = swingFit(sweep, anchor, aspect, REST);
      const want = swingPose(elapsed / sweep.durationS, sweep, anchor, aspect, fit, undefined, REST);
      expect(right().position.distanceTo(want.position), `aspect ${aspect.toFixed(2)}: the hand is not on step 2's fitted sweep`).toBeLessThan(0.012);
      seen.push(fit);
    }
    expect(seen[1], 'SETUP: the two aspects must give step 2 different fits, or a stale fit passes').toBeGreaterThan(seen[0] + 0.2);
  });

  it('at rest, the held item returns to the pose of what is mounted: the wand\'s, or an equipped sword\'s', async () => {
    const saved = useGameStore.getState().equipment;
    try {
      for (const [weapon, want] of [[null, HELD_REST.wand], ['Iron Sword', HELD_REST.weapon]]) {
        useGameStore.setState({ equipment: { ...saved, weapon } });
        r = await mountR3F(<StableMagicHands selectedBlock={null} attackType={null} attackStartTime={{ current: 0 }} />);
        const held = [];
        r.three().scene.traverse((o) => { if (o.userData.rest) held.push(o); });
        expect(held.length, `SETUP: ${weapon ?? 'the wand'}: one held group must be mounted`).toBe(1);
        expect(held[0].userData.rest, `${weapon ?? 'the wand'}: the mounted group names the wrong rest pose`).toBe(want);
        held[0].rotation.set(0.7, -0.4, 0.9);
        held[0].position.y = 0.5;
        await r.step(1);
        expect(held[0].rotation.toArray().slice(0, 3), `${weapon ?? 'the wand'}: the idle frame did not restore its rotation`).toEqual([...want.rotation]);
        expect(held[0].position.y).toBe(want.position[1]);
        await r.unmount();
        r = null;
      }
    } finally {
      useGameStore.setState({ equipment: saved });
    }
  });

  it('an equipped sword or pickaxe is drawn with the hands\' value floor on every part', async () => {
    const saved = useGameStore.getState().equipment;
    try {
      for (const [weapon, parts] of [['Iron Sword', 9], ['Diamond Sword', 9], ['pickaxe', 4]]) {
        useGameStore.setState({ equipment: { ...saved, weapon } });
        r = await mountR3F(<StableMagicHands selectedBlock={null} attackType={null} attackStartTime={{ current: 0 }} />);
        const meshes = [];
        r.three().scene.traverse((o) => { if (o.userData.rest) o.traverse((c) => { if (c.isMesh) meshes.push(c); }); });
        expect(meshes.length, `SETUP: ${weapon}: the held group's parts`).toBe(parts);
        const bare = meshes.filter((c) => c.material.userData.valueFloor?.value !== HAND_VALUE_FLOOR);
        expect(bare.length, `${weapon}: ${bare.length} part(s) without the value floor read near black at night`).toBe(0);
        await r.unmount();
        r = null;
      }
    } finally {
      useGameStore.setState({ equipment: saved });
    }
  });

  it('at full charge the right fist sits at chargePose\'s fitted pose', async () => {
    r = await mountR3F(<StableMagicHands selectedBlock={null} attackType={null} attackStartTime={{ current: 0 }} />, { width: 820, height: 1180 });
    pressHeavy(performance.now() - 10 * (HEAVY_HOLD_MS + HEAVY_CHARGE_MS), 'mouse');
    await r.step(1);
    const right = findHands(r.three().scene).find((h) => h.children.some((c) => c.userData.rest));
    const aspect = 820 / 1180;
    const anchor = handAnchors(aspect).right;
    const want = chargePose(1, anchor, aspect, chargeFit(anchor, aspect, REST), undefined, REST);
    expect(right.position.distanceTo(want.position), 'the hand is not at the fitted charge').toBeLessThan(0.007);
    expect(right.rotation.x).toBeCloseTo(want.rotation[0], 6);
    expect(anchor.z - right.position.z, 'SETUP: the charge did not move the hand').toBeLessThan(-0.02);
  });
});
