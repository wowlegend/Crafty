import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import { consumeImbueCast } from './game/elemancerChannel';
import { requestZone } from './game/elemancerChannel';
import { useFrame } from '@react-three/fiber';
import { GameMethods } from './GameMethods';
import { useGameStore } from './store/useGameStore';
import { useGameSounds } from './SoundManager';
import { SPELL_MANA_COSTS } from './GameSystems';
import { solveSpellDamage } from './utils/combat';
import { resolveCastBaseDamage, resolveCastManaCost } from './utils/spellCast';
import { SPELL_TYPES } from './game/spells';
import { solveChainTargets } from './game/chainLightning';
import { SPARK_PROFILE } from './game/spellVisualProfiles';
import { isCaptureMode } from './devtest/captureMode';
import { notifyDenied } from './ui/denyToast';
import * as THREE from 'three';
import { EnhancedSpellProjectile, SpellImpactPop, CastTelegraph } from './render/spellVfx';
export { MagicWand } from './render/spellVfx';

export const EnhancedMagicSystem = React.memo(({ playerPosition }) => {
  const playSpatialSound = useGameStore(state => state.playSpatialSound);
  const { playMagicCast, playMagicHit, playMagicExplosion } = useGameSounds();
  const [projectiles, setProjectiles] = useState([]);
  const [spellImpacts, setSpellImpacts] = useState([]);
  const [telegraphs, setTelegraphs] = useState([]); // S1-D-M2: cast-start rune-circle pops
  const [debuffs, setDebuffs] = useState([]);
  const projectileId = useRef(0);
  const impactId = useRef(0);
  const telegraphId = useRef(0);
  const debuffId = useRef(0);

  const projectilesRef = useRef([]);
  const frameCounter = useRef(0);
  const projectilesDirty = useRef(false);


  const applyBurnEffect = useCallback((mobId, duration, dps) => {
    let ticksRemaining = Math.floor(duration);
    const burnInterval = setInterval(() => {
      if (ticksRemaining <= 0 || !GameMethods.damageMob) {
        clearInterval(burnInterval);
        return;
      }
      const mob = GameMethods.damageMob(mobId, dps, 'fireball');
      if (!mob) {
        clearInterval(burnInterval);
        return;
      }
      ticksRemaining--;
    }, 1000);
  }, []);

  const applyChainLightning = useCallback((startPos, excludeId, baseDamage, maxChains, range, damageReduction) => {
    // S3-M2 T3: the targeting is pure (game/chainLightning.js); this wrapper keeps the
    // live halves — the store snapshot read + the damage application.
    const allMobs = useGameStore.getState().mobEntities;
    if (!allMobs) return;
    const pos = startPos.clone ? startPos : new THREE.Vector3(startPos.x, startPos.y, startPos.z);
    const hits = solveChainTargets(allMobs, pos, { excludeId, baseDamage, maxChains, range, damageReduction });
    for (const h of hits) {
      if (GameMethods.damageMob) GameMethods.damageMob(h.id, h.damage, 'lightning');
    }
  }, []);

  // S1-D-M1: Spell impacts now route through the SOTA shared GPU spark pool
  // (`store.triggerGPUSparks`, the same 1200-spark instanced additive system melee uses)
  // instead of mounting 25-40 per-instance React spheres. Each impact also: spikes Bloom,
  // shakes the camera (harder on a mob KILL), and spawns ONE pooled shockwave-ring + one
  // transient point-light (the lightweight `spellImpacts` entry below — no per-particle
  // meshes). `wasKill` is passed by mob-hit callers so the kill gets a beefier shake.
  // S1-D POLISH: richer impact spray. Brighter, hotter spark hues (matched to the
  // projectile energy palette) + higher counts so the impact reads as a punchy burst of
  // light, not a thin sprinkle. Still routed through the SAME 1200-spark GPU pool (no new
  // per-instance React spheres) and capped at the pool's 120-per-burst ceiling. The pool
  // branches on the type string for its velocity profile (fire ring / ice shards / fast
  // lightning / arcane swirl); the count is multiplied 1.8x on a kill upstream.

  // S1-D-M2: cast TELEGRAPH — a flat additive rune-circle that flashes at the caster's
  // muzzle on cast-start (~150ms), the spec §5 "shared shape vocabulary" (rune circles),
  // per-element hue. Tasteful DEFAULT shape (clean concentric rune-circle); the exact glyph
  // vocabulary is a Kevin taste-gate (batched, not finalized here). Built under the
  // Brawl-Stars animated-shapes / zero-texture doctrine: additive ring geometry animated by
  // scale + opacity, NO texture atlas. Capture-safe: ages off the parent useFrame deltaMs,
  // which is frozen at 0 in capture -> the telegraph holds a stable frozen pose.
  const spawnTelegraph = useCallback((position, normal, spellType) => {
    const spell = SPELL_TYPES[spellType];
    if (!spell) return;
    const tele = {
      id: telegraphId.current++,
      position: position.clone(),
      type: spellType, // S1-D POLISH: carry the element so the telegraph reads the energy palette
      // orient the rune-disc to face the cast direction (the projectile's travel normal)
      normal: normal ? normal.clone() : new THREE.Vector3(0, 0, -1),
      color: spell.color,
      glowColor: spell.glowColor,
      age: 0,
      maxAge: 180 // ~150-180ms telegraph onset, within the 120-220ms readability budget
    };
    setTelegraphs(prev => (prev.length > 12 ? [...prev.slice(prev.length - 12), tele] : [...prev, tele]));
  }, []);

  const createSpellImpact = useCallback((position, spellType, wasKill = false) => {
    const spell = SPELL_TYPES[spellType];
    const store = useGameStore.getState();

    // (1) GPU sparks — reuse the existing pool. The pool branches on the spell-type
    // string for its velocity profile (fire = explosive ring, ice = tight shards,
    // lightning = fast spray, arcane = swirl). uTime=0 in capture keeps it deterministic.
    if (store.triggerGPUSparks) {
      const [sparkColor, count] = SPARK_PROFILE[spellType] || ['#ffffff', 25];
      store.triggerGPUSparks(
        new THREE.Vector3(position.x, position.y, position.z),
        sparkColor,
        wasKill ? Math.round(count * 1.8) : count,
        spellType
      );
    }

    // (2) Transient bloom-spike (~80ms) — the flash that sells the hit.
    if (store.triggerBloomSpike) store.triggerBloomSpike(80);

    // (3) Camera-shake — spells previously never shook. Harder on a kill. The shake loop
    // is itself inert in capture mode (the player loop early-returns before reading it).
    if (store.triggerCameraShake) store.triggerCameraShake(wasKill ? 0.8 : 0.4);

    // (4) ONE pooled shockwave-ring + point-light pop. Lightweight transient: a single
    // ring mesh that scales up + fades, and a brief point light. NO per-particle spheres.
    const newImpact = {
      id: impactId.current++,
      position: position.clone(),
      type: spellType,
      color: spell.color,
      glowColor: spell.glowColor,
      age: 0,
      maxAge: 360
    };
    setSpellImpacts(prev => (prev.length > 24 ? [...prev.slice(prev.length - 24), newImpact] : [...prev, newImpact]));

    // Phase 11: Spatial Impact Sound (unchanged — gameplay/audio preserved).
    if (playSpatialSound) {
      playSpatialSound('magicHit', position, 1.0, 30);
      if (spellType === 'fireball') playSpatialSound('magicExplosion', position, 0.8, 50);
    } else {
      playMagicHit();
      if (spellType === 'fireball') playMagicExplosion();
    }
  }, [playSpatialSound, playMagicHit, playMagicExplosion]);

  useEffect(() => {
    useGameStore.setState({ castSpell: (spellType = 'fireball') => {
      const spell = SPELL_TYPES[spellType];
      const camera = useGameStore.getState().gameCamera;

      if (!camera || !spell) return;
      if (!useGameStore.getState().isAlive) return; // KEVIN-FIX C2: defense in depth

      // W1 #9: charge the LEVELED mana cost via the pure resolveCastManaCost seam (mirrors the #51 damage
      // wire). getSpellStats mirrors the upgrade hook so L2/L3 upgrades aren't free; null-safe fallback to
      // the static SPELL_MANA_COSTS base for unmapped/pre-mount (byte-identical at L1).
      const manaCost = resolveCastManaCost(useGameStore.getState().getSpellStats, spellType, SPELL_MANA_COSTS[spellType]);
      if (useGameStore.getState().useMana && !useGameStore.getState().useMana(manaCost)) {
        notifyDenied('no-mana'); // UX-legibility: the no-mana cast used to fail silently
        return;
      }

      // Phase 11: Spatial Cast Sound
      if (playSpatialSound && camera) {
        playSpatialSound('magicCast', camera.position, 1.0, 10);
      } else {
        playMagicCast();
      }

      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);

      const startPos = camera.position.clone().add(direction.clone().multiplyScalar(2));

      // S1-D-M2: telegraph the cast at the muzzle (cast-start rune-circle), oriented to
      // face the cast direction. Per-element hue. Gameplay-inert (purely cosmetic).
      spawnTelegraph(startPos, direction, spellType);

      // Apply pure RPG spell damage solving scaling with intellect & agility
      const effectiveStats = useGameStore.getState().getEffectiveAttributes();
      // #51: read the LEVELED base damage from the spell-upgrade hook (store-mirrored getSpellStats);
      // null-safe -> static base when pre-mount/unmapped. Byte-identical at L1 (L1 dmg == SPELL_TYPES base).
      const baseDamage = resolveCastBaseDamage(useGameStore.getState().getSpellStats, spell, spellType);
      const { damage: finalDamage } = solveSpellDamage(effectiveStats, baseDamage, spellType);

      const newProjectile = {
        id: projectileId.current++,
        type: spellType,
        position: startPos.clone(),
        velocity: direction.clone().multiplyScalar(spell.speed),
        ...spell,
        damage: finalDamage,
        age: 0,
        maxAge: 3000,
        trailPositions: [startPos.clone()],
        lastTrailUpdate: 0,
        // S2-B4-M5: a latch-armed cast carries its element kind to the impact (null = normal)
        imbueKind: consumeImbueCast(),
      };

      projectilesRef.current.push(newProjectile);
      projectilesDirty.current = true;

      if (window.playSpellCastSound) {
        window.playSpellCastSound(spellType);
      }

      if (GameMethods.grantXP) {
        GameMethods.grantXP(3);
      }
    }});

    // S1-D-M2: deterministic cast injector for the `spell-cast` visual-regression state.
    // DEV/capture-only path (driven by the spawnSpellCast test hook). It bypasses the
    // camera/mana/cooldown gates of the gameplay castSpell so the cast can be placed at
    // FIXED world coordinates and held: it (1) telegraphs a rune-circle at a fixed muzzle,
    // (2) injects a projectile frozen at a fixed mid-flight point (the capture clock-freeze
    // in useFrame keeps it there), and (3) fires a seeded GPU spark burst at the impact
    // point so the frame shows the real spray (the GPUSparkSystem capture-phase fix makes
    // it visible at uTime=0). Fully deterministic: fixed inputs + seeded RNG + frozen clock.
    useGameStore.setState({ spawnDeterministicCast: (opts = {}) => {
      const spellType = opts.spellType || 'fireball';
      const spell = SPELL_TYPES[spellType];
      if (!spell) return;
      const muzzle = new THREE.Vector3(...(opts.muzzle || [0, 141.4, -4.2]));
      const projPos = new THREE.Vector3(...(opts.projectile || [0, 141.0, -8.5]));
      const impactPos = new THREE.Vector3(...(opts.impact || [0, 140.6, -12.5]));
      const dir = new THREE.Vector3(...(opts.direction || [0, -0.12, -1])).normalize();

      // (1) cast-start telegraph rune-circle at the muzzle
      spawnTelegraph(muzzle, dir, spellType);

      // (2) projectile frozen at a fixed mid-flight point (velocity drives the trail
      //     stretch-billboard orientation; the clock-freeze keeps the head in place)
      projectilesRef.current.push({
        id: projectileId.current++,
        type: spellType,
        position: projPos.clone(),
        velocity: dir.clone().multiplyScalar(spell.speed),
        ...spell,
        damage: spell.damage,
        age: 0,
        maxAge: 3000,
        trailPositions: [projPos.clone()],
        lastTrailUpdate: 0
      });
      projectilesDirty.current = true;
      setProjectiles([...projectilesRef.current]);

      // (3) impact spray at the strike point — seeded GPU sparks + shockwave ring + light
      //     pop (camera-shake + bloom-spike are inert in capture by design).
      createSpellImpact(impactPos, spellType, true);
    }});
  }, [spawnTelegraph, createSpellImpact]);

  useFrame((state, frameDelta) => {
    // S1-D-M2: in capture mode FREEZE the spell clock (delta=0, time=0) so a driven cast
    // holds a deterministic frozen pose: the projectile stays at its placed mid-flight
    // point, the trail/impacts/telegraphs don't age, and no wall-clock-dependent collision
    // fires. This is what makes the `spell-cast` capture state byte-stable across runs.
    // No-op in gameplay (live delta + clock). Mirrors the Player/WeatherSystem capture pins.
    const capture = isCaptureMode();
    const delta = capture ? 0 : frameDelta;
    const deltaMs = capture ? 0 : frameDelta * 1000;
    const time = capture ? 0 : state.clock.elapsedTime;

    let survivingProjectiles = [];

    for (let i = 0; i < projectilesRef.current.length; i++) {
      const projectile = projectilesRef.current[i];
      projectile.age += deltaMs;

      if (projectile.type === 'fireball' || projectile.type === 'iceball') {
        projectile.velocity.y -= 12 * delta;
      }

      projectile.position.x += projectile.velocity.x * delta;
      projectile.position.y += projectile.velocity.y * delta;
      projectile.position.z += projectile.velocity.z * delta;

      if (time - projectile.lastTrailUpdate > 0.05) {
        if (projectile.trailPositions.length >= projectile.trailLength) {
           const oldest = projectile.trailPositions.shift();
           oldest.copy(projectile.position);
           projectile.trailPositions.push(oldest);
        } else {
           projectile.trailPositions.push(projectile.position.clone());
        }
        projectile.lastTrailUpdate = time;
      }

      let keep = true;

      if (projectile.age > projectile.maxAge) {
        createSpellImpact(projectile.position, projectile.type);
        keep = false;
      } else {
        if (useGameStore.getState().getMobGroundLevel) {
          const groundLevel = useGameStore.getState().getMobGroundLevel(projectile.position.x, projectile.position.z);
          if (groundLevel !== null && !isNaN(groundLevel) && projectile.position.y <= groundLevel + 0.5) {
            createSpellImpact(projectile.position, projectile.type);
            // S2-B4-M5: the imbued impact paints the element zone (the age-out above is a
            // FIZZLE by design — no zone, no refund; recorded in the M5 plan).
            if (projectile.imbueKind) {
              requestZone({ kind: projectile.imbueKind, pos: projectile.position });
              projectile.imbueKind = null;
            }
            keep = false;
          }
        } else if (projectile.position.y <= 12.5) {
          createSpellImpact(projectile.position, projectile.type);
          if (projectile.imbueKind) {
            requestZone({ kind: projectile.imbueKind, pos: projectile.position });
            projectile.imbueKind = null;
          }
          keep = false;
        }

        if (keep && GameMethods.checkMobCollision) {
          const hitMob = GameMethods.checkMobCollision(projectile.position, projectile.size + 1.5);
          if (hitMob) {
            const spellConfig = SPELL_TYPES[projectile.type];

            // damageMob returns the entity; health<=0 means this hit killed it, so the
            // impact gets a beefier camera-shake + spark spray (S1-D-M1).
            let wasKill = false;
            if (GameMethods.damageMob) {
              const hitEntity = GameMethods.damageMob(hitMob.id, projectile.damage, projectile.type);
              if (hitEntity && hitEntity.health <= 0) wasKill = true;
            }
            // S2-B4-M5: a mob hit grounds the zone at the impact point (zone effects are
            // 2D x/z); null-out so a piercing projectile spawns at most ONE zone.
            if (projectile.imbueKind) {
              requestZone({ kind: projectile.imbueKind, pos: projectile.position });
              projectile.imbueKind = null;
            }

            let willPierce = false;
            if (spellConfig?.secondary) {
              const sec = spellConfig.secondary;

              switch (sec.type) {
                case 'burn':
                  applyBurnEffect(hitMob.id, sec.duration, sec.damagePerSecond);
                  break;
                case 'freeze':
                  break;
                case 'chain':
                  applyChainLightning(
                    projectile.position,
                    hitMob.id,
                    projectile.damage,
                    sec.maxChains,
                    sec.chainRange,
                    sec.chainDamageReduction
                  );
                  break;
                case 'pierce':
                  const healAmount = Math.floor(projectile.damage * sec.lifestealPercent / 100);
                  if (useGameStore.getState().healPlayer) useGameStore.getState().healPlayer(healAmount);
                  projectile.pierceCount = (projectile.pierceCount || 0) + 1;
                  if (projectile.pierceCount < sec.pierceCount) {
                    willPierce = true;
                  }
                  break;
              }
            }

            if (!willPierce) {
              createSpellImpact(projectile.position, projectile.type, wasKill);
              keep = false;
            }

            if (GameMethods.grantXP) GameMethods.grantXP(5);
          }
        }

        if (keep) {
          const store = useGameStore.getState();
          const isBossActive = store.isBossActive && store.isBossActive();
          if (isBossActive && store.getBossPosition) {
            const bossPos = store.getBossPosition();
            if (bossPos) {
              const bVec = new THREE.Vector3(bossPos[0], bossPos[1], bossPos[2]);
              // Satisfying 3D hit registration for flying Shadow Dragon
              if (projectile.position.distanceTo(bVec) < 6.0) {
                if (store.damageBoss) {
                  store.damageBoss(projectile.damage);
                }
                createSpellImpact(projectile.position, projectile.type);
                if (playSpatialSound) {
                  playSpatialSound('magicHit', projectile.position, 1.2, 30);
                }
                keep = false;
              }
            }
          }
        }
      }

      if (keep) {
        survivingProjectiles.push(projectile);
      }
    }

    projectilesRef.current = survivingProjectiles;

    const lengthChanged = survivingProjectiles.length !== projectiles.length;
    if (projectilesDirty.current || lengthChanged) {
      setProjectiles([...survivingProjectiles]);
      projectilesDirty.current = false;
    }

    // S1-D-M1: impacts are now lightweight transient ring+light pops (≤24 pooled), not
    // 25-40 spheres each. Age them and prune the expired ones.
    let impactsChanged = false;
    for (const impact of spellImpacts) {
      impact.age += deltaMs;
      if (impact.age >= impact.maxAge) impactsChanged = true;
    }
    if (impactsChanged) {
      setSpellImpacts(prev => prev.filter(i => i.age < i.maxAge));
    }

    // S1-D-M2: age + prune the cast-start telegraphs (same lightweight transient model).
    // In capture deltaMs is 0, so a held telegraph stays put -> stable frozen frame.
    let telegraphsChanged = false;
    for (const tele of telegraphs) {
      tele.age += deltaMs;
      if (tele.age >= tele.maxAge) telegraphsChanged = true;
    }
    if (telegraphsChanged) {
      setTelegraphs(prev => prev.filter(t => t.age < t.maxAge));
    }
  });

  return (
    <group>
      {projectiles.map(projectile => (
        <EnhancedSpellProjectile key={projectile.id} projectile={projectile} />
      ))}

      {spellImpacts.map(impact => (
        <SpellImpactPop key={impact.id} impact={impact} />
      ))}

      {telegraphs.map(tele => (
        <CastTelegraph key={tele.id} telegraph={tele} />
      ))}
    </group>
  );
});

// S1-D POLISH: per-element ENERGY identity. The old projectile was ONE flat emissive
// sphere reading as a pastel ball. The premium-energy read is a LAYERED body: a hot,
// near-white INNER CORE (the bright heart bloom blows out) wrapped in a saturated,
// element-COLORED OUTER GLOW shell — both emissive + `toneMapped={false}` so the §3
// bloom pass (threshold 0.85, emissive-only) catches them and they read as light, not
// plastic. Hues are anchored to the spec §4 magic palette (fire #FF7A3C / ice #6FC8FF /
// lightning #FFE066 / arcane #B36BFF), pushed hot at the core for a glowing heart.
//
// `capturePhase` is the frozen turbulence phase shown in capture mode: a hand-picked,
// flattering value (not 0) so the byte-stable regression frame holds the projectile at a
// pleasing, slightly-expanded "alive" pose rather than a dead-on rest scale.
// Tuned (POLISH) so the WHITE-HOT inner core DOMINATES the center (blooms past the §3
// composer's luminanceThreshold=1.0 into a glowing heart) while a tight, saturated outer
// shell gives the element color at the edge — so it reads as a HOT energy ball, not a soft
// pink/pastel sphere. `coreColor` is pushed toward white (the heart should bloom white-hot);
// `glowColor` carries the element identity at the rim. Core is intentionally a touch LARGER
// than the colored shape so the bright heart shows through.


