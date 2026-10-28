// LightningDriver — storm lightning in the running world (plan docs/superpowers/plans/2026-09-23-crafty-storm-lightning.md,
// Task 2; EXTERNAL-BASELINE-R2 #4). A storm darkened the sky and played a rumble bed; it never flashed. Every number
// lives in game/lightning.js; this only schedules, writes lightningFlashRef once a frame (Atmosphere adds it to the
// sky light and the dome), and plays the thunder after the time sound takes to arrive.
//
// Game-Loop Isolation: one useFrame, transient refs and getState() only — a flash never re-renders React. Times are
// WORLD ms, so a hitstop holds a flash, the next strike and a thunder in flight like the rest of the world. Under
// capture the flash is RESET to 0 and every pending strike and thunder dropped (a declared reset, never an early
// return: capture is entered after boot, mid-storm possibly). Capture is read from the MODULE flag
// (devtest/captureMode.js), as Atmosphere reads it: eleven fixture hooks enter capture without the store's mirror.
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGameStore } from '../store/useGameStore';
import { worldNow } from '../game/worldClock.js';
import { nextStrikeIn, flashLight, thunderDelayMs } from '../game/lightning.js';
import { lightningFlashRef } from './mood';
import { registerTestHook } from '../devtest/testBridge.js';
import { isCaptureMode } from '../devtest/captureMode.js';

/** How far away a strike lands, m: near enough to feel, far enough that the crack arrives after the flash. */
const STRIKE_NEAR_M = 250;
const STRIKE_FAR_M = 1400;
/** Where the thunder is voiced: a point this far toward the strike, so it comes from the right side of the sky. */
const VOICE_AT_M = 40;

export function LightningDriver() {
  const camera = useThree((s) => s.camera);
  const nextAt = useRef(null); // world ms of the next strike (null: none scheduled)
  const lastStrike = useRef(-Infinity); // world ms of the last strike
  const thunder = useRef([]); // [{ at, dir: [x, z], rate }] — cracks in flight
  const force = useRef(null); // DEV: the e2e's strike-now seam — ms the strike is planted in the past (null: none)

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // `agoMs` plants the strike that far in the past, so a spec that freezes the world clock can hold the flash at
    // its peak: a 360 ms flash is shorter than one screenshot round trip.
    registerTestHook('strikeLightning', (agoMs = 0) => { force.current = Number(agoMs) || 0; });
    registerTestHook('readLightning', () => ({
      flash: lightningFlashRef.current,
      nextIn: nextAt.current === null ? null : nextAt.current - worldNow(),
      thunderPending: thunder.current.length,
      sinceStrike: worldNow() - lastStrike.current,
    }));
  }, []);

  useFrame(() => {
    const st = useGameStore.getState();
    const now = worldNow();
    if (isCaptureMode()) {
      lightningFlashRef.current = 0;
      nextAt.current = null;
      thunder.current.length = 0;
      force.current = null;
      return;
    }
    const storm = st.weatherMoodBoost > 0; // stormMoodBoost(weather) > 0 exactly while a storm is on (game/weatherGate.js)
    if (!storm) nextAt.current = null;
    else if (nextAt.current === null) nextAt.current = now + nextStrikeIn(Math.random, { storm, capture: false });

    if (force.current !== null || (nextAt.current !== null && now >= nextAt.current)) {
      lastStrike.current = now - (force.current ?? 0);
      force.current = null;
      if (storm) nextAt.current = now + nextStrikeIn(Math.random, { storm, capture: false });
      const dist = STRIKE_NEAR_M + Math.random() * (STRIKE_FAR_M - STRIKE_NEAR_M);
      const a = Math.random() * Math.PI * 2;
      // Farther strikes crack lower: the air eats the highs first.
      thunder.current.push({ at: now + thunderDelayMs(dist), dir: [Math.cos(a), Math.sin(a)], rate: 1 - (dist / STRIKE_FAR_M) * 0.35 });
    }

    // A storm that ends mid-flash still finishes its decay: the flash reads the last strike, not the weather.
    lightningFlashRef.current = flashLight(now - lastStrike.current, st.juiceIntensity);

    for (let i = thunder.current.length - 1; i >= 0; i--) {
      const t = thunder.current[i];
      if (now < t.at) continue;
      thunder.current.splice(i, 1);
      const p = camera.position;
      st.playSpatialSound?.('thunder', [p.x + t.dir[0] * VOICE_AT_M, p.y + 20, p.z + t.dir[1] * VOICE_AT_M], t.rate, VOICE_AT_M, false);
    }
  });
  return null;
}
