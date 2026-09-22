import { describe, it, expect, beforeAll } from 'vitest';
import { buildMobPayload, applyMobUpdate, MOB_STATE_FIELDS } from '../../src/game/mobStateSync.js';
import {
  SHOULDER_OVERSHOOT, SHOULDER_CHARGE_DIST, SHOULDER_BRACE_MS, SHOULDER_RECOVER_MS,
} from '../../src/game/mobMovement.js';

/**
 * THE AI LOOP, DRIVEN ACROSS TICKS — the seam the pure-function gates could not see (QUEUE R1.2).
 *
 * `mob-movement-gates` proved `movementGoal('shoulder')` aims past the player. It could not prove the
 * charge ever COMPLETES, because a charge is state held across ticks and a pure function has no ticks. An
 * independent review found it did not: the goal was recomputed every tick from the current vector, so the
 * brute homed like a beeline (sidestepping re-aimed it) and, once past the player, the vector flipped — it
 * oscillated across the player all fight. Green gate, broken mob.
 *
 * So this drives the REAL loop: `buildMobPayload` (what AIWorkerSystem sends) -> the real ai.worker.js,
 * run through a `self` shim exactly as mob-senses-gates does -> `applyMobUpdate` (what AIWorkerSystem
 * stores) -> the next payload. Any state the worker returns and the main thread fails to send back dies
 * between ticks — which is also how `wanderRoll`, returned by the worker and stored by the main thread,
 * was never sent back, so a seeded wander re-rolled roll #1 forever.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, each observed RED:
 *   M1 mobMovement: re-aim every tick instead of holding the latch (the review's defect)  -> sidestep + oscillation RED
 *   M2 mobStateSync: drop chargeAt from the payload (latch lost between ticks)            -> sidestep + closure RED
 *   M3 mobStateSync: drop wanderRoll from the payload (the pre-existing seam bug)          -> wander + closure RED
 *   M4 ai.worker: the recovery window still swings (drop the winded attack guard)            -> punish-window RED
 *   M5 mobMovement: plausible-wrong — recovery never expires (readyAt never passes)       -> re-engage RED
 *   M6 ai.worker: the charge gets no speed boost (plausible-wrong: a charge at walking pace)  -> charge-speed RED
 *
 * BLIND SPOTS: no heightGrid, so the 9x9 A* steering (Step 3) is not exercised — the brute runs on open
 * ground; and nothing here says whether the charge FEELS dodgeable, which needs a person playing.
 */

const posted = [];
let onmessage;
beforeAll(async () => {
  globalThis.self = { postMessage: (m) => posted.push(m), set onmessage(fn) { onmessage = fn; }, get onmessage() { return onmessage; } };
  await import('../../src/workers/ai.worker.js');
});
/** One real worker tick. */
function aiTick(data) {
  posted.length = 0;
  onmessage({ data });
  return posted[posted.length - 1];
}

const PY = 50;
const brute = (over = {}) => ({
  id: 'brute-1', passive: false, type: 'moss_brute',
  position: { x: 10, y: PY, z: 0 },
  isAggro: true, isMoving: false, targetX: 10, targetZ: 0,
  lastAttackTime: 0, windupUntil: 0, damage: 25, moveTimer: 0,
  speed: 1.2, rotation: 0, health: 220, maxHealth: 220,
  ...over,
});

/** Run the loop: payload -> aiTick -> merge, `ticks` times at `dt` seconds. */
function run(entities, { ticks, dt = 0.1, start = 1000, player = () => [0, PY, 0], captureSeed = null, onTick } = {}) {
  let now = start;
  for (let i = 0; i < ticks; i++) {
    const p = player(now);
    const mobs = entities.map((e) => buildMobPayload(e, { speed: e.speed, heightGrid: undefined }));
    const r = aiTick({ type: 'TICK', playerPos: p, now, delta: dt, mobs, captureSeed });
    for (const u of r.updates) applyMobUpdate(entities.find((e) => e.id === u.id), u);
    onTick?.({ now, r, entities, player: p });
    now += dt * 1000;
  }
  return now;
}

describe('the round trip is closed — every field the worker owns comes back next tick', () => {
  it('each MOB_STATE_FIELDS key is SENT by the payload and RETURNED by the worker', () => {
    const e = brute();
    const payload = buildMobPayload(e, { speed: 1.2, heightGrid: undefined });
    const r = aiTick({ type: 'TICK', playerPos: [0, PY, 0], now: 1000, delta: 0.1, mobs: [payload], captureSeed: null });
    expect(MOB_STATE_FIELDS.length).toBeGreaterThan(8);
    expect(MOB_STATE_FIELDS.filter((f) => !(f in payload)), 'sent by nobody — lost between ticks').toEqual([]);
    expect(MOB_STATE_FIELDS.filter((f) => !(f in r.updates[0])), 'returned by nobody').toEqual([]);
  });
});

describe('the shoulder charge is LATCHED, and completes', () => {
  it('a sidestep during the charge does not re-aim it — it runs on to where it committed', () => {
    const e = brute();
    let latched = null;
    let passed = false;
    run([e], {
      ticks: 60,
      // the player sidesteps 4 blocks the moment the brace ends
      player: (now) => (now >= 1000 + SHOULDER_BRACE_MS ? [0, PY, 4] : [0, PY, 0]),
      onTick: ({ entities: [m] }) => {
        if (!latched && m.chargeAt) latched = { x: m.chargeX, z: m.chargeZ };
        if (m.position.x < -(SHOULDER_OVERSHOOT - 1.5)) passed = true;
      },
    });
    expect(latched, 'no charge was ever latched').not.toBe(null);
    // committed THROUGH the player's position at latch time (0,0) and on past it
    expect(latched.x).toBeCloseTo(-SHOULDER_OVERSHOOT, 5);
    expect(latched.z).toBeCloseTo(0, 5);
    expect(passed, 'the brute never reached the far side — the charge was re-aimed or stalled').toBe(true);
  });

  it('with the player standing still, the brute does not oscillate across them', () => {
    const e = brute();
    let reversals = 0, lastDir = 0, farSide = false;
    let prevX = e.position.x;
    run([e], {
      ticks: 120, // 12 s
      onTick: ({ entities: [m] }) => {
        const dx = m.position.x - prevX;
        prevX = m.position.x;
        if (Math.abs(dx) > 1e-6) {
          const dir = Math.sign(dx);
          if (lastDir && dir !== lastDir) reversals++;
          lastDir = dir;
        }
        if (m.position.x < -(SHOULDER_OVERSHOOT - 1.5)) farSide = true;
      },
    });
    expect(farSide, 'the charge never overshot').toBe(true);
    // Measured 2026-09-22 with the latch: a handful of reversals, one per charge-and-return. The unlatched
    // version reversed on nearly every tick once it reached the player.
    expect(reversals).toBeGreaterThan(0);
    expect(reversals).toBeLessThanOrEqual(6);
  });

  it('the charge is FAST — a charge at walking pace is not a charge', () => {
    const e = brute();
    let maxStep = 0;
    let prevX = e.position.x;
    run([e], {
      ticks: 30,
      onTick: ({ entities: [m] }) => { maxStep = Math.max(maxStep, Math.abs(m.position.x - prevX)); prevX = m.position.x; },
    });
    const walkStep = 1.2 * 1.5 * 0.1; // speed x aggro mult x dt
    expect(maxStep).toBeGreaterThan(walkStep * 2);
  });

  it('after the charge the brute is WINDED: it neither moves nor swings, even with the player adjacent', () => {
    const e = brute();
    let releasedAt = null;
    const winded = [];
    run([e], {
      ticks: 80,
      // once released, stand right next to it
      player: () => (releasedAt ? [e.position.x + 1, PY, e.position.z] : [0, PY, 0]),
      onTick: ({ now, r, entities: [m] }) => {
        if (releasedAt === null && m.chargeReadyAt > now) {
          releasedAt = now;
          // SET what the assertion depends on (gate-authoring class 12). The charge usually strikes the player
          // on its way through, and the brute's 2,400 ms cooldown then covers the whole recovery — so without
          // this, "it did not swing" is the cooldown talking, and deleting the winded guard stayed GREEN.
          m.lastAttackTime = 0;
          m.windupUntil = 0;
        }
        if (releasedAt !== null && now > releasedAt && now < releasedAt + SHOULDER_RECOVER_MS - 100) {
          winded.push({ moving: m.isMoving, attacks: r.attacks.length });
        }
      },
    });
    expect(releasedAt, 'the charge never released').not.toBe(null);
    expect(winded.length).toBeGreaterThan(5);
    expect(winded.filter((w) => w.moving || w.attacks)).toEqual([]);
  });

  it('positive control: in this harness an adjacent, off-cooldown melee mob DOES swing', () => {
    // Without this, the winded case above cannot tell "suppressed" from "attacks are never observable here".
    const z = brute({ id: 'zombie-1', type: 'zombie', position: { x: 1, y: PY, z: 0 }, damage: 5, speed: 1 });
    let attacks = 0;
    run([z], { ticks: 15, onTick: ({ r }) => { attacks += r.attacks.length; } });
    expect(attacks).toBeGreaterThan(0);
  });

  it('when the recovery ends, the brute re-engages', () => {
    const e = brute();
    let releasedAt = null, movedAfter = false;
    run([e], {
      ticks: 120,
      onTick: ({ now, entities: [m] }) => {
        if (releasedAt === null && m.chargeReadyAt > now) releasedAt = now;
        if (releasedAt !== null && now > releasedAt + SHOULDER_RECOVER_MS + 200 && (m.isMoving || m.chargeAt)) movedAfter = true;
      },
    });
    expect(releasedAt).not.toBe(null);
    expect(movedAfter, 'recovery never ended — the brute stays winded forever').toBe(true);
  });

  it('outside the charge band it walks normally, and never latches', () => {
    const e = brute({ position: { x: SHOULDER_CHARGE_DIST + 8, y: PY, z: 0 } });
    run([e], { ticks: 3 });
    expect(e.chargeAt || 0).toBe(0);
    expect(e.targetX).toBeCloseTo(0, 5);
  });
});

describe('a seeded wander actually wanders (the wanderRoll round trip)', () => {
  it('under a capture seed, successive re-rolls advance the roll and change heading', () => {
    const e = {
      id: 'sheep-1', passive: true, type: 'sheep', position: { x: 0, y: PY, z: 0 },
      isAggro: false, isMoving: false, targetX: 0, targetZ: 0, lastAttackTime: 0, windupUntil: 0,
      damage: 0, moveTimer: 0, speed: 1, rotation: 0, health: 10, maxHealth: 10,
    };
    const rolls = [];
    run([e], {
      ticks: 200, dt: 0.1, player: () => [500, PY, 500], captureSeed: 'seed-a',
      onTick: ({ entities: [m] }) => {
        if (!rolls.length || rolls[rolls.length - 1].roll !== m.wanderRoll) rolls.push({ roll: m.wanderRoll, tx: m.targetX, tz: m.targetZ });
      },
    });
    expect(rolls.map((r) => r.roll).slice(0, 3)).toEqual([1, 2, 3]);
  });
});
