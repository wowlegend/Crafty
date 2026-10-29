// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest';
import * as THREE from 'three';
import { render, cleanup, act } from '@testing-library/react';

/**
 * MOBS SENSE THE BODY, NOT THE CAMERA (game/mobSenses.js mobSensePoint, systems/playerSensePoint.js).
 *
 * The camera carries the walk bob, the shake, the verb kicks and, for the roar, a reveal pose 4.5 m behind and 2.2 m up.
 * When the AI posted the camera as the player's position, a zombie beside the player could not swing during the roar
 * and one beside the reveal camera could. Each case stages the reveal (the camera at transformCamPose's hold) and the
 * body as the Player's loop samples it every live frame (game/combatStance.js stanceFrame), then drives a real reader
 * through R3F (tests/gates/_r3f.jsx):
 *   - the AI tick (systems/AIWorkerSystem.jsx, its Web Worker stubbed): the playerPos it posts, run through the real
 *     worker (workers/ai.worker.js, its `self` shimmed): a zombie beside the body lands a blow, a moss brute beside the
 *     reveal camera does not;
 *   - the worker's reply: an archer's arrow is aimed at the body's eye, and a spider's leap runs toward the body;
 *   - an arrow in flight (systems/EnemyProjectileSystem.jsx): one flying at the body's eye lands, one flying through the
 *     reveal camera does not;
 *   - the player's blow (systems/CombatSystem.jsx damageMob, mounted with react-dom): the mob is knocked away from the
 *     body.
 * From the camera each verdict flips, so every case tells the two points apart.
 * BLIND SPOT: the Player's own loop is not mounted; the body sample is staged by calling stanceFrame as the loop does.
 */
vi.mock('@react-three/fiber', () => import('@react-three/fiber/dist/react-three-fiber.esm.js'));
vi.mock('../../src/SoundManager', () => ({ useGameSounds: () => ({ playHit: () => {} }) }));
const worker = vi.hoisted(() => ({ posts: [], live: null }));
vi.mock('../../src/workers/ai.worker.js?worker', () => ({
  default: class FakeAIWorker {
    constructor() { worker.live = this; }
    postMessage(m) { worker.posts.push(m); }
    terminate() {}
  },
}));
const { mountR3F } = await import('./_r3f.jsx');
const { AIWorkerSystem } = await import('../../src/systems/AIWorkerSystem.jsx');
const { EnemyProjectileSystem } = await import('../../src/systems/EnemyProjectileSystem.jsx');
const { useGameStore } = await import('../../src/store/useGameStore');
const { transformCamPose } = await import('../../src/game/transformCam.js');
const { stanceFrame } = await import('../../src/game/combatStance.js');
const { stance } = await import('../../src/game/stanceState.js');
const { EYE_HEIGHT_M } = await import('../../src/combat/swingOrigin.js');
const { ecs } = await import('../../src/ecs/world.js');
const { CombatSystem } = await import('../../src/systems/CombatSystem.jsx');
const { GameMethods } = await import('../../src/GameMethods');

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

// The body's centre 0.95 m over a floor at y 50, the eye EYE_HEIGHT_M over it; the reveal camera at the transform-cam's
// hold, facing +Z.
const BODY = { x: 4, y: 50.95, z: -2 };
const EYE = [BODY.x, BODY.y + EYE_HEIGHT_M, BODY.z];
const REVEAL = transformCamPose([BODY.x, BODY.y, BODY.z], [0, 0, 1], 0.5).position;

/** Mount `el` with the camera at the reveal and the body sampled where the Player's loop would sample it. */
async function mountAtReveal(el) {
  stanceFrame([], BODY, 1 / 60);
  r = await mountR3F(el);
  const cam = r.three().camera;
  cam.position.set(...REVEAL);
  cam.updateMatrixWorld(true);
  return cam;
}

const realStore = useGameStore.getState();
let r = null;
const added = [];
afterEach(async () => {
  if (r) await r.unmount();
  r = null;
  worker.posts.length = 0;
  for (const e of added.splice(0)) ecs.remove(e);
  stance.bodySeen = false;
  cleanup();
  useGameStore.setState({ spawnEnemyProjectile: realStore.spawnEnemyProjectile, damagePlayer: realStore.damagePlayer,
    gameCamera: realStore.gameCamera });
});

describe('the point the AI posts during the roar\'s reveal', () => {
  it('is the body\'s steady eye, and a zombie beside the body reaches it while one beside the reveal camera does not', async () => {
    await mountAtReveal(<AIWorkerSystem />);
    await r.step(8); // the bridge ticks at 15 Hz
    const ticks = worker.posts.filter((m) => m.type === 'TICK');
    expect(ticks.length, 'SETUP: the AI system posted no tick').toBeGreaterThan(0);
    const posted = ticks[ticks.length - 1].playerPos;
    expect(Math.hypot(REVEAL[0] - BODY.x, REVEAL[2] - BODY.z), 'SETUP: the reveal camera must stand metres off the body').toBeGreaterThan(4);
    expect(posted, 'the AI senses the player from somewhere other than the body\'s eye').toEqual(EYE);

    // On the player's floor (a mob's centre 0.5 m over it): a zombie 1.5 m across from the body, and a moss brute (reach
    // 3.2 m across and up) 1.5 m across from the reveal camera, whose 2.2 m of height an ordinary mob cannot reach.
    const floor = BODY.y - 0.95;
    const zombie = mobAt('zombie', BODY.x + 1.5, floor + 0.5, BODY.z);
    const brute = mobAt('moss_brute', REVEAL[0] + 1.5, floor + 0.5, REVEAL[2]);
    expect(lands(posted, zombie), 'a zombie beside the player cannot swing during the reveal').toBe(true);
    expect(lands(posted, brute), 'a brute beside the reveal camera lands a blow on a player 4.7 m away').toBe(false);
    // The controls: from the camera each verdict flips, so the two cases tell the points apart.
    expect(lands(REVEAL, zombie), 'SETUP: from the camera, the zombie beside the body must be out of reach').toBe(false);
    expect(lands(REVEAL, brute), 'SETUP: from the camera, the brute beside it must reach').toBe(true);
  });
});

describe('the worker\'s strikes during the reveal', () => {
  it('an archer\'s arrow is aimed at the body\'s eye, and a spider\'s leap runs toward the body', async () => {
    const aimed = [];
    useGameStore.setState({ spawnEnemyProjectile: (pos, target) => aimed.push({ pos, target }) });
    await mountAtReveal(<AIWorkerSystem />);
    expect(typeof worker.live?.onmessage, 'SETUP: the AI system did not listen to its worker').toBe('function');
    // A spider 3 m across from the body: toward the body is straight along -x, toward the reveal camera mostly along -z.
    const spider = ecs.add({ isMob: true, id: 'leaper', type: 'spider', position: { x: BODY.x + 3, y: BODY.y - 0.45, z: BODY.z }, health: 50 });
    added.push(spider);
    worker.live.onmessage({ data: { type: 'TICK_RESULT', updates: [], attacks: [
      { type: 'projectile', id: 'archer', position: [BODY.x - 8, BODY.y, BODY.z + 3] },
      { type: 'leap', id: 'leaper' },
    ] } });
    expect(aimed.length, 'SETUP: the archer\'s strike spawned no arrow').toBe(1);
    expect(aimed[0].target, 'the arrow is aimed somewhere other than the body\'s eye').toEqual(EYE);
    expect(spider.knockback, 'SETUP: the leap set no impulse').toBeTruthy();
    const [kx, , kz] = spider.knockback;
    const toBody = [BODY.x - spider.position.x, BODY.z - spider.position.z];
    const toCam = [REVEAL[0] - spider.position.x, REVEAL[2] - spider.position.z];
    const cos = (a, b) => (a[0] * b[0] + a[1] * b[1]) / (Math.hypot(...a) * Math.hypot(...b));
    expect(cos(toBody, toCam), 'SETUP: the body and the camera must lie in different directions from the spider').toBeLessThan(0.7);
    expect(cos([kx, kz], toBody), 'the spider leaps somewhere other than at the body').toBeGreaterThan(0.9999);
  });
});

describe('an arrow in flight during the reveal', () => {
  it('lands on the body, and passes through the reveal camera without landing', async () => {
    const hits = [];
    useGameStore.setState({ damagePlayer: (amount, source) => hits.push({ amount, source }) });
    await mountAtReveal(<EnemyProjectileSystem />);
    const spawn = useGameStore.getState().spawnEnemyProjectile;
    expect(typeof spawn, 'SETUP: the projectile system did not install its spawner').toBe('function');
    // 6 m off along +x, each flying straight at its point: the one at the camera never comes within 4 m of the body.
    act(() => { spawn([REVEAL[0] + 6, REVEAL[1], REVEAL[2]], REVEAL); }); // the spawn renders the bolt
    await r.step(90);
    expect(hits.length, 'an arrow flying through the reveal camera landed on a body 4.7 m from it').toBe(0);
    act(() => { spawn([EYE[0] + 6, EYE[1], EYE[2]], EYE); });
    await r.step(90);
    expect(hits, 'an arrow flying at the body\'s eye did not land').toEqual([{ amount: 15, source: 'projectile' }]);
  });
});

describe('the player\'s blow during the reveal', () => {
  it('knocks the mob away from the body, not away from the reveal camera', () => {
    stanceFrame([], BODY, 1 / 60);
    const cam = new THREE.PerspectiveCamera();
    cam.position.set(...REVEAL);
    useGameStore.setState({ gameCamera: cam });
    render(<CombatSystem setDamageNumbers={() => {}} setShockwaves={() => {}} damageId={{ current: 0 }} />);
    // A zombie 2.5 m across from the body: away from the body is +x, away from the reveal camera mostly +z.
    const mob = ecs.add({ isMob: true, id: 'struck', type: 'zombie', passive: false, health: 100, maxHealth: 100, xp: 1,
      position: new THREE.Vector3(BODY.x + 2.5, BODY.y - 0.45, BODY.z) });
    added.push(mob);
    GameMethods.damageMob('struck', 5, 'physical', 'player');
    expect(mob.health, 'SETUP: the blow did not land').toBe(95);
    expect(mob.knockback, 'SETUP: the blow set no knockback').toBeTruthy();
    const away = [mob.position.x - BODY.x, mob.position.z - BODY.z];
    const fromCam = [mob.position.x - REVEAL[0], mob.position.z - REVEAL[2]];
    const cos = (a, b) => (a[0] * b[0] + a[1] * b[1]) / (Math.hypot(...a) * Math.hypot(...b));
    expect(cos(away, fromCam), 'SETUP: away from the body and away from the camera must differ').toBeLessThan(0.7);
    expect(cos([mob.knockback[0], mob.knockback[2]], away), 'the mob is knocked away from somewhere other than the body').toBeGreaterThan(0.9999);
  });
});
