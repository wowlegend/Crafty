import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGameStore } from '../store/useGameStore';

// PositionTracker -- throttled (200ms) camera->store playerPosition mirror (returns null, no render ->
// pixel-irrelevant). Extracted VERBATIM from Components.jsx (v6 de-monolith A3, the first Components
// slice); behavior unchanged. The giant Player useFrame loop stays in Components.jsx (GLI risk to split).
export const PositionTracker = React.memo(() => {
  const { camera } = useThree();
  const lastUpdate = useRef(0);
  useFrame(() => {
    const now = performance.now();
    if (camera && now - lastUpdate.current > 200) {
      lastUpdate.current = now;
      useGameStore.getState().setPlayerPosition({
        x: Math.round(camera.position.x),
        y: Math.round(camera.position.y),
        z: Math.round(camera.position.z)
      });
    }
  });
  return null;
});
