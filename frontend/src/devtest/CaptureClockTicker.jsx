import { useFrame } from '@react-three/fiber';
import { advanceCaptureFrame } from './captureClock.js';

/**
 * Drives the deterministic capture clock. Mount ONCE inside every R3F `<Canvas>` — the double-count is
 * already handled: `advanceCaptureFrame` dedupes on `document.timeline.currentTime`, so N canvases in the
 * same animation frame still produce exactly one tick.
 *
 * Priority -10000 so it runs BEFORE every other `useFrame` in that canvas. R3F sorts callbacks by
 * ascending priority, so a consumer reading `captureElapsed()` this frame must not read the previous
 * frame's value. Negative and not positive: any priority > 0 switches R3F to a manual render loop and
 * would silently stop the canvas from drawing itself.
 *
 * Renders nothing, and is inert outside capture mode — `advanceCaptureFrame` returns immediately when
 * `isCaptureMode()` is false, so a real player pays one function call per frame and nothing else.
 */
export function CaptureClockTicker() {
  useFrame(() => advanceCaptureFrame(), -10000);
  return null;
}
