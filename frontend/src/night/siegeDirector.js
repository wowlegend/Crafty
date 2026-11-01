// siegeDirector.js — the siege's rules, pure (W3-A task script, unit N4; the encounters-siege plan's Move C). N5's
// SiegeDirectorSystem runs them on the world clock and places what they plan through the store's spawnMob; nothing
// here touches the store, the world or a clock. Everything is derived from the night's number, the zone tier and the
// world, so nothing about a siege is saved: a reload mid-night ends it (no mob is saved), and the same night in the same
// world plans the same siege.
import { HALF_CYCLE_UNITS, CYCLE_UNITS } from '../game/dayNight.js';
import { MOB_TYPES } from '../game/mobTypes.js';
import { SEA_LEVEL } from '../world/oceanProfile.js';

/** Where each wave launches, in units into the night's 600 (0, 72 and 152 s at 2.5 units a second). */
export const WAVE_UNITS = Object.freeze([0, 180, 380]);
const BASE = [2, 2, 3];
const GROWTH = [0.5, 0.75, 1.0];
/** No wave holds more than this many. */
export const WAVE_CAP = 10;
/** The hub's four static NPCs, which the spawner's alive count includes. */
export const HUB_SLOTS = 4;
/** The captain's health, x its type's: night 1's is gentle. */
export const CAPTAIN_SCALE = Object.freeze({ firstNight: 1.6, later: 2.4 });
/** The horn clears room among mobs farther than this from the player, so a cleared mob is never one the player sees go. */
export const CLEAR_BEYOND_M = 30;
/** A marcher that moves less than `moveM` in `windowMs` of world time sidesteps `sideM` for `sideMs`; after `tries`
 *  sidesteps it hunts the player instead. */
export const STUCK = Object.freeze({ moveM: 1.5, windowMs: 6000, sideM: 8, sideMs: 4000, tries: 2 });

/** Units into the night at `gameTime`, 0 to 599, or -1 by day. Constant while the clock is held. */
export function unitsIntoNight(gameTime) {
  const t = ((gameTime % CYCLE_UNITS) + CYCLE_UNITS) % CYCLE_UNITS;
  return t >= HALF_CYCLE_UNITS ? t - HALF_CYCLE_UNITS : -1;
}

/** The three waves' sizes on night `night`: [2, 2, 3] on night 1, then base + floor(night x growth), at most WAVE_CAP. */
export function waveSizes(night) {
  if (night <= 1) return [2, 2, 3];
  return BASE.map((b, k) => Math.min(WAVE_CAP, b + Math.floor(night * GROWTH[k])));
}

/** How many ember elites night `night` carries, in waves 2 and 3: none on night 1, at most 3. */
export const eliteCount = (night) => (night <= 1 ? 0 : Math.min(3, Math.floor((night - 1) / 2)));
/** One bearing on nights 1 and 2, two from night 3, the waves alternating between them. */
export const bearingCount = (night) => (night >= 3 ? 2 : 1);

/** A seeded generator in [0, 1) (Park-Miller), from the world's seed and the night, so a reload replays it. */
export function rngFor(seed, night) {
  let s = (((seed | 0) ^ Math.imul(night | 0, 0x9e3779b1)) >>> 0) % 2147483647 || 1;
  return () => (s = (s * 48271) % 2147483647) / 2147483647;
}

/**
 * The land under a bearing from (cx, cz): how many of three probes, at 32, 40 and 48 m out, stand above the sea.
 * `surfaceAt(x, z)` is the generator's surface (world/climate.js surfaceBlockAt, seeded per world), so the score, and the
 * bearing with it, is the same after a reload. Bearings follow the compass: 0 north (-Z), clockwise.
 */
export function landScoreFrom(surfaceAt, cx = 0, cz = 0) {
  return (bearing) => [32, 40, 48].filter((r) => surfaceAt(cx + r * Math.sin(bearing), cz - r * Math.cos(bearing)).surfaceY > SEA_LEVEL).length;
}

const angleApart = (a, b) => Math.abs(((a - b + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);

/**
 * `count` siege bearings among the eight compass points, the best land first (a seeded tie-break among equals); a second
 * one at least 90 degrees from the first, so two waves never come from one side.
 */
export function chooseBearings({ night, seed = 0, count = bearingCount(night), landScore }) {
  const rng = rngFor(seed, night);
  const ranked = Array.from({ length: 8 }, (_, k) => ({ b: (k * Math.PI) / 4, score: landScore((k * Math.PI) / 4), tie: rng() }))
    .sort((p, q) => q.score - p.score || p.tie - q.tie);
  const out = [];
  for (const c of ranked) {
    if (out.length < count && out.every((b) => angleApart(b, c.b) >= Math.PI / 2 - 1e-9)) out.push(c.b);
  }
  return out;
}

// The night's hostiles a wave draws from, by MOB_TYPES weight: night 1's husks only, and from night 2 every hostile
// but the moss brute, which comes as a captain. N1's encounter table replaces this pick.
const FIRST_NIGHT = ['zombie', 'emberhusk'];
const LATER_NIGHTS = Object.keys(MOB_TYPES).filter((t) => !MOB_TYPES[t].passive && t !== 'moss_brute');
function pickType(rng, night) {
  const roster = night <= 1 ? FIRST_NIGHT : LATER_NIGHTS;
  const total = roster.reduce((s, t) => s + (MOB_TYPES[t].weight ?? 1), 0);
  let r = rng() * total;
  for (const t of roster) if ((r -= MOB_TYPES[t].weight ?? 1) < 0) return t;
  return roster[roster.length - 1];
}

/**
 * The siege of night `night`: its bearings and its three waves, each { index, atUnit, bearingIndex, members }, a
 * member { type, role: 'wave' | 'captain', elite: null | 'ember' | 'captain', scale }. Wave 3 carries one captain,
 * FIRST in its list so the drain places it first: an ember husk at zone tier 1 or less, a moss brute from tier 2.
 * Ember elites ride on the first members of waves 2 and 3. `total` is every member of the night.
 */
export function planNight({ night, zoneTier = 0, seed = 0, landScore = () => 0 }) {
  const rng = rngFor(seed, night);
  const bearings = chooseBearings({ night, seed, landScore });
  let elites = eliteCount(night);
  const waves = waveSizes(night).map((size, index) => {
    const members = [];
    if (index === 2) {
      const scale = night <= 1 ? CAPTAIN_SCALE.firstNight : CAPTAIN_SCALE.later;
      members.push({ type: zoneTier >= 2 ? 'moss_brute' : 'emberhusk', role: 'captain', elite: 'captain', scale });
    }
    while (members.length < size) {
      const elite = index > 0 && elites > 0 ? 'ember' : null;
      if (elite) elites -= 1;
      members.push({ type: pickType(rng, night), role: 'wave', elite, scale: 1 });
    }
    return { index, atUnit: WAVE_UNITS[index], bearingIndex: index % bearings.length, members };
  });
  return { night, bearings, waves, total: waves.reduce((s, w) => s + w.members.length, 0) };
}

/** The waves of `plan` that launch as the night moves from `prevUnits` to `nowUnits`: each once, a jump launching
 *  every wave it passes, and a resumed night (prev = now) none. */
export function waveLaunchesBetween(plan, prevUnits, nowUnits) {
  return plan.waves.filter((w) => prevUnits < w.atUnit && w.atUnit <= nowUnits).map((w) => w.index);
}

/**
 * Room for the night's waves: the ids of the mobs to retire (through the death dissolve, no kill) so that `free` slots
 * become `need`. Only a mob the player is not fighting and will not miss: not static, not aggro, not of the siege,
 * alive, and farther than CLEAR_BEYOND_M from the player, farthest first. Fewer when fewer qualify.
 */
export function hornClearance(mobs, { px, pz, free, need }) {
  const dist = (m) => Math.hypot(m.x - px, m.z - pz);
  return mobs
    .filter((m) => !m.isStatic && !m.isAggro && !m.siegeRole && m.health > 0 && dist(m) > CLEAR_BEYOND_M)
    .sort((a, b) => dist(b) - dist(a))
    .slice(0, Math.max(0, need - free))
    .map((m) => m.id);
}

/**
 * One director tick of a marcher's way to its objective, in world time: `track` (null for a new marcher) and where the
 * mob stands now. A marcher that moved less than STUCK.moveM in STUCK.windowMs sidesteps STUCK.sideM to one side of
 * the line to its objective (the sides alternate) for STUCK.sideMs, then marches again; one stuck after STUCK.tries
 * sidesteps hunts the player for good. Progress clears the count. Returns the next track, its anchor mode and point.
 */
export function marchStep(track, { x, z, now, objective, player }) {
  const t = track || { mode: 'march', fromX: x, fromZ: z, since: now, tries: 0, side: 1, until: 0, sideX: 0, sideZ: 0 };
  const at = (mode, ax, az, patch) => ({ ...t, ...patch, mode, anchorX: ax, anchorZ: az });
  if (t.mode === 'hunt') return at('hunt', player.x, player.z);
  if (t.mode === 'side') {
    if (now < t.until) return at('side', t.sideX, t.sideZ);
    return at('march', objective.x, objective.z, { fromX: x, fromZ: z, since: now });
  }
  if (now - t.since < STUCK.windowMs) return at('march', objective.x, objective.z);
  if (Math.hypot(x - t.fromX, z - t.fromZ) >= STUCK.moveM) {
    return at('march', objective.x, objective.z, { fromX: x, fromZ: z, since: now, tries: 0 });
  }
  if (t.tries >= STUCK.tries) return at('hunt', player.x, player.z);
  const dx = objective.x - x;
  const dz = objective.z - z;
  const len = Math.hypot(dx, dz) || 1;
  const side = -t.side;
  const sideX = x + (-dz / len) * STUCK.sideM * side;
  const sideZ = z + (dx / len) * STUCK.sideM * side;
  return at('side', sideX, sideZ, { tries: t.tries + 1, side, until: now + STUCK.sideMs, sideX, sideZ });
}
