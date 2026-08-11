import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Emissive } from './mascots/voxelKit';
import { isCaptureMode } from '../devtest/captureMode';

/**
 * An `Emissive` that hides itself under capture, RE-EVALUATED EVERY FRAME.
 *
 * WHY THIS EXISTS. `isCaptureMode()` is a mutable module-level flag with no subscription channel, so
 * reading it in a RENDER BODY — `{!isCaptureMode() && <Emissive .../>}` — makes the guard a function of
 * when React last rendered that component, not of the flag's value. HubRender's buildings are static:
 * they take no props, nothing above them changes, and they mount long before the harness calls
 * `enterCapture`. So they render once, with the flag false, and the forge fire and lookout lantern
 * shipped straight into the deterministic baselines that the guard existed to keep them out of.
 *
 * `useFrame` is the subscription the flag does not have. The mesh is mounted unconditionally and its
 * `visible` is written every frame, so the guard tracks the flag rather than the render schedule.
 *
 * DELIBERATELY ITS OWN MODULE, not an addition to `voxelKit`. Several gates mock voxelKit wholesale, and
 * a component living there would be replaced by `undefined` in those tests — which makes a gate
 * unbuildable rather than red, and an unbuildable gate is indistinguishable from a passing one.
 */
export function CaptureNullGlow(props) {
  const ref = useRef(null);
  useFrame(() => {
    if (ref.current) ref.current.visible = !isCaptureMode();
  });
  return <Emissive ref={ref} {...props} />;
}
