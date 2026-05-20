import React, { Suspense, useMemo, useEffect, useRef } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSounds } from './SoundManager';
import { useGameStore } from './store/useGameStore';
import { PointerLockControls, Stats, Preload, Sky, ContactShadows } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { EffectComposer, SSAO, Bloom, Noise, Vignette, N8AO } from '@react-three/postprocessing';
import { PositionTracker, Player } from './Components';
import { MinecraftWorld } from './world/Terrain';
import { EnhancedMagicSystem } from './EnhancedMagicSystem';
import { NPCSystem } from './SimplifiedNPCSystem';
import { BossEntity, PetEntities } from './AdvancedGameFeatures';

// Step 2: Spatial Audio Controller — bridges SoundProvider buffers to THREE.PositionalAudio
const SpatialAudioController = () => {
  const { camera, scene } = useThree();
  const { audioContext, sounds, soundEnabled, volume } = useSounds();
  const listenerRef = useRef();
  const filterRef = useRef();

  useEffect(() => {
    if (!camera || !audioContext) return;

    // 1. Create and attach listener to camera
    const listener = new THREE.AudioListener();
    camera.add(listener);
    listenerRef.current = listener;

    // 2. Add global low-pass filter for environmental effects (underground)
    const filter = audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(20000, audioContext.currentTime);
    
    // Connect listener gain to filter, then filter to destination
    listener.gain.disconnect();
    listener.gain.connect(filter);
    filter.connect(audioContext.destination);
    filterRef.current = filter;

    // 3. Expose spatial trigger globally
    useGameStore.setState({ 
      playSpatialSound: (soundName, position, playbackRate = 1, distance = 20) => {
        if (!soundEnabled || !sounds || !sounds[soundName] || !listenerRef.current) return;

        try {
          const sound = new THREE.PositionalAudio(listenerRef.current);
          sound.setBuffer(sounds[soundName]);
          sound.setRefDistance(distance);
          sound.setRolloffFactor(2); // Volume falls off more realistically
          sound.setPlaybackRate(playbackRate);
          sound.setVolume(volume);
          
          const soundSource = new THREE.Object3D();
          if (Array.isArray(position)) soundSource.position.set(...position);
          else if (position instanceof THREE.Vector3) soundSource.position.copy(position);
          else if (position && position.x !== undefined) soundSource.position.set(position.x, position.y, position.z);
          
          soundSource.add(sound);
          scene.add(soundSource);
          
          sound.play();
          sound.onEnded = () => {
            sound.disconnect();
            soundSource.removeFromParent();
          };
        } catch (e) {
          console.warn('Positional Audio failed:', e);
        }
      }
    });

    return () => {
      camera.remove(listener);
      filter.disconnect();
    };
  }, [camera, scene, audioContext, sounds, soundEnabled, volume]);

  // Step 3: Environmental Acoustics Update Loop
  const ambientWind = useRef(null);
  const windGain = useRef(null);

  useEffect(() => {
    if (!audioContext || !soundEnabled) return;
    
    // Generate procedural wind
    const bufferSize = 2 * audioContext.sampleRate;
    const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
    }

    const source = audioContext.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;

    const filter = audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;

    const gain = audioContext.createGain();
    gain.gain.value = 0.05 * volume;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);
    
    source.start();
    ambientWind.current = filter;
    windGain.current = gain;

    return () => {
        source.stop();
        source.disconnect();
    };
  }, [audioContext, soundEnabled, volume]);

  useFrame((state) => {
    if (filterRef.current && camera) {
      const undergroundLimit = 10;
      const y = camera.position.y;
      // Muffle sound as player goes deep underground
      const targetFreq = y < undergroundLimit 
        ? THREE.MathUtils.lerp(1000, 20000, Math.max(0, y / undergroundLimit))
        : 20000;
      
      filterRef.current.frequency.setTargetAtTime(targetFreq, audioContext.currentTime, 0.1);

      // Adjust wind based on height and day/night
      if (ambientWind.current && windGain.current) {
        const heightFactor = Math.min(2, Math.max(0.5, y / 30));
        const dayFactor = useGameStore.getState().isDay ? 1.0 : 0.6;
        ambientWind.current.frequency.setTargetAtTime(400 * heightFactor * dayFactor, audioContext.currentTime, 0.5);
        windGain.current.gain.setTargetAtTime(0.03 * heightFactor * volume, audioContext.currentTime, 0.5);
      }
    }
  });

  return null;
};

export function GameScene({
  gameState,
  isWorldBuilt,
  bossSystem,
  petSystem,
  showStats,
  showAchievements,
  showSpellUpgrades,
  showAuthModal
}) {
  const anyPanelOpen = gameState.showInventory || gameState.showCrafting ||
    gameState.showMagic || gameState.showBuildingTools ||
    gameState.showSettings || gameState.showTradingInterface ||
    gameState.selectedVillager || gameState.showWorldManager ||
    showAchievements || showSpellUpgrades || showAuthModal;
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
        
        <ambientLight intensity={gameState.isDay ? 0.6 : 0.25} />
        
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

        <SpatialAudioController />

        {!anyPanelOpen && <PointerLockControls makeDefault />}

        <PositionTracker />

        <Suspense fallback={null}>
          <Physics gravity={[0, -30, 0]}>
            <MinecraftWorld />

            <Player isWorldBuilt={isWorldBuilt} />

            <EnhancedMagicSystem />

            <NPCSystem />

            <BossEntity
              bossActive={bossSystem.bossActive}
              bossPositionRef={bossSystem.bossPositionRef}
              bossPhase={bossSystem.bossPhase}
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
