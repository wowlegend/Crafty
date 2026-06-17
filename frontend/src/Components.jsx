import React, { useRef, useEffect, useState, useMemo, useCallback, useLayoutEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { GameMethods } from './GameMethods';
import { motion } from 'framer-motion';
import * as THREE from 'three';
import { solveMeleeDamage } from './utils/combat';
import { getWeaponBaseDamage } from './game/equipment.js';
import { BEAST_FORMS, BASE_CAPSULE, setColliderToForm, restoreBaseCollider, elementForSpell, resolveFormMelee, formMeleeCooldownMult, formLocomotion } from './game/beasts.js';
import { makeTransformState, decideTransform, formDurationFor } from './game/beastTransform.js';
import { canTransform, FEROCITY_THRESHOLD } from './game/ferocity.js';
import { TRANSFORM_CAM_SEC, transformCamPose } from './game/transformCam.js';
import { BeastAvatar } from './render/BeastAvatar';
import { StableMagicHands } from './render/playerRender';
import { makeVoidhandState, decideVoidhand, PHANTOM_BLOCK_COLORS } from './game/voidhand.js';
import { footstepTypeAt } from './world/climate.js';
import { resolveSpawnGround, spawnTargetY, isVoidFall, SPAWN_FREEZE_Y } from './game/spawnPlacement.js';
import { moveSpeed, jumpVelocity, applyGravity, moveVector, VAULT_VELOCITY, GLUE_VELOCITY } from './game/locomotion.js';
import { dodgeDirection, dodgeSpeed, isDodgeInvincible } from './game/dodge.js';
import { makeKick, addKick, stepKick, KICK_PROFILES, localToWorldKick } from './game/cameraKick.js';
import { shakeOffset } from './game/trauma.js';
import { makeSoulbindState, decideSoulbind, SNARE_CHANNEL_SEC, makeFuseState, decideFuse, FUSE_CHANNEL_SEC } from './game/soulbind.js';
import { makeImbueState, decideImbue, KIND_BY_SPELL } from './game/elemancer.js';
import { canIgnite as rCanIgnite, ZONE_COST } from './game/resonance.js';
import { armImbueCast } from './game/elemancerChannel.js';

// music-motif v2: the stinger rarity guards (a stinger repeats no sooner than this)
const MOTIF_COOLDOWN_SEC = 10;
let _lastWildheartMotif = -Infinity;
let _lastVoidhandMotif = -Infinity;
import { canSnare as sCanSnare, SNARE_COST, canFuse as sCanFuse, FUSE_COST } from './game/soul.js';
import { ecs, alliesQuery } from './ecs/world';
import { writeSnareState, clearSnareState, fireBindCeremony } from './game/snareChannel.js';
import { lookupHybrid, applyFusion, FUSE_RADIUS } from './game/hybrids.js';
import { canGrab as kCanGrab, GRAB_COST } from './game/kinetic.js';
import { requestHurl, requestSlam } from './game/hurlChannel';
import { phantomWorldPos } from './world/PhantomBlockSystem';
import { PhantomBlockSystem } from './world/PhantomBlockSystem';
import { HurlSystem } from './world/HurlSystem';
import { SnareTetherSystem } from './world/SnareTetherSystem.jsx';
import { SquadAISystem } from './world/SquadAISystem.jsx';
import { ElementZoneSystem } from './world/ElementZoneSystem.jsx';
import { isPointInCone } from './combat/cone.js';
import { routeMouseVerb, AIM_CONE_RANGE, AIM_CONE_ARC } from './input/verbRouter';
import {
  PickaxeIcon,
  Sun,
  Moon,
  Copy,
  Download,
  Upload,
  Trash2,
  Sword,
  Star
} from 'lucide-react';

// Import optimized systems
import { useSimpleExperience } from './SimpleExperienceSystem';
import { EnhancedMagicSystem, MagicWand } from './EnhancedMagicSystem';
import { RigidBody, CapsuleCollider, useRapier } from '@react-three/rapier';
import { useGameStore } from './store/useGameStore';
import { isCaptureMode, getCaptureOpts } from './devtest/captureMode';
import { isPerfProbe } from './devtest/perfProbe';
import { getInput, setIntent, setActive, resetInput } from './input/inputState';
import { notifyDenied } from './ui/denyToast';

// Bold-flat UI primitives (S1C-M2a chrome migration)
import { Panel, Slot } from './ui/primitives/index.js';

export const PositionTracker = React.memo(() => {
  const { camera } = useThree();
  const lastUpdate = useRef(0);
  useFrame(() => {
    const now = performance.now();
    if (camera && now - lastUpdate.current > 200) {
      lastUpdate.current = now;
      useGameStore.getState().setPlayerPosition({
        x: Math.round(camera.position.x),
        y: Math.round(camera.position.y),
        z: Math.round(camera.position.z)
      });
    }
  });
  return null;
});




export const Player = ({ isWorldBuilt }) => {
  const isWorldBuiltRef = useRef(isWorldBuilt);
  useEffect(() => {
    isWorldBuiltRef.current = isWorldBuilt;
  }, [isWorldBuilt]);

  const activeSpell = useGameStore(state => state.activeSpell);
  const selectedBlock = useGameStore(state => state.selectedBlock);
  const { camera } = useThree();
  const [attackType, setAttackType] = useState(null); // 'melee' | 'spell' | null
  const attackStartTime = useRef(0);
  const rigidBodyRef = useRef();
  const { rapier, world } = useRapier();

  const velocityY = useRef(0);
  const lastStepRef = useRef(0);        // locomotion-audio: stride throttle (footstep cadence)
  const prevGroundedRef = useRef(true); // locomotion-audio: landing-edge detection
  const kickRef = useRef(makeKick());   // game-feel: per-verb camera-kick impulse (decays in the follow-cam)
  const controllerRef = useRef(null);
  const knockbackVelocity = useRef(new THREE.Vector3(0, 0, 0));
  // S2-B1-M1: beast-form collider hot-swap. pendingFormSwapRef = a one-shot target capsule enqueued
  // on activeBeastForm transitions, consumed inside useFrame (atomic with the Rapier sweep).
  // currentFormHHRef tracks the live half-height so we can nudge up by the grow-delta (depenetration)
  // when a larger form spawns near ground. Both are refs -> zero re-renders (Game-Loop Isolation).
  const pendingFormSwapRef = useRef(null);
  const currentFormHHRef = useRef(BASE_CAPSULE.halfHeight);
  // S2-B1-M3: the transform state machine (charge + duration + cooldown) + roar edge-detection.
  const beastSMRef = useRef(makeTransformState());
  const prevRoarRef = useRef(false);
  const voidhandSMRef = useRef(makeVoidhandState()); // S2-B2-M1: the VOIDHAND grab SM state
  const soulbindSMRef = useRef(makeSoulbindState()); // S2-B3-M4: the SOULBIND snare SM state
  const imbueSMRef = useRef(makeImbueState()); // S2-B4-M5: the ELEMANCER imbue latch
  const prevImbueRef = useRef(false);
  const spawnProbeFailsRef = useRef(0); // KEVIN-FIX C1: the bounded spawn-probe wait
  const castFiredRef = useRef(false); // stamped by the #72 cast branch; consumed by the latch
  const fuseSMRef = useRef(makeFuseState()); // S2-B3-M6: the FUSE channel state
  const prevSnareRef = useRef(false);
  const voidhandVerbRef = useRef({ attack: false, cast: false }); // M3: held-click edges -> SM
  const prevGrabRef = useRef(false);
  // S2-B1-M7a: the third-person transform-cam window. { active, t (sec elapsed), fwd (facing captured
  // at roar-start so the behind-shot is stable) }. Started on the SM 'startCharge', applied in useFrame.
  const transformCamRef = useRef({ active: false, t: 0, fwd: [0, 0, -1] });

  // Initialize Rapier Kinematic Character Controller
  useEffect(() => {
    if (world) {
      const offset = 0.05; // Gap offset between character capsule and environment
      const c = world.createCharacterController(offset);
      c.enableAutostep(1.05, 0.2, true); // Step-up height of 1.05m
      c.enableSnapToGround(0.5); // snap to ground when descending slopes
      c.setMaxSlopeClimbAngle(Math.PI / 4); // 45 degrees
      controllerRef.current = c;
      return () => {
        world.removeCharacterController(c);
        controllerRef.current = null;
      };
    }
  }, [world]);

  // FIX #1: Use useRef for keyboard state — prevents 60+ re-renders/sec
  // useState caused stale closures inside useFrame AND triggered full React re-renders on every keypress
  const keysRef = useRef({});
  const spawnPosSet = useRef(false);

  const lastCastTime = useRef(0);
  const CAST_COOLDOWN = 333;
  const cameraInitialized = useRef(false);

  const dodgeStateRef = useRef({
    isActive: false,
    duration: 0.4,       // total dodge duration (seconds)
    iframeDuration: 0.2, // invincibility window (~12 frames at 60fps)
    timeElapsed: 0,
    direction: new THREE.Vector3(),
    cooldown: 0.8,       // dodge cooldown (seconds)
    lastDodgeTime: 0
  });

  const lastAttackTime = useRef(0);
  const lastAttackTypeRef = useRef(null);
  const MELEE_COOLDOWN = 300; // milliseconds

  // Expose camera globally for magic system
  useEffect(() => {
    useGameStore.setState({ gameCamera: camera });
  }, [camera]);

  // Expose player rigid body globally for raycast filtering
  useEffect(() => {
    if (rigidBodyRef.current) {
      rigidBodyRef.current.applyImpulse = (impulse) => {
        knockbackVelocity.current.x += impulse.x;
        velocityY.current += impulse.y;
        knockbackVelocity.current.z += impulse.z;
      };
    }
    useGameStore.setState({ playerRigidBodyRef: rigidBodyRef });
    return () => {
      useGameStore.setState({ playerRigidBodyRef: null });
    };
  }, []);

  // S2-B1-M1: enqueue a one-shot collider swap when the (single-writer) activeBeastForm transitions.
  // Rare transition -> game-loop-isolation-safe to subscribe reactively. The mount run is skipped
  // (collider already at base); null -> restore BASE_CAPSULE, a form -> that form's capsule. The swap
  // is consumed inside useFrame so it is atomic with the Rapier sweep and never runs under capture.
  const activeBeastForm = useGameStore((s) => s.activeBeastForm);
  const didFormMount = useRef(false);
  useEffect(() => {
    if (!didFormMount.current) { didFormMount.current = true; return; }
    if (activeBeastForm) {
      // ENTER: queue the (possibly enlarging) swap -> consumed in useFrame so it is ATOMIC with the
      // Rapier sweep and the grow-depenetration folds into the same setNextKinematicTranslation.
      pendingFormSwapRef.current = BEAST_FORMS[activeBeastForm] || BASE_CAPSULE;
    } else {
      // EXIT/restore: shrink back to base IMPERATIVELY here -- NOT via the useFrame queue, which sits
      // behind the dead-window early-return (a queued restore would not drain until manual respawn,
      // leaving the live collider a beast shape for the whole death screen). This is the
      // no-permanent-beast restore AT the death/load edge. Always a shrink -> no depenetration ->
      // safe off-frame. Cancels any not-yet-consumed enter-swap + resyncs the half-height tracker.
      pendingFormSwapRef.current = null;
      restoreBaseCollider(rigidBodyRef.current?.collider(0), rapier, controllerRef.current);
      currentFormHHRef.current = BASE_CAPSULE.halfHeight;
    }
  }, [activeBeastForm]);

  // Safe-respawn coordinator: when player isAlive transitions from false to true, teleport player back to safe spawn coordinates
  const isAlive = useGameStore(state => state.isAlive);
  const lastAliveRef = useRef(true);
  useEffect(() => {
    // KEVIN-FIX C6: held intents (a W still down at death, a mid-channel verb) must not
    // persist through the death screen into the respawned run.
    if (!isAlive && lastAliveRef.current) resetInput();
    if (isAlive && !lastAliveRef.current) {
      spawnPosSet.current = false;
      spawnProbeFailsRef.current = 0;
      if (rigidBodyRef.current) {
        rigidBodyRef.current.setTranslation({ x: 0, y: 120, z: 0 }, true);
        rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
      // KEVIN-FIX C1 (the respawn deadlock): chunk streaming keys on the CAMERA — moving
      // only the body left origin chunks unloaded after a far-from-spawn death, so the
      // ground probe nulled forever and the frame loop starved before movement code.
      camera.position.set(0, 121.2, 0);
    }
    lastAliveRef.current = isAlive;
  }, [isAlive]);

  const triggerMeleeAttack = useCallback(() => {
    const now = performance.now();
    const store = useGameStore.getState();
    // M5: in a beast form the melee re-skins — per-form cooldown, scaled damage, element spark. Read
    // the form once (transient getState); human (null element) = the identity (cooldown/damage x1).
    const beastEl = store.beastFormActive ? store.activeBeastForm : null;
    if (now - lastAttackTime.current < MELEE_COOLDOWN * formMeleeCooldownMult(beastEl)) return;
    { const _kf = new THREE.Vector3(); camera.getWorldDirection(_kf); addKick(kickRef.current, localToWorldKick(_kf.x, _kf.z, KICK_PROFILES.melee)); } // game-feel: melee recoil
    lastAttackTime.current = now;
    // M6: every committed swing whooshes (playAttackSounds = swing + attack; was DEFINED-BUT-NEVER-CALLED,
    // so connecting hits had impact but no whoosh + swings only sounded on a MISS). A hit adds the spatial
    // 'hit' impact below; a miss is just the whoosh. Capture never runs the input path -> capture-inert.
    store.playAttackSounds?.();

    setAttackType('melee');
    setTimeout(() => setAttackType(null), 200);

    const effectiveStats = store.getEffectiveAttributes ? store.getEffectiveAttributes() : { strength: 10, agility: 10 };
    
    // Solve weapon base damage based on equipped weapon
    const equippedWeapon = store.equipment?.weapon;
    const baseWeaponDmg = getWeaponBaseDamage(equippedWeapon);
    
    const { damage, isCrit } = solveMeleeDamage(effectiveStats, baseWeaponDmg);
    // M5: resolveFormMelee applies the form damage mult on TOP of getEffectiveAttributes() (derive-
    // never-bake; x1 for human) AND derives the spark from the LOCKED form element (beastEl ==
    // activeBeastForm) — NOT the live activeSpell, so spell-switching mid-form can't desync the spark
    // from the body (Digit1-4 is ungated in-form). Unit-locked in beasts.test.js (the wiring contract).
    const { dealt, sparkType } = resolveFormMelee(damage, beastEl);

    if (GameMethods.checkMobsInMeleeCone && GameMethods.damageMob) {
      const lookDir = new THREE.Vector3();
      camera.getWorldDirection(lookDir);
      
      lookDir.y = 0;
      lookDir.normalize();

      const playerPos = camera.position.clone();
      playerPos.y -= 0.8; // shift down to chest/feet level

      const range = 4.5;
      const angleRad = Math.PI / 2; // 90-degree front arc sweep

      const hitMobs = GameMethods.checkMobsInMeleeCone(playerPos, lookDir, range, angleRad);

      let hitSomething = false;

      if (hitMobs && hitMobs.length > 0) {
        hitMobs.forEach(mob => {
          GameMethods.damageMob(mob.id, dealt, sparkType);
        });
        hitSomething = true;
      }

      // Boss-cone branch: the boss is a SEPARATE entity (not in the ECS), so the
      // mob loop above can never hit it. Reuse the SAME pure cone test against the
      // boss position (mirrors the spell boss path in EnhancedMagicSystem.jsx).
      // A single swing can hit BOTH mobs (above) AND the boss (here).
      if (store.isBossActive?.() && store.getBossPosition) {
        const bp = store.getBossPosition();
        if (bp) {
          const bossPoint = { x: bp[0], y: bp[1], z: bp[2] };
          if (isPointInCone(playerPos, lookDir, bossPoint, range, angleRad) && store.damageBoss) {
            store.damageBoss(dealt);
            // Mirror the melee mob-hit feedback at the player layer: a spatial 'hit'
            // sound at the boss (damageBoss plays no SFX of its own, unlike the spell
            // path) plus the same visceral crit camera-shake the mob path triggers.
            if (store.playSpatialSound) {
              store.playSpatialSound('hit', bp, 1.1, 30);
            }
            hitSomething = true;
          }
        }
      }

      if (hitSomething && isCrit && store.triggerCameraShake) {
        store.triggerCameraShake(1.6); // Visceral Crit camera shake
      }
      // (the swing whoosh now plays on EVERY swing via playAttackSounds above -- no miss-only sound)
    }
  }, [camera]);

  const triggerSpellCast = useCallback(() => {
    const now = performance.now();
    if (now - lastCastTime.current < CAST_COOLDOWN) return;
    lastCastTime.current = now;
    { const _kf = new THREE.Vector3(); camera.getWorldDirection(_kf); addKick(kickRef.current, localToWorldKick(_kf.x, _kf.z, KICK_PROFILES.cast)); } // game-feel: cast push

    const store = useGameStore.getState();
    if (store.castSpell) {
      const currentSpell = store.activeSpell || 'fireball';
      store.castSpell(currentSpell);
      if (store.onSpellCast) store.onSpellCast();
    }

    setAttackType('spell');
    setTimeout(() => setAttackType(null), 150);
  }, [activeSpell]);

  useEffect(() => {
    // WRITER: the keyboard/mouse listeners are the INPUT SOURCE. They write the same physical
    // keys into keysRef (the raw substrate continuous-reads like held-F casting still use) AND
    // mirror movement keys into the input-intent module so the verb loop reads intents, not raw
    // keys. Bindings are UNCHANGED — this is a pure abstraction-boundary refactor.
    const handleKeyDown = (e) => {
      keysRef.current[e.code] = true;

      // WASD -> continuous movement intents (W=forward, S=back, A=left, D=right).
      if (e.code === 'KeyW') setIntent('moveF', true);
      else if (e.code === 'KeyS') setIntent('moveB', true);
      else if (e.code === 'KeyA') setIntent('moveL', true);
      else if (e.code === 'KeyD') setIntent('moveR', true);

      if (e.code === 'Space') {
        setIntent('jump', true);
      }

      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        setIntent('dodge', true);
      }

      // S2-B1-M3: roar -> the abstract 'roar' intent (consumed by the transform SM in useFrame).
      // UX-legibility: a not-yet-unlocked Aspect verb used to fail SILENTLY — teach the unlock path.
      if (e.code === 'KeyR') {
        setIntent('roar', true);
        if (!(useGameStore.getState().unlockedTalents?.['wildheart_roar'] > 0)) notifyDenied('aspect-locked', 'WILDHEART');
      }

      // S2-B2-M1: grab -> the abstract 'grab' intent (VOIDHAND SM in useFrame). KeyV (KeyG = chest/trade).
      if (e.code === 'KeyV') {
        setIntent('grab', true);
        if (!(useGameStore.getState().unlockedTalents?.['voidhand_grasp'] > 0)) notifyDenied('aspect-locked', 'VOIDHAND');
      }

      // S2-B3-M4: snare -> the abstract 'snare' intent (SOULBIND SM in useFrame).
      // The Aspect-verb row: R=roar, V=grab, X=snare. (KeyT is double-bound legacy tame — avoided.)
      if (e.code === 'KeyX') {
        setIntent('snare', true);
        if (!(useGameStore.getState().unlockedTalents?.['soulbind_snare'] > 0)) notifyDenied('aspect-locked', 'SOULBIND');
      }

      // S2-B4-M5: imbue -> the abstract 'imbue' intent (the ELEMANCER latch in useFrame).
      // The Aspect-verb row completes: R=roar, V=grab, X=snare, Z=imbue.
      if (e.code === 'KeyZ') {
        setIntent('imbue', true);
        if (!(useGameStore.getState().unlockedTalents?.['elemancer_imbue'] > 0)) notifyDenied('aspect-locked', 'ELEMANCER');
      }

      if (e.code === 'KeyF') {
        // KEVIN-FIX C2: was fully ungated — fired even dead/in menus.
        if (getInput().active && useGameStore.getState().isAlive) triggerMeleeAttack();
      }
    };
    const handleKeyUp = (e) => {
      keysRef.current[e.code] = false;

      if (e.code === 'KeyW') setIntent('moveF', false);
      else if (e.code === 'KeyS') setIntent('moveB', false);
      else if (e.code === 'KeyA') setIntent('moveL', false);
      else if (e.code === 'KeyD') setIntent('moveR', false);

      if (e.code === 'Space') {
        setIntent('jump', false);
      }

      if (e.code === 'KeyR') {
        setIntent('roar', false);
      }

      if (e.code === 'KeyV') {
        setIntent('grab', false);
      }

      if (e.code === 'KeyX') {
        setIntent('snare', false);
      }

      if (e.code === 'KeyZ') {
        setIntent('imbue', false);
      }
    };
    // #72 VERB ROUTER: ONE listener, one click -> exactly ONE verb (design-of-record:
    // docs/superpowers/specs/2026-06-10-crafty-72-verb-router-design.md). ctx is built from
    // the LIVE seams: the same melee cone damage uses (router-attack ≡ swing-lands), a narrow
    // aim cone over the collider-less mobs (the through-mob guard), and Terrain's single 8m
    // build ray via the GameMethods registry (this file stays worker-token-free — gated).
    // #72 VERB ROUTER (unchanged logic): extracted to performVerb(button) so the touch overlay
    // (M1) reuses the identical ctx-build + routeMouseVerb dispatch (spec section 2 seam table).
    const performVerb = (button) => {
      if (!getInput().active) return;
      if (button !== 0 && button !== 2) return;
      const store = useGameStore.getState();
      // KEVIN-FIX C2: fire shares movement's gates — dead players don't shoot (the old
      // asymmetry presented as "can fire but cannot move" whenever the booleans disagreed).
      if (!store.isAlive) return;

      const lookDir = new THREE.Vector3();
      camera.getWorldDirection(lookDir);
      const aimDir = lookDir.clone();              // true aim (vertical kept) for the aim cone
      lookDir.y = 0; lookDir.normalize();          // the flattened melee-arc dir (damage parity)
      const playerPos = camera.position.clone();
      playerPos.y -= 0.8;

      // meleeHit — the EXACT live-damage test (mobs + boss)
      let meleeHit = false;
      if (GameMethods.checkMobsInMeleeCone) {
        meleeHit = GameMethods.checkMobsInMeleeCone(playerPos, lookDir, 4.5, Math.PI / 2).length > 0;
      }
      if (!meleeHit && store.isBossActive?.() && store.getBossPosition) {
        const bp = store.getBossPosition();
        if (bp) meleeHit = isPointInCone(playerPos, lookDir, { x: bp[0], y: bp[1], z: bp[2] }, 4.5, Math.PI / 2);
      }

      // aimedMobDist — nearest mob/boss in the narrow aim cone (pure math; mobs have no colliders)
      let aimedMobDist = Infinity;
      if (GameMethods.checkMobsInMeleeCone) {
        for (const m of GameMethods.checkMobsInMeleeCone(playerPos, aimDir, AIM_CONE_RANGE, AIM_CONE_ARC)) {
          const dx = m.position.x - playerPos.x, dy = m.position.y - playerPos.y, dz = m.position.z - playerPos.z;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d < aimedMobDist) aimedMobDist = d;
        }
      }
      if (store.isBossActive?.() && store.getBossPosition) {
        const bp = store.getBossPosition();
        if (bp && isPointInCone(playerPos, aimDir, { x: bp[0], y: bp[1], z: bp[2] }, AIM_CONE_RANGE, AIM_CONE_ARC)) {
          const dx = bp[0] - playerPos.x, dy = bp[1] - playerPos.y, dz = bp[2] - playerPos.z;
          aimedMobDist = Math.min(aimedMobDist, Math.sqrt(dx * dx + dy * dy + dz * dz));
        }
      }

      const hit = GameMethods.castBuildRay ? GameMethods.castBuildRay() : null;

      const verb = routeMouseVerb(button, {
        held: store.voidhandHeld,
        meleeHit,
        aimedMobDist,
        terrainDist: hit ? hit.toi : Infinity,
        chestTargeted: !!(hit && hit.chestTargeted),
      });

      if (verb === 'attack') {
        if (store.voidhandHeld) voidhandVerbRef.current.attack = true; // M3: HELD re-skin -> SM 'hurl'
        else triggerMeleeAttack();
      } else if (verb === 'cast') {
        if (store.voidhandHeld) voidhandVerbRef.current.cast = true;   // M3: HELD re-skin -> SM 'slam'
        else { triggerSpellCast(); castFiredRef.current = true; } // S2-B4-M5: the latch consumes this
      } else if (verb === 'mine') GameMethods.terrainVerbs?.mine(hit);
      else if (verb === 'place') GameMethods.terrainVerbs?.place(hit);
      else if (verb === 'interact') GameMethods.terrainVerbs?.open(hit);
    };
    const handleMouseDown = (e) => performVerb(e.button);
    useGameStore.setState({ performVerb }); // touch overlay (M1) dispatches via store.performVerb
    // Centralized active gate: the ONE pointer-lock read in the controller. Pointer-lock is the
    // KB+mouse "input is live" source today; setActive() routes it into the intent module so the
    // verb loop gates on getInput().active (a future touch layer sets active from its own focus).
    const handlePointerLockChange = () => {
      setActive(!!document.pointerLockElement);
    };
    // KEVIN-FIX C3: the missing FAILURE channel — a rejected requestPointerLock (Chrome's
    // ~1-2.5s post-ESC cooldown, no-user-activation) could strand active=true with no lock:
    // crosshair shown, clicks firing, mouse-look dead, no recovery surface.
    const handlePointerLockError = () => {
      setActive(false);
    };
    handlePointerLockChange(); // sync initial active state on mount (single read above)
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    document.addEventListener('pointerlockerror', handlePointerLockError);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      document.removeEventListener('pointerlockerror', handlePointerLockError);
    }
  }, [camera, triggerMeleeAttack, triggerSpellCast]);

  useFrame((state, delta) => {
    if (!rigidBodyRef.current) return;

    // Dev capture mode: pin the follow-cam to a fixed pose so frames are byte-stable.
    // Physics is paused in this mode, so we bypass all rigidbody-driven camera logic
    // (lerp/bob/shake/FOV) and hard-set a known camera. No-op in normal gameplay.
    if (isCaptureMode()) {
      const { position, lookAt } = getCaptureOpts().camera;
      const { camera } = state;
      camera.position.set(position[0], position[1], position[2]);
      camera.up.set(0, 1, 0);
      camera.lookAt(lookAt[0], lookAt[1], lookAt[2]);
      camera.fov = 75;
      camera.updateProjectionMatrix();
      return;
    }

    // Wake up physics body
    rigidBodyRef.current.wakeUp();

    // S2-B1-M3: tick the beast-transform state machine (the ROAR verb) HERE — below the capture
    // early-return (so it NEVER ticks under the visual gate) but ABOVE the dead-window early-return
    // below, so an in-flight roar charge CANCELS at the death edge via the SM's own `!alive` guard
    // instead of tunnelling through the dead window and auto-firing on respawn (review B1). Reads the
    // abstract `roar` intent transiently (never a raw key) + drives the M1 enter/exitBeastForm store
    // authority; the store's beastFormActive is the single active-truth, the SM owns only the charge +
    // duration/cooldown timers. `active` (input-live) is the deliberate modal proxy — every modal-open
    // path exits pointer-lock -> active=false -> no transform mid-menu. (No setIntent('roar',false) on
    // exit: the roarEdge + cooldown already block instant re-trigger.) `canEnter` is true now; M4 adds
    // the ferocity threshold, M6 the wildheart_roar talent-unlock. set() fires only on transitions.
    {
      const rin = getInput();
      const roar = rin.roar;
      const roarEdge = roar && !prevRoarRef.current;
      prevRoarRef.current = roar;
      const st = useGameStore.getState();
      const { sm, action } = decideTransform(beastSMRef.current, {
        isBeast: st.beastFormActive,
        roar,
        roarEdge,
        active: rin.active,
        alive: st.isAlive,
        now: state.clock.getElapsedTime(),
        // M4: a full Ferocity bank AND M6: the Primal Roar talent must be unlocked (the roar is a
        // signature ability, not free). canEnter gates BOTH startCharge and commit.
        canEnter: canTransform(st.ferocityBanked) && (st.unlockedTalents?.['wildheart_roar'] > 0),
        // M6: Primal Endurance extends the form duration — read the rank at THIS site (not the fold).
        formDurationSec: formDurationFor(st.unlockedTalents?.['wildheart_endurance'] || 0),
      });
      beastSMRef.current = sm;
      if (action === 'startCharge') {
        // M7a: begin the third-person transform-cam reveal — capture the facing NOW (horizontal) so the
        // behind-shot is a STABLE orbit, not mouse-jittered during the cinematic.
        const d = new THREE.Vector3();
        camera.getWorldDirection(d);
        d.y = 0;
        if (d.lengthSq() > 1e-6) d.normalize(); else d.set(0, 0, -1);
        transformCamRef.current = { active: true, t: 0, fwd: [d.x, 0, d.z] };
        st.setBeastCharging(true); // M7c: beat-1 anticipation begins
      } else if (action === 'enter') {
        // M4: UNLEASH — spend the banked Ferocity ONLY on a real transform (enterBeastForm returns
        // false if it rejects: already-in-form / dead). Avoids draining the bank on a no-op enter.
        if (st.enterBeastForm(elementForSpell(st.activeSpell))) {
          st.accrueFerocity(-FEROCITY_THRESHOLD);
          // AUDIO (the owed B1 backfill): the ROAR finally SOUNDS — spatial at the player.
          const rp = st.playerPosition;
          if (st.playSpatialSound && rp) st.playSpatialSound('roar', [rp.x, rp.y, rp.z], 1, 30);
          // music-motif v2: the WILDHEART stinger under the roar (the transform IS the signature)
          if (st.playSpatialSound && rp) {
            const nowS = performance.now() / 1000;
            if (nowS - _lastWildheartMotif > MOTIF_COOLDOWN_SEC) {
              _lastWildheartMotif = nowS;
              st.playSpatialSound('motifWildheart', [rp.x, rp.y, rp.z], 1, 40);
            }
          }
        }
        st.setBeastCharging(false); // M7c: anticipation -> BURST + the avatar entrance take over
      } else if (action === 'cancel') {
        // M7a: roar released early -> ease the transform-cam back to FPV (jump it to the return phase).
        const tc = transformCamRef.current;
        if (tc.active) tc.t = Math.max(tc.t, 0.78 * TRANSFORM_CAM_SEC);
        st.setBeastCharging(false); // M7c: charge cancelled
      } else if (action === 'exitTimer' || action === 'exitManual') {
        st.exitBeastForm();
      }
    }

    // S2-B2-M1: the VOIDHAND grab SM — tap V to grab a phantom block (orbits as a shield), re-press V to
    // release. Transient intent reads; the store holds the single held-truth; set() only on transitions
    // (Game-Loop-Isolation). M1 grab is ALWAYS a phantom (never a voxel edit -> no re-mesh). canGrab is OPEN
    // in M1; M4 ANDs the kinetic bank + the voidhand_grasp talent. HURL/SLAM (attack/cast re-skin) + impact
    // are M3, so attack/cast are not fed here yet -> release is via re-press or the max-hold timer.
    // S2-B2-M2: under perf-probe mode the runner writes `voidhandHeld` directly (no real grab happened,
    // so the SM's heldUntil=0 would max-hold-auto-drop it on the first frame) — the probe's store-driven
    // held state is authoritative, so the SM tick is skipped. isPerfProbe() is constant-false in prod.
    if (!isPerfProbe()) {
      const vin = getInput();
      const grab = vin.grab;
      const grabEdge = grab && !prevGrabRef.current;
      prevGrabRef.current = grab;
      // M3: single-frame held-click edges from the #72 dispatcher (consumed + cleared here)
      const vAtk = voidhandVerbRef.current.attack; voidhandVerbRef.current.attack = false;
      const vCast = voidhandVerbRef.current.cast; voidhandVerbRef.current.cast = false;
      const stv = useGameStore.getState();
      const { sm: vsm, action: vaction } = decideVoidhand(voidhandSMRef.current, {
        held: stv.voidhandHeld,
        grabEdge,
        attack: vAtk,
        cast: vCast,
        active: vin.active,
        alive: stv.isAlive,
        now: state.clock.getElapsedTime(),
        // M4: the gate M1 left OPEN — bank + talent compose here (the roar-gate pattern below)
        canGrab: kCanGrab(stv.kineticBanked) && (stv.unlockedTalents?.['voidhand_grasp'] > 0),
      });
      voidhandSMRef.current = vsm;
      if (vaction === 'grab') {
        stv.accrueKinetic(-GRAB_COST); // M4: a combat grab SPENDS banked Kinetic (canGrab vetted it)
        // M3: tint from the looked-at block when it's a KNOWN voxel (worldBlocks); else placeholder.
        const gHit = GameMethods.castBuildRay ? GameMethods.castBuildRay() : null;
        const known = gHit ? stv.worldBlocks?.get(gHit.targetCoords) : undefined;
        stv.setVoidhandHeld(true);
        stv.setHeldPhantom({ color: PHANTOM_BLOCK_COLORS[known] || '#A9966E' });
        const gp = stv.playerPosition; // AUDIO: the grab chirp carries the whole-tone Aspect motif
        if (stv.playSpatialSound && gp) stv.playSpatialSound('grab', [gp.x, gp.y, gp.z], 1, 20);
      } else if (vaction === 'hurl') {
        // launch along camera-forward from just ahead of the head (the phantom visually snaps to it)
        const hd = new THREE.Vector3();
        camera.getWorldDirection(hd);
        const ho = camera.position.clone().add(hd.clone().multiplyScalar(1.2));
        requestHurl({ x: ho.x, y: ho.y, z: ho.z }, { x: hd.x, y: hd.y, z: hd.z }, stv.heldPhantom && stv.heldPhantom.color);
        if (stv.playSpatialSound) stv.playSpatialSound('hurl', [ho.x, ho.y, ho.z], 1, 25); // AUDIO: launch whoosh
        stv.setVoidhandHeld(false);
        stv.setHeldPhantom(null);
      } else if (vaction === 'slam') {
        requestSlam({ x: phantomWorldPos.x, y: phantomWorldPos.y, z: phantomWorldPos.z }, stv.heldPhantom && stv.heldPhantom.color);
        if (stv.playSpatialSound) stv.playSpatialSound('slam', [phantomWorldPos.x, phantomWorldPos.y, phantomWorldPos.z], 1, 30); // AUDIO: the heavy thump
        { const _kf = new THREE.Vector3(); camera.getWorldDirection(_kf); addKick(kickRef.current, localToWorldKick(_kf.x, _kf.z, KICK_PROFILES.slam)); } // game-feel: slam recoil (hard down + forward)
        // music-motif v2: the VOIDHAND stinger on the slam (gravity's signature), 10s-guarded
        if (stv.playSpatialSound) {
          const nowS = performance.now() / 1000;
          if (nowS - _lastVoidhandMotif > MOTIF_COOLDOWN_SEC) {
            _lastVoidhandMotif = nowS;
            stv.playSpatialSound('motifVoidhand', [phantomWorldPos.x, phantomWorldPos.y, phantomWorldPos.z], 1, 40);
          }
        }
        stv.setVoidhandHeld(false);
        stv.setHeldPhantom(null);
      } else if (vaction === 'drop' || vaction === 'cancel') {
        stv.setVoidhandHeld(false);
        stv.setHeldPhantom(null);
      }

      // S2-B3-M4: the SOULBIND snare SM — the voidhand block's sibling. Target validity is computed
      // PER FRAME (the mob keeps moving; holding aim IS the skill — design §2).
      const SNARE_RANGE = 12;
      const SOULBIND_JADE = '#3DFFB0';
      const snareIn = vin.snare;
      const snareEdge = snareIn && !prevSnareRef.current;
      prevSnareRef.current = snareIn;
      let snareTargetId = null;
      let snareTarget = null;
      if (GameMethods.checkMobsInMeleeCone) {
        const sDir = new THREE.Vector3();
        camera.getWorldDirection(sDir); // unflattened — aim where you LOOK (the aimedMobDist precedent)
        const candidates = GameMethods.checkMobsInMeleeCone(camera.position, sDir, SNARE_RANGE, Math.PI / 8) || [];
        // nearest snareable: weakened (<=30% HP), hostile (not passive; villager converter-blocked too)
        let best = null, bestD = Infinity;
        for (const e of candidates) {
          if (!e || e.passive || e.health > 0.3 * e.maxHealth || e.health <= 0) continue;
          const dx = e.position.x - camera.position.x, dz = e.position.z - camera.position.z;
          const d = dx * dx + dz * dz;
          if (d < bestD) { bestD = d; best = e; }
        }
        if (best) { snareTargetId = best.id; snareTarget = best; }
      }
      const squadCap = 2 + ((stv.unlockedTalents?.['soulbind_pack'] > 0) ? 1 : 0);
      const { sm: ssm, action: saction } = decideSoulbind(soulbindSMRef.current, {
        snareEdge,
        active: vin.active,
        alive: stv.isAlive,
        now: state.clock.getElapsedTime(),
        canSnare: sCanSnare(stv.soulBanked) && (stv.unlockedTalents?.['soulbind_snare'] > 0) && alliesQuery.entities.length < squadCap,
        targetId: snareTargetId,
      });
      soulbindSMRef.current = ssm;
      if (saction === 'bind') {
        stv.accrueSoul(-SNARE_COST); // canSnare vetted the bank
        const ally = GameMethods.captureMob ? GameMethods.captureMob(ssm.targetId ?? snareTargetId) : null;
        if (ally) {
          // the jade re-tint: lerp the body color 45% toward the SOULBIND identity (design §2)
          ally.color = new THREE.Color(ally.color).lerp(new THREE.Color(SOULBIND_JADE), 0.45).getStyle();
          if (stv.playSpatialSound) stv.playSpatialSound('bind', [ally.position.x, ally.position.y, ally.position.z], 1, 25);
          fireBindCeremony(ally.position); // the jade halo — a creature JOINS you (feel pass)
        }
        clearSnareState();
      } else if (ssm.channeling && snareTarget) {
        writeSnareState({
          channeling: true, targetId: snareTargetId,
          progress: Math.min((state.clock.getElapsedTime() - ssm.channelStart) / SNARE_CHANNEL_SEC, 1),
          from: { x: camera.position.x, y: camera.position.y - 0.25, z: camera.position.z },
          to: { x: snareTarget.position.x, y: snareTarget.position.y + 0.4, z: snareTarget.position.z },
        });
      } else {
        clearSnareState();
      }

      // S2-B3-M6: FUSE — the X key's second life via a deterministic arbiter: a valid SNARE
      // target WINS; with none, holding X by two bound creatures braids them into a hybrid.
      // The channel only STARTS when fusion CAN complete (bank + roster entry + proximity).
      let fusePair = null;
      if (!snareTargetId && alliesQuery.entities.length >= 2) {
        const pp = stv.playerPosition;
        if (pp) {
          const near = alliesQuery.entities
            .map((e) => ({ e, d: (e.position.x - pp.x) ** 2 + (e.position.z - pp.z) ** 2 }))
            .filter((o) => o.d <= FUSE_RADIUS * FUSE_RADIUS)
            .sort((a, b) => a.d - b.d);
          if (near.length >= 2) fusePair = [near[0].e, near[1].e];
        }
      }
      const canStartFuse = !!fusePair && sCanFuse(stv.soulBanked)
        && !!lookupHybrid(fusePair[0].baseType || fusePair[0].type, fusePair[1].baseType || fusePair[1].type);
      const { sm: fsm, action: faction } = decideFuse(fuseSMRef.current, {
        fuseEdge: snareEdge, // the same key edge; the arbiter above kept it exclusive
        active: vin.active,
        alive: stv.isAlive,
        now: state.clock.getElapsedTime(),
        canStart: canStartFuse,
        pairNear: !!fusePair,
      });
      fuseSMRef.current = fsm;
      if (faction === 'fuse' && fusePair) {
        stv.accrueSoul(-FUSE_COST); // canStart vetted the bank
        const hy = applyFusion(ecs, fusePair[0], fusePair[1]);
        if (hy && stv.playSpatialSound) {
          // the bind chime down-pitched = the v1 fuse swell (deliberate reuse; M7 may upgrade)
          stv.playSpatialSound('bind', [hy.position.x, hy.position.y, hy.position.z], 0.7, 25);
          // music-motif v2: a soul JOINS — the fuse is SOULBIND's signature (rare by its 50-Soul price)
          stv.playSpatialSound('motifSoulbind', [hy.position.x, hy.position.y, hy.position.z], 1, 40);
        }
        if (hy) fireBindCeremony(hy.position); // the halo marks the hybrid's birth too
      } else if (fsm.channeling && fusePair) {
        // the tether doubles as the fusion thread — drawn BETWEEN the two creatures
        writeSnareState({
          channeling: true, targetId: fusePair[0].id,
          progress: Math.min((state.clock.getElapsedTime() - fsm.channelStart) / FUSE_CHANNEL_SEC, 1),
          from: { x: fusePair[0].position.x, y: fusePair[0].position.y + 0.4, z: fusePair[0].position.z },
          to: { x: fusePair[1].position.x, y: fusePair[1].position.y + 0.4, z: fusePair[1].position.z },
        });
      }

      // ELEMANCER (S2-B4-M5): the imbue LATCH — Z arms the next cast (bank- and talent-gated);
      // the #72 cast branch stamps castFiredRef when a real spell cast routes. On 'consume'
      // the cast is already in flight: spend the bank + hand the element kind to the
      // projectile spawn via the cast-arm slot.
      const imbueIn = vin.imbue;
      const imbueEdge = imbueIn && !prevImbueRef.current;
      prevImbueRef.current = imbueIn;
      const { sm: ism, action: iaction } = decideImbue(imbueSMRef.current, {
        imbueEdge,
        castFired: castFiredRef.current,
        active: vin.active,
        alive: stv.isAlive,
        canIgnite: rCanIgnite(stv.resonanceBanked) && (stv.unlockedTalents?.['elemancer_imbue'] > 0),
      });
      imbueSMRef.current = ism;
      castFiredRef.current = false;
      if (iaction === 'arm') stv.setImbueArmed(true);
      else if (iaction === 'disarm') stv.setImbueArmed(false);
      else if (iaction === 'consume') {
        stv.setImbueArmed(false);
        stv.accrueResonance(-ZONE_COST); // canIgnite vetted the bank at arm-time; spend at cast
        armImbueCast(KIND_BY_SPELL[stv.activeSpell] || 'burning');
      }
    }

    // Phase 29: Freeze physics body on death to prevent void-falling loops and camera jitter
    const isPlayerAlive = useGameStore.getState().isAlive;
    if (!isPlayerAlive) {
      rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      const translation = rigidBodyRef.current.translation();
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, translation.x, 0.85);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, translation.y + 1.2, 0.85);
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, translation.z, 0.85);
      return;
    }

    // M5: per-form locomotion re-skin. Read the form transiently (Game-Loop-Isolation — never a
    // subscription in useFrame); human (null) = the identity (all mults 1). `loco` is reused at the
    // jump + gravity sites below.
    const locoState = useGameStore.getState();
    const loco = formLocomotion(locoState.beastFormActive ? locoState.activeBeastForm : null);
    const speed = moveSpeed(loco);
    const currentVel = rigidBodyRef.current.linvel();
    const currentTrans = rigidBodyRef.current.translation();

    // Void Skyfall Guard: if player clips/falls through floor into the void, reset (game/spawnPlacement.js)
    if (spawnPosSet.current && isVoidFall(currentTrans.y)) {
      console.warn("[DEBUG] Player fell into void! Teleporting to safety.");
      rigidBodyRef.current.setTranslation({ x: 0, y: SPAWN_FREEZE_Y, z: 0 }, true);
      rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      spawnPosSet.current = false;
      return;
    }

    // Freeze player in sky until world is built to prevent falling through floor
    if (!isWorldBuiltRef.current) {
      rigidBodyRef.current.setTranslation({ x: 0, y: SPAWN_FREEZE_Y, z: 0 }, true);
      rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      return;
    } else if (!spawnPosSet.current) {
      const store = useGameStore.getState();
      // 1. placed-block ground (save load): highest block at the origin column
      let blockGroundY = null;
      if (store.worldBlocks && store.worldBlocks.size > 0) {
        for (let y = 150; y > 0; y--) {
          // ELEMANCER-M1 fix: writers key worldBlocks with UNDERSCORES (`x_y_z`).
          if (store.worldBlocks.has(`0_${y}_0`)) { blockGroundY = y; break; }
        }
      }
      // 2. else the physics raycast — the spawn-ground DECISION (bounded probe wait + y=60 fallback +
      //    the physicsY<=15 reject) lives in game/spawnPlacement.js (resolveSpawnGround). KEVIN-FIX C1.
      const probeAvailable = !!store.getMobGroundLevel;
      const physicsY = (blockGroundY === null && probeAvailable) ? store.getMobGroundLevel(0, 0) : null;
      const spawn = resolveSpawnGround(blockGroundY, physicsY, spawnProbeFailsRef.current, probeAvailable);
      if (spawn.incFails) spawnProbeFailsRef.current += 1;
      if (spawn.retry) {
        rigidBodyRef.current.setTranslation({ x: 0, y: SPAWN_FREEZE_Y, z: 0 }, true);
        rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
        return; // Wait for next frame (the streamer is loading origin chunks)
      }

      const safeY = spawnTargetY(spawn.groundY); // player center 1.2 above ground (instant land)
      rigidBodyRef.current.setTranslation({ x: 0, y: safeY, z: 0 }, true);
      rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);

      // Cancel skyfall lerp transition: set camera position instantly
      camera.position.set(0, safeY + 1.2, 0);

      spawnPosSet.current = true;
      return;
    }
    if (isNaN(velocityY.current) || isNaN(currentTrans.y)) {
      console.error(`[DEBUG] Physics corrupted! vel:`, velocityY.current, `trans:`, currentTrans);
    }

    // Ensure applyImpulse is bound on the rigid body for boss compatibility
    if (rigidBodyRef.current && !rigidBodyRef.current.applyImpulse) {
      rigidBodyRef.current.applyImpulse = (impulse) => {
        knockbackVelocity.current.x += impulse.x;
        velocityY.current += impulse.y;
        knockbackVelocity.current.z += impulse.z;
      };
    }

    // Read from keysRef instead of stale keys state
    const keys = keysRef.current;
    // READER: read the live intent object ONCE per frame (transient, alloc-free — Game-Loop
    // Isolation). `input.active` is the centralized gate that replaces the old scattered
    // raw pointer-lock reads; movement/dodge read input.moveF/.moveB/.moveL/.moveR.
    const input = getInput();
    const isLocked = input.active;

    // Handle dodge roll state machine
    const dodge = dodgeStateRef.current;
    const nowTime = state.clock.getElapsedTime();

    if (isLocked && input.dodge) {
      // Edge-trigger: consume the dodge intent so one press = one dodge.
      setIntent('dodge', false);

      // Check cooldown
      if (!dodge.isActive && nowTime - dodge.lastDodgeTime >= dodge.cooldown) {
        // Dodge direction (pure — game/dodge.js): planar basis from the camera + the move intents,
        // forward when no directional input. Byte-equivalent to the prior inline THREE math.
        const cameraDir = new THREE.Vector3();
        camera.getWorldDirection(cameraDir);
        const dodgeDir = dodgeDirection(cameraDir.x, cameraDir.z, {
          moveF: isLocked && input.moveF,
          moveB: isLocked && input.moveB,
          moveL: isLocked && input.moveL,
          moveR: isLocked && input.moveR,
        });

        // Initialize dodge
        dodge.isActive = true;
        dodge.timeElapsed = 0;
        dodge.direction.set(dodgeDir.x, 0, dodgeDir.z);
        dodge.lastDodgeTime = nowTime;

        // Set invincible callback in store
        useGameStore.setState({
          isPlayerInvincible: () => isDodgeInvincible(dodge.isActive, dodge.timeElapsed, dodge.iframeDuration)
        });

        // Trigger spatial audio
        if (useGameStore.getState().playSpatialSound) {
          useGameStore.getState().playSpatialSound('swing', currentTrans, 1.4, 15);
        }

        // Trigger camera shake
        if (useGameStore.getState().triggerCameraShake) {
          useGameStore.getState().triggerCameraShake(0.5);
        }
      }
    }

    // Set up robust player physics exclusions to prevent self-collision
    const playerHandle = rigidBodyRef.current.handle;
    const filterPredicate = (collider) => {
      const parent = collider.parent();
      return !parent || parent.handle !== playerHandle;
    };

    // Kinematic ground check from Rapier character controller
    const isGrounded = controllerRef.current ? controllerRef.current.computedGrounded() : false;

    // Phase 23: Ledge Parkour Climb/Vault System
    if (!isGrounded && isLocked && input.moveF && velocityY.current <= 2.0 && controllerRef.current) {
      const cameraDir = new THREE.Vector3();
      camera.getWorldDirection(cameraDir);
      const lookDir = new THREE.Vector3(cameraDir.x, 0, cameraDir.z).normalize();
      
      const chestRayStart = { x: currentTrans.x, y: currentTrans.y - 0.2, z: currentTrans.z };
      const rayDirection = { x: lookDir.x, y: 0, z: lookDir.z };
      
      const chestRay = new rapier.Ray(chestRayStart, rayDirection);
      const chestHit = world.castRay(
        chestRay,
        0.8,
        true,
        undefined,
        undefined,
        undefined,
        rigidBodyRef.current,
        filterPredicate
      );

      if (chestHit) {
        const headRayStart = { x: currentTrans.x, y: currentTrans.y + 0.8, z: currentTrans.z };
        const headRay = new rapier.Ray(headRayStart, rayDirection);
        const headHit = world.castRay(
          headRay,
          1.0,
          true,
          undefined,
          undefined,
          undefined,
          rigidBodyRef.current,
          filterPredicate
        );

        if (!headHit) {
          // Ledge detected! Perform vault boost.
          // M5 review [C]: the ledge-vault is DELIBERATELY form-INVARIANT (not x loco.jumpMult) — a
          // traversal-reliability / Marcus-floor choice (every form mantles a ledge identically). Per-
          // form mobility lives in the primary jump (x jumpMult); revisit if Kevin wants form-vault feel.
          velocityY.current = VAULT_VELOCITY;
          
          // Apply a gentle forward push to land on top
          knockbackVelocity.current.x = lookDir.x * 3.5;
          knockbackVelocity.current.z = lookDir.z * 3.5;
          
          // Play a premium vault audio sound
          const store = useGameStore.getState();
          if (store.playSpatialSound) {
            store.playSpatialSound('swing', currentTrans, 1.2, 10);
          }
        }
      }
    }

    // Handle jumping & gravity
    if (isGrounded) {
      if (isLocked && input.jump && !dodge.isActive) {
        velocityY.current = jumpVelocity(loco); // M5: hawk hops higher (low-gravity), bull/golem lower
        useGameStore.getState().playSpatialSound?.('jump', [camera.position.x, camera.position.y, camera.position.z], 1, 6); // locomotion-audio: jump cue
        // Consume the jump intent on a grounded jump. OS key-repeat re-sets the intent via
        // repeated keydown, so held-Space bunny-hopping is preserved byte-identically.
        setIntent('jump', false);
      } else {
        // Small downward force to stay glued to slopes and stairs
        velocityY.current = GLUE_VELOCITY;
      }
    } else {
      // Apply gravity over time (clamped at terminal velocity) — game/locomotion.js
      velocityY.current = applyGravity(velocityY.current, loco.gravityMult, delta);
    }

    // Decay knockback velocity using exponential spring dampening
    knockbackVelocity.current.x *= Math.exp(-delta * 8.0);
    knockbackVelocity.current.z *= Math.exp(-delta * 8.0);
    if (Math.abs(knockbackVelocity.current.x) < 0.05) knockbackVelocity.current.x = 0;
    if (Math.abs(knockbackVelocity.current.z) < 0.05) knockbackVelocity.current.z = 0;

    let desiredVelX = 0;
    let desiredVelZ = 0;

    if (dodge.isActive) {
      // Progressively update dodge elapsed time
      dodge.timeElapsed += delta;
      
      if (dodge.timeElapsed >= dodge.duration) {
        dodge.isActive = false;
        useGameStore.setState({ isPlayerInvincible: null });
      } else {
        // Juicy dodge speed curve.
        // M5 review [D]: the dodge i-frame burst is DELIBERATELY form-INVARIANT (not x loco.moveMult) —
        // an i-frame-fairness choice (a reliable defensive escape in every form, like the turnRate
        // omission). Per-form pace lives in the walk speed (x moveMult). Flag for Kevin if he wants a
        // form-paced dodge (comet far / golem short).
        const progress = dodge.timeElapsed / dodge.duration;
        const spd = dodgeSpeed(progress);
        desiredVelX = dodge.direction.x * spd;
        desiredVelZ = dodge.direction.z * spd;
      }
    } else if (isLocked) {
      // Normal WASD movement — camera-relative planar velocity (pure, game/locomotion.moveVector).
      const cameraDir = new THREE.Vector3();
      camera.getWorldDirection(cameraDir);
      const mv = moveVector(cameraDir.x, cameraDir.z, input, speed);
      if (mv.moving) {
        desiredVelX = mv.x;
        desiredVelZ = mv.z;
      }
    }

    // Combine keyboard input velocity and knockback
    const nextVelX = desiredVelX + knockbackVelocity.current.x;
    const nextVelZ = desiredVelZ + knockbackVelocity.current.z;

    // S1-D-M1: Non-blocking hitstop. While `hitstopUntil` is in the future, clamp the
    // player's per-frame motion toward zero — a brief micro-freeze that reads as impact
    // weight. Replaces the old main-thread busy-wait (which froze the whole tab). Cheap
    // store read; 0 = inactive. Capture mode never reaches here (early return above).
    const hitstopUntil = useGameStore.getState().hitstopUntil || 0;
    const hitstopScale = performance.now() < hitstopUntil ? 0 : 1;

    // Calculate displacement vector
    const displacement = new THREE.Vector3(
      nextVelX * delta * hitstopScale,
      velocityY.current * delta * hitstopScale,
      nextVelZ * delta * hitstopScale
    );

    // S2-B1-M1: consume the one-shot beast-form ENTER swap HERE -- after every early-return
    // (capture/respawn/void-guard above), immediately before the collider(0) read -- so the in-place
    // setShape is ATOMIC with this frame's sweep (a frame that skips the sweep also skips the swap)
    // and NEVER runs under the visual-capture harness (capture early-returns at the top of useFrame).
    // setShape preserves the collider handle/index/groups -> no re-bind, ZERO voxel edits. The grow-
    // depenetration delta folds into the single setNextKinematicTranslation below. (EXIT/restore is
    // done imperatively in the activeBeastForm effect -- it must drain even while the dead-window
    // early-return is active.) Guarded on controllerRef so the swap + its depenetration stay paired.
    let growDeltaY = 0;
    if (pendingFormSwapRef.current && rapier && controllerRef.current) {
      const target = pendingFormSwapRef.current;
      pendingFormSwapRef.current = null;
      const c0 = rigidBodyRef.current.collider(0);
      if (c0 && setColliderToForm(c0, rapier, target)) {
        growDeltaY = Math.max(0, target.halfHeight - currentFormHHRef.current);
        currentFormHHRef.current = target.halfHeight;
        // defensive base reset (M1 forms never shove dynamics; the bull enables this in M5).
        if (controllerRef.current.setApplyImpulsesToDynamicBodies) {
          controllerRef.current.setApplyImpulsesToDynamicBodies(false);
        }
      }
    }

    // Call Rapier WASM Kinematic collision sweeps
    const collider = rigidBodyRef.current.collider(0);
    if (collider && controllerRef.current) {
      controllerRef.current.computeColliderMovement(
        collider,
        displacement,
        undefined,
        undefined,
        filterPredicate
      );

      // Get corrected movements
      const corrected = controllerRef.current.computedMovement();

      // Set next kinematic translation coordinates. growDeltaY (from a just-applied enlarging
      // form-swap) is folded into THIS frame's single write -- never a competing setNextKinematic
      // from a subscribe callback -- so a larger capsule never spawns intersecting the ground.
      const currentPos = rigidBodyRef.current.translation();
      rigidBodyRef.current.setNextKinematicTranslation({
        x: currentPos.x + corrected.x,
        y: currentPos.y + corrected.y + growDeltaY,
        z: currentPos.z + corrected.z
      });
    }

    // Phase 9: Dynamic FOV Momentum & Camera Bobbing
    const horizontalSpeed = Math.sqrt(nextVelX * nextVelX + nextVelZ * nextVelZ);
    
    let targetFov = 75;
    if (velocityY.current < -15) targetFov = 85; // falling fast
    else if (horizontalSpeed > 5) targetFov = 75 + (horizontalSpeed - 5) * 1.5; // moving fast

    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 0.1);
    camera.updateProjectionMatrix();

    const time = state.clock.elapsedTime;
    let bobOffset = 0;
    if (isGrounded && horizontalSpeed > 1) {
      bobOffset = Math.sin(time * 15) * 0.06;
    }

    // Locomotion audio (interleave): surface-keyed footsteps in stride + a landing thud. Game-Loop
    // safe — transient getState() + stride/grounded refs, no React state. Audio-only (zero visual).
    {
      const sStore = useGameStore.getState();
      const px = camera.position.x, pz = camera.position.z;
      if (isGrounded && horizontalSpeed > 1.2) {
        const stride = Math.max(0.28, 0.42 - horizontalSpeed * 0.01); // faster -> quicker steps
        if (time - lastStepRef.current > stride) {
          lastStepRef.current = time;
          const t = footstepTypeAt(px, pz);
          const rate = t === 'stone' ? 0.8 : t === 'snow' ? 1.25 : t === 'sand' ? 0.95 : 1.05;
          sStore.playSpatialSound?.('footstep', [px, camera.position.y, pz], rate, 5);
        }
      }
      if (isGrounded && !prevGroundedRef.current) { // landing edge -> a firmer footstep
        const t = footstepTypeAt(px, pz);
        sStore.playSpatialSound?.('footstep', [px, camera.position.y, pz], (t === 'stone' ? 0.7 : 0.85), 8);
        lastStepRef.current = time;
        addKick(kickRef.current, KICK_PROFILES.land); // game-feel: landing dip (vertical; capture-immune via the follow-cam early-return)
      }
      prevGroundedRef.current = isGrounded;
    }

    // Phase 9: Camera Shake
    let shakeX = 0;
    let shakeY = 0;
    let shakeZ = 0;
    const store = useGameStore.getState();
    if (store.cameraShakeIntensity > 0.01) {
      // SOTA game-feel: the decaying cameraShakeIntensity IS the "trauma" value -> shake magnitude scales
      // with trauma^2 (a light hit barely shakes, a crit PUNCHES), via seeded value-noise (game/trauma.js)
      // scaled by the global juiceIntensity dial. Seed off the wall clock (this block is below the
      // isCaptureMode early-return -> never in a baseline, so non-determinism here is fine). Quadratic
      // falloff + the dial replace the old flat linear Math.random jitter.
      const trauma = store.cameraShakeIntensity;
      const ji = store.juiceIntensity ?? 1;
      // M2 #9: bias the shake along the hit vector (set at trigger, preserved through decay) so a hit
      // lurches the camera away from the player toward the impact, not a direction-less jitter.
      const [dx, dz] = store.cameraShakeDir || [0, 0];
      const o = shakeOffset(trauma, performance.now() * 0.05, dx, dz, 0.55 * ji);
      shakeX = o.x;
      shakeY = o.y;
      shakeZ = o.z;
      store.triggerCameraShake(trauma * 0.85); // Decay
    } else if (store.cameraShakeIntensity > 0) {
      store.triggerCameraShake(0);
    }
    // game-feel: per-verb camera kick (decaying impulse from the verb triggers), folded into the
    // camera-target offset alongside the shake. Below the isCaptureMode early-return -> never in a baseline.
    const kick = stepKick(kickRef.current, delta);

    // Sync camera to rigid body — smoothly lerp to eliminate 120Hz/ProMotion physics sync stutter
    const translation = rigidBodyRef.current.translation();

    // S2-B1-M7a: while the third-person TRANSFORM-CAM window is active (roar reveal), OVERRIDE the FPV
    // follow with the behind+above reveal pose (easing FPV->TPV->FPV via the envelope). Transient ref
    // (Game-Loop-Isolation). The pose's f=0 endpoints ARE the FPV pose, so the move blends seamlessly.
    // (Capture mode never reaches here — the capture early-return precedes this; spawnBeastTransform
    // sets its own pose at M7d.) FPV combat aim/hit-reg is untouched — camera-only, ~1.2s.
    const tc = transformCamRef.current;
    if (tc.active) {
      tc.t += delta;
      if (tc.t >= TRANSFORM_CAM_SEC) {
        tc.active = false; // window done -> FPV resumes (next branch, this same frame)
      } else {
        const pose = transformCamPose([translation.x, translation.y, translation.z], tc.fwd, tc.t / TRANSFORM_CAM_SEC);
        camera.position.x = THREE.MathUtils.lerp(camera.position.x, pose.position[0], 0.85);
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, pose.position[1], 0.85);
        camera.position.z = THREE.MathUtils.lerp(camera.position.z, pose.position[2], 0.85);
        camera.lookAt(pose.lookAt[0], pose.lookAt[1], pose.lookAt[2]);
      }
    }

    if (!tc.active) {
      const targetX = translation.x + shakeX + kick.x;
      const targetY = translation.y + 1.2 + bobOffset + shakeY + kick.y;
      const targetZ = translation.z + shakeZ + kick.z;

      // Use 0.85 lerp factor: eliminates camera coupling latency entirely while absorbing micro-stutter
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 0.85);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, 0.85);
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, 0.85);
    }

    // Defensive camera pitch clamp to prevent gimbal lock or out-of-bounds rotation
    camera.rotation.order = 'YXZ';
    const maxPitch = Math.PI / 2 - 0.05;
    camera.rotation.x = Math.max(-maxPitch, Math.min(maxPitch, camera.rotation.x));

    // Force horizontal camera on first frame
    if (!cameraInitialized.current && translation.y > 0) {
      camera.rotation.set(0, 0, 0);
      cameraInitialized.current = true;
    }

    // Continuous spell casting
    if (keys.KeyF) {
      const now = performance.now();
      if (now - lastCastTime.current >= CAST_COOLDOWN) {
        lastCastTime.current = now;

        if (useGameStore.getState().castSpell) {
          const currentSpell = activeSpell;
          useGameStore.getState().castSpell(currentSpell);
          if (useGameStore.getState().onSpellCast) useGameStore.getState().onSpellCast();
        }

        setAttackType('spell');
        setTimeout(() => setAttackType(null), 150);
      }
    }

    // Sync attackStartTime at-action-time in game loop
    if (attackType !== lastAttackTypeRef.current) {
      if (attackType !== null) {
        attackStartTime.current = state.clock.getElapsedTime();
      }
      lastAttackTypeRef.current = attackType;
    }
  });

  // Hide the camera-attached first-person hands + held FX during capture so the
  // visual-regression fixture is a clean world vista (the render recipe operates on
  // terrain/sky/AO; the character render language is validated separately in S1-B M2).
  const inCapture = useGameStore((s) => s.isCaptureMode);

  return (
    <group>
      <RigidBody
        ref={rigidBodyRef}
        colliders={false}
        type="kinematicPosition"
        position={[0, 100, 0]}
        enabledRotations={[false, false, false]}
      >
        <CapsuleCollider args={[0.5, 0.4]} />
        {/* S2-B1-M7b: the visible beast (self-gates on beastFormActive -> nothing as human). At the
            player (RigidBody child); revealed by the M7a transform-cam. */}
        <BeastAvatar />
        <PhantomBlockSystem />
        <HurlSystem />
      <SnareTetherSystem />
      <SquadAISystem />
      <ElementZoneSystem />
      </RigidBody>
      <primitive object={camera}>
        {!inCapture && (
          <StableMagicHands selectedBlock={selectedBlock} attackType={attackType} attackStartTime={attackStartTime} />
        )}
      </primitive>
    </group>
  );
};

// SOTA Procedural 3D Weapon Meshes (Stone, Iron, Diamond Swords & Pickaxe)
