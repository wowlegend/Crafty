import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  WAVE_UNITS, WAVE_CAP, HUB_SLOTS, CAPTAIN_SCALE, CLEAR_BEYOND_M, STUCK,
  unitsIntoNight, waveSizes, eliteCount, planNight, chooseBearings, landScoreFrom, waveLaunchesBetween, hornClearance,
  marchStep, rngFor,
} from './siegeDirector.js';
import { siegeParams, HALF_CYCLE_UNITS, GAME_UNITS_PER_SECOND, DAY_LENGTH_SECONDS } from '../game/dayNight.js';
import { MOB_TYPES } from '../game/mobTypes.js';
import { SEA_LEVEL } from '../world/oceanProfile.js';
import { useGameStore } from '../store/useGameStore.jsx';
import { solveMeleeDamage } from '../utils/combat.js';
import { getWeaponBaseDamage } from '../game/equipment.js';
import { BEAST_FORMS, resolveFormMelee, formMeleeCooldownMult } from '../game/beasts.js';
import { SWING_COOLDOWN_MS } from '../game/meleeString.js';

// THE SIEGE DIRECTOR'S RULES (W3-A task script, unit N4; DECISIONS 2026-11-01 (W3-A PR C) item 520). Pure: the waves on
// the night's clock, their sizes, the bearings, the captain, the horn's room among the day's mobs, the launch rule and a
// marcher's way round a wall; then the two claims the task script makes of them, a whole night placed inside the cap from
// the population a day leaves, and the night-1 captain killable by a level-2 beast inside the held roar.
const LAND = () => 3;
afterEach(() => vi.restoreAllMocks());

describe('the night\'s clock', () => {
  it('launches the waves at 0, 180 and 380 units into the night, and reads -1 by day and the same while held', () => {
    expect(WAVE_UNITS).toEqual([0, 180, 380]);
    expect(planNight({ night: 1, landScore: LAND }).waves.map((w) => w.atUnit)).toEqual([0, 180, 380]);
    expect(unitsIntoNight(HALF_CYCLE_UNITS + 250)).toBe(250);
    expect(unitsIntoNight(HALF_CYCLE_UNITS + 250), 'the same gameTime read twice moved').toBe(250);
    expect(unitsIntoNight(3 * HALF_CYCLE_UNITS + 10), 'a later night is not read from its own start').toBe(10);
    expect([0, 100, HALF_CYCLE_UNITS - 1, 2 * HALF_CYCLE_UNITS].map(unitsIntoNight), 'a day unit reads as night').toEqual([-1, -1, -1, -1]);
  });

  it('launches each wave once: a jump launches every wave it passes, a resumed night none, a boundary once', () => {
    const plan = planNight({ night: 4, landScore: LAND });
    expect(waveLaunchesBetween(plan, -1, 0), 'the horn did not launch wave 1').toEqual([0]);
    expect(waveLaunchesBetween(plan, 10, 400)).toEqual([1, 2]);
    expect(waveLaunchesBetween(plan, 250, 250), 'a resumed night launched a wave').toEqual([]);
    expect(waveLaunchesBetween(plan, 179, 180)).toEqual([1]);
    expect(waveLaunchesBetween(plan, 180, 181), 'wave 2 launched twice').toEqual([]);
  });
});

describe('the waves', () => {
  it('ramp with the night and stop at 10', () => {
    const table = Array.from({ length: 12 }, (_, i) => waveSizes(i + 1));
    expect(table).toEqual([
      [2, 2, 3], [3, 3, 5], [3, 4, 6], [4, 5, 7], [4, 5, 8], [5, 6, 9],
      [5, 7, 10], [6, 8, 10], [6, 8, 10], [7, 9, 10], [7, 10, 10], [8, 10, 10],
    ]);
    expect(table.flat().every((s) => s <= WAVE_CAP)).toBe(true);
    expect(waveSizes(40), 'the cap does not hold far out').toEqual([10, 10, 10]);
  });

  it('are gentle on night 1: one bearing, 2, 2 and 3, no ember elite, the captain at x1.6', () => {
    const plan = planNight({ night: 1, landScore: LAND });
    expect(plan.bearings).toHaveLength(1);
    expect(plan.waves.map((w) => w.members.length)).toEqual([2, 2, 3]);
    expect(plan.waves.flatMap((w) => w.members).filter((m) => m.elite === 'ember'), 'night 1 carries an ember elite').toEqual([]);
    expect(plan.waves[2].members[0]).toMatchObject({ role: 'captain', type: 'emberhusk', scale: CAPTAIN_SCALE.firstNight });
    expect(CAPTAIN_SCALE.firstNight).toBe(1.6);
    expect(plan.total).toBe(7);
  });

  it('carry exactly one captain, first in wave 3: an ember husk to tier 1, a moss brute from tier 2, x2.4 after night 1', () => {
    let checked = 0;
    for (let night = 1; night <= 12; night++) {
      for (let zoneTier = 0; zoneTier <= 4; zoneTier++) {
        const plan = planNight({ night, zoneTier, landScore: LAND });
        const captains = plan.waves.flatMap((w) => w.members.map((m, i) => ({ ...m, wave: w.index, at: i }))).filter((m) => m.role === 'captain');
        expect(captains, `night ${night} tier ${zoneTier}: not one captain`).toHaveLength(1);
        expect([captains[0].wave, captains[0].at], `night ${night}: the captain is not first in wave 3`).toEqual([2, 0]);
        expect(captains[0].type).toBe(zoneTier >= 2 ? 'moss_brute' : 'emberhusk');
        expect(captains[0].scale).toBe(night === 1 ? 1.6 : 2.4);
        checked += 1;
      }
    }
    expect(checked).toBe(60);
  });

  it('put the night\'s ember elites on the first members of waves 2 and 3', () => {
    const plan = planNight({ night: 9, landScore: LAND });
    expect(eliteCount(9)).toBe(3);
    const embers = plan.waves.flatMap((w) => w.members.map((m, i) => (m.elite === 'ember' ? [w.index, i] : null))).filter(Boolean);
    expect(embers).toEqual([[1, 0], [1, 1], [1, 2]]);
    expect(eliteCount(1)).toBe(0);
    expect(eliteCount(40)).toBe(3);
  });

  it('draw night 1 from the husks only, and never a moss brute but the captain', () => {
    for (let night = 1; night <= 12; night++) {
      const types = planNight({ night, landScore: LAND }).waves.flatMap((w) => w.members.filter((m) => m.role === 'wave').map((m) => m.type));
      if (night === 1) expect(new Set(types), 'night 1 drew more than the husks').toEqual(new Set(types.filter((t) => ['zombie', 'emberhusk'].includes(t))));
      expect(types.includes('moss_brute'), `night ${night} drew a moss brute in a wave`).toBe(false);
      expect(types.every((t) => MOB_TYPES[t] && !MOB_TYPES[t].passive), `night ${night} drew a passive`).toBe(true);
    }
  });
});

describe('the bearings', () => {
  it('are two from night 3, never within 90 degrees, and the same for the same world and night', () => {
    const ok = (bs) => bs.length < 2 || Math.abs(((bs[0] - bs[1] + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) >= Math.PI / 2 - 1e-9;
    let pairs = 0;
    for (let night = 1; night <= 12; night++) {
      for (const seed of [1, 12345, 99]) {
        const bs = chooseBearings({ night, seed, landScore: LAND });
        expect(bs.length).toBe(night >= 3 ? 2 : 1);
        expect(ok(bs), `night ${night} seed ${seed}: two bearings within 90 degrees (${bs})`).toBe(true);
        expect(chooseBearings({ night, seed, landScore: LAND }), 'a reload chose another bearing').toEqual(bs);
        if (bs.length === 2) pairs += 1;
      }
    }
    expect(pairs).toBe(30);
    const spread = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((night) => chooseBearings({ night, seed: 7, landScore: LAND })[0]));
    expect(spread.size, 'equal land always picks the same bearing: the tie-break is not seeded').toBeGreaterThan(2);
  });

  it('never come out of the sea while a land bearing exists, and prefer the most land', () => {
    const seaEast = (b) => (Math.sin(b) > 0.1 ? 0 : 3); // every bearing with an eastward part is sea
    for (let night = 1; night <= 12; night++) {
      for (const b of chooseBearings({ night, seed: 3, landScore: seaEast })) {
        expect(Math.sin(b) > 0.1, `night ${night}: a sea bearing ${b} was chosen`).toBe(false);
      }
    }
    const one = (b) => (Math.abs(b - Math.PI) < 1e-9 ? 3 : 1);
    expect(chooseBearings({ night: 1, seed: 3, landScore: one }), 'the bearing with the most land lost').toEqual([Math.PI]);
  });

  it('score a bearing by three probes from the anchor, 32 to 48 m out, above the sea', () => {
    const probes = [];
    const surface = (x, z) => { probes.push([Math.round(x), Math.round(z)]); return { surfaceY: z > -40 ? SEA_LEVEL + 5 : SEA_LEVEL }; };
    const score = landScoreFrom(surface, 0, 0);
    expect(score(0), 'north: 32 m stands on land, 40 and 48 m in the sea').toBe(1);
    expect(probes).toEqual([[0, -32], [0, -40], [0, -48]]);
    expect(score(Math.PI), 'south is all land').toBe(3);
    expect(probes.slice(3)).toEqual([[0, 32], [0, 40], [0, 48]]);
    expect(landScoreFrom(() => ({ surfaceY: SEA_LEVEL }), 0, 0)(1), 'the sea scores').toBe(0);
  });
});

describe('the horn\'s room', () => {
  it('retires the farthest mobs the player is not fighting, beyond 30 m, until the night fits', () => {
    const mobs = [
      { id: 1, x: 80, z: 0, health: 50 }, { id: 2, x: 0, z: 60, health: 50 }, { id: 3, x: 31, z: 0, health: 50 },
      { id: 4, x: 25, z: 0, health: 50 }, { id: 5, x: 90, z: 0, health: 50, isStatic: true }, { id: 6, x: 0, z: -85, health: 50, isAggro: true },
      { id: 7, x: -70, z: 0, health: 50, siegeRole: 'wave' }, { id: 8, x: -88, z: 0, health: 0 },
    ];
    expect(CLEAR_BEYOND_M).toBe(30);
    expect(hornClearance(mobs, { px: 0, pz: 0, free: 1, need: 3 })).toEqual([1, 2]);
    expect(hornClearance(mobs, { px: 0, pz: 0, free: 0, need: 9 }), 'it took one it must not').toEqual([1, 2, 3]);
    expect(hornClearance(mobs, { px: 0, pz: 0, free: 7, need: 7 }), 'room was made where none was needed').toEqual([]);
  });

  // The day the night follows: the spawner fills to the day cap (siegeParams(0, z).maxMobs, the hub's four static NPCs
  // among them) between 20 and 90 m of the player at the Hearth; a third are passive, and a fifth of the hostiles are
  // already hunting the player. No mob is killed all night, so every slot a wave takes was free or made free.
  const carried = (zoneTier, rng) => {
    const out = Array.from({ length: HUB_SLOTS }, (_, i) => ({ id: `hub${i}`, x: 3 + i, z: 3, health: 120, isStatic: true }));
    for (let i = out.length; i < siegeParams(0, zoneTier).maxMobs; i++) {
      const r = 20 + rng() * 70;
      const a = rng() * 2 * Math.PI;
      out.push({ id: i, x: r * Math.sin(a), z: -r * Math.cos(a), health: 50, isAggro: rng() < 0.2 && rng() < 0.67, passive: rng() < 0.33 });
    }
    return out;
  };

  it('places every member of every night inside the cap, from the population a day leaves, with no kill', () => {
    expect(DAY_LENGTH_SECONDS, 'the day this was measured on').toBe(480);
    const nightSec = HALF_CYCLE_UNITS / GAME_UNITS_PER_SECOND;
    let cases = 0;
    for (let night = 1; night <= 12; night++) {
      for (let zoneTier = 0; zoneTier <= 4; zoneTier++) {
        const plan = planNight({ night, zoneTier, landScore: LAND });
        const cap = siegeParams(night, zoneTier).maxMobs;
        const mobs = carried(zoneTier, rngFor(night * 31 + zoneTier, night));
        let alive = mobs.length;
        alive -= hornClearance(mobs, { px: 0, pz: 0, free: cap - alive, need: plan.total }).length;
        const queue = [];
        let prev = -1;
        let placed = 0;
        let peak = alive;
        let captainAfter = null;
        for (let sec = 0; sec < nightSec; sec++) {
          const now = sec * GAME_UNITS_PER_SECOND;
          for (const k of waveLaunchesBetween(plan, prev, now)) queue.push(...plan.waves[k].members.map((m) => ({ ...m, launched: sec })));
          prev = now;
          const n = Math.min(3, cap - alive, queue.length);
          for (const m of queue.splice(0, n)) if (m.role === 'captain') captainAfter = sec - m.launched;
          placed += n;
          alive += n;
          peak = Math.max(peak, alive);
        }
        const where = `night ${night} tier ${zoneTier} (cap ${cap}, ${plan.total} members)`;
        expect(placed, `${where}: the night's waves were starved, ${queue.length} never placed`).toBe(plan.total);
        expect(peak, `${where}: the cap was passed`).toBeLessThanOrEqual(cap);
        expect(captainAfter, `${where}: the captain did not come within 2 s of wave 3`).toBeLessThanOrEqual(2);
        cases += 1;
      }
    }
    expect(cases).toBe(60);
  });
});

describe('a marcher at a wall', () => {
  const objective = { x: 0, z: 0 };
  const player = { x: 5, z: 5 };
  it('marches on its objective while it moves, sidesteps 8 m when it does not, and hunts after two sidesteps', () => {
    let t = marchStep(null, { x: 0, z: 40, now: 0, objective, player });
    expect([t.mode, t.anchorX, t.anchorZ]).toEqual(['march', 0, 0]);
    t = marchStep(t, { x: 0, z: 30, now: STUCK.windowMs, objective, player });
    expect(t.mode, 'a mob 10 m on in 6 s was called stuck').toBe('march');
    t = marchStep(t, { x: 0, z: 29, now: 2 * STUCK.windowMs, objective, player });
    expect(t.mode, 'a mob 1 m on in 6 s did not sidestep').toBe('side');
    expect(Math.hypot(t.anchorX - 0, t.anchorZ - 29), 'the sidestep is not 8 m').toBeCloseTo(STUCK.sideM, 6);
    expect(t.anchorZ, 'the sidestep is not square to the line to the objective').toBeCloseTo(29, 6);
    const firstSide = Math.sign(t.anchorX);
    t = marchStep(t, { x: 2, z: 29, now: 2 * STUCK.windowMs + STUCK.sideMs - 1, objective, player });
    expect(t.mode, 'the sidestep ended early').toBe('side');
    t = marchStep(t, { x: 3, z: 29, now: 2 * STUCK.windowMs + STUCK.sideMs, objective, player });
    expect([t.mode, t.anchorX, t.anchorZ], 'it did not march again after its sidestep').toEqual(['march', 0, 0]);
    const back = 2 * STUCK.windowMs + STUCK.sideMs;
    t = marchStep(t, { x: 3, z: 28.5, now: back + STUCK.windowMs, objective, player });
    expect(t.mode).toBe('side');
    expect(Math.sign(t.anchorX - 3), 'the second sidestep went the same way').toBe(-firstSide);
    t = marchStep(t, { x: 3, z: 28.5, now: back + STUCK.windowMs + STUCK.sideMs, objective, player });
    t = marchStep(t, { x: 3, z: 28.4, now: back + 2 * STUCK.windowMs + STUCK.sideMs, objective, player });
    expect([t.mode, t.anchorX, t.anchorZ], 'a mob stuck after two sidesteps did not hunt the player').toEqual(['hunt', 5, 5]);
    expect(marchStep(t, { x: 9, z: 9, now: 1e6, objective, player: { x: 7, z: 1 } }), 'the hunt let go of the player')
      .toMatchObject({ mode: 'hunt', anchorX: 7, anchorZ: 1 });
  });

  it('clears its count of sidesteps once it moves again', () => {
    let t = marchStep(null, { x: 0, z: 40, now: 0, objective, player });
    t = marchStep(t, { x: 0, z: 40, now: STUCK.windowMs, objective, player });
    t = marchStep(t, { x: 4, z: 40, now: STUCK.windowMs + STUCK.sideMs, objective, player });
    expect(t.tries).toBe(1);
    t = marchStep(t, { x: 4, z: 30, now: 2 * STUCK.windowMs + STUCK.sideMs, objective, player });
    expect([t.mode, t.tries], 'progress did not clear the count').toEqual(['march', 0]);
  });
});

describe('the night-1 captain', () => {
  it('falls to a level-2 beast\'s swings, uncritted, with 4 s or more of a 14 s roar to spare, in every form', () => {
    const s = useGameStore.getState();
    useGameStore.setState({ level: 2 });
    const stats = useGameStore.getState().getEffectiveAttributes();
    const weapon = useGameStore.getState().equipment.weapon;
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // no crit: the worst case
    const { damage, isCrit } = solveMeleeDamage(stats, getWeaponBaseDamage(weapon));
    useGameStore.setState({ level: s.level });
    expect(isCrit, 'SETUP: the swing critted').toBe(false);
    const captainHp = MOB_TYPES.emberhusk.health * CAPTAIN_SCALE.firstNight;
    const rows = Object.keys(BEAST_FORMS).map((element) => {
      const { dealt } = resolveFormMelee(damage, element, 1);
      const cadenceMs = SWING_COOLDOWN_MS * formMeleeCooldownMult(element);
      return { element, dealt, cadenceMs, killMs: (Math.ceil(captainHp / dealt) - 1) * cadenceMs };
    });
    expect(rows.length).toBe(4);
    expect(rows.filter((r) => r.killMs > 14000 - 4000), `the night-1 captain (${captainHp} HP) outlasts the roar's spare: ${JSON.stringify(rows)}`)
      .toEqual([]);
  });
});
