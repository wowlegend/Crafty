// Mascot direction B — "Crafty Hero": a chunky toy-like apprentice-MAGE humanoid.
// Short/bulky proportions, an OVERSIZED pointy wizard hat + a staff with a glowing tip —
// an iconic silhouette that evolves the current title-screen pointy-hat placeholder.
// Built from grouped voxel cubes on the shared toon material + rim + inverted-hull outline.
//
// ROUGH directional reference only (silhouette + identity + vibe), NOT final art.
import { Cube, Emissive, Ink } from './voxelKit';

const CLOTH = '#E8C07A';      // hero cloth (warm robe), from the explore palette
const ROBE = '#2F6FAE';       // hero accent (deep blue robe + hat)
const ROBE_HI = '#3E86C8';    // lighter robe band
const SKIN = '#F0C9A0';       // face
const ARCANE = '#B36BFF';     // staff-gem magic emissive

export function MascotCraftyHero() {
  // Centered at origin; ~2.6 tall incl. hat tip. Short/bulky: wide squat body, stubby
  // limbs, a head ~40% of body width, topped by a hat TALLER than the head (iconic read).
  return (
    <group position={[0, -0.1, 0]}>
      {/* --- Bulky robed body (the squat mass) --- */}
      <Cube position={[0, 0.15, 0]} size={[1.25, 1.1, 0.9]} color={ROBE} />
      <Cube position={[0, -0.45, 0]} size={[1.45, 0.55, 1.0]} color={ROBE_HI} />{/* flared robe hem */}
      {/* Cloth front placket / sash */}
      <Cube position={[0, 0.1, 0.46]} size={[0.4, 1.0, 0.06]} color={CLOTH} />
      <Cube position={[0, -0.2, 0.5]} size={[0.7, 0.2, 0.06]} color={CLOTH} />{/* belt */}

      {/* Stubby arms */}
      <Cube position={[-0.78, 0.2, 0.05]} size={[0.34, 0.7, 0.42]} color={ROBE} />
      <Cube position={[0.78, 0.2, 0.05]} size={[0.34, 0.7, 0.42]} color={ROBE} />
      {/* Mitten hands (cloth) */}
      <Cube position={[-0.82, -0.25, 0.1]} size={[0.32, 0.3, 0.36]} color={CLOTH} />
      <Cube position={[0.82, -0.25, 0.1]} size={[0.32, 0.3, 0.36]} color={CLOTH} />
      {/* Stubby feet peeking under the hem */}
      <Cube position={[-0.32, -0.85, 0.18]} size={[0.36, 0.22, 0.5]} color="#5A3D28" />
      <Cube position={[0.32, -0.85, 0.18]} size={[0.36, 0.22, 0.5]} color="#5A3D28" />

      {/* --- Head (round, friendly) --- */}
      <Cube position={[0, 1.0, 0.02]} size={[0.85, 0.78, 0.8]} color={SKIN} />
      {/* Big expressive eyes */}
      <Emissive position={[-0.2, 1.02, 0.42]} size={[0.22, 0.28, 0.12]} color="#FFFFFF" intensity={2.0} />
      <Emissive position={[0.2, 1.02, 0.42]} size={[0.22, 0.28, 0.12]} color="#FFFFFF" intensity={2.0} />
      <Ink position={[-0.18, 0.99, 0.5]} size={[0.11, 0.15, 0.06]} />
      <Ink position={[0.18, 0.99, 0.5]} size={[0.11, 0.15, 0.06]} />
      {/* Rosy cheek + tiny smile cue (warm cloth blocks) */}
      <Cube position={[0, 0.78, 0.42]} size={[0.3, 0.08, 0.06]} color="#C77A5A" outline={0} />

      {/* --- OVERSIZED pointy wizard hat (the iconic silhouette) --- */}
      <Cube position={[0, 1.42, 0]} size={[1.15, 0.22, 1.1]} color={ROBE} />{/* wide brim */}
      <Cube position={[0, 1.65, -0.02]} size={[0.78, 0.34, 0.74]} color={ROBE_HI} />{/* base */}
      <Cube position={[0.04, 1.95, -0.06]} size={[0.52, 0.34, 0.5]} color={ROBE} />{/* mid (slight lean) */}
      <Cube position={[0.1, 2.24, -0.1]} size={[0.32, 0.34, 0.3]} color={ROBE_HI} />{/* upper */}
      <Cube position={[0.16, 2.5, -0.14]} size={[0.16, 0.3, 0.16]} color={ROBE} />{/* tip */}
      {/* Hat star/gem accent */}
      <Emissive position={[0, 1.66, 0.4]} size={[0.18, 0.22, 0.1]} color={ARCANE} intensity={2.4} />

      {/* --- Staff (held in the right hand, glowing arcane tip) --- */}
      <Cube position={[1.0, 0.35, 0.32]} size={[0.16, 1.9, 0.16]} color="#6E4A30" />
      <Emissive position={[1.0, 1.45, 0.32]} size={[0.34, 0.34, 0.34]} color={ARCANE} intensity={3.0} />
      <Emissive position={[1.0, 1.45, 0.32]} size={[0.16, 0.16, 0.16]} color="#FFFFFF" intensity={3.2} />
    </group>
  );
}
