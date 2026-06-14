import { useEffect } from 'react';
import { useGameStore } from '../store/useGameStore';
import { Toast } from './primitives/index.js';
import { isCaptureMode } from '../devtest/captureMode';

/**
 * AspectHintToast -- the just-in-time Aspect-unlock teaching toast. Shows store.aspectHint (set on the
 * FIRST unlock of an Aspect verb-talent, e.g. "WILDHEART unlocked -- press R to roar") for ~5s, then
 * auto-clears it. Teaches the signature verb AT the moment of unlock (the cheatsheet is an easy-to-miss
 * corner reference). Capture-safe: aspectHint is null in capture (no unlocks in the captured states)
 * -> renders nothing -> the 18 baselines are unaffected.
 */
export default function AspectHintToast() {
  const hint = useGameStore((s) => s.aspectHint);
  const setAspectHint = useGameStore((s) => s.setAspectHint);
  useEffect(() => {
    if (!hint) return;
    const id = setTimeout(() => setAspectHint(null), 5000);
    return () => clearTimeout(id);
  }, [hint, setAspectHint]);
  if (!hint || isCaptureMode()) return null;
  return (
    <div style={{ position: 'fixed', top: '14%', left: '50%', transform: 'translateX(-50%)', zIndex: 60, pointerEvents: 'none' }}>
      <Toast status="success">{hint}</Toast>
    </div>
  );
}
