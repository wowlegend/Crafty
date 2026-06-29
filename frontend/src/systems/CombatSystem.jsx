import { useEffect } from 'react';
import * as THREE from 'three';
import { useGameSounds } from '../SoundManager';
import { useGameStore } from '../store/useGameStore';
import { ecs, mobsQuery } from '../ecs/world';
import { GameMethods } from '../GameMethods';
import { convertMobToAlly } from '../game/allegiance';
import { isPointInCone } from '../combat/cone.js';
import { sparkFor, hitKnockback, deathBurst } from '../game/mobHitFx';
import { emitMobKill } from '../game/mobKillBus.js';
import { DEATH_DISSOLVE_MS } from '../game/deathFx.js';
import { HITSTOP } from '../game/trauma.js';
import { nextSpawnId } from './_npcShared';

// CombatSystem -- registers damageMob / captureMob / checkMobCollision / checkMobsInMeleeCone on the
// store + GameMethods (the melee/spell hit-resolution + death/XP-drop + capture seam). Extracted VERBATIM
// from SimplifiedNPCSystem.jsx (v6 de-monolith A1.8); behavior unchanged. Keeps its orchestrator props
// (setDamageNumbers/setShockwaves/damageId). XP-orb spawn uses nextSpawnId() from ./_npcShared (A1.5).
export const CombatSystem = ({ setDamageNumbers, setShockwaves, damageId }) => {
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
            id: nextSpawnId(),
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
