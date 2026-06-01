import { useGameStore } from './store/useGameStore';
import { isCaptureMode } from './devtest/captureMode';
import React, { useRef, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { GameUI } from './Components';
import { CombatInstructions } from './SimplifiedNPCSystem';
import {
  PlayerHealthBar,
  PlayerManaBar,
  PlayerHungerBar,
  DamageOverlay,
  DeathScreen,
  SPELL_MANA_COSTS
} from './GameSystems';
import { SimpleExperienceBar, SimpleXPGainVisual, SimpleLevelUpEffect } from './SimpleExperienceSystem';
import { QuestTracker, NotificationStack, ChestIndicator } from './QuestSystem';
import { PetIndicator, SurvivalWarning, BossHealthBar } from './AdvancedGameFeatures';

const Minimap = React.memo(() => {
  const canvasRef = useRef(null);
  const MAP_SIZE = 130;
  const MAP_RANGE = 60;
  const [coords, setCoords] = React.useState({ x: 0, z: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const draw = () => {
      const playerPos = useGameStore.getState().playerPosition;
      if (!playerPos) return;

      setCoords({ x: playerPos.x, z: playerPos.z });

      ctx.fillStyle = 'rgba(10, 10, 20, 0.85)';
      ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i < MAP_SIZE; i += MAP_SIZE / 6) {
        ctx.beginPath();
        ctx.moveTo(i, 0); ctx.lineTo(i, MAP_SIZE);
        ctx.moveTo(0, i); ctx.lineTo(MAP_SIZE, i);
        ctx.stroke();
      }

      const cx = MAP_SIZE / 2;
      const cy = MAP_SIZE / 2;
      const scale = MAP_SIZE / MAP_RANGE;

      if (useGameStore.getState().mobEntities) {
        useGameStore.getState().mobEntities.forEach(mob => {
          const dx = (mob.position[0] - playerPos.x) * scale;
          const dz = (mob.position[2] - playerPos.z) * scale;
          if (Math.abs(dx) < MAP_SIZE / 2 && Math.abs(dz) < MAP_SIZE / 2) {
            ctx.beginPath();
            ctx.arc(cx + dx, cy + dz, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = mob.passive ? '#4ade80' : '#ef4444';
            ctx.fill();
          }
        });
      }

      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx, cy - 4);
      ctx.lineTo(cx - 2.5, cy + 2);
      ctx.lineTo(cx + 2.5, cy + 2);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.font = '9px Orbitron, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('N', cx, 10);
    };

    const interval = setInterval(draw, 250);
    draw();
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="absolute bottom-20 right-4 z-20 pointer-events-none">
      <div className="minimap-container">
        <canvas ref={canvasRef} width={MAP_SIZE} height={MAP_SIZE} />
      </div>
      <div className="text-center text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'Orbitron, monospace' }}>
        {coords.x}, {coords.z}
      </div>
    </div>
  );
});

const Compass = React.memo(({ treasureChests, bossSystem }) => {
  const containerRef = useRef(null);

  useEffect(() => {
    let animFrame;
    
    const updateCompass = () => {
      // Dev capture-determinism: in capture mode the follow-cam is pinned, so the
      // compass markers are fully determined by the frozen camera + marker positions.
      // Render ONCE and do NOT reschedule the rAF loop — a continuously running loop
      // re-derives the float `left: %` each frame and rounds to sub-pixel-different
      // marker x-positions between runs (a ~500px top-of-frame flicker). Inert in
      // normal gameplay: the loop runs every frame exactly as before.
      if (!isCaptureMode()) animFrame = requestAnimationFrame(updateCompass);

      const container = containerRef.current;
      if (!container) return;

      const state = useGameStore.getState();
      const camera = state.gameCamera;
      const playerPos = state.playerPosition;
      if (!camera || !camera.matrixWorld || !playerPos) return;

      // Extract horizontal heading from the camera's matrixWorld
      const el = camera.matrixWorld.elements;
      const fx = -el[8];
      const fz = -el[10];
      const heading = Math.atan2(fx, -fz);

      // 180 degrees field of view (visible markers)
      const fov = Math.PI; 
      
      // Cardinal points definitions
      const cardinals = [
        { label: 'N', angle: 0 },
        { label: 'NE', angle: Math.PI / 4 },
        { label: 'E', angle: Math.PI / 2 },
        { label: 'SE', angle: 3 * Math.PI / 4 },
        { label: 'S', angle: Math.PI },
        { label: 'SW', angle: -3 * Math.PI / 4 },
        { label: 'W', angle: -Math.PI / 2 },
        { label: 'NW', angle: -Math.PI / 4 },
      ];

      const markersHtml = [];

      // 1. Render Cardinal Ticks
      cardinals.forEach(c => {
        let diff = c.angle - heading;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;

        if (Math.abs(diff) < fov / 2) {
          const pct = ((diff / (fov / 2)) * 50) + 50; // Map [-fov/2, fov/2] to [0, 100]
          markersHtml.push(`
            <div class="absolute top-0 transform -translate-x-1/2 flex flex-col items-center" style="left: ${pct}%">
              <span class="text-[10px] font-bold text-slate-200 tracking-wider">${c.label}</span>
              <div class="w-[1px] h-1.5 bg-slate-400/50 mt-0.5"></div>
            </div>
          `);
        }
      });

      // 2. Render Boss Marker
      const bossActive = bossSystem?.bossActive;
      const getBossPosition = state.getBossPosition;
      const bossPos = (bossActive && getBossPosition) ? getBossPosition() : null;
      if (bossPos) {
        const dx = bossPos[0] - playerPos.x;
        const dz = bossPos[2] - playerPos.z;
        const dist = Math.round(Math.sqrt(dx * dx + dz * dz));
        const targetAngle = Math.atan2(dx, -dz);
        
        let diff = targetAngle - heading;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;

        if (Math.abs(diff) < fov / 2) {
          const pct = ((diff / (fov / 2)) * 50) + 50;
          markersHtml.push(`
            <div class="absolute top-0.5 transform -translate-x-1/2 flex flex-col items-center z-10" style="left: ${pct}%">
              <span class="text-[9px] font-bold text-rose-500 animate-pulse drop-shadow-[0_0_4px_rgba(239,68,68,0.5)]">🐉 BOSS (${dist}m)</span>
              <div class="w-1.5 h-1.5 bg-rose-500 rounded-full mt-0.5 animate-ping"></div>
            </div>
          `);
        }
      }

      // 3. Render Chest Markers
      const chests = treasureChests?.chests || [];
      const openedChestIds = treasureChests?.openedChestIds || new Set();
      chests.forEach(chest => {
        const isOpened = openedChestIds instanceof Set ? openedChestIds.has(chest.id) : openedChestIds.includes(chest.id);
        if (isOpened) return;
        
        const dx = chest.position[0] - playerPos.x;
        const dz = chest.position[2] - playerPos.z;
        const dist = Math.round(Math.sqrt(dx * dx + dz * dz));
        if (dist > 80) return; // Hide distant chests

        const targetAngle = Math.atan2(dx, -dz);
        let diff = targetAngle - heading;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;

        if (Math.abs(diff) < fov / 2) {
          const pct = ((diff / (fov / 2)) * 50) + 50;
          markersHtml.push(`
            <div class="absolute top-0.5 transform -translate-x-1/2 flex flex-col items-center" style="left: ${pct}%">
              <span class="text-[8px] font-semibold text-amber-400 drop-shadow-[0_0_2px_rgba(251,191,36,0.3)]">📦 Chest (${dist}m)</span>
              <div class="w-1 h-1 bg-amber-400 rounded-full mt-1"></div>
            </div>
          `);
        }
      });

      // 4. Render Villager NPC Markers
      const mobEntities = state.mobEntities || [];
      mobEntities.forEach(mob => {
        if (mob.type !== 'villager') return;
        const dx = mob.position[0] - playerPos.x;
        const dz = mob.position[2] - playerPos.z;
        const dist = Math.round(Math.sqrt(dx * dx + dz * dz));
        if (dist > 60) return; // Hide distant NPCs

        const targetAngle = Math.atan2(dx, -dz);
        let diff = targetAngle - heading;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;

        if (Math.abs(diff) < fov / 2) {
          const pct = ((diff / (fov / 2)) * 50) + 50;
          markersHtml.push(`
            <div class="absolute top-0.5 transform -translate-x-1/2 flex flex-col items-center" style="left: ${pct}%">
              <span class="text-[8px] font-semibold text-emerald-400 drop-shadow-[0_0_2px_rgba(52,211,153,0.3)]">🧙‍♂️ NPC (${dist}m)</span>
              <div class="w-1 h-1 bg-emerald-400 rounded-full mt-1"></div>
            </div>
          `);
        }
      });

      container.innerHTML = markersHtml.join('');
    };

    updateCompass();
    return () => cancelAnimationFrame(animFrame);
  }, [treasureChests, bossSystem]);

  return (
    <div className="absolute top-3 left-1/2 transform -translate-x-1/2 z-20 pointer-events-none flex flex-col items-center">
      <div className="w-[320px] h-[34px] bg-slate-950/70 border border-slate-700/50 rounded-xl relative flex items-center justify-center overflow-hidden" style={{
        boxShadow: 'inset 0 0 12px rgba(0, 0, 0, 0.8), 0 4px 15px rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(8px)',
      }}>
        {/* Alignment reticle line */}
        <div className="absolute top-0 bottom-0 w-[1.5px] bg-sky-400/80 z-20 shadow-[0_0_6px_rgba(56,189,248,0.8)]"></div>
        {/* Scrolling Marker track */}
        <div ref={containerRef} className="w-[280px] h-full relative overflow-hidden font-mono"></div>
      </div>
    </div>
  );
});

export function HUD({
  isPointerLocked,
  isWorldBuilt,
  gameState,
  gameSystems,
  experienceSystem,
  questSystem,
  treasureChests,
  survivalMode,
  bossSystem,
  petSystem,
  spellUpgrades,
  showStats,
  setShowStats,
  setIsPointerLocked
}) {
  return (
    <>
      <AnimatePresence>
        {isPointerLocked && gameSystems.isAlive && isWorldBuilt && (
          <>
            <GameUI
              gameState={gameState}
              showStats={showStats}
              setShowStats={setShowStats}
            />
            <CombatInstructions />

            <Compass treasureChests={treasureChests} bossSystem={bossSystem} />

            <div className="absolute top-16 left-4 pointer-events-none z-20 space-y-2">
              <PlayerHealthBar health={gameSystems.health} maxHealth={gameSystems.maxHealth} />
              <PlayerManaBar mana={gameSystems.mana} maxMana={gameSystems.maxMana} />
              <PlayerHungerBar hunger={gameSystems.hunger} />
            </div>

            <div className="absolute top-16 left-1/2 transform -translate-x-1/2 z-20 pointer-events-none">
              <div className="bg-black/60 px-4 py-2 rounded-lg text-white text-sm text-center">
                <span className="text-gray-400">Spell: </span>
                <span style={{ color: gameState.activeSpell === 'fireball' ? '#FF4500' : gameState.activeSpell === 'iceball' ? '#00BFFF' : gameState.activeSpell === 'lightning' ? '#FFD700' : '#9932CC' }}>
                  {gameState.activeSpell.toUpperCase()}
                </span>
                <span className="text-gray-400 ml-2">({SPELL_MANA_COSTS[gameState.activeSpell]} MP)</span>
              </div>
            </div>

            <SimpleExperienceBar
              level={experienceSystem.playerLevel}
              currentXP={experienceSystem.currentXP}
              xpRequired={experienceSystem.xpRequired}
              xpProgress={experienceSystem.xpProgress}
            />

            <SimpleXPGainVisual xpGains={experienceSystem.xpGains} />

            <SimpleLevelUpEffect
              levelUpEffects={experienceSystem.levelUpEffects}
              onEffectComplete={(id) => {
                experienceSystem.setLevelUpEffects(prev =>
                  prev.filter(effect => effect.id !== id)
                );
              }}
            />

            <Minimap />

            <QuestTracker quests={questSystem.quests} onClaim={questSystem.claimQuest} />

            <NotificationStack notifications={questSystem.notifications} />

            <ChestIndicator
              chests={treasureChests.chests}
              openedChestIds={treasureChests.openedChestIds}
            />

            <PetIndicator pets={petSystem.pets} />

            <AnimatePresence>
              <SurvivalWarning message={survivalMode.survivalWarning} />
            </AnimatePresence>

            <BossHealthBar
              bossActive={bossSystem.bossActive}
              bossHealth={bossSystem.bossHealth}
              bossMaxHealth={bossSystem.bossMaxHealth}
              bossPhase={bossSystem.bossPhase}
            />

            {bossSystem.bossNotification && (
              <div className="absolute top-48 left-1/2 transform -translate-x-1/2 z-30 pointer-events-none">
                <div className="px-6 py-3 rounded-xl text-white font-bold text-sm" style={{
                  background: 'linear-gradient(135deg, rgba(75,0,130,0.9), rgba(139,0,139,0.9))',
                  border: '2px solid #8B00FF',
                  boxShadow: '0 0 25px rgba(139,0,255,0.4)',
                  textShadow: '0 2px 4px rgba(0,0,0,0.5)',
                }}>{bossSystem.bossNotification}</div>
              </div>
            )}
            {petSystem.petNotification && (
              <div className="absolute top-56 left-1/2 transform -translate-x-1/2 z-30 pointer-events-none">
                <div className="px-4 py-2 rounded-lg text-white text-sm font-bold" style={{
                  background: 'rgba(255,105,180,0.9)',
                  border: '1px solid #ff69b4',
                  boxShadow: '0 0 15px rgba(255,105,180,0.4)',
                }}>{petSystem.petNotification}</div>
              </div>
            )}
            {spellUpgrades.upgradeNotification && (
              <div className="absolute top-64 left-1/2 transform -translate-x-1/2 z-30 pointer-events-none">
                <div className="px-4 py-2 rounded-lg text-white text-sm font-bold" style={{
                  background: 'rgba(147,51,234,0.9)',
                  border: '1px solid #9333ea',
                  boxShadow: '0 0 15px rgba(147,51,234,0.4)',
                }}>{spellUpgrades.upgradeNotification}</div>
              </div>
            )}
          </>
        )}
      </AnimatePresence>

      <DamageOverlay active={gameSystems.damageFlash} intensity={gameSystems.screenShake} />

      {!gameSystems.isAlive && (
        <DeathScreen onRespawn={() => {
          gameSystems.respawn();
          if (useGameStore.getState().onPlayerDeath) useGameStore.getState().onPlayerDeath();
          
          // Re-acquire pointer lock upon respawning
          const state = useGameStore.getState();
          if (state.requestPointerLock) {
            state.requestPointerLock();
          } else {
            const canvas = document.querySelector('canvas');
            if (canvas && canvas.requestPointerLock) {
              canvas.requestPointerLock();
            } else if (document.body.requestPointerLock) {
              document.body.requestPointerLock();
            }
          }
          setIsPointerLocked(true);
        }} />
      )}
      
      {isPointerLocked && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-30">
          <div className="w-6 h-6">
            <div className="absolute top-1/2 left-1/2 w-4 h-0.5 bg-white transform -translate-x-1/2 -translate-y-1/2 shadow-lg"></div>
            <div className="absolute top-1/2 left-1/2 w-0.5 h-4 bg-white transform -translate-x-1/2 -translate-y-1/2 shadow-lg"></div>
          </div>
        </div>
      )}
    </>
  );
}
