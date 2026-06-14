import { motion } from 'framer-motion';
import { useGameStore } from '../store/useGameStore';
import { isCaptureMode, getCaptureOpts } from '../devtest/captureMode';

/**
 * DamageDirection -- the combat-legibility cue: a red glow at the screen edge pointing toward the most
 * recent incoming hit (store.lastHitDir.angle: 0=top, +pi/2=right, -pi/2=left, +/-pi=bottom). The glow
 * CENTRE is placed on the screen perimeter from the angle (aspect-ratio robust -- no rotation). Fades
 * ~0.8s via framer-motion in play (re-keyed per hit). Capture-determinism: under capture it renders at a
 * FIXED opacity and only when the `hitDir` capture-opt is set (the 18 normal baselines pass no opt -> null,
 * exactly like the touch overlay's showTouch). Mounted in the HUD next to DamageOverlay.
 */
export default function DamageDirection() {
  const hit = useGameStore((s) => s.lastHitDir);
  const capture = isCaptureMode();
  const angle = capture ? getCaptureOpts().hitDir : hit?.angle;
  if (angle == null) return null;

  // gradient centre on the screen perimeter: 0=top, +pi/2=right, -pi/2=left, +/-pi=bottom
  const gx = 50 + 50 * Math.sin(angle);
  const gy = 50 - 50 * Math.cos(angle);
  const bg = `radial-gradient(60% 60% at ${gx}% ${gy}%, rgba(225,32,32,0.66), rgba(220,38,38,0.2) 32%, transparent 58%)`;
  const base = { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 38, background: bg };

  if (capture) return <div style={{ ...base, opacity: 0.9 }} />;
  return (
    <motion.div
      key={hit.t}
      initial={{ opacity: 0.85 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 0.8, ease: 'easeOut' }}
      style={base}
    />
  );
}
