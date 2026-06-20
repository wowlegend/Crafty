import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../store/useGameStore';
import { GameMethods } from '../GameMethods';
import { mobsQuery } from '../ecs/world';
import { isCaptureMode } from '../devtest/captureMode';
import { makeZoneRegistry, spawnZone, stepZones, clearZones, applyZoneEffects } from '../game/elementZones';
import { consumeZoneRequest } from '../game/elemancerChannel';

const AI_TICK_SEC = 1 / 15; // the bridge cadence (the SquadAISystem stencil)
const SFX_BY_KIND = { burning: 'ignite', frozen: 'freeze', conductive: 'zap', resonant: 'rune' };
const FX_TICK_SEC = 0.3;    // zone effects at ~3.3Hz — the React-thrash damper (<=4Hz, load-bearing)

// the LIVE registry — owned here (M6's render reads it transiently; tests own their own instances)
const liveZones = makeZoneRegistry();
export function getLiveZones() { return liveZones; }

/**
 * ElementZoneSystem — S2-B4-M4: chemistry acts on combat. Main-thread only (the v1 stance:
 * zero worker traffic — gated); all effect logic lives in the pure applyZoneEffects (TDD'd,
 * two-pass frozen semantics) — this component is plumbing: the accumulator, the channel
 * consume, the dawn-clear, and the capture gate. Attribution: every zone hit is source
 * 'hazard' (banks nothing — M1).
 */
export function ElementZoneSystem() {
  const accumRef = useRef(0);
  const fxAccumRef = useRef(0);
  const prevIsDayRef = useRef(true);
  const dayMotifPlayedRef = useRef(false); // music-motif v2: the stinger plays on the DAY'S FIRST zone only
  const zonesActiveRef = useRef(false); // tracks zone presence -> clear frozen-slow ONCE when the last zone expires

  useFrame((state, delta) => {
    if (isCaptureMode()) return;
    const store = useGameStore.getState();

    // the dawn contract: zones never survive the night->day flip
    if (store.isDay && !prevIsDayRef.current) { clearZones(liveZones); dayMotifPlayedRef.current = false; }
    prevIsDayRef.current = store.isDay;

    accumRef.current += delta;
    if (accumRef.current < AI_TICK_SEC) return;
    accumRef.current = 0;

    const now = state.clock.getElapsedTime();
    const req = consumeZoneRequest();
    if (req) {
      const z = spawnZone(liveZones, req, now);
      // M6: the element speaks at its spawn moment (a dedupe-refresh replays — the player
      // DID cast; an annihilation stays silent steam in v1). Guarded: the sound registry
      // arrives late via a GameScene effect.
      if (z && store.playSpatialSound) {
        store.playSpatialSound(SFX_BY_KIND[z.kind], [z.pos.x, z.pos.y, z.pos.z], 1, 30);
        // music-motif v2: the ELEMANCER stinger on the day's FIRST zone — chemistry's signature
        if (!dayMotifPlayedRef.current) {
          dayMotifPlayedRef.current = true;
          store.playSpatialSound('motifElemancer', [z.pos.x, z.pos.y, z.pos.z], 1, 40);
        }
      }
    }
    stepZones(liveZones, now); // (M6 consumes .expired for char decals)

    if (liveZones.zones.length === 0) {
      // The last zone just expired: clear any lingering frozen-slow ONCE. The reset sweep inside
      // applyZoneEffects normally owns this, but it never runs while there are no zones, so a mob
      // that touched an expired ice patch would crawl at SLOW_MULT forever. Cheap O(mobs), gated
      // to the non-empty -> empty transition.
      if (zonesActiveRef.current) {
        zonesActiveRef.current = false;
        for (const e of mobsQuery.entities) {
          if (e && e.zoneSlowMult !== undefined && e.zoneSlowMult !== 1) e.zoneSlowMult = 1;
        }
      }
      return;
    }
    zonesActiveRef.current = true;

    fxAccumRef.current += AI_TICK_SEC;
    if (fxAccumRef.current < FX_TICK_SEC) return;
    fxAccumRef.current = 0;

    if (GameMethods.damageMob) {
      applyZoneEffects(liveZones.zones, mobsQuery.entities, GameMethods.damageMob);
    }
  });
  return null;
}
