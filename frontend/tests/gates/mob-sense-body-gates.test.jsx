// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest';

/**
 * MOBS SENSE THE BODY, NOT THE CAMERA (game/mobSenses.js mobSensePoint, systems/AIWorkerSystem.jsx).
 *
 * The camera carries the walk bob, the shake, the verb kicks and, for the roar, a reveal pose 4.5 m behind and 2.2 m up.
 * When the AI posted the camera as the player's position, a zombie beside the player could not swing during the roar
 * and one beside the reveal camera could. This mounts the real AIWorkerSystem through R3F (tests/gates/_r3f.jsx) with
 * its Web Worker stubbed, stages the reveal (the camera at transformCamPose's hold), and reads the playerPos the system
 * POSTS; then it runs the real worker (workers/ai.worker.js, its `self` shimmed) on that point: a zombie beside the body
 * lands a blow, and a moss brute beside the reveal camera does not (from the camera, both verdicts flip). The arrow's hit test (systems/EnemyProjectileSystem.jsx)
 * reads the same point, and so does the combat stance (combatStance.test.js).
 * BLIND SPOT: the Player's own loop is not mounted; the body is the store's playerRigidBodyRef, stubbed.
 */
vi.mock('@react-three/fiber', () => import('@react-three/fiber/dist/react-three-fiber.esm.js'));
const worker = vi.hoisted(() => ({ posts: [] }));
vi.mock('../../src/workers/ai.worker.js?worker', () => ({
  default: class FakeAIWorker {
    postMessage(m) { worker.posts.push(m); }
    terminate() {}
  },
}));
const { mountR3F } = await import('./_r3f.jsx');
const { AIWorkerSystem } = await import('../../src/systems/AIWorkerSystem.jsx');
const { useGameStore } = await import('../../src/store/useGameStore');
const { transformCamPose } = await import('../../src/game/transformCam.js');
const { EYE_HEIGHT_M } = await import('../../src/combat/swingOrigin.js');

// The real worker, run in this process: it assigns self.onmessage and replies through self.postMessage.
const replies = [];
let onmessage;
beforeAll(async () => {
  vi.stubGlobal('self', { postMessage: (m) => replies.push(m), set onmessage(fn) { onmessage = fn; }, get onmessage() { return onmessage; } });
  await import('../../src/workers/ai.worker.js');
});
// The worker replies through `self` when it runs, not when it loads, so the shim stays for the file.
afterAll(() => { vi.unstubAllGlobals(); });

const NOW = 10_000_000;
const mobAt = (type, x, y, z) => ({
  id: type, passive: false, x, y, z, targetX: x, targetZ: z, isMoving: false, isAggro: true, lastAttackTime: 0,
  windupUntil: 0, damage: 5, type, moveTimer: 0, speed: 1, rotation: 0, health: 100, maxHealth: 100, heightGrid: null,
});
/** Two real worker ticks, the second past the windup: does the zombie land a blow on `playerPos`? */
function lands(playerPos, mob) {
  replies.length = 0;
  onmessage({ data: { type: 'TICK', playerPos, now: NOW, delta: 0.016, mobs: [mob] } });
  const u = replies[replies.length - 1].updates[0];
  const first = replies[replies.length - 1].attacks.length;
  onmessage({ data: { type: 'TICK', playerPos, now: NOW + 600, delta: 0.016,
    mobs: [{ ...mob, isAggro: u.isAggro, windupUntil: u.windupUntil, lastAttackTime: u.lastAttackTime }] } });
  return first + replies[replies.length - 1].attacks.length > 0;
}

let r = null;
afterEach(async () => {
  if (r) await r.unmount();
  r = null;
  worker.posts.length = 0;
  useGameStore.setState({ playerRigidBodyRef: null });
});

describe('the point the AI posts during the roar\'s reveal', () => {
  it('is the body\'s steady eye, and a zombie beside the body reaches it while one beside the reveal camera does not', async () => {
    // The body's centre 0.95 m over a floor at y 50; the reveal camera at the transform-cam's hold, facing +Z.
    const body = { x: 4, y: 50.95, z: -2 };
    useGameStore.setState({ playerRigidBodyRef: { current: { translation: () => ({ ...body }) } } });
    r = await mountR3F(<AIWorkerSystem />);
    const reveal = transformCamPose([body.x, body.y, body.z], [0, 0, 1], 0.5).position;
    const cam = r.three().camera;
    cam.position.set(...reveal);
    cam.updateMatrixWorld(true);
    await r.step(8); // the bridge ticks at 15 Hz
    const ticks = worker.posts.filter((m) => m.type === 'TICK');
    expect(ticks.length, 'SETUP: the AI system posted no tick').toBeGreaterThan(0);
    const posted = ticks[ticks.length - 1].playerPos;
    expect(Math.hypot(reveal[0] - body.x, reveal[2] - body.z), 'SETUP: the reveal camera must stand metres off the body').toBeGreaterThan(4);
    expect(posted, 'the AI senses the player from somewhere other than the body\'s eye').toEqual([body.x, body.y + EYE_HEIGHT_M, body.z]);

    // On the player's floor (a mob's centre 0.5 m over it): a zombie 1.5 m across from the body, and a moss brute (reach
    // 3.2 m across and up) 1.5 m across from the reveal camera, whose 2.2 m of height an ordinary mob cannot reach.
    const floor = body.y - 0.95;
    const zombie = mobAt('zombie', body.x + 1.5, floor + 0.5, body.z);
    const brute = mobAt('moss_brute', reveal[0] + 1.5, floor + 0.5, reveal[2]);
    expect(lands(posted, zombie), 'a zombie beside the player cannot swing during the reveal').toBe(true);
    expect(lands(posted, brute), 'a brute beside the reveal camera lands a blow on a player 4.7 m away').toBe(false);
    // The controls: from the camera each verdict flips, so the two cases tell the points apart.
    expect(lands(reveal, zombie), 'SETUP: from the camera, the zombie beside the body must be out of reach').toBe(false);
    expect(lands(reveal, brute), 'SETUP: from the camera, the brute beside it must reach').toBe(true);
  });
});
