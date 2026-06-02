// TitleMascot (S1-D-M4) — the live 3D "Crafty Hero" brand face on the title screen.
// A small, transparent, fixed-size R3F canvas that sits where the old 2D pointy-hat
// <Icon name="mascot"> placeholder was, over the menu's starfield. It reuses the SAME
// toon + fresnel-rim + inverted-hull-outline character look as the mascot studio + the
// game's mobs, and the mascot's own idle (body bob + hat sway + gem pulse) plays here —
// which freezes automatically in capture mode (isCaptureMode), so the `menu` frame stays
// deterministic for the visual gate.
//
// PERF: deliberately LIGHTWEIGHT for a persistent menu canvas — no EffectComposer/Bloom
// (the gem still reads bright via emissive + toneMapped=false), dpr capped, frameloop
// switched to "demand" in capture mode so a frozen frame costs nothing. Lazy-loaded +
// Suspense-wrapped by the caller so the three/R3F chunk never blocks first paint of the menu.
import { Canvas } from '@react-three/fiber';
import { MascotCraftyHero } from './MascotCraftyHero';
import { isCaptureMode } from '../../devtest/captureMode';

// Explore-day light palette (mirrors MascotStudio) so the title hero reads like the
// in-game daytime look without pulling in the gameplay Atmosphere/scene.
const SKY_MID = '#2E8AE0';
const SUN = '#FFFBF2';
const SKY_HORIZON = '#CDEAF5';

export function TitleMascot({ size = 168 }) {
  // In capture mode the idle is frozen (mascot gates its own useFrame), so render on demand
  // (one settled frame) — byte-stable + zero idle cost. Live menu animates continuously.
  const frozen = isCaptureMode();
  return (
    <div
      data-testid="title-mascot"
      style={{ width: size, height: size, pointerEvents: 'none' }}
    >
      <Canvas
        shadows={false}
        dpr={[1, 2]}
        frameloop={frozen ? 'demand' : 'always'}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        // Framed slightly tighter than the studio: the hero fills the badge, centered on the
        // upper body/hat so the iconic stepped-hat + staff silhouette dominates the thumbnail.
        camera={{ fov: 34, near: 0.1, far: 100, position: [2.6, 2.2, 6.2] }}
        onCreated={({ camera }) => { camera.lookAt(0, 0.7, 0); }}
      >
        <ambientLight color={SKY_MID} intensity={0.95} />
        <directionalLight color={SUN} position={[-5, 6, 4]} intensity={1.9} />
        <directionalLight color={SKY_HORIZON} position={[4, 1.5, 5]} intensity={0.45} />
        <group scale={0.92}>
          <MascotCraftyHero />
        </group>
      </Canvas>
    </div>
  );
}
