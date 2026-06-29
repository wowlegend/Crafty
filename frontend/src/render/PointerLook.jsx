import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useGameStore } from '../store/useGameStore';
import { attachPointerLook } from '../input/pointerLook';

// PointerLook -- mounts the desktop pointer-lock camera-look handler (attachPointerLook) while playing;
// disabled in capture mode + renders nothing (returns null). Extracted VERBATIM from GameScene.jsx
// (v6 de-monolith A2.4); behavior unchanged. Pixel-irrelevant (no render, capture-disabled).
export function PointerLook() {
  const camera = useThree((s) => s.camera);
  const isCaptureMode = useGameStore((s) => s.isCaptureMode);
  useEffect(() => {
    if (isCaptureMode || !camera) return undefined;
    return attachPointerLook({ camera, getSensitivity: () => useGameStore.getState().lookSensitivity });
  }, [camera, isCaptureMode]);
  return null;
}
