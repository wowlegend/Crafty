// Mascot direction B — "Crafty Hero": the BRAND FACE. A chunky toy-like apprentice-mage.
// Short/bulky proportions topped by an OVERSIZED stepped pointy wizard hat, gripping a
// staff with a glowing arcane gem — an iconic silhouette that passes the 100%-black read
// (big stepped hat + staff + bulky robe), and evolves the old title pointy-hat placeholder.
//
// Built from grouped voxel cubes on the shared toon material + fresnel rim + inverted-hull
// <Outlines> (mob screen-px thickness), so the mascot reads on-brand with the game's mobs.
// A gentle idle (body bob + hat-tip sway + gem twinkle/staff-glow pulse) plays in normal
// use and is FROZEN in capture mode (isCaptureMode) for byte-stable deterministic frames.
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Cube, Emissive, Ink } from './voxelKit';
import { isCaptureMode } from '../../devtest/captureMode';

// --- Palette (Vanguard + Toon: bright, saturated, friendly, clear value separation) ---
const ROBE = '#2C6CC4';       // deep royal-blue robe + hat (the dominant brand mass)
const ROBE_HI = '#4A93E0';    // lighter blue band (hat steps + hem highlight)
const SASH = '#F2C14E';       // warm gold sash/trim (the accent that pops on blue)
const SASH_HI = '#FFD86B';    // brighter gold (buckle / hat star)
const SKIN = '#F4CCA1';       // friendly face
const CHEEK = '#E8956A';      // rosy cheek warmth
const BOOT = '#6B4A2E';       // soft brown boots
const STAFF = '#8A5A34';      // warm wood staff
const STAFF_HI = '#A87242';   // staff highlight wrap
const ARCANE = '#9B5BFF';     // arcane gem emissive (ties to the spell-VFX signature)
const ARCANE_HOT = '#E0C2FF'; // hot inner gem core

export function MascotCraftyHero() {
  const root = useRef(null);
  const hatTip = useRef(null);
  const gem = useRef(null);
  const gemCore = useRef(null);

  // Subtle idle: a gentle body bob, a soft hat-tip sway, and a gem/staff-glow pulse.
  // FROZEN in capture mode so the studio + title frames are byte-stable across runs.
  useFrame((state) => {
    if (isCaptureMode()) return;
    const t = state.clock.elapsedTime;
    if (root.current) root.current.position.y = -0.1 + Math.sin(t * 1.6) * 0.045;
    if (hatTip.current) hatTip.current.rotation.z = Math.sin(t * 1.2) * 0.05;
    const pulse = 0.82 + Math.sin(t * 2.4) * 0.18;
    if (gem.current) gem.current.material.emissiveIntensity = 8.5 * pulse;
    if (gemCore.current) gemCore.current.material.emissiveIntensity = 11 * pulse;
  });

  // Centered at origin; ~2.7 tall incl. hat tip. Short/bulky: wide squat robe, stubby
  // limbs, a round head, topped by a stepped hat TALLER than the head (the iconic read).
  return (
    <group ref={root} position={[0, -0.1, 0]}>
      {/* ------------------------------------------------------------------ */}
      {/* Bulky robed body — a clean conical mass (wide hem, narrower chest)  */}
      {/* so the lower silhouette reads as one solid wizard-robe triangle.    */}
      {/* ------------------------------------------------------------------ */}
      <Cube position={[0, -0.62, 0]} size={[1.6, 0.5, 1.12]} color={ROBE} />{/* flared hem (widest) */}
      <Cube position={[0, -0.2, 0]} size={[1.42, 0.5, 1.02]} color={ROBE} />{/* mid robe */}
      <Cube position={[0, 0.22, 0]} size={[1.22, 0.55, 0.92]} color={ROBE} />{/* chest/shoulders */}
      {/* Gold hem trim band (reads as a crisp line on the robe triangle) */}
      <Cube position={[0, -0.82, 0]} size={[1.64, 0.12, 1.16]} color={SASH} outline={0} />

      {/* Front placket + belted sash + buckle (the gold accent down the center) */}
      <Cube position={[0, 0.0, 0.5]} size={[0.34, 1.05, 0.06]} color={SASH} />
      <Cube position={[0, -0.28, 0.52]} size={[0.92, 0.2, 0.07]} color={SASH} />{/* belt */}
      <Cube position={[0, -0.28, 0.56]} size={[0.26, 0.24, 0.06]} color={SASH_HI} outline={0} />{/* buckle */}

      {/* Stubby arms (robe sleeves) angled slightly outward for a clear gap from the body */}
      <Cube position={[-0.82, 0.18, 0.06]} size={[0.36, 0.78, 0.46]} color={ROBE} />
      <Cube position={[0.82, 0.18, 0.06]} size={[0.36, 0.78, 0.46]} color={ROBE} />
      {/* Gold sleeve cuffs */}
      <Cube position={[-0.82, -0.16, 0.07]} size={[0.4, 0.12, 0.5]} color={SASH} outline={0} />
      <Cube position={[0.82, -0.16, 0.07]} size={[0.4, 0.12, 0.5]} color={SASH} outline={0} />
      {/* Mitten hands (skin) — the right one grips the staff */}
      <Cube position={[-0.84, -0.34, 0.12]} size={[0.34, 0.32, 0.38]} color={SKIN} />
      <Cube position={[0.84, -0.3, 0.16]} size={[0.34, 0.34, 0.4]} color={SKIN} />

      {/* Stubby boots peeking under the hem */}
      <Cube position={[-0.32, -0.98, 0.2]} size={[0.4, 0.24, 0.56]} color={BOOT} />
      <Cube position={[0.32, -0.98, 0.2]} size={[0.4, 0.24, 0.56]} color={BOOT} />

      {/* ------------------------------------------------------------------ */}
      {/* Head — round + friendly, ~40% of body width, sits on a short neck.  */}
      {/* ------------------------------------------------------------------ */}
      <Cube position={[0, 0.78, 0.02]} size={[0.86, 0.8, 0.82]} color={SKIN} />
      {/* Big expressive eyes (bright whites + dark ink pupils = the appeal cue) */}
      <Emissive position={[-0.21, 0.82, 0.44]} size={[0.24, 0.3, 0.12]} color="#FFFFFF" intensity={1.8} />
      <Emissive position={[0.21, 0.82, 0.44]} size={[0.24, 0.3, 0.12]} color="#FFFFFF" intensity={1.8} />
      <Ink position={[-0.19, 0.79, 0.52]} size={[0.12, 0.16, 0.07]} />
      <Ink position={[0.19, 0.79, 0.52]} size={[0.12, 0.16, 0.07]} />
      {/* Little eyebrow ticks (friendly, alert) + rosy cheeks + a small smile cue */}
      <Ink position={[-0.21, 1.0, 0.46]} size={[0.2, 0.05, 0.05]} />
      <Ink position={[0.21, 1.0, 0.46]} size={[0.2, 0.05, 0.05]} />
      <Cube position={[-0.32, 0.66, 0.42]} size={[0.16, 0.1, 0.06]} color={CHEEK} outline={0} />
      <Cube position={[0.32, 0.66, 0.42]} size={[0.16, 0.1, 0.06]} color={CHEEK} outline={0} />
      <Ink position={[0, 0.6, 0.46]} size={[0.26, 0.05, 0.05]} />{/* smile */}

      {/* ------------------------------------------------------------------ */}
      {/* OVERSIZED stepped pointy wizard hat — the #1 silhouette signature.  */}
      {/* Wide brim -> 4 stacked shrinking steps -> a leaning tip. The tip     */}
      {/* group is animated (sway) and carries the gold star accent.          */}
      {/* ------------------------------------------------------------------ */}
      <Cube position={[0, 1.22, 0]} size={[1.46, 0.2, 1.4]} color={ROBE_HI} />{/* wide curled brim */}
      <Cube position={[0, 1.3, 0]} size={[1.18, 0.14, 1.12]} color={ROBE} />{/* brim underside step */}
      <Cube position={[0, 1.52, -0.02]} size={[0.86, 0.34, 0.82]} color={ROBE} />{/* base */}
      <Cube position={[0, 1.66, 0.42]} size={[0.22, 0.26, 0.08]} color={SASH_HI} outline={0} />{/* hat star */}
      <Cube position={[0.03, 1.84, -0.04]} size={[0.62, 0.34, 0.6]} color={ROBE_HI} />{/* step 2 */}
      <Cube position={[0.06, 2.14, -0.06]} size={[0.42, 0.32, 0.4]} color={ROBE} />{/* step 3 */}

      {/* Leaning hat-tip (animated sway) — pivot near the upper steps so the sway reads */}
      <group ref={hatTip} position={[0.1, 2.3, -0.08]}>
        <Cube position={[0.04, 0.16, -0.02]} size={[0.28, 0.3, 0.26]} color={ROBE_HI} />{/* step 4 */}
        <Cube position={[0.1, 0.42, -0.04]} size={[0.16, 0.28, 0.15]} color={ROBE} />{/* tip */}
        <Emissive position={[0.14, 0.6, -0.04]} size={[0.12, 0.12, 0.12]} color={ARCANE} intensity={4.0} />{/* tip glow bauble */}
      </group>

      {/* ------------------------------------------------------------------ */}
      {/* Staff — gripped in the right hand, vertical, with a glowing arcane   */}
      {/* gem on top (emissive -> bloom; ties to the spell-VFX signature).     */}
      {/* ------------------------------------------------------------------ */}
      <Cube position={[1.02, 0.4, 0.34]} size={[0.17, 2.1, 0.17]} color={STAFF} />
      <Cube position={[1.02, -0.32, 0.34]} size={[0.19, 0.16, 0.19]} color={STAFF_HI} outline={0} />{/* grip wrap */}
      <Cube position={[1.02, 0.34, 0.34]} size={[0.19, 0.14, 0.19]} color={STAFF_HI} outline={0} />{/* upper wrap */}
      {/* Gem cradle (4 little prongs) + the glowing gem + a hot inner core */}
      <Cube position={[1.02, 1.5, 0.34]} size={[0.3, 0.16, 0.3]} color={STAFF_HI} />
      <Emissive ref={gem} position={[1.02, 1.66, 0.34]} size={[0.4, 0.44, 0.4]} color={ARCANE} intensity={8.5} />
      <Emissive ref={gemCore} position={[1.02, 1.66, 0.34]} size={[0.18, 0.2, 0.18]} color={ARCANE_HOT} intensity={11} />
      {/* Localized arcane glow spill — stronger gem glow without lowering the shared studio bloom threshold (keeps eyes/body un-bloomed). Static -> capture-deterministic. */}
      <pointLight position={[1.02, 1.66, 0.34]} color={ARCANE} intensity={2.8} distance={2.6} decay={2} />
    </group>
  );
}
