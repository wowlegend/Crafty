// denyToast.js — the throttled, capture-safe denial notifier (UX-legibility interleave, 2026-06-13).
// Wraps the pure deniedReason copy + the store's addNotification toast pipe. A single ~1s throttle
// prevents per-frame spam from the F-held cast path (Components casts every frame F is held). Capture
// guard: denial toasts NEVER fire in capture, so the visual baselines stay byte-identical (the toasts
// are the only net-new feedback on a path that does run during capture).
import { deniedReason } from '../game/deniedReason';
import { isCaptureMode } from '../devtest/captureMode';
import { useGameStore } from '../store/useGameStore';

let _lastDeniedAt = 0;

export function notifyDenied(kind, ctx) {
  if (isCaptureMode()) return;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (now - _lastDeniedAt < 1000) return;
  _lastDeniedAt = now;
  const add = useGameStore.getState().addNotification;
  if (add) add(deniedReason(kind, ctx), 'warn');
}
