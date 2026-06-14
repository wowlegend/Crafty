import { motion } from 'framer-motion';
import { useGameStore } from '../store/useGameStore';
import { isCaptureMode } from '../devtest/captureMode';
import { lowHealthIntensity } from '../game/lowHealth';

/**
 * LowHealthVignette — the survival-legibility DANGER cue: a red edge vignette that fades IN + PULSES as
 * the player's health goes critical (< 35% of max), intensifying + pulsing faster toward 0 HP, so danger
 * is FELT continuously (distinct from the per-hit DamageOverlay flash + the directional DamageDirection
 * glow). Pure intensity from game/lowHealth. At safe HP -> intensity 0 -> renders NOTHING; the capture
 * player is full HP, so every gated frame stays byte-identical (no fixture, like the camera-kick). Mounted
 * in the HUD; zIndex below DamageDirection (38) so a directional hit-glow still layers over it.
 */
export default function LowHealthVignette() {
  const health = useGameStore((s) => s.playerHealth);
  const maxHealth = useGameStore((s) => s.maxHealth);
  const intensity = lowHealthIntensity(health, maxHealth);
  if (intensity <= 0) return null; // safe HP (and all capture frames) -> nothing

  const peak = 0.16 + 0.55 * intensity; // edge opacity scales with how-critical
  const bg = 'radial-gradient(ellipse 78% 78% at 50% 50%, transparent 48%, rgba(198,18,26,0.9) 100%)';
  const base = { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 37, background: bg };

  // Capture-determinism: if ever captured (a low-HP fixture), hold a fixed opacity (no animated pulse).
  if (isCaptureMode()) return <div style={{ ...base, opacity: peak }} />;

  // In play: pulse the opacity; faster + deeper toward 0 HP (a quickening heartbeat).
  const period = 1.4 - 0.7 * intensity;
  return (
    <motion.div
      style={base}
      animate={{ opacity: [peak * 0.5, peak, peak * 0.5] }}
      transition={{ duration: period, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}
