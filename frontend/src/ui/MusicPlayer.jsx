import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/useGameStore';
import { useShallow } from 'zustand/react/shallow';
import { useSounds } from '../SoundManager';
import { isCaptureMode } from '../devtest/captureMode';
import { onUserGesture } from '../audio/audioRecovery.js';

// ElevenLabs-generated background music (replaces the muted procedural pad/arp — PROC_MUSIC_GAIN=0 in
// SoundManager). Picks the track by context (boss > night/day) and SMOOTH-crossfades between them.
// musicEnabled-gated; capture-safe (no playback under capture -> visual frames unaffected); renders nothing.
const VOL = 0.4;
// The crossfade's slope, in level per second: 0.04 every 60 ms, the step the fade has always taken.
const FADE_PER_SEC = 0.04 / 0.06;
const TRACKS = { day: '/music/day.mp3', night: '/music/night.mp3', boss: '/music/boss.mp3' };

// A refusal is the autoplay policy, which the next gesture answers; anything else is a track that cannot play.
const onPlayError = (e) => {
  if (e?.name !== 'NotAllowedError' && e?.name !== 'AbortError') console.warn('Music track failed to play:', e);
};
const playTrack = (t) => { const p = t.el.play(); if (p) p.catch(onPlayError); };

export default function MusicPlayer() {
  const { isDay, bossActive, musicVolume, masterMuted } = useGameStore(useShallow((s) => ({
    isDay: s.isDay, bossActive: s.bossActive, musicVolume: s.musicVolume ?? 1, masterMuted: s.masterMuted || false,
  })));
  const { musicEnabled, audioContext } = useSounds();
  const tracksRef = useRef(null);
  const wantRef = useRef(null);
  const fadeRef = useRef(null);

  // The tracks sound through the shared AudioContext, each through its own GainNode, which is where the fade, the
  // music slider and Mute All act. A media element's own volume is not a control on an iPhone: WebKit locks it on a
  // small screen and reads back 1 (HTMLMediaElement::setVolume), so a fade written there would play at full volume and
  // Mute All could not silence it. Each GainNode feeds the speakers directly, beside the effects' master bus and its
  // limiter, where the media elements' own output went: the levels and the balance are the ones Kevin set.
  useEffect(() => {
    // This guard is at MOUNT, and capture is enabled AFTER boot by a test-bridge hook that installs in a later
    // effect -- so it has always read false and has never once suppressed anything. It is kept, because it is correct
    // for the case where capture is entered before this mounts. What makes the suppression REAL is the check inside the
    // playback effect below, which runs on every state change.
    if (isCaptureMode() || !audioContext) return undefined;
    const tracks = {};
    for (const [key, src] of Object.entries(TRACKS)) {
      const el = new Audio(src);
      el.loop = true; el.preload = 'auto';
      const source = audioContext.createMediaElementSource(el);
      const gain = audioContext.createGain();
      gain.gain.value = 0;
      source.connect(gain); gain.connect(audioContext.destination);
      tracks[key] = { el, source, gain, target: 0, primed: false };
    }
    tracksRef.current = tracks;
    // A play() refused outside a gesture (iOS, and a first visit in Chrome) is asked for again inside the next one, the
    // Start tap included. The same gesture plays and pauses each other track once, because WebKit lifts an element's
    // gesture restriction when it is played inside one (HTMLMediaElement::play), so a later dusk or boss crossfade can
    // start its track from a timer. A permitted play() clears `paused` before it returns and a refused one leaves it set
    // (HTML, the play() method), so an event that carries no activation, a finger's pointerdown, primes nothing.
    const offGesture = onUserGesture(() => {
      for (const [key, t] of Object.entries(tracks)) {
        const wanted = key === wantRef.current;
        if (!t.el.paused || (t.primed && !wanted)) continue;
        playTrack(t);
        if (!t.el.paused) t.primed = true;
        if (!wanted) t.el.pause();
      }
    });
    return () => {
      offGesture();
      clearTimeout(fadeRef.current);
      fadeRef.current = null;
      for (const t of Object.values(tracks)) { t.el.pause(); t.source.disconnect(); t.gain.disconnect(); }
      tracksRef.current = null;
    };
  }, [audioContext]);

  useEffect(() => {
    const tracks = tracksRef.current;
    if (isCaptureMode() || !tracks) return;
    // M3 #3 S3b: the wanted track's level is the music-volume slider * VOL; Mute All wants no track at all.
    const key = !musicEnabled || masterMuted ? null : bossActive ? 'boss' : isDay ? 'day' : 'night';
    wantRef.current = key;
    if (key && tracks[key].el.paused) playTrack(tracks[key]);
    // Smooth crossfade: every track's gain ramps from where it is toward its target (VOL * slider for the wanted track, 0
    // for the rest) at FADE_PER_SEC, on the audio clock, so a busy main thread cannot stretch it; once the longest ramp
    // has run, one timer pauses every track whose target is 0.
    const now = audioContext.currentTime;
    let longest = 0;
    for (const [k, t] of Object.entries(tracks)) {
      t.target = k === key ? VOL * musicVolume : 0;
      const from = t.gain.gain.value;
      const secs = Math.abs(t.target - from) / FADE_PER_SEC;
      t.gain.gain.cancelScheduledValues(now);
      t.gain.gain.setValueAtTime(from, now);
      t.gain.gain.linearRampToValueAtTime(t.target, now + secs);
      longest = Math.max(longest, secs);
    }
    clearTimeout(fadeRef.current);
    fadeRef.current = setTimeout(() => {
      fadeRef.current = null;
      for (const t of Object.values(tracks)) if (t.target === 0 && !t.el.paused) t.el.pause();
    }, longest * 1000);
  }, [isDay, bossActive, musicEnabled, musicVolume, masterMuted, audioContext]);

  return null;
}
