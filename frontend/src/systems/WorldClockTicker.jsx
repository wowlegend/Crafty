// WorldClockTicker.jsx — computes the world's freeze scale ONCE per frame, before any consumer reads it
// (game/worldClock.js, review #3 R4.10). Mounted in GameScene inside the Canvas.
import { useFrame } from '@react-three/fiber';
import { tickWorldClock } from '../game/worldClock.js';

/** Below every consumer's priority; CaptureClockTicker (-10000) advances the capture clock first. */
const WORLD_CLOCK_PRIORITY = -9999;

export function WorldClockTicker() {
  useFrame(() => tickWorldClock(), WORLD_CLOCK_PRIORITY);
  return null;
}
