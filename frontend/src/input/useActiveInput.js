/**
 * useActiveInput.js — React projection of the inputState `active` gate.
 *
 * `inputState.active` is the single source of truth for "is input live"
 * (pointer-lock enter/exit today; a touch-focus model in S3). The game LOOP
 * reads it transiently via getInput().active (NEVER subscribed). React UI
 * consumers (the click-to-play overlay gate, crosshair, music-start) project
 * it reactively here via useSyncExternalStore. `active` changes only on a rare
 * user gesture (not per-frame), so this subscription is SAFE under Game-Loop
 * Isolation. The snapshot is a primitive bool - stable Object.is equality, so
 * no infinite-render loop.
 */
import { useSyncExternalStore } from 'react';
import { subscribeActive, getActiveSnapshot } from './inputState';

export function useActiveInput() {
  // 3rd arg = server snapshot (harmless for SSR-less Vite; keeps signature explicit).
  return useSyncExternalStore(subscribeActive, getActiveSnapshot, getActiveSnapshot);
}
