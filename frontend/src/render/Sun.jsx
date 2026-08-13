import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { moodRef, sampleMood } from './mood';

// Sun -- the sky sun billboard: tracks the camera at a fixed distance along the per-mood sun direction
// + recolours from the mood grade each frame. Extracted VERBATIM from GameScene.jsx (v6 de-monolith
// A2.1); behavior unchanged. moodRef/sampleMood are the shared mood source (render/mood.js).
export const Sun = ({ onReady }) => {
  const ref = useRef();
  const { camera } = useThree();
  const _dir = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => { if (ref.current) onReady(ref.current); }, [onReady]);
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = sampleMood(moodRef.current);
    _dir.set(m.sunPos[0], m.sunPos[1], m.sunPos[2]).normalize();
    mesh.position.copy(camera.position).addScaledVector(_dir, 380);
    mesh.material.color.copy(m.sun);
  });
  // THE SUN IS A SKY ELEMENT AND MUST DRAW LIKE ONE — depth-independent, with the dome.
  //
  // It used to take THREE's defaults (depthTest and depthWrite BOTH true) while the sky dome one file
  // over runs `depthWrite: false, depthTest: false, renderOrder: -1`. That inconsistency was invisible
  // for as long as the composer's depth buffer was malformed, and `postprocessing` 6.39.3 fixed exactly
  // that ("EffectComposer: fix depth buffer format mismatch when depth-aware passes are added after the
  // composer has already rendered"). On the upgrade the sun DISAPPEARED from the sky — confirmed in two
  // independent gated frames (spell-arcane, spell-lightning) by edge-step analysis and then by eye at 5x
  // zoom. The library change was correct; this mesh was relying on the bug.
  //
  // A sun billboard tracking the camera at a fixed 380 units is not scene geometry: nothing may occlude
  // it and it must never occlude anything. Writing depth is therefore wrong on its own terms, and
  // testing depth makes it hostage to whatever the composer's depth attachment happens to contain. It
  // now matches the dome, and `renderOrder: -1` keeps it in the sky layer.
  //
  // GodRays is unaffected: it takes this mesh as its light SOURCE and builds occlusion from the SCENE
  // depth in its own pass, so terrain still occludes the rays. What changes is only that the disc itself
  // always renders.
  return (
    <mesh ref={ref} frustumCulled={false} renderOrder={-1}>
      <sphereGeometry args={[13, 28, 28]} />
      <meshBasicMaterial color="#FFFAF0" toneMapped={false} fog={false} depthTest={false} depthWrite={false} />
    </mesh>
  );
};
