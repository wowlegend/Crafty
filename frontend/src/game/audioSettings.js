/**
 * Audio settings: map a 0..1 volume slider (and an optional mute) onto a WebAudio GainNode value.
 * muted -> 0; else the clamped volume. Pure + RNG-free. The SoundManager applies
 * audioGain(sfxVolume, masterMuted) to the master-bus input gain; the MusicPlayer (S3b) reuses it for
 * the music element volume.
 */
export function audioGain(volume, muted = false) {
  if (muted) return 0;
  return Math.max(0, Math.min(1, volume));
}
