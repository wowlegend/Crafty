import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/useGameStore';
import { useShallow } from 'zustand/react/shallow';
import { useSounds } from '../SoundManager';
import { isCaptureMode } from '../devtest/captureMode';

// ElevenLabs-generated background music (replaces the muted procedural pad/arp — PROC_MUSIC_GAIN=0 in
// SoundManager). Picks the track by context (boss > night/day) and SMOOTH-crossfades between them.
// musicEnabled-gated; capture-safe (no playback under capture -> visual frames unaffected); renders nothing.
const VOL = 0.4;

export default function MusicPlayer() {
  const { isDay, bossActive } = useGameStore(useShallow((s) => ({ isDay: s.isDay, bossActive: s.bossActive })));
  const { musicEnabled } = useSounds();
  const refs = useRef(null);
  const fadeRef = useRef(null);

  useEffect(() => {
    if (isCaptureMode()) return undefined;
    const mk = (src) => { const a = new Audio(src); a.loop = true; a.volume = 0; a.preload = 'auto'; return a; };
    refs.current = { day: mk('/music/day.mp3'), night: mk('/music/night.mp3'), boss: mk('/music/boss.mp3') };
    return () => {
      if (fadeRef.current) clearInterval(fadeRef.current);
      const r = refs.current; if (r) Object.values(r).forEach((a) => a.pause());
      refs.current = null;
    };
  }, []);

  useEffect(() => {
    if (isCaptureMode() || !refs.current) return;
    const r = refs.current;
    const key = !musicEnabled ? null : bossActive ? 'boss' : isDay ? 'day' : 'night';
    if (key) r[key].play?.().catch(() => {}); // autoplay may defer until a gesture; harmless
    // Smooth crossfade: each tick nudge every track's volume toward its target (VOL for the active key,
    // 0 for the rest); pause a track once it reaches 0; stop the timer when all have settled.
    if (fadeRef.current) clearInterval(fadeRef.current);
    fadeRef.current = setInterval(() => {
      let settled = true;
      for (const [k, a] of Object.entries(r)) {
        const target = k === key ? VOL : 0;
        const d = target - a.volume;
        if (Math.abs(d) < 0.02) { a.volume = target; if (target === 0) a.pause(); }
        else { a.volume = Math.max(0, Math.min(1, a.volume + Math.sign(d) * 0.04)); settled = false; }
      }
      if (settled) { clearInterval(fadeRef.current); fadeRef.current = null; }
    }, 60);
  }, [isDay, bossActive, musicEnabled]);

  return null;
}
