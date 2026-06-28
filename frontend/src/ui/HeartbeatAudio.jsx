import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/useGameStore';
import { useGameSounds } from '../SoundManager';
import { lowHealthIntensity, heartbeatPeriod } from '../game/lowHealth';

/**
 * HeartbeatAudio — the AUDIO half of the low-health danger cue (pairs with LowHealthVignette). While the
 * player's health is critical (< 35% of max) a soft low "lub-dub" repeats, quickening as HP falls toward 0.
 * The interval is keyed on a QUANTIZED intensity bucket so it only re-arms on a meaningful change (not
 * every HP point) — a reactive store read on a low-frequency field (Game-Loop-safe, like UISounds). At
 * safe HP -> no interval (silent). Capture-safe: audio is null under capture + the player is full HP there.
 */
export default function HeartbeatAudio() {
  const health = useGameStore((s) => s.playerHealth);
  const maxHealth = useGameStore((s) => s.maxHealth);
  const { playHeartbeat } = useGameSounds();
  // useGameSounds returns a fresh object each render, so playHeartbeat's identity churns every render.
  // Read it through a ref so the interval effect can depend on [bucket] ALONE (re-arm only on a real
  // danger-bucket change, the quantization's intent) instead of restarting on every HP tick.
  const playRef = useRef(playHeartbeat);
  playRef.current = playHeartbeat;
  const intensity = lowHealthIntensity(health, maxHealth);
  const bucket = intensity > 0 ? Math.ceil(intensity * 4) : 0; // 0..4

  useEffect(() => {
    if (bucket <= 0) return undefined;
    const period = heartbeatPeriod(bucket / 4); // representative intensity for this bucket
    playRef.current?.(); // an immediate beat on entering / escalating danger
    const id = setInterval(() => playRef.current?.(), period * 1000);
    return () => clearInterval(id);
  }, [bucket]);

  return null;
}
