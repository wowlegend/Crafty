/**
 * elementZones.js — S2-B4-M3: the ELEMANCER chemistry core (pure). A caller-owned registry
 * of element ZONES — stateful, time-acting surface effects (never voxel edits; the elemancer
 * no-re-mesh gate covers this file from birth). THE OVERLAP RULES ARE THE DESIGN (combinatorial
 * chemistry): same-kind nearby = REFRESH (no stack-stamping) · fire vs ice = ANNIHILATE both
 * (steam) · a resonant rune is CONSUMED by the next non-resonant spawn touching it, AMPLIFYING
 * it (arcane bends, never reacts — the catalyst identity, design §2). MAX_ZONES soonest-expiry evict:
 * the economy cap IS the perf cap. The M4 bridge owns the live registry + the tick; M6 owns
 * the look. All numbers Kevin-tunable.
 */
export const MAX_ZONES = 8;
const DEDUPE_DIST = 2;       // same-kind within this = refresh, not respawn (module-internal)
export const AMP_RADIUS_MULT = 1.5; // the rune's gift
export const AMP_TTL_MULT = 1.5;

export const ZONE_DEFS = {
  burning:    { radius: 2.5, ttl: 10 },
  frozen:     { radius: 3,   ttl: 12 },
  conductive: { radius: 3,   ttl: 8  },
  resonant:   { radius: 2,   ttl: 12 },
};

const OPPOSED = { burning: 'frozen', frozen: 'burning' };

const d2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
const radiusMultOf = (spec) => (Number.isFinite(spec.radiusMult) && spec.radiusMult > 0 ? spec.radiusMult : 1);

export function makeZoneRegistry() {
  return { zones: [], nextId: 1 };
}

/**
 * Make room on a full board: drop the zone with the soonest expiresAt, the first painted among equals, from the zones the
 * CAST does not own. A cast owns the zones it painted or refreshed (spawnZone adds each to `cast`): its impact, a zone the
 * impact renewed, and every chain leap. Not the first painted outright: a refresh renews a zone in place, so array order is
 * paint order and says nothing about who has the least life left (AUDIT:ultra:ultra-game-logic-4). Not only the zone the last
 * spawnZone call painted: the next leap of the same cast then evicted it, in the same tick, and the bridge voiced a zone
 * that was already gone. A board the cast owns whole has nothing of anyone else's to give up (castZone stops the chain
 * before that); a caller who hands spawnZone such a cast anyway gets the cap kept at the cost of the soonest of the cast's
 * own, never the newcomer `keep`.
 */
function evictSoonest(reg, cast, keep) {
  const soonest = (eligible) => {
    let at = -1;
    for (let i = 0; i < reg.zones.length; i++) {
      const z = reg.zones[i];
      if (!eligible(z)) continue;
      if (at < 0 || z.expiresAt < reg.zones[at].expiresAt) at = i;
    }
    return at;
  };
  let at = soonest((z) => !cast.has(z));
  if (at < 0) at = soonest((z) => z !== keep);
  if (at >= 0) reg.zones.splice(at, 1);
}

/**
 * spawnZone(reg, {kind, pos, radiusMult?}, now, cast?) -> the live zone (new or refreshed) | null (annihilated).
 * `cast` is the Set of zones this cast has painted or refreshed so far (castZone owns one); the zone returned joins it, and
 * the cap never evicts a member. Left out, the zone is a cast of its own.
 */
export function spawnZone(reg, spec, now, cast = new Set()) {
  const def = ZONE_DEFS[spec.kind];
  if (!def) return null;
  // Conflux (game/verbMods.js zoneRadiusMult) widens a zone the player painted; a missing or junk value is 1. The zone
  // touches its neighbours at the size it is drawn at.
  const radius = def.radius * radiusMultOf(spec);

  // ANNIHILATION: the new spawn touching an opposed zone consumes BOTH (steam, not stacking).
  const enemyKind = OPPOSED[spec.kind];
  if (enemyKind) {
    const enemy = reg.zones.find((z) => z.kind === enemyKind && d2(z.pos, spec.pos) <= (z.radius + radius) ** 2);
    if (enemy) {
      reg.zones = reg.zones.filter((z) => z !== enemy);
      return null;
    }
  }

  // DEDUPE: a same-kind neighbor refreshes instead of stamping a twin, and grows to a wider spawn's size (never shrinks).
  const near = reg.zones.find((z) => z.kind === spec.kind && d2(z.pos, spec.pos) <= DEDUPE_DIST ** 2);
  if (near) {
    near.expiresAt = now + (near.amplified ? def.ttl * AMP_TTL_MULT : def.ttl);
    near.radius = Math.max(near.radius, radius * (near.amplified ? AMP_RADIUS_MULT : 1));
    cast.add(near);
    return near;
  }

  // AMPLIFICATION: a non-resonant spawn touching a rune consumes it and grows.
  let amplified = false;
  if (spec.kind !== 'resonant') {
    const rune = reg.zones.find((z) => z.kind === 'resonant' && d2(z.pos, spec.pos) <= (z.radius + radius) ** 2);
    if (rune) {
      reg.zones = reg.zones.filter((z) => z !== rune);
      amplified = true;
    }
  }

  const zone = {
    id: reg.nextId++,
    kind: spec.kind,
    pos: { x: spec.pos.x, y: spec.pos.y, z: spec.pos.z },
    radius: radius * (amplified ? AMP_RADIUS_MULT : 1),
    expiresAt: now + def.ttl * (amplified ? AMP_TTL_MULT : 1),
    amplified,
  };
  reg.zones.push(zone);
  cast.add(zone);
  if (reg.zones.length > MAX_ZONES) evictSoonest(reg, cast, zone);
  return zone;
}

/** How far an imbued zone leaps to the next hostile (Chain Imbue, Wildfire, Prism Shard). */
export const CHAIN_RANGE = 8;

/**
 * spawnChain(reg, {kind, pos, chain, radiusMult?}, mobs, isTarget, now, cast?) -> the leaps taken, as spawnZone's results.
 * An imbue that chains paints up to `chain` more zones of its kind, each under the nearest hostile `isTarget` accepts
 * within CHAIN_RANGE of the impact that stands outside the impact's own zone and outside every zone of that kind, the
 * ones this chain paints included. A hostile already in a zone of the element takes its ticks there, so a leap onto it
 * would only stack a second zone's ticks on the same body; the leap goes on to the next hostile instead. Call it after
 * spawning the impact's own zone, with the same `cast`. The chain stops when every zone on a full board is the cast's own:
 * one more leap could only evict a zone this cast painted.
 */
export function spawnChain(reg, req, mobs, isTarget, now, cast = new Set()) {
  const def = ZONE_DEFS[req?.kind];
  const count = Number.isFinite(req?.chain) ? Math.floor(req.chain) : 0;
  if (!def || count <= 0 || !req.pos) return [];
  const radius = def.radius * radiusMultOf(req);
  const candidates = [];
  for (const e of mobs || []) {
    if (!e || !e.position || !isTarget(e)) continue;
    const d = d2(e.position, req.pos);
    if (d <= CHAIN_RANGE ** 2 && d > radius ** 2) candidates.push({ d, pos: e.position });
  }
  candidates.sort((a, b) => a.d - b.d);
  const covered = (pos) => reg.zones.some((z) => z.kind === req.kind && d2(z.pos, pos) <= z.radius ** 2);
  const leaps = [];
  for (const c of candidates) {
    if (leaps.length >= count) break;
    if (covered(c.pos)) continue;
    if (reg.zones.length >= MAX_ZONES && reg.zones.every((z) => cast.has(z))) break;
    leaps.push(spawnZone(reg, { kind: req.kind, pos: { x: c.pos.x, y: c.pos.y, z: c.pos.z }, radiusMult: req.radiusMult }, now, cast));
  }
  return leaps;
}

/**
 * castZone(reg, req, mobs, isTarget, now) -> { zone, leaps }: one imbued impact as the unit the cap protects. The impact's
 * own zone (new, or an old one it refreshed) and the leaps of its chain share one cast, so no part of it evicts another;
 * what the cap evicts on the way is the soonest expiry among the rest of the board. `zone` is null when the impact
 * annihilated an opposed zone; a non-null `zone` is on the board when this returns (the bridge voices it).
 */
export function castZone(reg, req, mobs, isTarget, now) {
  const cast = new Set();
  const zone = spawnZone(reg, req, now, cast);
  const leaps = spawnChain(reg, req, mobs, isTarget, now, cast);
  return { zone, leaps };
}


/** stepZones(reg, now) -> { expired } — the bridge ticks this at 15Hz (M4). */
export function stepZones(reg, now) {
  const expired = reg.zones.filter((z) => now >= z.expiresAt);
  if (expired.length) reg.zones = reg.zones.filter((z) => now < z.expiresAt);
  return { expired };
}

/** clearZones(reg) — the dawn contract: zones never survive the day-flip. */
export function clearZones(reg) {
  reg.zones = [];
}

// ---- S2-B4-M4: the zone EFFECTS (pure; the bridge calls this at the FX cadence) ----
export const BURN_TICK = 4;   // burning DoT per FX tick (~13 dps in-zone at ~3.3Hz)
export const SHOCK_TICK = 6;  // conductive pulse per FX tick
export const SLOW_MULT = 0.4; // frozen: mobs crawl at 40% (the mobsData speed line consumes)

/**
 * applyZoneEffects(zones, mobs, damageFn) — one FX tick of chemistry-on-combat.
 * TWO-PASS frozen semantics: membership first (a Set), then mults — so a mob inside
 * zone B but outside zone A is NOT reset by A's pass (the multi-zone trap, plan M4).
 * Every kind acts on membership, as frozen does: a mob takes each element's tick once per FX tick however many zones of
 * it overlap there, so a re-imbue beside an old zone or a chain's leap never multiplies the damage on one body.
 * damageFn(id, dmg, type, source) is always called with source 'hazard' (banks nothing).
 * The resonant lure sets isAggro (persists through the AI worker — the squad precedent).
 */
export function applyZoneEffects(zones, mobs, damageFn) {
  const frozenIds = new Set();
  for (const z of zones) {
    if (z.kind !== 'frozen') continue;
    for (const e of mobs) {
      if (!e || e.health <= 0) continue;
      const dx = e.position.x - z.pos.x, dz = e.position.z - z.pos.z;
      const r = z.radius + (e.bodyRadius || 0);
      if (dx * dx + dz * dz <= r * r) frozenIds.add(e.id);
    }
  }
  for (const e of mobs) {
    if (!e || e.health <= 0) continue;
    if (frozenIds.has(e.id)) e.zoneSlowMult = SLOW_MULT;
    else if (e.zoneSlowMult !== undefined && e.zoneSlowMult !== 1) e.zoneSlowMult = 1;
  }
  for (const e of mobs) {
    if (!e || e.health <= 0) continue;
    let burning = false, conductive = false, resonant = false;
    for (const z of zones) {
      if (z.kind === 'frozen') continue;
      // A body with a bodyRadius (the dragon) stands in a zone that reaches its edge, not only its centre.
      const dx = e.position.x - z.pos.x, dz = e.position.z - z.pos.z;
      const r = z.radius + (e.bodyRadius || 0);
      if (dx * dx + dz * dz > r * r) continue;
      if (z.kind === 'burning') burning = true;
      else if (z.kind === 'conductive') conductive = true;
      else if (z.kind === 'resonant') resonant = true;
    }
    if (burning) damageFn(e.id, BURN_TICK, 'fireball', 'hazard');
    if (conductive && e.health > 0) damageFn(e.id, SHOCK_TICK, 'lightning', 'hazard');
    if (resonant) e.isAggro = true;
  }
}
