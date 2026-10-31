import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../store/useGameStore';
import { settleBoot } from '../game/worldBoot.js';
import { sessionStore } from '../game/worldSwitch.js';

/**
 * Takes back the boot's attempt once the world has run a frame (game/worldBoot.js BOOT_ATTEMPT_KEY). It mounts with the
 * world, after the world and the player in GameScene, so a world that throws as it mounts never reaches this frame. The
 * effect arms it: a frame drawn before the effects of the commit that mounted the world (Terrain publishes its worker in
 * one) does not count. One sessionStorage write, once; the store is read with getState (Game-Loop Isolation).
 */
export function BootSettle() {
  const armed = useRef(false);
  useEffect(() => { armed.current = true; }, []);
  useFrame(() => {
    if (!armed.current) return;
    armed.current = false;
    settleBoot(sessionStore(), useGameStore.getState()._bootAttempt);
  });
  return null;
}
