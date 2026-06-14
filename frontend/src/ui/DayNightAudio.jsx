import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/useGameStore';
import { useGameSounds } from '../SoundManager';

/**
 * DayNightAudio — the one-shot AUDIO punctuation for the day/night TRANSITION beats (pairs with the
 * SurvivalWarning banner + the gradual DAY/NIGHT music shift). On day->night it sounds an ominous siege
 * HORN (the night siege begins — the beat the onboarding nudge promises); on night->day a bright dawn
 * CHIME (you survived). Mirrors HeartbeatAudio/UISounds: a tiny store-watcher that fires a sound on a
 * low-frequency edge (a reactive read on isDay -> Game-Loop-safe). No sound on mount (the ref seeds to the
 * initial phase). Capture-safe: the clock is frozen under capture so isDay never flips -> this never fires;
 * audio is null there anyway; the component renders nothing.
 */
export default function DayNightAudio() {
  const isDay = useGameStore((s) => s.isDay);
  const { playSiegeHorn, playDawnChime } = useGameSounds();
  const prevIsDay = useRef(isDay);

  useEffect(() => {
    if (prevIsDay.current === isDay) return;          // identity-churn re-runs are no-ops (no edge)
    if (prevIsDay.current && !isDay) playSiegeHorn?.();      // day -> night: the siege begins
    else if (!prevIsDay.current && isDay) playDawnChime?.(); // night -> day: you survived
    prevIsDay.current = isDay;
  }, [isDay, playSiegeHorn, playDawnChime]);

  return null;
}
