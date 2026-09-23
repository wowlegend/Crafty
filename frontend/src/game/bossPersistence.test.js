import { describe, it, expect } from 'vitest';
import { serializeBossState, hydrateBossState, phaseForHealth } from './bossPersistence.js';
import { bossTierStats } from './bossTier.js';
import { BOSS_CONFIG } from './bossConfig.js';

const MAX = BOSS_CONFIG.health;

// Mutation-Proof (C3 tiers, via scripts/dev/mutate.sh against bossPersistence.js), each RED: P1 a won
// pre-tier save re-arms; P2 a won save kept at tier 0; P3 plausible-wrong: max always the tier-0 health;
// P4 tier not serialized; P5 a junk killNight trusted; P6 plausible-wrong: a junk killNight on a tiered save
// falls back to night 0 (a slain dragon due at once) instead of tonight.

describe('phaseForHealth — ONE derivation, shared by the hook and the rehydrate', () => {
  // bossSystem.js derives the phase from hpPercent inside a useEffect. Persisting the phase alongside the
  // health would create a SECOND source for the same fact, free to drift; deriving it twice in two places
  // would too. So the derivation is extracted here and both callers use it.
  it('reads the phase straight off the config thresholds', () => {
    expect(phaseForHealth(MAX, MAX)).toBe(0);
    expect(phaseForHealth(MAX * 0.8, MAX)).toBe(0);
    expect(phaseForHealth(MAX * 0.6, MAX)).toBe(1); // threshold is <=, so exactly 0.6 is phase 2
    expect(phaseForHealth(MAX * 0.45, MAX)).toBe(1);
    expect(phaseForHealth(MAX * 0.3, MAX)).toBe(2);
    expect(phaseForHealth(1, MAX)).toBe(2);
    expect(phaseForHealth(0, MAX)).toBe(2);
  });

  it('never returns an index outside the configured phases, whatever it is handed', () => {
    for (const h of [-500, 0, MAX, MAX * 99, NaN, undefined, null, 'lots']) {
      const p = phaseForHealth(h, MAX);
      expect(Number.isInteger(p), `phaseForHealth(${h}) returned ${p}`).toBe(true);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(BOSS_CONFIG.phases.length);
    }
  });

  it('survives a zero or missing max without dividing into a NaN phase', () => {
    expect(phaseForHealth(100, 0)).toBe(0);
    expect(phaseForHealth(100, undefined)).toBe(0);
  });
});

describe('serializeBossState — only what cannot be re-derived', () => {
  it('carries health, active, defeated, tier and killNight — and NOT the derivable phase', () => {
    const out = serializeBossState({ bossActive: true, bossHealth: 420, bossDefeated: false, bossPhase: 1, bossTier: 2, bossKillNight: 17 });
    expect(out).toEqual({ health: 420, active: true, defeated: false, tier: 2, killNight: 17 });
    expect(out).not.toHaveProperty('phase');
  });

  it('is JSON-safe', () => {
    const out = serializeBossState({ bossActive: true, bossHealth: 420, bossDefeated: false });
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });

  it('coerces a missing or junk health to a number rather than writing NaN into the save', () => {
    // A NaN reaches disk as `null` through JSON and comes back as a boss with no health at all.
    expect(serializeBossState({ bossHealth: undefined }).health).toBe(MAX);
    expect(serializeBossState({ bossHealth: NaN }).health).toBe(MAX);
    expect(serializeBossState({}).health).toBe(MAX);
  });
});

describe('hydrateBossState — a reload must not change the fight', () => {
  const fresh = { active: false, health: MAX, defeated: false, phase: 0, tier: 0, killNight: 0 };

  it('restores a fight in progress at the HP it was left at — the whole bug', () => {
    // B2g: bossHealth was useState(BOSS_CONFIG.health), so a reload during the fight handed the dragon
    // back every point of health the player had taken off it.
    const out = hydrateBossState({ health: 120, active: true, defeated: false }, { maxHealth: MAX });
    expect(out.health).toBe(120);
    expect(out.active).toBe(true);
    expect(out.defeated).toBe(false);
  });

  it('SEEDS THE PHASE from the restored HP, so the reload does not re-announce a passed phase', () => {
    // The phase effect announces "PHASE 3: ENRAGED!" on any change. Rehydrating at 17% HP with the phase
    // still 0 makes that effect fire on load, announcing a transition that happened before the reload.
    const out = hydrateBossState({ health: MAX * 0.17, active: true, defeated: false }, { maxHealth: MAX });
    expect(out.phase).toBe(2);
    expect(out.phase).toBe(phaseForHealth(out.health, MAX));
  });

  it('returns a fresh encounter for a save written before boss state existed', () => {
    // Old saves have no boss block at all. That must read as "not started", never as a half-dead dragon.
    expect(hydrateBossState(undefined, { maxHealth: MAX })).toEqual(fresh);
    expect(hydrateBossState(null, { maxHealth: MAX })).toEqual(fresh);
  });

  it('NEVER re-arms the dragon from a won PRE-TIER save, whatever it says', () => {
    // S9c persists gameWon. A legacy save (no tier) that also carried active:true would otherwise resurrect
    // the boss into a beaten game on every load. It hydrates as one kill, the return pending from tonight.
    const out = hydrateBossState({ health: 300, active: true, defeated: false }, { maxHealth: MAX, gameWon: true, nightCount: 12 });
    expect(out.active).toBe(false);
    expect(out.defeated).toBe(true);
    expect(out.tier).toBe(1);
    expect(out.killNight).toBe(12);
  });

  it('keeps a defeated dragon defeated and inactive', () => {
    const out = hydrateBossState({ health: 0, active: true, defeated: true }, { maxHealth: MAX });
    expect(out.defeated).toBe(true);
    expect(out.active).toBe(false);
  });

  it('clamps health above max — a lowered config must not leave the boss over-healed', () => {
    expect(hydrateBossState({ health: 99999, active: true }, { maxHealth: MAX }).health).toBe(MAX);
  });

  it('rejects junk health rather than restoring a NaN-HP boss that can never be killed', () => {
    for (const bad of [NaN, undefined, null, 'half', {}, -1]) {
      const out = hydrateBossState({ health: bad, active: true, defeated: false }, { maxHealth: MAX });
      expect(Number.isFinite(out.health), `health ${String(bad)} produced ${out.health}`).toBe(true);
      expect(out.health).toBeGreaterThanOrEqual(0);
      expect(out.health).toBeLessThanOrEqual(MAX);
    }
  });

  it('RE-ARMS a 0-HP boss that was never marked defeated, rather than stranding the player', () => {
    // The contradictory state (dead by HP, no defeat recorded, no win) is reachable from the pre-B2h bug
    // where a throwing reward stranded the win. Leaving it active at 0 HP is a soft-lock: an enemy that
    // cannot be killed because it is already dead, and no win to show for it. Marking it defeated would
    // be worse — it permanently removes the only path to gameWon. So it resets to a fresh encounter: walk
    // back to the lair and fight it again. A repeated fight beats an unwinnable save.
    const out = hydrateBossState({ health: 0, active: true, defeated: false }, { maxHealth: MAX });
    expect(out.health).toBe(MAX);
    expect(out.active).toBe(false);
    expect(out.defeated).toBe(false);
  });

  it('does not treat a 0-HP defeated boss as that contradiction — defeat is recorded, nothing to re-arm', () => {
    const out = hydrateBossState({ health: 0, active: false, defeated: true }, { maxHealth: MAX });
    expect(out.defeated).toBe(true);
    expect(out.health).toBe(0);
  });

  it('round-trips: serialize -> JSON -> hydrate leaves the fight exactly where it was', () => {
    const live = { bossActive: true, bossHealth: 233, bossDefeated: false };
    const out = hydrateBossState(JSON.parse(JSON.stringify(serializeBossState(live))), { maxHealth: MAX });
    expect(out).toEqual({ active: true, health: 233, defeated: false, phase: phaseForHealth(233, MAX), tier: 0, killNight: 0 });
  });
});

// QUEUE C3 — the dragon returns. Tier = dragons slain so far; killNight = the night of the last kill.
describe('hydrateBossState — tiers', () => {
  const T1 = bossTierStats(1).health;

  it('round-trips a RETURN fight in a won game — a tiered save is trusted, not overruled by the win', () => {
    const live = { bossActive: true, bossHealth: 900, bossDefeated: false, bossTier: 1, bossKillNight: 20 };
    const out = hydrateBossState(JSON.parse(JSON.stringify(serializeBossState(live))), { gameWon: true, nightCount: 25 });
    expect(out).toMatchObject({ active: true, health: 900, defeated: false, tier: 1, killNight: 20 });
  });

  it('sizes the fight from the TIER: health clamps to that tier\'s max, and the phase reads against it', () => {
    const out = hydrateBossState({ health: 99999, active: true, defeated: false, tier: 1, killNight: 3 }, { gameWon: true });
    expect(out.health).toBe(T1);
    const mid = hydrateBossState({ health: T1 * 0.5, active: true, defeated: false, tier: 1, killNight: 3 }, { gameWon: true });
    expect(mid.phase).toBe(phaseForHealth(T1 * 0.5, T1));
  });

  it('a slain tier waits: defeated, inactive, its kill night kept', () => {
    const out = hydrateBossState({ health: 0, active: false, defeated: true, tier: 2, killNight: 30 }, { gameWon: true, nightCount: 31 });
    expect(out).toMatchObject({ active: false, defeated: true, health: 0, tier: 2, killNight: 30 });
  });

  it('a won save with a tier of 0 is contradictory: it has killed at least one dragon', () => {
    expect(hydrateBossState({ health: 0, active: false, defeated: true, tier: 0, killNight: 4 }, { gameWon: true }).tier).toBe(1);
  });

  it('a slain tier whose kill night is junk counts its return from TONIGHT — never from night 0, which would wake it at once', () => {
    for (const bad of [NaN, -3, 'two', null, undefined]) {
      const out = hydrateBossState({ health: 0, active: false, defeated: true, tier: 2, killNight: bad }, { gameWon: true, nightCount: 31 });
      expect(out.killNight, `killNight ${String(bad)}`).toBe(31);
    }
  });

  it('junk tier and killNight coerce to safe integers, never NaN', () => {
    for (const bad of [NaN, -3, 'two', null, {}]) {
      const out = hydrateBossState({ health: 100, active: true, defeated: false, tier: bad, killNight: bad }, { nightCount: 7 });
      expect(Number.isInteger(out.tier) && out.tier >= 0, `tier ${String(bad)}`).toBe(true);
      expect(Number.isFinite(out.killNight), `killNight ${String(bad)}`).toBe(true);
    }
  });
});
