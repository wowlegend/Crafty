// FrameStall — DEV-only synthetic slow frames (plan docs/superpowers/plans/2026-10-27-crafty-steady-cool.md, item d).
// The tier-governor e2e injects a busy-wait into every frame to drive PerformanceMonitor below its bounds, the way a
// GPU-bound device would, and removes it to let the monitor see headroom again. Mounted only under import.meta.env.DEV
// by GameScene; it does nothing until the hook sets a stall.
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { registerTestHook } from './testBridge.js';

export function FrameStall() {
  const stallMs = useRef(0);
  useEffect(() => {
    registerTestHook('injectFrameStall', (ms) => { stallMs.current = Math.max(0, Number(ms) || 0); });
  }, []);
  useFrame(() => {
    if (!(stallMs.current > 0)) return;
    const until = performance.now() + stallMs.current;
    while (performance.now() < until) { /* busy-wait: a frame that costs stallMs */ }
  });
  return null;
}
