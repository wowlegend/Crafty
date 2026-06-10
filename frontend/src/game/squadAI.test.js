import { describe, it, expect } from 'vitest';
import { stepSquad, FOLLOW_RING, ENGAGE_RADIUS, ATTACK_RANGE, ATTACK_COOLDOWN_SEC, LEASH_DIST } from './squadAI';

const P = { x: 0, y: 10, z: 0 };
const ally = (over = {}) => ({ id: 1, position: { x: 10, y: 10, z: 0 }, type: 'zombie', lastAllyAttack: 0, ...over });
const hostile = (over = {}) => ({ id: 50, position: { x: 3, y: 10, z: 0 }, health: 50, passive: false, ...over });

describe('S2-B3-M5: the squad brain (pure)', () => {
  it('no hostiles near the player -> FOLLOW: moves toward the ring, never inside it', () => {
    const { moves, attacks } = stepSquad([ally()], [], P, 10, true);
    expect(attacks).toEqual([]);
    expect(moves).toHaveLength(1);
    const m = moves[0];
    const dBefore = Math.hypot(10 - P.x, 0 - P.z);
    const dAfter = Math.hypot(m.x - P.x, m.z - P.z);
    expect(dAfter).toBeLessThan(dBefore);           // approaching
    expect(dAfter).toBeGreaterThanOrEqual(FOLLOW_RING.min - 0.01); // but not crowding the player
  });
  it('inside the ring -> holds (no thrash)', () => {
    const a = ally({ position: { x: FOLLOW_RING.min + 0.5, y: 10, z: 0 } });
    const { moves } = stepSquad([a], [], P, 10, true);
    expect(moves).toEqual([]); // standing in the band = no move order
  });
  it('a hostile within ENGAGE_RADIUS of the PLAYER -> moves to it; in ATTACK_RANGE + off cooldown -> attacks', () => {
    const h = hostile();
    const far = ally({ position: { x: 8, y: 10, z: 0 } });
    const r1 = stepSquad([far], [h], P, 10, true);
    expect(r1.moves[0]).toBeDefined(); // closing on the hostile, not the ring
    const near = ally({ position: { x: h.position.x + 1, y: 10, z: h.position.z }, lastAllyAttack: 0 });
    const r2 = stepSquad([near], [h], P, 10, true);
    expect(r2.attacks).toEqual([{ id: near.id, targetId: h.id }]);
  });
  it('attack cooldown: a fresh hit blocks until ATTACK_COOLDOWN_SEC elapses', () => {
    const h = hostile();
    const a = ally({ position: { x: h.position.x + 1, y: 10, z: h.position.z }, lastAllyAttack: 9.0 });
    expect(stepSquad([a], [h], P, 10, true).attacks).toEqual([]); // 1.0s < 1.5s
    expect(stepSquad([a], [h], P, 10 + ATTACK_COOLDOWN_SEC, true).attacks).toHaveLength(1);
  });
  it('hostiles beyond ENGAGE_RADIUS of the player are IGNORED (the leash keeps squads home)', () => {
    const h = hostile({ position: { x: ENGAGE_RADIUS + 10, y: 10, z: 0 } });
    const { moves, attacks } = stepSquad([ally()], [h], P, 10, true);
    expect(attacks).toEqual([]);
    // follow-ring move only (toward the player, not the far hostile)
    if (moves.length) expect(Math.hypot(moves[0].x - P.x, moves[0].z - P.z)).toBeLessThan(10);
  });
  it('an ally beyond LEASH_DIST -> a teleport order to the ring', () => {
    const lost = ally({ position: { x: LEASH_DIST + 5, y: 10, z: 0 } });
    const { teleports } = stepSquad([lost], [], P, 10, true);
    expect(teleports).toHaveLength(1);
    expect(Math.hypot(teleports[0].x - P.x, teleports[0].z - P.z)).toBeLessThanOrEqual(FOLLOW_RING.max);
  });
  it('player dead -> squad disengages atomically (no moves, no attacks — the §4 edge contract)', () => {
    const h = hostile();
    const a = ally({ position: { x: h.position.x + 1, y: 10, z: h.position.z } });
    const { moves, attacks } = stepSquad([a], [h], P, 10, false);
    expect(moves).toEqual([]);
    expect(attacks).toEqual([]);
  });
  it('dead/invalid hostiles are never targeted', () => {
    const dead = hostile({ health: 0 });
    const a = ally({ position: { x: dead.position.x + 1, y: 10, z: dead.position.z } });
    expect(stepSquad([a], [dead], P, 10, true).attacks).toEqual([]);
  });
});
