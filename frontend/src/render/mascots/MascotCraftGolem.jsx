// Mascot direction C — "Craft-Golem": a friendly creature visibly BUILT from the world's
// own voxel blocks (grass / stone / crystal cubes), with a glowing rune-core in its chest.
// The "made of the world" identity — block faces stay distinct (mixed materials per cube),
// silhouette stays chunky + readable. Shared toon material + rim + inverted-hull outline.
//
// ROUGH directional reference only (silhouette + identity + vibe), NOT final art.
import { Cube, Emissive, Ink } from './voxelKit';

// World-block palette (from the explore tokens) — the golem is assembled from these.
const GRASS = '#7FB85E';
const GRASS_HI = '#74C07E';
const ROCK = '#C2A06A';
const ROCK_SH = '#8A6B41';
const STONE = '#9AA0AA';
const CRYSTAL = '#46E0FF';   // crystal-cube accents
const CORE = '#7FE0A0';      // nature-green rune-core (the chest heart)

export function MascotCraftGolem() {
  // Centered at origin; ~2.7 tall. Big-shouldered blocky golem: heavy torso of mixed
  // world-cubes, stubby legs, chunky arms, a small stone head + glowing rune-core chest.
  return (
    <group position={[0, -0.2, 0]}>
      {/* --- Legs (stubby stone+rock stumps) --- */}
      <Cube position={[-0.42, -0.95, 0]} size={[0.6, 0.7, 0.62]} color={ROCK_SH} />
      <Cube position={[0.42, -0.95, 0]} size={[0.6, 0.7, 0.62]} color={STONE} />
      <Cube position={[-0.42, -1.35, 0.06]} size={[0.66, 0.22, 0.7]} color={ROCK} />{/* foot */}
      <Cube position={[0.42, -1.35, 0.06]} size={[0.66, 0.22, 0.7]} color={ROCK} />

      {/* --- Torso — a stack of distinct world-block cubes (grass on top, stone/rock below) --- */}
      <Cube position={[-0.4, -0.15, -0.05]} size={[0.7, 0.78, 0.74]} color={ROCK} />
      <Cube position={[0.42, -0.15, -0.05]} size={[0.72, 0.78, 0.74]} color={STONE} />
      <Cube position={[0.0, -0.1, 0.05]} size={[0.7, 0.9, 0.7]} color={ROCK_SH} />
      {/* Grass-capped shoulders (the "world surface" growing on the golem) */}
      <Cube position={[-0.55, 0.45, 0]} size={[0.74, 0.42, 0.78]} color={GRASS} />
      <Cube position={[0.55, 0.45, 0]} size={[0.74, 0.42, 0.78]} color={GRASS_HI} />
      <Cube position={[0.0, 0.5, 0]} size={[0.7, 0.34, 0.66]} color={GRASS} />{/* chest-top grass */}

      {/* --- Glowing rune-core in the chest (the heart) --- */}
      <Cube position={[0, 0.05, 0.34]} size={[0.5, 0.5, 0.18]} color="#1B3A2A" outline={0} />{/* recessed dark socket */}
      <Emissive position={[0, 0.05, 0.42]} size={[0.34, 0.34, 0.12]} color={CORE} intensity={3.0} />
      <Emissive position={[0, 0.05, 0.46]} size={[0.14, 0.14, 0.1]} color="#FFFFFF" intensity={3.2} />
      {/* Crystal shards embedded around the core */}
      <Emissive position={[-0.42, 0.1, 0.36]} size={[0.12, 0.2, 0.12]} color={CRYSTAL} intensity={2.6} />
      <Emissive position={[0.42, 0.1, 0.36]} size={[0.12, 0.2, 0.12]} color={CRYSTAL} intensity={2.6} />

      {/* --- Chunky arms (heavy stone fists) --- */}
      <Cube position={[-1.05, 0.1, 0]} size={[0.46, 0.95, 0.5]} color={STONE} />
      <Cube position={[1.05, 0.1, 0]} size={[0.46, 0.95, 0.5]} color={ROCK} />
      <Cube position={[-1.08, -0.55, 0.04]} size={[0.58, 0.5, 0.6]} color={ROCK_SH} />{/* fist */}
      <Cube position={[1.08, -0.55, 0.04]} size={[0.58, 0.5, 0.6]} color={ROCK_SH} />
      {/* A crystal cube clutched in one fist (carrying a piece of the world) */}
      <Emissive position={[1.08, -0.55, 0.4]} size={[0.22, 0.22, 0.22]} color={CRYSTAL} intensity={2.4} />

      {/* --- Small stone head (kept small so the body mass dominates the silhouette) --- */}
      <Cube position={[0, 1.0, 0.02]} size={[0.7, 0.62, 0.66]} color={STONE} />
      <Cube position={[0, 1.28, 0]} size={[0.5, 0.2, 0.5]} color={GRASS} />{/* grass tuft "hair" */}
      {/* Friendly glowing eyes (cyan creature-eye, on-brand) */}
      <Emissive position={[-0.17, 1.02, 0.34]} size={[0.18, 0.2, 0.1]} color={CRYSTAL} intensity={2.4} />
      <Emissive position={[0.17, 1.02, 0.34]} size={[0.18, 0.2, 0.1]} color={CRYSTAL} intensity={2.4} />
      <Ink position={[-0.16, 1.0, 0.4]} size={[0.08, 0.1, 0.06]} />
      <Ink position={[0.16, 1.0, 0.4]} size={[0.08, 0.1, 0.06]} />
    </group>
  );
}
