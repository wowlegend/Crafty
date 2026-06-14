import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ENERGY_PROFILE, _defaultEnergy, WAND_CONFIGS } from '../game/spellVisualProfiles';
import { isCaptureMode } from '../devtest/captureMode';

// Shared scratch objects for the stretch-billboard trail math (avoid per-frame allocs).
// Defined HERE, in the module that uses them: they were orphaned in EnhancedMagicSystem
// during the iter-152 spellVfx extraction, throwing `_trailDir is not defined` EVERY frame a
// spell projectile rendered (live + capture) — a broken-main hidden by the stale-diff hole.
// This is the dep-completeness pass the charter mandates after a byte-exact extraction.
const _trailDir = new THREE.Vector3();
const _trailMid = new THREE.Vector3();
const _trailQuat = new THREE.Quaternion();
const _trailUp = new THREE.Vector3(0, 1, 0);

// Spell-VFX render group (S3 de-monolith from EnhancedMagicSystem): the projectile / core / impact-pop /
// cast-telegraph / wand renderers. EMS imports the 3 it renders directly; SpellProjectileCore is internal
// (used by EnhancedSpellProjectile); MagicWand is exported (Components -> playerRender uses it).
const EnhancedSpellProjectile = React.memo(({ projectile }) => {
  const groupRef = useRef();
  const trailRef = useRef();

  useFrame(() => {
    // The whole projectile group tracks the head position; the layered energy core
    // (SpellProjectileCore) owns the turbulence/rotation (capture-gated internally).
    if (groupRef.current) groupRef.current.position.copy(projectile.position);

    // S1-D-M1: single velocity-STRETCH-BILLBOARD trail (one cylinder) instead of the old
    // per-instance trail-sphere group (12-20 spheres/projectile). Oriented along the
    // velocity vector, length scales with speed, trailing BEHIND the projectile head.
    // (The trail lives OUTSIDE groupRef in world space since it orients to velocity.)
    if (trailRef.current) {
      const v = projectile.velocity;
      const speed = Math.hypot(v.x, v.y, v.z);
      if (speed > 0.001) {
        _trailDir.set(v.x, v.y, v.z).multiplyScalar(1 / speed);
        const len = Math.min(4.5, 0.5 + speed * 0.06);
        // midpoint half a length behind the projectile head
        _trailMid.copy(projectile.position).addScaledVector(_trailDir, -len * 0.5);
        trailRef.current.position.copy(_trailMid);
        // cylinder default axis is +Y; rotate it onto the (reversed) travel direction
        _trailQuat.setFromUnitVectors(_trailUp, _trailDir);
        trailRef.current.quaternion.copy(_trailQuat);
        trailRef.current.scale.set(1, len, 1);
      }
    }
  });

  return (
    <group>
      {/* S1-D POLISH: the LAYERED energy body (hot inner core + saturated outer glow),
          replacing the single flat emissive sphere. Tracks the head via groupRef. */}
      <group ref={groupRef}>
        <SpellProjectileCore projectile={projectile} />
      </group>

      {/* S1-D-M1: single velocity-stretch-billboard trail (one additive cylinder,
          oriented + scaled in useFrame) — replaces the old 12-20 trail-sphere group. */}
      <mesh ref={trailRef}>
        <cylinderGeometry args={[projectile.size * 0.22, projectile.size * 0.04, 1, 6, 1, true]} />
        <meshBasicMaterial
          color={projectile.trailColor}
          transparent
          opacity={0.45}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
});

// S1-D POLISH: SpellProjectileCore — the premium-ENERGY projectile body that replaced the
// single flat coral/pastel sphere. Three concentric, ADDITIVE, `toneMapped={false}` layers:
//   (1) a per-element silhouette MESH (the recognizable shape: fiery sphere / ice crystal /
//       electric bolt / arcane swirl) emissive in the saturated element color,
//   (2) a tight HOT INNER CORE sphere (near-white) that bloom blows out into a glowing
//       heart — this is what makes it read as light, not plastic,
//   (3) a soft OUTER GLOW shell (the saturated element halo) that gives volume + bloom.
// Per-element personality comes from ENERGY_PROFILE (hues, intensities, scales, turbulence).
//
// Capture-determinism: the scale-flicker / turbulence is driven by the clock + (for the
// jagged lightning) a tiny deterministic hash; in capture mode (`isCaptureMode()`) it is
// FROZEN at a hand-picked flattering phase (`profile.capturePhase`) so the byte-stable
// regression frame holds the projectile at a pleasing, slightly-alive pose — never a flat
// rest scale, never a clock/Math.random read.
const SpellProjectileCore = React.memo(({ projectile }) => {
  const innerRef = useRef();
  const outerRef = useRef();
  const meshRef = useRef();
  const profile = ENERGY_PROFILE[projectile.type] || _defaultEnergy;
  const size = projectile.size || 1;

  useFrame((state) => {
    const capture = isCaptureMode();
    // The turbulence phase: frozen at the flattering capturePhase in capture, else live.
    const phase = capture ? profile.capturePhase : state.clock.elapsedTime * profile.flickerSpeed;
    const pulse = 1 + Math.sin(phase) * profile.flicker;
    // A secondary high-freq jitter for the electric/jagged personalities (lightning), made
    // DETERMINISTIC via a sine of a second phase rather than Math.random so capture stays
    // byte-stable; frozen with everything else in capture.
    const jitter = 1 + Math.sin(phase * 2.7 + 1.3) * profile.flicker * 0.4;

    if (meshRef.current) {
      meshRef.current.scale.setScalar(pulse);
      if (!capture) {
        // Gentle rotation in gameplay for life; frozen in capture for a stable frame.
        meshRef.current.rotation.x += 0.06;
        meshRef.current.rotation.y += 0.05;
        meshRef.current.rotation.z += 0.04;
      }
    }
    if (innerRef.current) innerRef.current.scale.setScalar(pulse * jitter);
    if (outerRef.current) outerRef.current.scale.setScalar(pulse);
  });

  // Per-element silhouette geometry for the colored shape layer (keeps the recognizable
  // form: round fireball, crystalline ice, thin bolt, arcane ring).
  const renderShape = () => {
    switch (profile.shape) {
      case 'crystal':
        return <dodecahedronGeometry args={[size * 0.5, 0]} />;
      case 'bolt':
        return <cylinderGeometry args={[size * 0.12, size * 0.12, size * 1.8, 6]} />;
      case 'swirl':
        return <torusGeometry args={[size * 0.42, size * 0.16, 8, 24]} />;
      case 'sphere':
      default:
        return <icosahedronGeometry args={[size * 0.5, 1]} />;
    }
  };

  return (
    <group>
      {/* (1) per-element silhouette shape — saturated element color, emissive + bloomable.
          renderOrder 0 + depthWrite off so the additive core/glow always paint OVER it
          (otherwise the opaque colored shape occludes the hot white heart -> pink wash). */}
      <mesh ref={meshRef} renderOrder={0}>
        {renderShape()}
        <meshStandardMaterial
          color={profile.glowColor}
          emissive={profile.glowColor}
          emissiveIntensity={profile.glowIntensity}
          roughness={0.25}
          metalness={0.0}
          toneMapped={false}
          transparent
          opacity={0.9}
          depthWrite={false}
        />
      </mesh>

      {/* (2) hot inner core — near-white heart that bloom blows out into glowing light.
          renderOrder 2/3 (paints last, over the colored shape) so the white heart
          dominates. A tight white-hot HOTSPOT nested in the tinted core guarantees the
          center clips past the bloom threshold (1.0) and blooms as a glowing point of
          light — the same recipe that makes the impact flash read premium. */}
      <mesh ref={innerRef} renderOrder={2}>
        <sphereGeometry args={[size * profile.coreScale, 16, 16]} />
        <meshBasicMaterial
          color={profile.coreColor}
          toneMapped={false}
          transparent
          opacity={0.98}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          depthTest={false}
        />
        <mesh renderOrder={3}>
          <sphereGeometry args={[size * profile.coreScale * 0.55, 12, 12]} />
          <meshBasicMaterial
            color="#FFFFFF"
            toneMapped={false}
            transparent
            opacity={1.0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            depthTest={false}
          />
        </mesh>
      </mesh>

      {/* (3) soft outer glow shell — saturated element halo giving volume + bloom */}
      <mesh ref={outerRef} renderOrder={1}>
        <sphereGeometry args={[size * profile.glowScale, 16, 16]} />
        <meshBasicMaterial
          color={profile.glowColor}
          toneMapped={false}
          transparent
          opacity={profile.glowOpacity}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* point-light pop so the energy actually casts onto nearby voxels (gameplay) */}
      <pointLight color={profile.glowColor} intensity={5} distance={7} decay={2} />
    </group>
  );
});

// S1-D-M1: SpellImpactPop — the ONE pooled impact mesh that replaced the old
// SpellImpact/ImpactParticle/Fire|Ice|Lightning|ArcaneImpactEffect slop (each cast used
// to mount a sphere + `particleCount` ImpactParticle spheres + a per-element sub-effect
// group = 25-40 meshes). The spark spray + flash now come from the GPU pool + bloom-spike;
// this is just a fast-expanding additive shockwave RING that fades, plus a transient
// point-light pop. Two objects total, lifetime ~360ms.
//
// Capture-safe: the GPU spark burst pushes to the clip void when uTime=0, the bloom-spike
// driver no-ops in capture, and camera-shake is inert (player loop early-returns). This
// ring ages off `impact.age` (advanced by the parent's useFrame deltaMs); in capture the
// clock is frozen so age stays put — a stable frozen frame. No Math.random / clock reads.
const SpellImpactPop = React.memo(({ impact }) => {
  const ringRef = useRef();
  const flashRef = useRef();
  const lightRef = useRef();
  // S1-D POLISH: derive the impact's energy hues from the projectile energy palette so the
  // hit flash matches the projectile's saturated glow + hot-white heart (consistent grammar).
  const energy = ENERGY_PROFILE[impact.type] || _defaultEnergy;

  useFrame(() => {
    const progress = Math.min(1, impact.age / impact.maxAge);
    const eased = 1 - (1 - progress) * (1 - progress); // ease-out
    if (ringRef.current) {
      const scale = 0.4 + eased * 3.4;
      ringRef.current.scale.set(scale, scale, scale);
      ringRef.current.material.opacity = 0.95 * (1 - progress);
    }
    if (flashRef.current) {
      // Hot-white core flash: a quick bright billboard that peaks at t=0 and is gone by
      // ~22% of lifetime (within the 40-90ms flash-peak readability budget given the
      // ~360ms lifetime). Sells the "wow" punch without exceeding the ~15% viewport.
      const fp = Math.max(0, 1 - progress / 0.22);
      const s = 0.5 + (1 - fp) * 1.1; // expands slightly as it fades
      flashRef.current.scale.set(s, s, s);
      flashRef.current.material.opacity = fp;
    }
    if (lightRef.current) {
      // Quick light pop: bright at t=0, gone by ~40% of lifetime.
      lightRef.current.intensity = Math.max(0, 1 - progress / 0.4) * 18;
    }
  });

  return (
    <group position={impact.position}>
      {/* expanding shockwave ring (element-glow hue) on the ground plane (XZ) */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.35, 0.55, 40]} />
        <meshBasicMaterial
          color={energy.glowColor}
          transparent
          opacity={0.95}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      {/* hot-white core flash — the bright punch at the moment of impact (bloom-catchable) */}
      <mesh ref={flashRef}>
        <sphereGeometry args={[0.55, 16, 16]} />
        <meshBasicMaterial
          color={energy.coreColor}
          transparent
          opacity={1.0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <pointLight
        ref={lightRef}
        color={energy.glowColor}
        intensity={18}
        distance={10}
        decay={2}
      />
    </group>
  );
});

// S1-D-M2: CastTelegraph — the cast-start RUNE-CIRCLE (spec §5 shared shape vocabulary).
// Two concentric additive rings (an outer rune-circle + a tighter inner core ring) that
// snap in bright, expand slightly, and fade over ~150-180ms — the "telegraph" beat of the
// telegraph -> release -> impact arc. Per-element hue. Built under the animated-shapes /
// zero-texture doctrine: pure additive ring geometry animated by scale + opacity, no atlas,
// ink-outline-consistent (it reads as a flat glyph, preserving silhouette).
//
// TASTEFUL DEFAULT: a clean concentric rune-circle. The richer glyph vocabulary (hex
// glyphs, per-element personality, an energy column on charge) is a Kevin taste-gate —
// batched in KEVIN-REVIEW-BATCH, not finalized autonomously here.
//
// Capture-safe: ages off `telegraph.age` (advanced by the parent useFrame deltaMs, frozen
// at 0 in capture) -> a held telegraph renders a stable frozen pose. No clock/Math.random.
const CastTelegraph = React.memo(({ telegraph }) => {
  const groupRef = useRef();
  const outerRef = useRef();
  const ringRef = useRef();
  const innerRef = useRef();
  const spokesRef = useRef();
  // S1-D POLISH: telegraph hues from the energy palette so the cast sigil's saturated rune
  // color + hot-white heart match the projectile that follows (one consistent VFX grammar).
  const energy = ENERGY_PROFILE[telegraph.type] || _defaultEnergy;

  useFrame((state) => {
    // Billboard the rune-disc to face the camera so it always reads as a full circle (a
    // "cast sigil" at the muzzle) rather than collapsing edge-on when the cast direction
    // points across the view. Capture-safe: the camera is pinned, so this is deterministic.
    if (groupRef.current) {
      groupRef.current.quaternion.copy(state.camera.quaternion);
    }

    const progress = Math.min(1, telegraph.age / telegraph.maxAge);
    // Snap-in then settle: bright + slightly contracted at onset, expands as it fades.
    const eased = 1 - (1 - progress) * (1 - progress); // ease-out
    const opacity = (1 - progress); // fade across the ~150ms window
    if (outerRef.current) {
      const s = 0.85 + eased * 0.7; // rune-circle expands outward as it fades
      outerRef.current.scale.set(s, s, s);
      outerRef.current.material.opacity = 1.0 * opacity;
    }
    if (ringRef.current) {
      const s = 0.72 + eased * 0.55; // second concentric rune band (crisper sigil read)
      ringRef.current.scale.set(s, s, s);
      ringRef.current.material.opacity = 0.85 * opacity;
    }
    if (innerRef.current) {
      const s = 0.55 + eased * 0.30;
      innerRef.current.scale.set(s, s, s);
      innerRef.current.material.opacity = 1.0 * opacity;
    }
    if (spokesRef.current) {
      const s = 0.85 + eased * 0.7;
      spokesRef.current.scale.set(s, s, s);
      spokesRef.current.material.opacity = 0.85 * opacity;
    }
  });

  return (
    <group ref={groupRef} position={telegraph.position}>
      {/* outer rune-circle — thin crisp saturated band */}
      <mesh ref={outerRef}>
        <ringGeometry args={[0.84, 0.97, 64]} />
        <meshBasicMaterial
          color={energy.glowColor}
          transparent
          opacity={1.0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      {/* second concentric rune band — gives the sigil a layered, crafted read */}
      <mesh ref={ringRef}>
        <ringGeometry args={[0.70, 0.76, 64]} />
        <meshBasicMaterial
          color={energy.glowColor}
          transparent
          opacity={0.85}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      {/* mid spoke-ring: 8 short radial ticks (a glyph hint) on a thin ring band */}
      <mesh ref={spokesRef}>
        <ringGeometry args={[0.54, 0.64, 8, 1]} />
        <meshBasicMaterial
          color={energy.glowColor}
          transparent
          opacity={0.85}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      {/* inner core disc — hot near-white heart that bloom catches (per-element core hue) */}
      <mesh ref={innerRef}>
        <circleGeometry args={[0.30, 32]} />
        <meshBasicMaterial
          color={energy.coreColor}
          transparent
          opacity={1.0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
});

export const MagicWand = React.memo(({ wandType = 'fireball', position = [0, 0, 0], rotation = [0, 0, 0] }) => {
  const wandRef = useRef();
  const gemRef = useRef();


  const config = WAND_CONFIGS[wandType] || WAND_CONFIGS.fireball;

  useFrame((state) => {
    if (wandRef.current) {
      const idle = Math.sin(state.clock.elapsedTime * 2) * 0.05;
      wandRef.current.rotation.z = idle;
    }

    if (gemRef.current) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 4) * 0.2;
      gemRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <group ref={wandRef} position={position} rotation={rotation}>
      <mesh position={[0, -0.4, 0]}>
        <cylinderGeometry args={[0.03, 0.05, 0.8, 8]} />
        <meshStandardMaterial roughness={0.8} metalness={0.1} color={config.handleColor} />
      </mesh>

      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.02, 0.04, 0.3, 8]} />
        <meshStandardMaterial roughness={0.8} metalness={0.1} color={config.tipColor} />
      </mesh>

      <mesh ref={gemRef} position={[0, 0.3, 0]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshBasicMaterial
          color={config.gemColor}
          transparent
          opacity={0.9}
        />
      </mesh>

      <mesh position={[0, 0.3, 0]}>
        <sphereGeometry args={[0.15, 8, 8]} />
        <meshBasicMaterial
          color={config.auraColor}
          transparent
          opacity={0.3}
        />
      </mesh>
    </group>
  );
});

export { EnhancedSpellProjectile, SpellImpactPop, CastTelegraph };
