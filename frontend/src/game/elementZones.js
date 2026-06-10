/**
 * elementZones.js — S2-B4-M3: the ELEMANCER chemistry core (pure). A caller-owned registry
 * of element ZONES — stateful, time-acting surface effects (never voxel edits; the elemancer
 * no-re-mesh gate covers this file from birth). THE OVERLAP RULES ARE THE DESIGN (combinatorial
 * chemistry): same-kind nearby = REFRESH (no stack-stamping) · fire vs ice = ANNIHILATE both
 * (steam) · a resonant rune is CONSUMED by the next non-resonant spawn touching it, AMPLIFYING
 * it (arcane bends, never reacts — the catalyst identity, design §2). MAX_ZONES oldest-evict:
 * the economy cap IS the perf cap. The M4 bridge owns the live registry + the tick; M6 owns
 * the look. All numbers Kevin-tunable.
 */
export const MAX_ZONES = 8;
export const DEDUPE_DIST = 2;       // same-kind within this = refresh, not respawn
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

export function makeZoneRegistry() {
  return { zones: [], nextId: 1 };
}

/** spawnZone(reg, {kind, pos}, now) -> the live zone (new or refreshed) | null (annihilated). */
export function spawnZone(reg, spec, now) {
  const def = ZONE_DEFS[spec.kind];
  if (!def) return null;

  // ANNIHILATION: the new spawn touching an opposed zone consumes BOTH (steam, not stacking).
  const enemyKind = OPPOSED[spec.kind];
  if (enemyKind) {
    const enemy = reg.zones.find((z) => z.kind === enemyKind && d2(z.pos, spec.pos) <= (z.radius + def.radius) ** 2);
    if (enemy) {
      reg.zones = reg.zones.filter((z) => z !== enemy);
      return null;
    }
  }

  // DEDUPE: a same-kind neighbor refreshes instead of stamping a twin.
  const near = reg.zones.find((z) => z.kind === spec.kind && d2(z.pos, spec.pos) <= DEDUPE_DIST ** 2);
  if (near) {
    near.expiresAt = now + (near.amplified ? def.ttl * AMP_TTL_MULT : def.ttl);
    return near;
  }

  // AMPLIFICATION: a non-resonant spawn touching a rune consumes it and grows.
  let amplified = false;
  if (spec.kind !== 'resonant') {
    const rune = reg.zones.find((z) => z.kind === 'resonant' && d2(z.pos, spec.pos) <= (z.radius + def.radius) ** 2);
    if (rune) {
      reg.zones = reg.zones.filter((z) => z !== rune);
      amplified = true;
    }
  }

  const zone = {
    id: reg.nextId++,
    kind: spec.kind,
    pos: { x: spec.pos.x, y: spec.pos.y, z: spec.pos.z },
    radius: def.radius * (amplified ? AMP_RADIUS_MULT : 1),
    expiresAt: now + def.ttl * (amplified ? AMP_TTL_MULT : 1),
    amplified,
  };
  reg.zones.push(zone);
  if (reg.zones.length > MAX_ZONES) reg.zones.shift(); // oldest-evict
  return zone;
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
