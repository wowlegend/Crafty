import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGameStore } from './store/useGameStore';
import { useGameSounds } from './SoundManager';
import * as THREE from 'three';
import { World } from 'miniplex';
import { ecs, mobsQuery, alliesQuery } from './ecs/world';
import { convertMobToAlly } from './game/allegiance';
import { GameMethods } from './GameMethods';
import { isPointInCone } from './combat/cone.js';
import { isCaptureMode } from './devtest/captureMode';
import { DamageNumber, ImpactShockwave } from './render/combatVfx';
import { XPOrbRender, LootDropRender, LootPopRender } from './render/pickupVfx';
import { DeathFxRender } from './render/deathVfx';
import { stepXPOrb, stepLootDrop } from './game/xpOrbStepper';
import { sparkFor, hitKnockback, deathBurst } from './game/mobHitFx';
import { getItemRarity } from './data/items.js';
import { rarityBeam } from './game/lootJuice.js';
import { emitMobKill } from './game/mobKillBus.js';
import { DEATH_DISSOLVE_MS } from './game/deathFx.js';
import { HITSTOP } from './game/trauma.js';
import { MobModel } from './render/MobModel';
import { MinimapSyncSystem } from './systems/MinimapSyncSystem';
import { EnemyProjectileSystem } from './systems/EnemyProjectileSystem';
import { SpawnerSystem } from './systems/SpawnerSystem';
import { AIWorkerSystem } from './systems/AIWorkerSystem';


const xpOrbsQuery = ecs.with('isXPOrb', 'position', 'amount');
const lootDropsQuery = ecs.with('isLootDrop', 'position', 'item', 'xp');

// Shared monotonic id for ECS-spawned pickups (loot drops + XP orbs). These are
// rendered with key={loot.id}/key={orb.id}; without a stamped id React threw the
// duplicate/undefined unique-key warning. One counter keeps both streams unique.
let _spawnId = 0;

const spawnLootDrop = (item, xp, pos) => {
  // Capture-determinism: in capture mode the LootSystem physics loop is frozen, so the
  // drop never moves -> a zero velocity keeps the drop pinned exactly at its spawn pos
  // (no reliance on Math.random in the capture path). Gameplay keeps the random pop arc.
  const capture = isCaptureMode();
  const angle = capture ? 0 : Math.random() * Math.PI * 2;
  const speed = capture ? 0 : 1.0 + Math.random() * 2.0;
  const vx = Math.cos(angle) * speed;
  const vy = capture ? 0 : 3 + Math.random() * 3; // vertical pop
  const vz = Math.sin(angle) * speed;

  const spawnPos = pos
    ? new THREE.Vector3(pos[0], pos[1] + 0.3, pos[2])
    : new THREE.Vector3(0, 15, 0);

  ecs.add({
    id: _spawnId++,
    isLootDrop: true,
    item,
    xp: xp || 0,
    position: spawnPos,
    velocity: new THREE.Vector3(vx, vy, vz),
    spawnTime: performance.now(),
    age: 0
  });
};
GameMethods.spawnLootDrop = spawnLootDrop;

// Custom miniplex React hook for compatibility
const useEntities = (query) => {
  const [entities, setEntities] = useState([...query.entities]);
  useEffect(() => {
    const update = () => setEntities([...query.entities]);
    const unsubAdded = query.onEntityAdded.subscribe(update);
    const unsubRemoved = query.onEntityRemoved.subscribe(update);
    return () => {
      unsubAdded();
      unsubRemoved();
    };
  }, [query]);
  return entities;
};

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

const CombatSystem = ({ setDamageNumbers, setShockwaves, damageId }) => {
  const { playHit } = useGameSounds();
  useEffect(() => {
    const damageMob = (id, damage = 25, type = 'physical', source = 'player', spawnRing = true) => {
      const entity = mobsQuery.entities.find(e => e.id === id);
      if (!entity) return null;

      // Phase 9 / S1-D-M1: Visceral Hitstop (micro-freeze for game feel).
      // Was a MAIN-THREAD BUSY-WAIT (a spin loop on the wall clock) that froze
      // the entire tab — rendering, audio, AND input — for 35ms. Replaced with a
      // non-blocking store flag: a `performance.now()` timestamp the player movement
      // loop reads to clamp its motion toward zero for the window. Same felt micro-
      // freeze, zero main-thread stall, and it benefits every damageMob caller
      // (melee AND spells). Shorter window (28ms) since it's now a true motion dip,
      // not a wall-clock stall stacked on top of frame time.
      // S2-B3-M1: hitstop is PLAYER feel — an ally's hit must not clamp the player's motion.
      // SOTA M1: weight-TIERED hitstop (was a flat 28ms that collapsed the light/heavy/crit hierarchy --
      // the audit's #1 game-feel gap). Tier by the incoming damage (matches the isCrit>=40 proxy below) +
      // scale by the global juiceIntensity dial.
      if (source === 'player') {
        const weight = damage >= 40 ? 'crit' : damage >= 30 ? 'heavy' : 'light';
        const ji = useGameStore.getState().juiceIntensity ?? 1;
        useGameStore.setState({ hitstopUntil: performance.now() + HITSTOP[weight] * ji });
      }

      const store = useGameStore.getState();

      // Hit direction (away-from-player, world unit) -- computed up-front so the camera shake, the
      // spark cone, AND the flinch tilt all share the SAME vector (pure pulls -> game/mobHitFx.js).
      const { knockback, hitDir } = hitKnockback(entity.position, store.gameCamera ? store.gameCamera.position : null);
      if (knockback) entity.knockback = knockback;
      entity.hitDirection = new THREE.Vector3(hitDir[0], hitDir[1], hitDir[2]);

      // NOTE (M5 review [B]): this is a MAGNITUDE proxy ("big hit -> bigger spray"), NOT the crit
      // source-of-truth (that's the real isCrit at Components.jsx triggerMeleeAttack). Since M5 the
      // incoming `damage` is form-multiplied, so heavy beast forms (ice/golem) cross 40 more often and
      // light forms (comet/hawk) less — intended feel. Thread the real isCrit here only if Kevin wants
      // the spray to track the crit ROLL rather than the damage magnitude (combat-differentiation depth).
      const isCrit = damage >= 40;
      // S2-B3-M1: camera shake is PLAYER feel — 3 allies on attack cooldowns would judder it continuously.
      if (source === 'player' && store.triggerCameraShake) {
        store.triggerCameraShake(isCrit ? 1.6 : 1.0, hitDir[0], hitDir[2]);
      }
      
      // Phase 11: Spatial Hit Sound
      if (store.playSpatialSound) {
        store.playSpatialSound('hit', [entity.position.x, entity.position.y, entity.position.z]);
      } else {
        playHit();
      }

      // SOTA High-performance fully GPU-driven particle burst triggering
      if (store.triggerGPUSparks) {
        const { color: sparkColor, count } = sparkFor(type, isCrit); // pure pull -> game/mobHitFx.js (S3-M6)

        store.triggerGPUSparks(
          new THREE.Vector3(entity.position.x, entity.position.y + 0.8, entity.position.z),
          sparkColor,
          count,
          type,
          hitDir
        );
      }

      entity.health -= damage;
      entity.lastHit = performance.now();

      setDamageNumbers(nums => [...nums, {
        id: damageId.current++,
        damage,
        type,
        position: [entity.position.x, entity.position.y, entity.position.z]
      }]);

      // spawnRing=false from spell-projectile hits, which render their own SpellImpactPop ring
      // (EnhancedMagicSystem.createSpellImpact) — avoids the double ImpactShockwave+SpellImpactPop stack.
      if (spawnRing) setShockwaves(waves => [...waves, {
        id: damageId.current++,
        type,
        position: [entity.position.x, entity.position.y + 0.1, entity.position.z]
      }]);

      if (entity.health <= 0 && !entity.dyingUntil) {
        const store = useGameStore.getState();

        // Spawn warm-gold XP motes (recoloured from the old garish green). XP drops only on YOUR kills
        // (S2-B3-M1: ally kills would farm pickups). CAP the COUNT so a high-XP kill is a tasteful few
        // motes, not a confetti storm — and scale each mote's value to totalXP/count so no XP is lost.
        const totalXP = source === 'player' ? (entity.xp || 10) : 0;
        const count = totalXP > 0 ? Math.min(6, Math.max(1, Math.round(totalXP / 8))) : 0;
        const orbValue = count > 0 ? Math.ceil(totalXP / count) : 0;
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 1.0 + Math.random() * 1.4;  // gentler scatter (was 1.5 + 2.5 -> "spilled like confetti")
          const vx = Math.cos(angle) * speed;
          const vy = 3 + Math.random() * 2.2; // softer upward pop (was 4 + 4)
          const vz = Math.sin(angle) * speed;

          ecs.add({
            id: _spawnId++,
            isXPOrb: true,
            position: new THREE.Vector3(entity.position.x, entity.position.y + 0.2, entity.position.z),
            velocity: new THREE.Vector3(vx, vy, vz),
            amount: orbValue,
            spawnTime: performance.now(),
            age: 0
          });
        }

        // Death FINISHER: a bigger, mob-coloured spark burst so a kill reads as a payoff (was silent --
        // the mob just vanished). Reuses the proven GPU spark pool; capture-safe (no kills under capture).
        // W2-T5: pass the FULL deathBurst descriptor -- db.color carries the hue-preserving dark-mob
        // tint floor, db.burst selects the upward-biased death velocity branch, hitDir gives the rise
        // a directional lean away from the player. A t=0 flash + a fading ground decal are spawned too.
        const db = deathBurst(entity.type);
        const deathPos = new THREE.Vector3(entity.position.x, entity.position.y + 0.8, entity.position.z);
        if (store.triggerGPUSparks) {
          store.triggerGPUSparks(deathPos, db.color, db.count, db.burst, entity.hitDirection);
        }
        if (GameMethods.spawnDeathFx) {
          GameMethods.spawnDeathFx([entity.position.x, entity.position.y, entity.position.z], deathPos.y, db.color);
        }
        emitMobKill(entity.type, [entity.position.x, entity.position.y, entity.position.z], source); // M3.5 fan-out + B3-M1 attribution
        // M2 #7 death weight: defer removal behind a dissolve so a kill has WEIGHT (XP / spark / kill-bus
        // already fired this frame). The dying-sweep removes the corpse after the dissolve elapses.
        entity.dyingUntil = performance.now() + DEATH_DISSOLVE_MS;
      }
      return entity;
    };

    // S2-B3-M3: capture a mob into the squad — the SNARE bind's apply-path (M4 calls this).
    const captureMob = (id) => {
      const entity = mobsQuery.entities.find(e => e.id === id);
      if (!entity || entity.health <= 0) return null;
      return convertMobToAlly(ecs, entity);
    };

    useGameStore.setState({ damageMob: damageMob });
    GameMethods.damageMob = damageMob;
    GameMethods.captureMob = captureMob;

    const checkMobCollision = (pos, range = 3) => {
      return mobsQuery.entities.find(e => {
        const dx = e.position.x - pos.x;
        const dy = e.position.y - pos.y;
        const dz = e.position.z - pos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        return dist < range;
      });
    };

    const checkMobsInMeleeCone = (playerPos, lookDir, range = 4.5, angleRad = Math.PI / 2) => {
      // Cone geometry extracted to the pure, unit-tested helper `isPointInCone`
      // (src/combat/cone.js) so the SAME front-arc test is reused for the boss
      // (Components.jsx triggerMeleeAttack). Behaviour here is IDENTICAL.
      return mobsQuery.entities.filter(e =>
        isPointInCone(playerPos, lookDir, e.position, range, angleRad)
      );
    };

    useGameStore.setState({ checkMobCollision: checkMobCollision, checkMobsInMeleeCone: checkMobsInMeleeCone });
    GameMethods.checkMobCollision = checkMobCollision;
    GameMethods.checkMobsInMeleeCone = checkMobsInMeleeCone;
  }, [setDamageNumbers, setShockwaves]);

  return null;
};

// --- ORCHESTRATOR ---
// EnemyProjectileSystem extracted -> src/systems/EnemyProjectileSystem.jsx (v6 de-monolith A1.2).

// --- XP Orb Physics & Pull System ---
const XPOrbSystem = () => {
  const { camera } = useThree();
  const { playPickup } = useGameSounds();

  useFrame((state, delta) => {
    if (!camera) return;
    const store = useGameStore.getState();
    const playerPos = camera.position;

    for (const entity of [...xpOrbsQuery.entities]) {
      // physics extracted to the pure game/xpOrbStepper.js (S3-M6 NPC de-monolith, byte-equivalent);
      // the component keeps the ECS iteration + the collect side-effects.
      const collected = stepXPOrb(entity, delta, {
        playerPos,
        groundYAt: store.getMobGroundLevel,
      }).collected;
      if (collected) {
        if (GameMethods.grantXP) GameMethods.grantXP(entity.amount);
        if (GameMethods.spawnXPText) GameMethods.spawnXPText(entity.amount, entity.position);
        playPickup();
        ecs.remove(entity);
      }
    }
  });

  return null;
};


// --- Physical Loot Helpers ---
// Re-exported for the M3 loot/rarity characterization tests, which import
// getItemRarity from this module. M3-T3 routed rarity through the single registry
// in src/data/items.js (removing the local duplicate with its emoji-fallback
// branches), so this re-export now resolves to the registry — resolving the prior
// cross-file divergence with GamePanels (both re-export the same registry function).
export { getItemRarity };

// --- Loot Physics & Pull System ---
const LootSystem = () => {
  const { camera } = useThree();
  const { playPickup } = useGameSounds();

  useFrame((state, delta) => {
    if (!camera) return;
    // Capture-determinism: FREEZE the loot physics/magnet/collection loop so spawned
    // fixture drops hold their exact spawn position (no gravity arc, no camera-magnet
    // pull, no auto-collect) -> the loot-showcase frame is byte-stable. Mirrors the mob
    // AI freeze (NPCSystem useFrame early-returns in capture). No-op in gameplay.
    if (isCaptureMode()) return;
    const store = useGameStore.getState();
    const playerPos = camera.position;

    for (const entity of [...lootDropsQuery.entities]) {
      // physics extracted to the pure game/xpOrbStepper.js stepLootDrop (S3-M6, byte-equivalent;
      // magnet range 7 / base 40 / floor 3); the component keeps the loot collect side-effects.
      const collected = stepLootDrop(entity, delta, {
        playerPos,
        groundYAt: store.getMobGroundLevel,
      }).collected;
      if (collected) {
        if (store.addToInventory) store.addToInventory(entity.item, 1);
        if (entity.xp > 0 && GameMethods.grantXP) GameMethods.grantXP(entity.xp, entity.item);
        if (entity.xp > 0 && GameMethods.spawnXPText) GameMethods.spawnXPText(entity.xp, entity.position);
        if (store.addNotification) store.addNotification(`Looted: ${entity.item}`, 'loot');
        playPickup();
        // M3c-T2: rarity-tinted pickup pop at the collect point (same color as the drop's beam).
        if (GameMethods.spawnLootPop) GameMethods.spawnLootPop(entity.position, rarityBeam(getItemRarity(entity.item)).color);
        ecs.remove(entity);
      }
    }
  });

  return null;
};

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
