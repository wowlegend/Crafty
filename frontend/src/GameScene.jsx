import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { PointerLockControls, Stats } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { MinecraftSky, PositionTracker, Player } from './Components';
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
  return (
    <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, zIndex: 0 }}>
      <Canvas
        shadows={false}
        className="w-full h-full"
        gl={{
          antialias: true,
          alpha: false,
          depth: true,
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
        <MinecraftSky isDay={gameState.isDay} />
        <ambientLight intensity={gameState.isDay ? 0.6 : 0.2} />
        <directionalLight
          position={[50, 50, 25]}
          intensity={gameState.isDay ? 1.2 : 0.3}
        />
        {!gameState.isDay && (
          <pointLight position={[0, 20, 0]} intensity={0.1} distance={30} color="#4169E1" />
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
        </Suspense>

        {showStats && <Stats />}
      </Canvas>
    </div>
  );
}
