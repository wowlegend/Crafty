import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { skyFrameRef } from './mood';
import { lookbookPassesOff } from './lookbookState.js';

// Sun -- the sky sun billboard (and therefore the GodRays light source): tracks the camera at a fixed distance along
// the SUN's direction and takes the sun's colour, both from the one sky frame <Atmosphere> publishes each frame
// (render/mood.js skyFrameRef).
//
// It follows the frame's `sunDir` (the arc) and hides once the sun is below the horizon. Its colour is `sunColor`, the
// SUN's, never `keyColor`: the billboard is visible while the sun's y > -0.05 (s > -0.093), but the key light is the
// moon for every s < 0, so reading the key would paint the sun the moon's colour in that window.
const SUN_HIDE_Y = -0.05;

export const Sun = ({ onReady }) => {
  const ref = useRef();
  const { camera } = useThree();
  const _dir = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => { if (ref.current) onReady(ref.current); }, [onReady]);
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const f = skyFrameRef.current; // the published copy: read, never retained across frames
    _dir.fromArray(f.sunDir);
    mesh.visible = _dir.y > SUN_HIDE_Y && !lookbookPassesOff().has('sun');
    mesh.position.copy(camera.position).addScaledVector(_dir, 380);
    mesh.material.color.copy(f.sunColor);
  });
  return (
    <mesh ref={ref} frustumCulled={false}>
      <sphereGeometry args={[13, 28, 28]} />
      <meshBasicMaterial color="#FFFAF0" toneMapped={false} fog={false} />
    </mesh>
  );
};
