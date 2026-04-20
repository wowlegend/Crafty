import React, { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { PointerLockControls, Stats, Preload, Sky, ContactShadows } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { EffectComposer, SSAO, Bloom, Noise, Vignette, N8AO } from '@react-three/postprocessing';
import { PositionTracker, Player } from './Components';
import { MinecraftWorld } from './world/Terrain';
import { EnhancedMagicSystem } from './EnhancedMagicSystem';
import { NPCSystem } from './SimplifiedNPCSystem';
import { BossEntity, PetEntities } from './AdvancedGameFeatures';

export function GameScene({
  gameState,
  playerPosition,
  setPlayerPosition,
  isWorldBuilt,
  bossSystem,
  petSystem,
  showStats
}) {
  const shadowConfig = useMemo(() => ({
    mapSize: [2048, 2048],
    camera: {
      left: -100,
      right: 100,
      top: 100,
      bottom: -100,
      near: 0.1,
      far: 200
    }
  }), []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, zIndex: 0 }}>
      <Canvas
        shadows
        className="w-full h-full"
        gl={{
          antialias: false, // Post-processing handles AA
          alpha: false,
          depth: true,
          stencil: false,
          powerPreference: "high-performance"
        }}
        camera={{
          fov: 75,
          near: 0.1,
          far: 500,
          position: [0, 30, 0]
        }}
        onCreated={({ gl, camera }) => {
          gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
          camera.rotation.set(0, 0, 0);
          camera.lookAt(0, 30, -100);
        }}
      >
        <Sky 
          sunPosition={gameState.isDay ? [100, 20, 100] : [-100, -20, -100]} 
          turbidity={0.1}
          rayleigh={2}
          mieCoefficient={0.005}
          mieDirectionalG={0.8}
        />
        
        <ambientLight intensity={gameState.isDay ? 0.4 : 0.1} />
        
        <directionalLight
          castShadow
          position={gameState.isDay ? [50, 100, 50] : [-50, 50, -50]}
          intensity={gameState.isDay ? 1.5 : 0.2}
          shadow-mapSize={shadowConfig.mapSize}
          shadow-camera-left={shadowConfig.camera.left}
          shadow-camera-right={shadowConfig.camera.right}
          shadow-camera-top={shadowConfig.camera.top}
          shadow-camera-bottom={shadowConfig.camera.bottom}
          shadow-camera-near={shadowConfig.camera.near}
          shadow-camera-far={shadowConfig.camera.far}
          shadow-bias={-0.0001}
        />

        {!gameState.isDay && (
          <pointLight position={[0, 20, 0]} intensity={0.5} distance={50} color="#4169E1" />
        )}

        <PointerLockControls makeDefault />

        <PositionTracker onPositionUpdate={setPlayerPosition} />

        <Suspense fallback={null}>
          <Physics gravity={[0, -30, 0]}>
            <MinecraftWorld />

            <Player isWorldBuilt={isWorldBuilt} />

            <EnhancedMagicSystem playerPosition={playerPosition} />

            <NPCSystem />

            <BossEntity
              bossActive={bossSystem.bossActive}
              bossPositionRef={bossSystem.bossPositionRef}
              bossPhase={bossSystem.bossPhase}
              playerPosition={playerPosition}
            />

            <PetEntities pets={petSystem.pets} />
          </Physics>

          <EffectComposer disableNormalPass>
            <N8AO intensity={1.5} radius={2} color="black" />
            <Bloom 
              intensity={0.5} 
              luminanceThreshold={0.9} 
              luminanceSmoothing={0.025} 
              mipmapBlur 
            />
            <Noise opacity={0.02} />
            <Vignette eskil={false} offset={0.1} darkness={1.1} />
          </EffectComposer>

          <Preload all />
        </Suspense>

        {showStats && <Stats />}
      </Canvas>
    </div>
  );
}
