import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { youngBytesPerCall, NO_ALLOCATION_BYTES } from './_youngGrowth.js';
import { chargePose, swingPose, castPose } from '../../src/render/handPose.js';
import { playerSensePoint } from '../../src/systems/playerSensePoint.js';
import { stanceFrame } from '../../src/game/combatStance.js';
import { stance } from '../../src/game/stanceState.js';
import { useGameStore } from '../../src/store/useGameStore';
import { EYE_HEIGHT_M } from '../../src/combat/swingOrigin.js';
import { stepDragon, launchFireball, stepFireball } from '../../src/game/dragonMoves.js';
import { createBossCombat } from '../../src/game/bossCombat.js';

/**
 * PER-FRAME CALLS ALLOCATE NOTHING (CLAUDE.md game-code: no allocation in the hot path).
 *
 * Each subject runs every frame of something the player does: the hand poses every frame of a swing, a cast and a heavy
 * charge (render/handPose.js), the point the mobs sense the player from every frame an arrow flies and at the AI's
 * 15 Hz (systems/playerSensePoint.js), and the dragon's move machine through a windup and its fireball's flight every
 * frame of the fight (game/dragonMoves.js). Measured as young-generation growth over runs of 5000 calls no collection
 * interrupted, once the optimiser has compiled the call (tests/gates/_youngGrowth.js), against a control in the same run that shows the probe sees an allocation of the size
 * that matters: a Rapier body's translation(), which builds a wasm vector and an object per call (rapier3d-compat 0.19.2,
 * the build the game ships, run for real here).
 * BLIND SPOT: what the JIT does in a browser is not this process's; a call that allocates only on a path these inputs
 * never take is not seen.
 */

let body = null;
let world = null;
beforeAll(async () => {
  await RAPIER.init();
  world = new RAPIER.World({ x: 0, y: -30, z: 0 });
  body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(4, 50.95, -2));
});
afterEach(() => {
  useGameStore.setState({ playerRigidBodyRef: null });
  stance.bodySeen = false;
});

describe('the probe', () => {
  it('reads an allocation as one, and a call that allocates nothing as nothing', () => {
    let sink = null;
    const translation = youngBytesPerCall(() => { sink = body.translation(); }, { budgetMs: 0 });
    expect(sink.x, 'SETUP: the control did not read the body').toBe(4);
    expect(translation, 'the probe cannot see a Rapier translation() allocate').toBeGreaterThan(8 * NO_ALLOCATION_BYTES);
    const v = new THREE.Vector3();
    expect(youngBytesPerCall((i) => v.set(i, i, i)), 'the probe reads a call that allocates nothing as allocating')
      .toBeLessThan(NO_ALLOCATION_BYTES);
  });
});

describe('the hand poses, every frame of a gesture', () => {
  const anchor = new THREE.Vector3(0.3, -0.3, -0.5);
  const out = { position: new THREE.Vector3(), rotation: [0, 0, 0] };
  const rest = [0.1, -0.2, 0.05];

  it('chargePose, swingPose and castPose fill `out` and allocate nothing', () => {
    chargePose(1, anchor, 1.6, 1, out, rest);
    expect(out.position.distanceTo(anchor), 'SETUP: a full charge must move the hand').toBeGreaterThan(0.05);
    const per = {
      charge: youngBytesPerCall((i) => chargePose((i % 100) / 100, anchor, 1.6, 1, out, rest)),
      swing: youngBytesPerCall((i) => swingPose((i % 100) / 100, { dir: 1, widthMult: 1 }, anchor, 1.6, 1, out, rest)),
      cast: youngBytesPerCall((i) => castPose((i % 100) / 100, anchor, 1.6, out, rest)),
    };
    for (const [name, bytes] of Object.entries(per)) {
      expect(bytes, `${name}Pose allocates ${bytes.toFixed(1)} bytes a call`).toBeLessThan(NO_ALLOCATION_BYTES);
    }
    expect(Object.keys(per).length).toBe(3);
  });
});

describe('the point the mobs sense the player from', () => {
  it('is the steady eye of the body sample the Player loop takes, and reading it allocates nothing', () => {
    // The store holds the real body, as the Player publishes it, so a read through translation() would be measured.
    useGameStore.setState({ playerRigidBodyRef: { current: body } });
    stanceFrame([], body.translation(), 1 / 60); // what the Player loop does every live frame
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(-0.5, 53.15, -6.5); // the roar's reveal, metres off the body
    const out = { x: 0, y: 0, z: 0 };
    const t = body.translation(); // Rapier stores single precision
    expect(playerSensePoint(camera, out), 'SETUP: the point is not the body\'s steady eye').toEqual({ x: t.x, y: t.y + EYE_HEIGHT_M, z: t.z });
    const bytes = youngBytesPerCall(() => playerSensePoint(camera, out));
    expect(bytes, `playerSensePoint allocates ${bytes.toFixed(1)} bytes a call`).toBeLessThan(NO_ALLOCATION_BYTES);
  });

  it('before the Player loop has sampled the body, the camera stands in', () => {
    useGameStore.setState({ playerRigidBodyRef: null });
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(1, 2, 3);
    expect(playerSensePoint(camera, { x: 0, y: 0, z: 0 })).toEqual({ x: 1, y: 2, z: 3 });
  });
});

describe('the dragon, every frame of its fight', () => {
  it('a step through a windup and a fireball\'s flight allocate nothing', () => {
    const rec = createBossCombat();
    rec.active = true; rec.health = 300;
    const ctx = { phase: 1, tricks: ['fireball', 'lava', 'summon'], player: { x: 3, y: 0, z: 0 }, playerAlive: true,
      invincible: false, groundY: 0, damage: 25 };
    expect(stepDragon(rec, ctx, 0)[0], 'SETUP: no bite wound up').toMatchObject({ type: 'windup', move: 'bite', until: 520 });
    const windup = youngBytesPerCall((i) => stepDragon(rec, ctx, i % 500));
    expect(rec.move, 'SETUP: the windup resolved while it was measured').toBe('bite');
    expect(windup, `a step through a windup allocates ${windup.toFixed(1)} bytes a call`).toBeLessThan(NO_ALLOCATION_BYTES);
    // A mark far enough off that the flight never arrives inside the measurement.
    const f = launchFireball({ x: 0, y: 14, z: 0 }, { x: 1e7, y: 0, z: 0 });
    const player = { x: 5, y: 0, z: 5 };
    expect(stepFireball(f, 1 / 60, player), 'SETUP: the fireball is not in flight').toBe('flying');
    const flight = youngBytesPerCall(() => stepFireball(f, 1 / 60, player));
    expect(f.left, 'SETUP: the fireball arrived while it was measured').toBeGreaterThan(0);
    expect(flight, `a fireball's step allocates ${flight.toFixed(1)} bytes a call`).toBeLessThan(NO_ALLOCATION_BYTES);
  });
});
