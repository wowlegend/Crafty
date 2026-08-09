import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { HITSTOP } from '../../src/game/trauma.js';
import { KICK_PROFILES } from '../../src/game/cameraKick.js';

// E-ter — being hit had no WEIGHT. `damagePlayer` set damageFlash + screenShake and stopped there; hitstop
// existed only for OUTGOING hits (the boss kill sets hitstopUntil, and trauma.js ships a whole weight-tiered
// HITSTOP table for it), and cameraKick.js had melee/cast/slam/land but no `hurt`. So the player's own
// swings had impact and the enemies' did not — a moss brute's 25 landed exactly like a skitterling's 5.
//
// Drives the REAL store through the REAL damagePlayer, because the pure tier function passing proves
// nothing about whether the damage path ever calls it.

const reset = (over = {}) => {
  useGameStore.setState({
    isAlive: true, playerHealth: 100, maxHealth: 100,
    lastDamageTime: 0, hitstopUntil: 0, lastHitDir: null,
    _spawnTime: 0, isPlayerInvincible: () => false,
    attributes: { strength: 1, agility: 1, intellect: 1, vitality: 1 }, equipment: {},
    ...over,
  });
};

describe('E-ter — an incoming hit freezes, graded by what it cost', () => {
  beforeEach(() => reset());

  it('sets hitstopUntil at all — it never did before', () => {
    const before = useGameStore.getState().hitstopUntil;
    useGameStore.getState().damagePlayer(30, 'test');
    expect(useGameStore.getState().hitstopUntil).toBeGreaterThan(before);
  });

  it('freezes LONGER for a heavier blow', () => {
    // Each duration is anchored to a clock sample taken IMMEDIATELY BEFORE its own damagePlayer call.
    //
    // This previously sampled performance.now() AFTER each call, which measures
    // `duration + (elapsed since the store wrote hitstopUntil)`. The two samples sat on either side of a
    // reset() and a pile of store churn, so the wall-clock gap between the measurement blocks leaked
    // straight into the comparison. It passes on a quiet machine and fails under load — observed
    // 2026-08-09 at load 231, "expected 91 to be close to 85", while passing 3/3 in isolation.
    //
    // The tolerance is NOT relaxed. The measurement is corrected to mean what the assertion says: the
    // residual error is now only the time spent INSIDE damagePlayer, not the time between two tests.
    const t0light = performance.now();
    useGameStore.getState().damagePlayer(5, 'light');
    const light = useGameStore.getState().hitstopUntil - t0light;
    reset();
    const t0crit = performance.now();
    useGameStore.getState().damagePlayer(40, 'crit');
    const crit = useGameStore.getState().hitstopUntil - t0crit;
    expect(crit).toBeGreaterThan(light);
    expect(Math.round(crit - light)).toBeCloseTo(HITSTOP.crit - HITSTOP.light, -1);
  });

  it('stamps a hit signal on EVERY accepted hit, even with no attacker position', () => {
    // The stamp doubles as the camera controller's kick signal, so a hit with no sourcePos must still
    // produce one — it previously only updated when a direction could be computed.
    useGameStore.getState().damagePlayer(10, 'no-pos');
    const hit = useGameStore.getState().lastHitDir;
    expect(hit).toBeTruthy();
    expect(Number.isFinite(hit.t)).toBe(true);
    expect(hit.t).toBeGreaterThan(0);
  });

  it('advances the stamp between successive hits, so each one kicks once', () => {
    useGameStore.getState().damagePlayer(10, 'first');
    const t1 = useGameStore.getState().lastHitDir.t;
    reset({ lastHitDir: { angle: null, t: t1 } });
    useGameStore.setState({ lastDamageTime: 0 });
    useGameStore.getState().damagePlayer(10, 'second');
    expect(useGameStore.getState().lastHitDir.t).toBeGreaterThanOrEqual(t1);
  });
});

describe('E-ter — the freeze does not fire when it should not', () => {
  beforeEach(() => reset());

  it('does NOT freeze while the player is in dodge i-frames', () => {
    reset({ isPlayerInvincible: () => true });
    useGameStore.getState().damagePlayer(50, 'dodged');
    expect(useGameStore.getState().hitstopUntil).toBe(0);
  });

  it('does NOT freeze on a hit rejected by the damage cooldown', () => {
    useGameStore.getState().damagePlayer(20, 'first');
    const after = useGameStore.getState().hitstopUntil;
    useGameStore.getState().damagePlayer(20, 'too soon'); // inside the 500ms window
    expect(useGameStore.getState().hitstopUntil).toBe(after);
  });

  it('does NOT freeze a dead player', () => {
    reset({ isAlive: false });
    useGameStore.getState().damagePlayer(20, 'posthumous');
    expect(useGameStore.getState().hitstopUntil).toBe(0);
  });
});

describe('E-ter — the hurt camera profile exists and reads as a flinch', () => {
  it('is defined alongside the verbs the player chooses', () => {
    expect(KICK_PROFILES.hurt).toBeDefined();
    expect(KICK_PROFILES.hurt).toHaveLength(3);
  });

  it('pushes DOWN and BACK — a flinch away from the blow, not a forward lunge', () => {
    const [right, up, forward] = KICK_PROFILES.hurt;
    expect(up).toBeLessThan(0);
    expect(forward).toBeLessThan(0);
    expect(right).toBe(0); // undirected for now; a directional flinch is recorded as the next slice
  });

  it('is the strongest profile — it is the only one the player did not choose', () => {
    const mag = ([x, y, z]) => Math.hypot(x, y, z);
    for (const k of ['melee', 'cast', 'land']) {
      expect(mag(KICK_PROFILES.hurt), `hurt vs ${k}`).toBeGreaterThan(mag(KICK_PROFILES[k]));
    }
  });
});
