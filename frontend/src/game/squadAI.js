/**
 * squadAI.js — S2-B3-M5: the pure squad brain (the voidhand/soulbind purity discipline).
 * stepSquad(allies, hostiles, playerPos, now, playerAlive) -> { moves, attacks, teleports }.
 * v1 auto-assist (design §2): FOLLOW a 3-5m ring · ENGAGE the nearest hostile within
 * ENGAGE_RADIUS of the PLAYER (the leash anchor — squads never chase the horizon) ·
 * attack at <=ATTACK_RANGE on a per-ally cooldown (entity.lastAllyAttack, written by the
 * bridge) · LEASH-teleport at >LEASH_DIST. The brain ORDERS; the SquadAISystem bridge
 * APPLIES (positions ground-snapped, damage via damageMob(...,'ally'), isAggro set).
 * Player dead -> empty orders (atomic disengage, the §4 edge contract).
 */
export const FOLLOW_RING = { min: 3, max: 5 };
export const ENGAGE_RADIUS = 18;   // hostiles must be near the PLAYER to be squad targets
export const ATTACK_RANGE = 2.2;
export const ATTACK_COOLDOWN_SEC = 1.5;
export const LEASH_DIST = 40;
export const ALLY_DPS_HIT = 12;    // per swing (Kevin-tunable; ~the design's DPS-assist stance)
const STEP = 0.28;                 // per-tick move step at 15Hz ~= 4.2 u/s — brisk follow

const d2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);

export function stepSquad(allies, hostiles, playerPos, now, playerAlive) {
  const moves = [], attacks = [], teleports = [];
  if (!playerAlive) return { moves, attacks, teleports };
  for (const a of allies) {
    if (!a || !a.position) continue;
    const dPlayer = Math.sqrt(d2(a.position.x, a.position.z, playerPos.x, playerPos.z));
    if (dPlayer > LEASH_DIST) {
      // left behind: rejoin at the outer ring edge along the player->ally bearing
      const k = FOLLOW_RING.max / Math.max(dPlayer, 1e-6);
      teleports.push({ id: a.id, x: playerPos.x + (a.position.x - playerPos.x) * k, z: playerPos.z + (a.position.z - playerPos.z) * k });
      continue;
    }
    // nearest live hostile NEAR THE PLAYER
    let target = null, tD2 = Infinity;
    for (const h of hostiles) {
      if (!h || h.passive || h.health <= 0) continue;
      if (d2(h.position.x, h.position.z, playerPos.x, playerPos.z) > ENGAGE_RADIUS * ENGAGE_RADIUS) continue;
      const dd = d2(a.position.x, a.position.z, h.position.x, h.position.z);
      if (dd < tD2) { tD2 = dd; target = h; }
    }
    if (target) {
      const dist = Math.sqrt(tD2);
      if (dist <= ATTACK_RANGE) {
        if (now - (a.lastAllyAttack || 0) >= ATTACK_COOLDOWN_SEC) attacks.push({ id: a.id, targetId: target.id });
      } else {
        const k = STEP / dist;
        moves.push({ id: a.id, x: a.position.x + (target.position.x - a.position.x) * k, z: a.position.z + (target.position.z - a.position.z) * k });
      }
      continue;
    }
    // FOLLOW: outside the band -> step toward the ring; inside -> hold
    if (dPlayer > FOLLOW_RING.max) {
      const k = STEP / dPlayer;
      const nx = a.position.x + (playerPos.x - a.position.x) * k;
      const nz = a.position.z + (playerPos.z - a.position.z) * k;
      // never step INSIDE the inner ring (no player-crowding)
      const nd = Math.sqrt(d2(nx, nz, playerPos.x, playerPos.z));
      if (nd >= FOLLOW_RING.min) moves.push({ id: a.id, x: nx, z: nz });
    }
    // dPlayer < min: backing off is v2 polish; holding is fine (no thrash either way)
  }
  return { moves, attacks, teleports };
}
