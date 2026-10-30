// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, renderHook, cleanup, act } from '@testing-library/react';
// CombatSystem's mob-hit sound comes from the SoundProvider the app mounts; the dragon's hit sound goes through the store.
vi.mock('../SoundManager', () => ({ useGameSounds: () => ({ playHit: () => {} }) }));
import { useGameStore } from '../store/useGameStore.jsx';
import { useBossSystem } from '../world/bossSystem.js';
import { CombatSystem } from './CombatSystem.jsx';
import { GameMethods } from '../GameMethods';
import { bossCombat, bossTargets, resetBossCombat, BOSS_TARGET_ID } from '../game/bossCombat.js';
import { applyZoneEffects, BURN_TICK } from '../game/elementZones.js';
import { stepSquad, ALLY_DPS_HIT } from '../game/squadAI.js';
import { makeHurl, stepHurlChunked, HURL_DAMAGE } from '../game/hurl.js';
import { makeBurnManager } from '../game/burnManager.js';
import { STAGGER_MS } from '../game/perfectDodge.js';
import { worldNow } from '../game/worldClock.js';

// THE DRAGON ON THE ONE DAMAGE PATH, A SEEDED STORE PROBE (reset plan row 25; DECISIONS 2026-10-30 item 126). The real
// boss hook (damageBoss) and the real CombatSystem (damageMob, which routes the dragon's id to damageBoss) are mounted
// over a restored fight at 300 HP; the dragon's record stands at a known place; then each way the Aspect kits deal
// damage is driven through the pure step its system runs, with the target list its system builds (bossTargets), and
// the HP read back from the hook. The systems' own wiring (HurlSystem, SquadAISystem, ElementZoneSystem, the spell's
// burn in EnhancedMagicSystem) runs in the browser: tests/e2e/dragon-fight.spec.js.
//
// Mutation-Proof: via scripts/dev/mutate.sh, each observed RED, an identity mutant (a comment edit) GREEN:
//   P1 damageMob does not route the dragon's id (CombatSystem.jsx) -> every case
//   P2 the route ignores the source (damageBoss(damage)) -> "an ally's hit is never a riposte"
//   P3 hitDragon returns the record after the fight is over -> "a burn stops when the fight is over"
const GROUND_ONLY = { groundOnly: true };
const AT = { x: 40, y: 20, z: 40 };

let hook;
const hp = () => hook.result.current.bossHealth;
const settle = () => act(() => { hook.rerender(); });

beforeEach(() => {
  vi.useFakeTimers();
  useGameStore.setState({ bossHealth: 300, bossActive: true, bossDefeated: false, bossTier: 0, gameWon: false,
    isCaptureMode: false, hitstopUntil: 0, hitstopStart: 0, addNotification: vi.fn(), juiceIntensity: 1,
    playerPosition: { x: 0, y: 60, z: 0 }, getMobGroundLevel: null });
  hook = renderHook(() => useBossSystem(9));
  render(<CombatSystem setDamageNumbers={() => {}} setShockwaves={() => {}} damageId={{ current: 0 }} />);
  resetBossCombat(bossCombat);
  Object.assign(bossCombat, { active: true, health: 300, airborne: false });
  Object.assign(bossCombat.position, AT);
});
afterEach(() => { cleanup(); vi.useRealTimers(); resetBossCombat(bossCombat); useGameStore.setState({ hitstopUntil: 0 }); });

describe('each Aspect kit lowers the dragon\'s HP through damageMob', () => {
  it('PRESENCE: the probe reads the hook\'s HP, and a direct damageBoss moves it', () => {
    expect(hp()).toBe(300);
    act(() => { useGameStore.getState().damageBoss(7, 'player'); });
    settle();
    expect(hp()).toBe(293);
  });

  it('an element zone burns it while it stands in the zone (a hazard: no riposte)', () => {
    bossCombat.staggerUntil = worldNow() + STAGGER_MS;
    act(() => applyZoneEffects([{ kind: 'burning', pos: { x: AT.x + 3, y: AT.y, z: AT.z }, radius: 2.5 }],
      bossTargets([], bossCombat, GROUND_ONLY), GameMethods.damageMob));
    settle();
    expect(hp()).toBe(300 - BURN_TICK);
  });

  it('a squad ally beside it strikes it (an ally\'s hit is never a riposte)', () => {
    bossCombat.staggerUntil = worldNow() + STAGGER_MS;
    const ally = { id: 1, position: { x: AT.x + 3, y: AT.y, z: AT.z }, lastAllyAttack: 0 };
    const { attacks } = stepSquad([ally], bossTargets([], bossCombat, GROUND_ONLY), { x: AT.x + 6, y: AT.y, z: AT.z }, 10, true);
    expect(attacks).toEqual([{ id: 1, targetId: BOSS_TARGET_ID }]);
    act(() => { for (const at of attacks) GameMethods.damageMob(at.targetId, ALLY_DPS_HIT, 'physical', 'ally'); });
    settle();
    expect(hp()).toBe(300 - ALLY_DPS_HIT);
  });

  it('a hurled block flying at it hits it, in the air too', () => {
    bossCombat.airborne = true;
    const h = makeHurl({ x: AT.x - 6, y: AT.y, z: AT.z }, { x: 1, y: 0, z: 0 });
    h.velocity.y = 0;
    let r = { done: false, hit: null };
    for (let i = 0; i < 120 && !r.done; i++) r = stepHurlChunked(h, 1 / 60, bossTargets([], bossCombat));
    expect(r.hit?.id).toBe(BOSS_TARGET_ID);
    act(() => { GameMethods.damageMob(r.hit.id, HURL_DAMAGE, 'fire'); });
    settle();
    expect(hp()).toBe(300 - HURL_DAMAGE);
  });

  it('a burn ticks on it, the player\'s damage: the riposte applies while it is staggered', () => {
    const burns = makeBurnManager();
    burns.start(BOSS_TARGET_ID, 2, 10, () => GameMethods.damageMob);
    act(() => { vi.advanceTimersByTime(1000); });
    settle();
    expect(hp()).toBe(290);
    bossCombat.staggerUntil = worldNow() + 60000;
    act(() => { vi.advanceTimersByTime(1000); });
    settle();
    expect(hp(), 'the second tick on a staggered dragon is a riposte').toBe(275);
    act(() => { vi.advanceTimersByTime(3000); });
    settle();
    expect(hp(), 'the burn outlived its two ticks').toBe(275);
    burns.stopAll();
  });

  it('zones and allies cannot reach it in the air; the systems\' lists leave it out', () => {
    bossCombat.airborne = true;
    act(() => applyZoneEffects([{ kind: 'burning', pos: { x: AT.x, y: AT.y, z: AT.z }, radius: 2.5 }],
      bossTargets([], bossCombat, GROUND_ONLY), GameMethods.damageMob));
    const ally = { id: 1, position: { x: AT.x + 2, y: AT.y, z: AT.z }, lastAllyAttack: 0 };
    expect(stepSquad([ally], bossTargets([], bossCombat, GROUND_ONLY), { x: AT.x, y: AT.y, z: AT.z }, 10, true).attacks).toEqual([]);
    settle();
    expect(hp()).toBe(300);
  });

  it('a burn stops when the fight is over: damageMob hands back nothing for a dragon that is not fighting', () => {
    expect(GameMethods.damageMob(BOSS_TARGET_ID, 5, 'fireball', 'player-dot')).toBe(bossCombat);
    bossCombat.active = false;
    expect(GameMethods.damageMob(BOSS_TARGET_ID, 5, 'fireball', 'player-dot')).toBeNull();
  });
});
