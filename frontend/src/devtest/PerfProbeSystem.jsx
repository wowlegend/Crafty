import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { isPerfProbe, perfScenarioId, consumeHurl } from './perfProbe';
import { SCENARIOS } from './perfScenarios';
import { requestHurl } from '../game/hurlChannel';

/**
 * PerfProbeSystem — S2-B2-M2/M3 scenario E (dev probe; GameScene mounts it inside <Physics>):
 * a thin probe-to-gameplay ADAPTER. On each scheduled probe tick it fires a REAL hurl through the
 * gameplay hurlChannel (consumed by HurlSystem — the SHIPPED substepped flight + impact path),
 * so scenario E measures the M3 hurl as built, not a stand-in. (Pre-M3 this component carried a
 * 3-body Rapier dynamic pool — replaced at the M3 close-out per the recorded M2 re-gate item.)
 * Renders nothing; transient reads only (Game-Loop-Isolation); zero voxel/worker seams (gated).
 */
export function PerfProbeSystem() {
  const { camera } = useThree();

  // Computed OUTSIDE the callback so the SUBSCRIPTION is unconditional — useFrame runs at hook-call time,
  // before any return could gate it — while the WORK is conditional. The old code tried to gate a side
  // effect through the render output: `if (!active) return null;` immediately above `return null;`, two
  // identical arms, which is not a control surface for a component that renders nothing either way.
  const active = Boolean(isPerfProbe() && SCENARIOS[perfScenarioId()]?.hurl);

  useFrame(() => {
    if (!active) return;      // BEFORE consuming, so an inactive scenario neither fires nor drains the flag
    if (!consumeHurl()) return;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const origin = camera.position.clone().add(dir.clone().multiplyScalar(1.2));
    requestHurl({ x: origin.x, y: origin.y, z: origin.z }, { x: dir.x, y: dir.y, z: dir.z }, '#A9966E');
  });

  return null;
}
