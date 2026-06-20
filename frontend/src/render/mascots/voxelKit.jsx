// Shared voxel-mascot kit: the two render primitives every mascot direction reuses, so
// all three render with the EXACT same character look (toon body + fresnel rim + drei
// inverted-hull outline at screen-px thickness, matching how mobs render in
// SimplifiedNPCSystem). Keeping them here makes the three mascot files apples-to-apples.
import { forwardRef } from 'react';
import { Outlines } from '@react-three/drei';
import { MobToonMaterial } from '../MobToonMaterial';
import { OUTLINE, RIM } from '../characterStyle';

const OUTLINE_T = OUTLINE.mob.thickness;
const RIM_S = RIM.strength;

// A toon voxel cube — one <mesh> = one cube, with the shared 2-band toon material +
// rim + the inverted-hull outline. `size` is a scalar or [w,h,d].
export function Cube({ position, rotation, size = 1, color, rim = RIM_S, outline = OUTLINE_T, ...props }) {
  const s = Array.isArray(size) ? size : [size, size, size];
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow {...props}>
      <boxGeometry args={s} />
      <MobToonMaterial color={color} rimStrength={rim} />
      {outline > 0 && <Outlines thickness={outline} color={OUTLINE.color} toneMapped={false} />}
    </mesh>
  );
}

// An emissive cube (eyes / runes / embers / crystal) — toneMapped=false + emissive so it
// picks up the studio's emissive-only bloom for a glow read. No outline (it's a light source).
// forwardRef so callers can mutate the mesh/material (e.g. an idle glow pulse on a staff gem).
export const Emissive = forwardRef(function Emissive(
  { position, rotation, size = 0.18, color = '#46E0FF', intensity = 2.6 },
  ref
) {
  const s = Array.isArray(size) ? size : [size, size, size];
  return (
    <mesh ref={ref} position={position} rotation={rotation}>
      <boxGeometry args={s} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={intensity} toneMapped={false} />
    </mesh>
  );
});

// A flat dark "ink" cube for pupils — no rim/outline, pure silhouette accent.
export function Ink({ position, size = 0.16 }) {
  const s = Array.isArray(size) ? size : [size, size, size];
  return (
    <mesh position={position}>
      <boxGeometry args={s} />
      <meshBasicMaterial color={OUTLINE.color} toneMapped={false} />
    </mesh>
  );
}
