import React, { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from './store/useGameStore';
import { mobsQuery, alliesQuery } from './ecs/world';
import { GameMethods } from './GameMethods';
import { DamageNumber, ImpactShockwave } from './render/combatVfx';
import { XPOrbRender, LootDropRender, LootPopRender } from './render/pickupVfx';
import { DeathFxRender } from './render/deathVfx';
import { getItemRarity } from './data/items.js';
import { MobModel } from './render/MobModel';
import { MinimapSyncSystem } from './systems/MinimapSyncSystem';
import { EnemyProjectileSystem } from './systems/EnemyProjectileSystem';
import { SpawnerSystem } from './systems/SpawnerSystem';
import { AIWorkerSystem } from './systems/AIWorkerSystem';
import { xpOrbsQuery, lootDropsQuery, useEntities } from './systems/_npcShared';
import { XPOrbSystem } from './systems/XPOrbSystem';
import { LootSystem } from './systems/LootSystem';
import { CombatSystem } from './systems/CombatSystem';


// XP/loot queries + _spawnId/spawnLootDrop + the useEntities miniplex hook hoisted ->
// src/systems/_npcShared.js (v6 de-monolith A1.5). Imported above; CombatSystem uses nextSpawnId().

// AI_TICK_SEC + aggro-growl consts moved with AIWorkerSystem -> src/systems/AIWorkerSystem.jsx (A1.4).

// Mob Model Component with variety - PURE ECS RENDERER
// React.memo on the per-entity renderers (STATE-REVIEW-2026-06-10 #4 mitigation): the useEntities
// bridge re-renders NPCSystem on every entity add/remove; memo + stable miniplex entity refs
// confine that to the changed children — a kill burst (mob remove + N orb adds/removes) now
// reconciles only the changed keys instead of every mounted mob/orb/loot subtree. The full
// DEEPEN (transient query reads in useFrame, no bridge) stays tracked in the PRE-S2B audit.

// --- ECS SYSTEMS ---
// SpawnerSystem extracted -> src/systems/SpawnerSystem.jsx (v6 de-monolith A1.3).

// AIWorkerSystem extracted -> src/systems/AIWorkerSystem.jsx (v6 de-monolith A1.4).

// MinimapSyncSystem extracted -> src/systems/MinimapSyncSystem.jsx (v6 de-monolith A1.1).

// CombatSystem extracted -> src/systems/CombatSystem.jsx (v6 de-monolith A1.8).

// --- ORCHESTRATOR ---
// EnemyProjectileSystem extracted -> src/systems/EnemyProjectileSystem.jsx (v6 de-monolith A1.2).

// XPOrbSystem extracted -> src/systems/XPOrbSystem.jsx (v6 de-monolith A1.6).

// --- Physical Loot Helpers ---
// Re-exported for the M3 loot/rarity characterization tests, which import
// getItemRarity from this module. M3-T3 routed rarity through the single registry
// in src/data/items.js (removing the local duplicate with its emoji-fallback
// branches), so this re-export now resolves to the registry — resolving the prior
// cross-file divergence with GamePanels (both re-export the same registry function).
export { getItemRarity };

// LootSystem extracted -> src/systems/LootSystem.jsx (v6 de-monolith A1.7).

export const NPCSystem = React.memo(() => {
  const [damageNumbers, setDamageNumbers] = useState([]);
  const [shockwaves, setShockwaves] = useState([]);
  const [lootPops, setLootPops] = useState([]);
  const [deathFx, setDeathFx] = useState([]);
  const damageId = useRef(0);
  const entities = useEntities(mobsQuery);
  const allies = useEntities(alliesQuery); // S2-B3-M5: bound creatures RENDER again (they left mobsQuery at bind)
  const xpOrbs = useEntities(xpOrbsQuery);
  const lootDrops = useEntities(lootDropsQuery);

  const removeDamageNumber = (id) => {
    setDamageNumbers(prev => prev.filter(d => d.id !== id));
  };

  useEffect(() => {
    GameMethods.spawnXPText = (amount, position) => {
      setDamageNumbers(prev => [...prev, {
        id: damageId.current++,
        isXP: true,
        damage: amount,
        position: [position.x, position.y, position.z]
      }]);
    };
    // M7-T3: the gold WALL HIT! label — fired by HurlSystem when the anvil 3x lands.
    GameMethods.spawnAnvilText = (position) => {
      setDamageNumbers(prev => [...prev, {
        id: damageId.current++,
        isAnvil: true,
        damage: 0,
        position: [position.x, position.y + 0.6, position.z]
      }]);
    };
    // M3c-T2: rarity-tinted pickup pop, fired from the LootSystem collect branch.
    GameMethods.spawnLootPop = (position, color) => {
      setLootPops(prev => [...prev, {
        id: damageId.current++,
        position: [position.x, position.y + 0.1, position.z],
        color
      }]);
    };
    // W2-T5: mob-death flourish -- a t=0 hot flash at the burst centre + a fading ground-ring decal
    // in the mob's hue-preserved colour, fired from the damageMob kill path.
    GameMethods.spawnDeathFx = (position, flashY, color) => {
      setDeathFx(prev => [...prev, {
        id: damageId.current++,
        position,
        flashY,
        color
      }]);
    };
  }, []);

  return (
    <group>
      <SpawnerSystem />
      <AIWorkerSystem />
      <MinimapSyncSystem />
      <CombatSystem setDamageNumbers={setDamageNumbers} setShockwaves={setShockwaves} damageId={damageId} />
      <EnemyProjectileSystem />
      <XPOrbSystem />
      <LootSystem />

      {entities.filter(entity => entity && (entity.health > 0 || entity.dyingUntil)).map(entity => (
        <MobModel key={entity.id} entity={entity} />
      ))}

      {/* S2-B3-M5: the squad — the same parametric MobModel (the jade color lerp from the bind
          already differentiates; a rim treatment is M6-look-judge material). */}
      {allies.map(entity => (
        <MobModel key={'ally-' + entity.id} entity={entity} />
      ))}

      {xpOrbs.map(orb => (
        <XPOrbRender key={orb.id} entity={orb} />
      ))}

      {lootDrops.map(loot => (
        <LootDropRender key={loot.id} entity={loot} />
      ))}

      {damageNumbers.map(dmg => (
        <DamageNumber
          key={dmg.id}
          id={dmg.id}
          damage={dmg.damage}
          isXP={dmg.isXP}
          isAnvil={dmg.isAnvil}
          type={dmg.type}
          position={dmg.position}
          onComplete={removeDamageNumber}
        />
      ))}

      {shockwaves.map(wave => (
        <ImpactShockwave
          key={wave.id}
          id={wave.id}
          position={wave.position}
          type={wave.type}
          onComplete={(id) => setShockwaves(prev => prev.filter(w => w.id !== id))}
        />
      ))}

      {lootPops.map(pop => (
        <LootPopRender
          key={pop.id}
          id={pop.id}
          position={pop.position}
          color={pop.color}
          onComplete={(id) => setLootPops(prev => prev.filter(p => p.id !== id))}
        />
      ))}

      {deathFx.map(fx => (
        <DeathFxRender
          key={fx.id}
          id={fx.id}
          position={fx.position}
          flashY={fx.flashY}
          color={fx.color}
          onComplete={(id) => setDeathFx(prev => prev.filter(f => f.id !== id))}
        />
      ))}
    </group>
  );
});
