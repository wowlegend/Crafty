/**
 * Accessibility: map the OS `prefers-reduced-motion` preference onto the feedback-intensity dial.
 * When the user prefers reduced motion we return 0 (kills screenshake + hitstop juice); otherwise we
 * pass through their chosen scale, clamped to [0,1]. Pure + RNG-free -- the mount-time matchMedia
 * listener (App) feeds `mq.matches` in and writes the result to store.setJuiceIntensity.
 */
export function motionIntensity(prefersReduced, userScale = 1) {
  if (prefersReduced) return 0;
  return Math.max(0, Math.min(1, userScale));
}
