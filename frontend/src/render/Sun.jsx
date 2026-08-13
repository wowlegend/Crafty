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
  return (
    <mesh ref={ref} frustumCulled={false}>
      <sphereGeometry args={[13, 28, 28]} />
      <meshBasicMaterial color="#FFFAF0" toneMapped={false} fog={false} />
    </mesh>
  );
};
