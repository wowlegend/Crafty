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

  useFrame(() => {
    if (!consumeHurl()) return;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const origin = camera.position.clone().add(dir.clone().multiplyScalar(1.2));
    requestHurl({ x: origin.x, y: origin.y, z: origin.z }, { x: dir.x, y: dir.y, z: dir.z }, '#A9966E');
  });

  const active = isPerfProbe() && SCENARIOS[perfScenarioId()] && SCENARIOS[perfScenarioId()].hurl;
  if (!active) return null;
  return null;
}
