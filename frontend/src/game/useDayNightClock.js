import { useEffect } from 'react';
import { useGameStore } from '../store/useGameStore';
import { getInput } from '../input/inputState';
import { isCaptureMode } from '../devtest/captureMode';
import { GAME_UNITS_PER_SECOND } from './dayNight';

// useDayNightClock -- the React wiring that makes `gameTime` advance over real time
// so the day/night cycle actually runs. GAME-LOOP ISOLATION (CRITICAL): this is a
// COARSE setInterval (1000 ms), NOT useFrame -- 1 tick/s is rare-change, so a single
// zustand set() per second is safe; a per-frame set() would be a render storm.
//
// PAUSE GATES (advance ONLY when ALL true; otherwise the tick early-returns and the
// interval keeps running cheaply):
//   - isWorldBuilt        -- the world is loaded (no ticking on the menu/loading)
//   - getInput().active   -- input is live; opening any panel exits pointer-lock ->
//                            active=false, so time pauses in menus + at click-to-play
//                            (coherent reuse of the M2d active SoT, player-friendly)
//   - isAlive !== false   -- not dead (treat undefined as alive)
//   - !isCaptureMode()    -- the visual-regression bridge pins lighting via
//                            setTimeOfDay; the ticker must NOT fight it (determinism)
export function useDayNightClock({ isWorldBuilt, isAlive } = {}) {
  useEffect(() => {
    const id = setInterval(() => {
      // Re-read every guard each tick (cheap) so pause/resume tracks live state.
      if (!isWorldBuilt) return;
      if (!getInput().active) return;
      if (isAlive === false) return;
      if (isCaptureMode()) return;
      useGameStore.getState().setGameTime((t) => t + GAME_UNITS_PER_SECOND);
    }, 1000);
    return () => clearInterval(id);
  }, [isWorldBuilt, isAlive]);
}
