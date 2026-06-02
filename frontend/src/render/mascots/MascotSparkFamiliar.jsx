// Mascot direction A — "Spark Familiar": a small FLOATING voxel elemental companion.
// Chunky orb/wisp body, big expressive eyes, a subtle ember/spark aura. The friendly
// buddy lead. Built from grouped voxel cubes wearing the shared toon material + fresnel
// rim + drei <Outlines> (screen-px thickness), so it reads on-brand with the game's mobs.
//
// ROUGH directional reference only (silhouette + identity + vibe), NOT final art. All
// RNG is seeded in capture so the studio frame is byte-stable.
import { Cube, Emissive, Ink, RIM_S } from './voxelKit';
import { isCaptureMode, makeSeededRandom } from '../../devtest/captureMode';

const FIRE = '#FF7A3C';
const CYAN = '#46E0FF';

export function MascotSparkFamiliar() {
  // Seeded, order-independent spark layout (capture) -> a deterministic ember halo.
  const rnd = isCaptureMode() ? makeSeededRandom('mascot-a-sparks') : Math.random;
  const sparks = [];
  for (let i = 0; i < 9; i++) {
    const ang = (i / 9) * Math.PI * 2 + rnd() * 0.4;
    const r = 0.95 + rnd() * 0.35;
    const y = 0.2 + (rnd() - 0.5) * 1.4;
    sparks.push({ pos: [Math.cos(ang) * r, y, Math.sin(ang) * r * 0.7], size: 0.1 + rnd() * 0.12 });
  }

  // Centered at origin; ~2.2 tall. Floating cue: no legs, a tapering tail-wisp under the
  // orb body, and a hover gap (the whole group sits above y=0).
  return (
    <group position={[0, 0.35, 0]}>
      {/* Orb body — chunky stepped voxel sphere (the dominant silhouette mass) */}
      <Cube position={[0, 0.0, 0]} size={[1.5, 1.35, 1.3]} color="#46E0FF" />
      <Cube position={[0, 0.78, 0]} size={[1.05, 0.7, 0.95]} color="#6FD8FF" />
      <Cube position={[0, -0.7, 0]} size={[1.0, 0.55, 0.85]} color="#2FB6E0" />
      {/* Side cheek puffs -> a rounder, friendlier read at thumbnail scale */}
      <Cube position={[-0.85, 0.05, 0]} size={[0.45, 0.7, 0.7]} color="#3FC4E8" />
      <Cube position={[0.85, 0.05, 0]} size={[0.45, 0.7, 0.7]} color="#3FC4E8" />

      {/* Big expressive eyes — bright emissive, the #1 appeal cue for an 8-yo */}
      <Emissive position={[-0.34, 0.28, 0.7]} size={[0.34, 0.42, 0.18]} color="#FFFFFF" intensity={2.2} />
      <Emissive position={[0.34, 0.28, 0.7]} size={[0.34, 0.42, 0.18]} color="#FFFFFF" intensity={2.2} />
      <Ink position={[-0.3, 0.24, 0.82]} size={[0.16, 0.2, 0.08]} />
      <Ink position={[0.3, 0.24, 0.82]} size={[0.16, 0.2, 0.08]} />

      {/* Ember crown — fire chips on top, the elemental "spark" identity */}
      <Emissive position={[0, 1.05, 0.1]} size={[0.26, 0.34, 0.24]} color={FIRE} intensity={2.8} />
      <Emissive position={[-0.3, 0.95, -0.05]} size={[0.16, 0.22, 0.16]} color={FIRE} intensity={2.4} />
      <Emissive position={[0.32, 0.92, -0.05]} size={[0.16, 0.24, 0.16]} color={FIRE} intensity={2.4} />

      {/* Floating tail-wisp under the orb (tapering cubes -> "hovering") */}
      <Cube position={[0, -1.15, 0]} size={[0.55, 0.4, 0.5]} color="#2FB6E0" rim={RIM_S} />
      <Cube position={[0.08, -1.5, -0.02]} size={[0.3, 0.3, 0.28]} color="#2691B5" />

      {/* Ember-spark aura — the subtle orbiting halo (emissive, deterministic layout) */}
      {sparks.map((s, i) => (
        <Emissive key={i} position={s.pos} size={s.size} color={i % 3 === 0 ? CYAN : FIRE} intensity={2.6} />
      ))}
    </group>
  );
}
