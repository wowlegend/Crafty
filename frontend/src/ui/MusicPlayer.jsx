import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/useGameStore';
import { useSounds } from '../SoundManager';
import { isCaptureMode } from '../devtest/captureMode';

// ElevenLabs-generated background music (replaces the muted procedural pad/arp — PROC_MUSIC_GAIN=0 in
// SoundManager). Swaps the day<->night track by phase. musicEnabled-gated; capture-safe (no playback under
// capture -> visual frames unaffected); renders nothing. Boss track + smooth crossfade are follow-ups.
const VOL = 0.4;

export default function MusicPlayer() {
  const isDay = useGameStore((s) => s.isDay);
  const { musicEnabled } = useSounds();
  const refs = useRef(null);

  useEffect(() => {
    if (isCaptureMode()) return undefined;
    const mk = (src) => { const a = new Audio(src); a.loop = true; a.volume = 0; a.preload = 'auto'; return a; };
    refs.current = { day: mk('/music/day.mp3'), night: mk('/music/night.mp3') };
    return () => { const r = refs.current; if (r) { r.day.pause(); r.night.pause(); } refs.current = null; };
  }, []);

  useEffect(() => {
    if (isCaptureMode() || !refs.current) return;
    const { day, night } = refs.current;
    if (!musicEnabled) { day.pause(); night.pause(); return; }
    const on = isDay ? day : night;
    const off = isDay ? night : day;
    off.pause(); off.volume = 0;
    on.volume = VOL;
    on.play?.().catch(() => {}); // autoplay may defer until the next gesture; harmless
  }, [isDay, musicEnabled]);

  return null;
}
