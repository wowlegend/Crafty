import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { GameMethods } from './GameMethods';
import { useGameStore } from './store/useGameStore';
import { useGameSounds } from './SoundManager';
import { SPELL_MANA_COSTS } from './GameSystems';
import { solveSpellDamage } from './utils/combat';
import { isCaptureMode } from './devtest/captureMode';
import * as THREE from 'three';

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

  const SPELL_TYPES = useMemo(() => ({
    fireball: {
      color: '#FF4500',
      trailColor: '#FF6347',
      particleColor: '#FFD700',
      glowColor: '#FF6600',
      speed: 25,
      size: 1.2,
      damage: 50,
      trailLength: 25,
      particleCount: 15,
      effect: 'fire',
      secondary: {
        type: 'burn',
        duration: 4,
        damagePerSecond: 8,
        color: '#FF4500'
      }
    },
    iceball: {
      color: '#00BFFF',
      trailColor: '#87CEEB',
      particleColor: '#E0FFFF',
      glowColor: '#00FFFF',
      speed: 20,
      size: 1.0,
      damage: 40,
      trailLength: 20,
      particleCount: 12,
      effect: 'ice',
      secondary: {
        type: 'freeze',
        duration: 5,
        slowPercent: 70,
        freezeChance: 0.2,
        color: '#87CEEB'
      }
    },
    lightning: {
      color: '#FFD700',
      trailColor: '#FFFF00',
      particleColor: '#FFFFE0',
      glowColor: '#FFFF00',
      speed: 60,
      size: 0.8,
      damage: 75,
      trailLength: 30,
      particleCount: 20,
      effect: 'lightning',
      secondary: {
        type: 'chain',
        maxChains: 3,
        chainRange: 8,
        chainDamageReduction: 0.3,
        stunDuration: 1,
        color: '#FFFF00'
      }
    },
    arcane: {
      color: '#9932CC',
      trailColor: '#DA70D6',
      particleColor: '#DDA0DD',
      glowColor: '#FF00FF',
      speed: 30,
      size: 1.1,
      damage: 60,
      trailLength: 22,
      particleCount: 14,
      effect: 'arcane',
      secondary: {
        type: 'pierce',
        pierceCount: 3,
        lifestealPercent: 15,
        color: '#DA70D6'
      }
    }
  }), []);

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

  const applyFreezeEffect = useCallback((mobId, duration, slowPercent, freezeChance) => {
    useGameStore.setState(state => {
      const slowEffects = { ...(state.mobSlowEffects || {}) };
      slowEffects[mobId] = {
        slowMultiplier: 1 - (slowPercent / 100),
        endTime: Date.now() + (duration * 1000)
      };
      return { mobSlowEffects: slowEffects };
    });

    if (Math.random() < freezeChance) {
      useGameStore.setState(state => {
        const stunEffects = { ...(state.mobStunEffects || {}) };
        stunEffects[mobId] = Date.now() + 2000;
        return { mobStunEffects: stunEffects };
      });
    }

    setTimeout(() => {
      useGameStore.setState(state => {
        const slowEffects = { ...(state.mobSlowEffects || {}) };
        delete slowEffects[mobId];
        return { mobSlowEffects: slowEffects };
      });
    }, duration * 1000);
  }, []);

  const applyChainLightning = useCallback((startPos, excludeId, baseDamage, maxChains, range, damageReduction) => {
    const allMobs = useGameStore.getState().mobEntities;
    if (!allMobs) return;

    let currentDamage = baseDamage * damageReduction;
    let lastPos = startPos.clone ? startPos.clone() : new THREE.Vector3(startPos.x, startPos.y, startPos.z);
    const hitMobs = new Set([excludeId]);

    const maxPossibleRangeSq = (range * maxChains) ** 2;
    const nearbyMobs = allMobs.filter(mob => {
      const dx = mob.position[0] - lastPos.x;
      const dy = mob.position[1] - lastPos.y;
      const dz = mob.position[2] - lastPos.z;
      return (dx*dx + dy*dy + dz*dz) <= maxPossibleRangeSq;
    });

    for (let i = 0; i < maxChains; i++) {
      let nearestMob = null;
      let nearestDistSq = range * range;

      for (const mob of nearbyMobs) {
        if (hitMobs.has(mob.id)) continue;

        const dx = mob.position[0] - lastPos.x;
        const dy = mob.position[1] - lastPos.y;
        const dz = mob.position[2] - lastPos.z;
        const distSq = dx*dx + dy*dy + dz*dz;

        if (distSq < nearestDistSq) {
          nearestDistSq = distSq;
          nearestMob = mob;
        }
      }

      if (nearestMob) {
        hitMobs.add(nearestMob.id);
        if (GameMethods.damageMob) {
          GameMethods.damageMob(nearestMob.id, Math.floor(currentDamage), 'lightning');
        }
        lastPos = new THREE.Vector3(nearestMob.position[0], nearestMob.position[1], nearestMob.position[2]);
        currentDamage *= (1 - damageReduction);
      } else {
        break;
      }
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
  const SPARK_PROFILE = useMemo(() => ({
    // [sparkColor, count] per element.
    fireball:  ['#FF7A1A', 52],
    iceball:   ['#7FD8FF', 42],
    lightning: ['#FFF0A0', 48],
    arcane:    ['#C77DFF', 46],
  }), []);

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
  }, [SPELL_TYPES]);

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
  }, [SPELL_TYPES, SPARK_PROFILE, playSpatialSound, playMagicHit, playMagicExplosion]);

  useEffect(() => {
    useGameStore.setState({ castSpell: (spellType = 'fireball') => {
      const spell = SPELL_TYPES[spellType];
      const camera = useGameStore.getState().gameCamera;

      if (!camera || !spell) return;

      const manaCost = SPELL_MANA_COSTS[spellType] || 15;
      if (useGameStore.getState().useMana && !useGameStore.getState().useMana(manaCost)) {
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
      const { damage: finalDamage } = solveSpellDamage(effectiveStats, spell.damage, spellType);

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
        lastTrailUpdate: 0
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
  }, [SPELL_TYPES, spawnTelegraph, createSpellImpact]);

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
            keep = false;
          }
        } else if (projectile.position.y <= 12.5) {
          createSpellImpact(projectile.position, projectile.type);
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

            let willPierce = false;
            if (spellConfig?.secondary) {
              const sec = spellConfig.secondary;

              switch (sec.type) {
                case 'burn':
                  applyBurnEffect(hitMob.id, sec.duration, sec.damagePerSecond);
                  break;
                case 'freeze':
                  applyFreezeEffect(hitMob.id, sec.duration, sec.slowPercent, sec.freezeChance);
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

// Shared scratch objects for the stretch-billboard math (avoid per-frame allocs).
const _trailDir = new THREE.Vector3();
const _trailMid = new THREE.Vector3();
const _trailQuat = new THREE.Quaternion();
const _trailUp = new THREE.Vector3(0, 1, 0);

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
const ENERGY_PROFILE = {
  fireball: {
    coreColor: '#FFF4D6',   // white-hot heart (blooms white, edges go orange)
    glowColor: '#FF7A1A',   // saturated fiery orange shell (spec §4 #FF7A3C, pushed hot)
    coreIntensity: 6.0,
    glowIntensity: 4.0,
    coreScale: 0.62,        // larger hot heart so it dominates + blooms
    glowScale: 0.92,        // tighter halo (less pink wash)
    glowOpacity: 0.22,      // restrained outer wash so the hot core wins
    flicker: 0.18,          // strong fiery turbulence (gameplay only)
    flickerSpeed: 14,
    capturePhase: 0.65,     // flattering frozen phase (sin arg) -> slightly expanded
    shape: 'sphere',
  },
  iceball: {
    coreColor: '#F2FCFF',   // crystalline white heart
    glowColor: '#3FB7FF',   // cool saturated cyan shell (spec §4 #6FC8FF, pushed saturated)
    coreIntensity: 5.5,
    glowIntensity: 3.6,
    coreScale: 0.58,
    glowScale: 0.86,
    glowOpacity: 0.20,
    flicker: 0.07,          // crisp, low-turbulence (ice is sharp, not roiling)
    flickerSpeed: 7,
    capturePhase: 0.30,
    shape: 'crystal',
  },
  lightning: {
    coreColor: '#FFFFFF',   // pure electric white heart
    glowColor: '#86B8FF',   // white-blue electric shell (over the §4 #FFE066 bolt)
    coreIntensity: 8.0,
    glowIntensity: 4.0,
    coreScale: 0.50,
    glowScale: 0.74,        // thin, jagged — lightning is a hot line, not a ball
    glowOpacity: 0.18,
    flicker: 0.34,          // jagged, high-frequency electric jitter (gameplay only)
    flickerSpeed: 26,
    capturePhase: 1.10,     // frozen at a jagged-but-flattering peak
    shape: 'bolt',
  },
  arcane: {
    coreColor: '#FBEEFF',   // luminous near-white violet heart
    glowColor: '#B84DFF',   // saturated purple-magenta shell (spec §4 #B36BFF, pushed)
    coreIntensity: 6.0,
    glowIntensity: 3.8,
    coreScale: 0.60,
    glowScale: 0.90,
    glowOpacity: 0.22,
    flicker: 0.14,          // gentle swirling pulse
    flickerSpeed: 10,
    capturePhase: 0.50,
    shape: 'swirl',
  },
};

const _defaultEnergy = {
  coreColor: '#FFFFFF', glowColor: '#46E0FF', coreIntensity: 5.0, glowIntensity: 3.4,
  coreScale: 0.58, glowScale: 0.9, glowOpacity: 0.22, flicker: 0.12, flickerSpeed: 10,
  capturePhase: 0.5, shape: 'sphere',
};

const EnhancedSpellProjectile = React.memo(({ projectile }) => {
  const groupRef = useRef();
  const trailRef = useRef();

  useFrame(() => {
    // The whole projectile group tracks the head position; the layered energy core
    // (SpellProjectileCore) owns the turbulence/rotation (capture-gated internally).
    if (groupRef.current) groupRef.current.position.copy(projectile.position);

    // S1-D-M1: single velocity-STRETCH-BILLBOARD trail (one cylinder) instead of the old
    // per-instance trail-sphere group (12-20 spheres/projectile). Oriented along the
    // velocity vector, length scales with speed, trailing BEHIND the projectile head.
    // (The trail lives OUTSIDE groupRef in world space since it orients to velocity.)
    if (trailRef.current) {
      const v = projectile.velocity;
      const speed = Math.hypot(v.x, v.y, v.z);
      if (speed > 0.001) {
        _trailDir.set(v.x, v.y, v.z).multiplyScalar(1 / speed);
        const len = Math.min(4.5, 0.5 + speed * 0.06);
        // midpoint half a length behind the projectile head
        _trailMid.copy(projectile.position).addScaledVector(_trailDir, -len * 0.5);
        trailRef.current.position.copy(_trailMid);
        // cylinder default axis is +Y; rotate it onto the (reversed) travel direction
        _trailQuat.setFromUnitVectors(_trailUp, _trailDir);
        trailRef.current.quaternion.copy(_trailQuat);
        trailRef.current.scale.set(1, len, 1);
      }
    }
  });

  return (
    <group>
      {/* S1-D POLISH: the LAYERED energy body (hot inner core + saturated outer glow),
          replacing the single flat emissive sphere. Tracks the head via groupRef. */}
      <group ref={groupRef}>
        <SpellProjectileCore projectile={projectile} />
      </group>

      {/* S1-D-M1: single velocity-stretch-billboard trail (one additive cylinder,
          oriented + scaled in useFrame) — replaces the old 12-20 trail-sphere group. */}
      <mesh ref={trailRef}>
        <cylinderGeometry args={[projectile.size * 0.22, projectile.size * 0.04, 1, 6, 1, true]} />
        <meshBasicMaterial
          color={projectile.trailColor}
          transparent
          opacity={0.45}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
});

// S1-D POLISH: SpellProjectileCore — the premium-ENERGY projectile body that replaced the
// single flat coral/pastel sphere. Three concentric, ADDITIVE, `toneMapped={false}` layers:
//   (1) a per-element silhouette MESH (the recognizable shape: fiery sphere / ice crystal /
//       electric bolt / arcane swirl) emissive in the saturated element color,
//   (2) a tight HOT INNER CORE sphere (near-white) that bloom blows out into a glowing
//       heart — this is what makes it read as light, not plastic,
//   (3) a soft OUTER GLOW shell (the saturated element halo) that gives volume + bloom.
// Per-element personality comes from ENERGY_PROFILE (hues, intensities, scales, turbulence).
//
// Capture-determinism: the scale-flicker / turbulence is driven by the clock + (for the
// jagged lightning) a tiny deterministic hash; in capture mode (`isCaptureMode()`) it is
// FROZEN at a hand-picked flattering phase (`profile.capturePhase`) so the byte-stable
// regression frame holds the projectile at a pleasing, slightly-alive pose — never a flat
// rest scale, never a clock/Math.random read.
const SpellProjectileCore = React.memo(({ projectile }) => {
  const innerRef = useRef();
  const outerRef = useRef();
  const meshRef = useRef();
  const profile = ENERGY_PROFILE[projectile.type] || _defaultEnergy;
  const size = projectile.size || 1;

  useFrame((state) => {
    const capture = isCaptureMode();
    // The turbulence phase: frozen at the flattering capturePhase in capture, else live.
    const phase = capture ? profile.capturePhase : state.clock.elapsedTime * profile.flickerSpeed;
    const pulse = 1 + Math.sin(phase) * profile.flicker;
    // A secondary high-freq jitter for the electric/jagged personalities (lightning), made
    // DETERMINISTIC via a sine of a second phase rather than Math.random so capture stays
    // byte-stable; frozen with everything else in capture.
    const jitter = 1 + Math.sin(phase * 2.7 + 1.3) * profile.flicker * 0.4;

    if (meshRef.current) {
      meshRef.current.scale.setScalar(pulse);
      if (!capture) {
        // Gentle rotation in gameplay for life; frozen in capture for a stable frame.
        meshRef.current.rotation.x += 0.06;
        meshRef.current.rotation.y += 0.05;
        meshRef.current.rotation.z += 0.04;
      }
    }
    if (innerRef.current) innerRef.current.scale.setScalar(pulse * jitter);
    if (outerRef.current) outerRef.current.scale.setScalar(pulse);
  });

  // Per-element silhouette geometry for the colored shape layer (keeps the recognizable
  // form: round fireball, crystalline ice, thin bolt, arcane ring).
  const renderShape = () => {
    switch (profile.shape) {
      case 'crystal':
        return <dodecahedronGeometry args={[size * 0.5, 0]} />;
      case 'bolt':
        return <cylinderGeometry args={[size * 0.12, size * 0.12, size * 1.8, 6]} />;
      case 'swirl':
        return <torusGeometry args={[size * 0.42, size * 0.16, 8, 24]} />;
      case 'sphere':
      default:
        return <icosahedronGeometry args={[size * 0.5, 1]} />;
    }
  };

  return (
    <group>
      {/* (1) per-element silhouette shape — saturated element color, emissive + bloomable.
          renderOrder 0 + depthWrite off so the additive core/glow always paint OVER it
          (otherwise the opaque colored shape occludes the hot white heart -> pink wash). */}
      <mesh ref={meshRef} renderOrder={0}>
        {renderShape()}
        <meshStandardMaterial
          color={profile.glowColor}
          emissive={profile.glowColor}
          emissiveIntensity={profile.glowIntensity}
          roughness={0.25}
          metalness={0.0}
          toneMapped={false}
          transparent
          opacity={0.9}
          depthWrite={false}
        />
      </mesh>

      {/* (2) hot inner core — near-white heart that bloom blows out into glowing light.
          renderOrder 2/3 (paints last, over the colored shape) so the white heart
          dominates. A tight white-hot HOTSPOT nested in the tinted core guarantees the
          center clips past the bloom threshold (1.0) and blooms as a glowing point of
          light — the same recipe that makes the impact flash read premium. */}
      <mesh ref={innerRef} renderOrder={2}>
        <sphereGeometry args={[size * profile.coreScale, 16, 16]} />
        <meshBasicMaterial
          color={profile.coreColor}
          toneMapped={false}
          transparent
          opacity={0.98}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          depthTest={false}
        />
        <mesh renderOrder={3}>
          <sphereGeometry args={[size * profile.coreScale * 0.55, 12, 12]} />
          <meshBasicMaterial
            color="#FFFFFF"
            toneMapped={false}
            transparent
            opacity={1.0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            depthTest={false}
          />
        </mesh>
      </mesh>

      {/* (3) soft outer glow shell — saturated element halo giving volume + bloom */}
      <mesh ref={outerRef} renderOrder={1}>
        <sphereGeometry args={[size * profile.glowScale, 16, 16]} />
        <meshBasicMaterial
          color={profile.glowColor}
          toneMapped={false}
          transparent
          opacity={profile.glowOpacity}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* point-light pop so the energy actually casts onto nearby voxels (gameplay) */}
      <pointLight color={profile.glowColor} intensity={5} distance={7} decay={2} />
    </group>
  );
});

// S1-D-M1: SpellImpactPop — the ONE pooled impact mesh that replaced the old
// SpellImpact/ImpactParticle/Fire|Ice|Lightning|ArcaneImpactEffect slop (each cast used
// to mount a sphere + `particleCount` ImpactParticle spheres + a per-element sub-effect
// group = 25-40 meshes). The spark spray + flash now come from the GPU pool + bloom-spike;
// this is just a fast-expanding additive shockwave RING that fades, plus a transient
// point-light pop. Two objects total, lifetime ~360ms.
//
// Capture-safe: the GPU spark burst pushes to the clip void when uTime=0, the bloom-spike
// driver no-ops in capture, and camera-shake is inert (player loop early-returns). This
// ring ages off `impact.age` (advanced by the parent's useFrame deltaMs); in capture the
// clock is frozen so age stays put — a stable frozen frame. No Math.random / clock reads.
const SpellImpactPop = React.memo(({ impact }) => {
  const ringRef = useRef();
  const flashRef = useRef();
  const lightRef = useRef();
  // S1-D POLISH: derive the impact's energy hues from the projectile energy palette so the
  // hit flash matches the projectile's saturated glow + hot-white heart (consistent grammar).
  const energy = ENERGY_PROFILE[impact.type] || _defaultEnergy;

  useFrame(() => {
    const progress = Math.min(1, impact.age / impact.maxAge);
    const eased = 1 - (1 - progress) * (1 - progress); // ease-out
    if (ringRef.current) {
      const scale = 0.4 + eased * 3.4;
      ringRef.current.scale.set(scale, scale, scale);
      ringRef.current.material.opacity = 0.95 * (1 - progress);
    }
    if (flashRef.current) {
      // Hot-white core flash: a quick bright billboard that peaks at t=0 and is gone by
      // ~22% of lifetime (within the 40-90ms flash-peak readability budget given the
      // ~360ms lifetime). Sells the "wow" punch without exceeding the ~15% viewport.
      const fp = Math.max(0, 1 - progress / 0.22);
      const s = 0.5 + (1 - fp) * 1.1; // expands slightly as it fades
      flashRef.current.scale.set(s, s, s);
      flashRef.current.material.opacity = fp;
    }
    if (lightRef.current) {
      // Quick light pop: bright at t=0, gone by ~40% of lifetime.
      lightRef.current.intensity = Math.max(0, 1 - progress / 0.4) * 18;
    }
  });

  return (
    <group position={impact.position}>
      {/* expanding shockwave ring (element-glow hue) on the ground plane (XZ) */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.35, 0.55, 40]} />
        <meshBasicMaterial
          color={energy.glowColor}
          transparent
          opacity={0.95}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      {/* hot-white core flash — the bright punch at the moment of impact (bloom-catchable) */}
      <mesh ref={flashRef}>
        <sphereGeometry args={[0.55, 16, 16]} />
        <meshBasicMaterial
          color={energy.coreColor}
          transparent
          opacity={1.0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <pointLight
        ref={lightRef}
        color={energy.glowColor}
        intensity={18}
        distance={10}
        decay={2}
      />
    </group>
  );
});

// S1-D-M2: CastTelegraph — the cast-start RUNE-CIRCLE (spec §5 shared shape vocabulary).
// Two concentric additive rings (an outer rune-circle + a tighter inner core ring) that
// snap in bright, expand slightly, and fade over ~150-180ms — the "telegraph" beat of the
// telegraph -> release -> impact arc. Per-element hue. Built under the animated-shapes /
// zero-texture doctrine: pure additive ring geometry animated by scale + opacity, no atlas,
// ink-outline-consistent (it reads as a flat glyph, preserving silhouette).
//
// TASTEFUL DEFAULT: a clean concentric rune-circle. The richer glyph vocabulary (hex
// glyphs, per-element personality, an energy column on charge) is a Kevin taste-gate —
// batched in KEVIN-REVIEW-BATCH, not finalized autonomously here.
//
// Capture-safe: ages off `telegraph.age` (advanced by the parent useFrame deltaMs, frozen
// at 0 in capture) -> a held telegraph renders a stable frozen pose. No clock/Math.random.
const CastTelegraph = React.memo(({ telegraph }) => {
  const groupRef = useRef();
  const outerRef = useRef();
  const ringRef = useRef();
  const innerRef = useRef();
  const spokesRef = useRef();
  // S1-D POLISH: telegraph hues from the energy palette so the cast sigil's saturated rune
  // color + hot-white heart match the projectile that follows (one consistent VFX grammar).
  const energy = ENERGY_PROFILE[telegraph.type] || _defaultEnergy;

  useFrame((state) => {
    // Billboard the rune-disc to face the camera so it always reads as a full circle (a
    // "cast sigil" at the muzzle) rather than collapsing edge-on when the cast direction
    // points across the view. Capture-safe: the camera is pinned, so this is deterministic.
    if (groupRef.current) {
      groupRef.current.quaternion.copy(state.camera.quaternion);
    }

    const progress = Math.min(1, telegraph.age / telegraph.maxAge);
    // Snap-in then settle: bright + slightly contracted at onset, expands as it fades.
    const eased = 1 - (1 - progress) * (1 - progress); // ease-out
    const opacity = (1 - progress); // fade across the ~150ms window
    if (outerRef.current) {
      const s = 0.85 + eased * 0.7; // rune-circle expands outward as it fades
      outerRef.current.scale.set(s, s, s);
      outerRef.current.material.opacity = 1.0 * opacity;
    }
    if (ringRef.current) {
      const s = 0.72 + eased * 0.55; // second concentric rune band (crisper sigil read)
      ringRef.current.scale.set(s, s, s);
      ringRef.current.material.opacity = 0.85 * opacity;
    }
    if (innerRef.current) {
      const s = 0.55 + eased * 0.30;
      innerRef.current.scale.set(s, s, s);
      innerRef.current.material.opacity = 1.0 * opacity;
    }
    if (spokesRef.current) {
      const s = 0.85 + eased * 0.7;
      spokesRef.current.scale.set(s, s, s);
      spokesRef.current.material.opacity = 0.85 * opacity;
    }
  });

  return (
    <group ref={groupRef} position={telegraph.position}>
      {/* outer rune-circle — thin crisp saturated band */}
      <mesh ref={outerRef}>
        <ringGeometry args={[0.84, 0.97, 64]} />
        <meshBasicMaterial
          color={energy.glowColor}
          transparent
          opacity={1.0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      {/* second concentric rune band — gives the sigil a layered, crafted read */}
      <mesh ref={ringRef}>
        <ringGeometry args={[0.70, 0.76, 64]} />
        <meshBasicMaterial
          color={energy.glowColor}
          transparent
          opacity={0.85}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      {/* mid spoke-ring: 8 short radial ticks (a glyph hint) on a thin ring band */}
      <mesh ref={spokesRef}>
        <ringGeometry args={[0.54, 0.64, 8, 1]} />
        <meshBasicMaterial
          color={energy.glowColor}
          transparent
          opacity={0.85}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      {/* inner core disc — hot near-white heart that bloom catches (per-element core hue) */}
      <mesh ref={innerRef}>
        <circleGeometry args={[0.30, 32]} />
        <meshBasicMaterial
          color={energy.coreColor}
          transparent
          opacity={1.0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
});

export const MagicWand = React.memo(({ wandType = 'fireball', position = [0, 0, 0], rotation = [0, 0, 0] }) => {
  const wandRef = useRef();
  const gemRef = useRef();

  const WAND_CONFIGS = {
    fireball: {
      handleColor: '#8B4513',
      tipColor: '#FF4500',
      gemColor: '#FF6347',
      auraColor: '#FFD700'
    },
    iceball: {
      handleColor: '#4169E1',
      tipColor: '#00BFFF',
      gemColor: '#87CEEB',
      auraColor: '#E0FFFF'
    },
    lightning: {
      handleColor: '#FFD700',
      tipColor: '#FFFF00',
      gemColor: '#FFFFE0',
      auraColor: '#FFFACD'
    },
    arcane: {
      handleColor: '#9932CC',
      tipColor: '#DA70D6',
      gemColor: '#DDA0DD',
      auraColor: '#E6E6FA'
    }
  };

  const config = WAND_CONFIGS[wandType] || WAND_CONFIGS.fireball;

  useFrame((state) => {
    if (wandRef.current) {
      const idle = Math.sin(state.clock.elapsedTime * 2) * 0.05;
      wandRef.current.rotation.z = idle;
    }

    if (gemRef.current) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 4) * 0.2;
      gemRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <group ref={wandRef} position={position} rotation={rotation}>
      <mesh position={[0, -0.4, 0]}>
        <cylinderGeometry args={[0.03, 0.05, 0.8, 8]} />
        <meshStandardMaterial roughness={0.8} metalness={0.1} color={config.handleColor} />
      </mesh>

      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.02, 0.04, 0.3, 8]} />
        <meshStandardMaterial roughness={0.8} metalness={0.1} color={config.tipColor} />
      </mesh>

      <mesh ref={gemRef} position={[0, 0.3, 0]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshBasicMaterial
          color={config.gemColor}
          transparent
          opacity={0.9}
        />
      </mesh>

      <mesh position={[0, 0.3, 0]}>
        <sphereGeometry args={[0.15, 8, 8]} />
        <meshBasicMaterial
          color={config.auraColor}
          transparent
          opacity={0.3}
        />
      </mesh>
    </group>
  );
});
