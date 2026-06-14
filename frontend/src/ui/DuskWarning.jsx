import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/useGameStore';
import { isCaptureMode } from '../devtest/captureMode';
import { isDuskApproaching } from '../game/dayPhase';

/**
 * DuskWarning — the actionable "night is coming" pre-warning that completes the siege loop:
 *   PREPARE (this warning) -> the siege horn + 'Night has fallen' AT nightfall -> survive -> dawn chime + reward.
 * The onboarding promises "build by day, survive the night siege", but until now nothing warned the player
 * BEFORE dusk ('Night has fallen' only fires AT the nightfall edge — too late to build defenses).
 *
 * Game-Loop-safe: gameTime changes every tick, so this POLLS on a 1s interval (a reactive subscription to
 * gameTime would re-render every frame). Fires ONE notification on the rising edge into the dusk window, then
 * re-arms once night has fallen (one warning per day). Capture-safe: no-op under capture (the clock is frozen
 * so the edge never occurs anyway) + renders nothing.
 */
export default function DuskWarning() {
  const armed = useRef(true); // ready to warn for the current day; consumed on warn, re-armed at night

  useEffect(() => {
    if (isCaptureMode()) return undefined;
    const id = setInterval(() => {
      const s = useGameStore.getState();
      if (isDuskApproaching(s.gameTime, s.isDay)) {
        if (armed.current) {
          armed.current = false;
          s.addNotification?.('Dusk approaches — night falls soon. Ready your defenses!', 'warn');
        }
      } else if (!s.isDay) {
        armed.current = true; // night has fallen -> re-arm for the next day
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return null;
}
