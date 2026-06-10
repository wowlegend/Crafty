import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../store/useGameStore';
import { GameMethods } from '../GameMethods';
import { mobsQuery } from '../ecs/world';
import { isCaptureMode } from '../devtest/captureMode';
import { makeZoneRegistry, spawnZone, stepZones, clearZones, applyZoneEffects } from '../game/elementZones';
import { consumeZoneRequest } from '../game/elemancerChannel';

const AI_TICK_SEC = 1 / 15; // the bridge cadence (the SquadAISystem stencil)
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

  useFrame((state, delta) => {
    if (isCaptureMode()) return;
    const store = useGameStore.getState();

    // the dawn contract: zones never survive the night->day flip
    if (store.isDay && !prevIsDayRef.current) clearZones(liveZones);
    prevIsDayRef.current = store.isDay;

    accumRef.current += delta;
    if (accumRef.current < AI_TICK_SEC) return;
    accumRef.current = 0;

    const now = state.clock.getElapsedTime();
    const req = consumeZoneRequest();
    if (req) spawnZone(liveZones, req, now);
    stepZones(liveZones, now); // (M6 consumes .expired for char decals)

    if (liveZones.zones.length === 0) return;

    fxAccumRef.current += AI_TICK_SEC;
    if (fxAccumRef.current < FX_TICK_SEC) return;
    fxAccumRef.current = 0;

    if (GameMethods.damageMob) {
      applyZoneEffects(liveZones.zones, mobsQuery.entities, GameMethods.damageMob);
    }
  });
  return null;
}
