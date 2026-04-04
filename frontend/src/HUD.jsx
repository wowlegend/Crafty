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

export const Minimap = React.memo(({ playerPosition }) => {
  const canvasRef = useRef(null);
  const MAP_SIZE = 130;
  const MAP_RANGE = 60;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const draw = () => {
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

      if (window._mobEntities) {
        window._mobEntities.forEach(mob => {
          const dx = (mob.position[0] - playerPosition.x) * scale;
          const dz = (mob.position[2] - playerPosition.z) * scale;
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
  }, [playerPosition]);

  return (
    <div className="absolute bottom-20 right-4 z-20 pointer-events-none">
      <div className="minimap-container">
        <canvas ref={canvasRef} width={MAP_SIZE} height={MAP_SIZE} />
      </div>
      <div className="text-center text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'Orbitron, monospace' }}>
        {playerPosition.x}, {playerPosition.z}
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
  playerPosition,
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
              playerPosition={playerPosition}
            />
            <CombatInstructions />

            <div className="absolute top-16 left-4 pointer-events-none z-20 space-y-2">
              <PlayerHealthBar health={gameSystems.playerHealth} maxHealth={gameSystems.maxHealth} />
              <PlayerManaBar mana={gameSystems.mana} maxMana={gameSystems.maxMana} />
              <PlayerHungerBar hunger={gameSystems.hunger} />
            </div>

            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20 pointer-events-none">
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

            <Minimap playerPosition={playerPosition} />

            <QuestTracker quests={questSystem.quests} onClaim={questSystem.claimQuest} />

            <NotificationStack notifications={questSystem.notifications} />

            <ChestIndicator
              playerPosition={playerPosition}
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
          if (window.onPlayerDeath) window.onPlayerDeath();
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
