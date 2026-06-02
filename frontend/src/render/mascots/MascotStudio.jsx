// MascotStudio — a self-contained R3F studio overlay that renders ONE mascot direction
// mockup against a clean gradient backdrop with a FIXED camera + lighting + scale, so all
// three directions render identically (apples-to-apples for Kevin's pick). Mounted as a
// full-screen overlay from App.jsx (mirrors the PrimitivesShowcase overlay pattern) and
// gated on a local React flag driven by the `showMascot` DEV test hook.
//
// DELIBERATELY standalone (its OWN Canvas + lights + post-stack that REPLICATE the game's
// explore-day look — toon + emissive-only bloom + SMAA + Neutral tone-map) rather than
// hooking the gameplay GameScene/Atmosphere: zero terrain/physics/streaming flake, fully
// deterministic, and it keeps the implementation strictly inside the mascot files + App.jsx
// (no gameplay-scene edits). Throwaway: 2 of 3 directions get pruned after the pick.
import { Canvas } from '@react-three/fiber';
import { SMAA, EffectComposer, Bloom, HueSaturation, BrightnessContrast, Vignette, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { MascotSparkFamiliar } from './MascotSparkFamiliar';
import { MascotCraftyHero } from './MascotCraftyHero';
import { MascotCraftGolem } from './MascotCraftGolem';

const MASCOTS = { a: MascotSparkFamiliar, b: MascotCraftyHero, c: MascotCraftGolem };

// Explore-day palette (from src/theme/tokens.js -> mood.js) so the studio light/sky reads
// like the in-game daytime look the mascots will live in.
const SKY_TOP = '#1A5AD0';
const SKY_MID = '#2E8AE0';
const SKY_HORIZON = '#CDEAF5';
const SUN = '#FFFBF2';

// A simple 3-stop vertical gradient backdrop (top -> horizon), drawn behind everything,
// camera-independent (it's a fixed full-frame quad facing the camera). Mirrors the spirit
// of the game's skydome without pulling in the gameplay Atmosphere component.
function StudioBackdrop() {
  return (
    <mesh position={[0, 0.5, -14]} frustumCulled={false}>
      <planeGeometry args={[60, 40]} />
      <shaderMaterial
        depthWrite={false}
        uniforms={{
          top: { value: hexToVec3(SKY_TOP) },
          mid: { value: hexToVec3(SKY_MID) },
          horizon: { value: hexToVec3(SKY_HORIZON) },
        }}
        vertexShader={`
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `}
        fragmentShader={`
          uniform vec3 top, mid, horizon;
          varying vec2 vUv;
          void main() {
            vec3 col = mix(horizon, mid, smoothstep(0.25, 0.6, vUv.y));
            col = mix(col, top, smoothstep(0.6, 1.0, vUv.y));
            gl_FragColor = vec4(col, 1.0);
          }
        `}
      />
    </mesh>
  );
}

function hexToVec3(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  // sRGB -> linear (the renderer works in linear; matches how three decodes colors)
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return [lin(r), lin(g), lin(b)];
}

export function MascotStudio({ variant = 'a' }) {
  const Mascot = MASCOTS[variant] || MascotSparkFamiliar;
  return (
    <div
      data-testid="mascot-studio"
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#0b0e14' }}
    >
      <Canvas
        shadows={false}
        dpr={[1, 2]}
        gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
        // FIXED camera — identical for all three variants (apples-to-apples). A gentle
        // 3/4 down-angle "diorama" look; mascots are centered at origin and sized to fill
        // ~70% of the frame height.
        camera={{ fov: 32, near: 0.1, far: 100, position: [3.4, 2.6, 6.4] }}
        onCreated={({ camera }) => { camera.lookAt(0, 0.35, 0); }}
      >
        <StudioBackdrop />

        {/* Lighting mirrors explore-day (mood.js explore scalars): a strong warm key from
            the upper-left, a sky-mid ambient fill, and a soft cool fill from the front so
            the toon shadow band + fresnel rim read on the silhouette. */}
        <ambientLight color={SKY_MID} intensity={0.9} />
        <directionalLight color={SUN} position={[-5, 6, 4]} intensity={1.9} />
        <directionalLight color={SKY_HORIZON} position={[4, 1.5, 5]} intensity={0.45} />

        <group scale={1.05}>
          <Mascot />
        </group>

        {/* Post stack replicates the game's composer (GameScene.jsx): saturation/contrast
            pop, emissive-ONLY bloom (high threshold so the toon bodies don't bloom), SMAA,
            Neutral tone-map (NOT ACES — preserves the bright stylized look), gentle vignette.
            No Noise (would break determinism) — matches capture-mode behavior in-game. */}
        <EffectComposer>
          <HueSaturation saturation={0.22} />
          <BrightnessContrast brightness={0.04} contrast={0.08} />
          <Bloom intensity={0.9} luminanceThreshold={0.85} luminanceSmoothing={0.12} mipmapBlur />
          <SMAA />
          <ToneMapping mode={ToneMappingMode.NEUTRAL} />
          <Vignette eskil={false} offset={0.5} darkness={0.3} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
