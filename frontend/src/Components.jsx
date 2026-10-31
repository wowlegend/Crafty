import React, { useRef, useEffect, useState, useCallback, useSyncExternalStore } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { GameMethods } from './GameMethods';
import * as THREE from 'three';
import { solveMeleeDamage } from './utils/combat';
import { getWeaponBaseDamage } from './game/equipment.js';
import { worldTimeScale, hitstopForHit } from './game/hitstop.js';
import { realDelta, worldNow } from './game/worldClock.js';
import { BEAST_FORMS, BASE_CAPSULE, elementForSpell, resolveFormMelee, formMeleeCooldownMult, formLocomotion } from './game/beasts.js';
import { formHasRoom, enterFormFitted, restoreBaseFitted, fitLoadedSpot } from './game/formFit.js';
import { refuseFormSwap, cutTransformCam } from './game/formRefusal.js';
import { makeTransformState, decideTransform } from './game/beastTransform.js';
import { canAfford, ROAR_COST, GRAB_COST, SNARE_COST, FUSE_COST, IMBUE_COST } from './game/ember.js';
import { TRANSFORM_CAM_SEC, transformCamPose } from './game/transformCam.js';
import { markFollowView } from './render/followView.js';
import { BeastAvatar } from './render/BeastAvatar';
import { StableMagicHands } from './render/playerRender';
import { ViewmodelLayer } from './render/ViewmodelLayer.jsx';
import { makeVoidhandState, decideVoidhand, PHANTOM_BLOCK_COLORS } from './game/voidhand.js';
import { buildCooldownMirror } from './game/cooldownMirror.js';
import { footstepTypeAt } from './world/climate.js';
import { resolveSpawnGround, resolveResumeSpawn, resumeColumnProbe, spawnTargetY, spawnCornerGround, isVoidFall, returnToSpawn, followBlindDrop, SPAWN_FREEZE_Y, SPAWN_PROBE_MAX_SEC } from './game/spawnPlacement.js';
import { makeStuckWatch, stuckInRock } from './game/stuckInRock.js';
import { moveSpeed, jumpVelocity, applyGravity, moveVector, VAULT_VELOCITY, GLUE_VELOCITY } from './game/locomotion.js';
import { coyoteOk, bufferOk, COYOTE_TIME, JUMP_BUFFER } from './game/gameFeel.js';
import { dodgeDirection, dodgeSpeed, isDodgeInvincible } from './game/dodge.js';
import { applyPerfectDodge, PERFECT_HITSTOP_MS } from './game/perfectDodge.js';
import { bossCombat, withBossTarget, bossHitByCone, registerBossHeavy } from './game/bossCombat.js';
import { logImpulse } from './devtest/impulseLog.js';
import { cancelHeavy, heavyWalkMult, isHeavyReady, isHeavyHeld, meleeRefusal, HEAVY_MULT, HEAVY_STAGGER_MS, HEAVY_SHOVE_MULT } from './game/heavyAttack.js';
import { gateSwing, takeBufferedSwing, cancelIntoDodge, endString, peekStep, stringWalkMult, swingShape, slashSweep, SWING_COOLDOWN_MS, FINISHER_ARC_RAD } from './game/meleeString.js';
import { stanceFrame, stanceWalk, dodgeBurst, resetStance } from './game/combatStance.js';
import { makeKick, addKick, stepKick, KICK_PROFILES, localToWorldKick } from './game/cameraKick.js';
import { isNewHit } from './game/hurtFeel.js';
import { sparkFor } from './game/mobHitFx.js';
import { shakeOffset, SHAKE_WEIGHT_MAX, HITSTOP } from './game/trauma.js';
import { shakeTrauma, shakeDir, decayShake } from './game/cameraShakeChannel.js';
import { makeSoulbindState, decideSoulbind, SNARE_CHANNEL_SEC, makeFuseState, decideFuse, FUSE_CHANNEL_SEC } from './game/soulbind.js';
import { makeImbueState, decideImbue, KIND_BY_SPELL } from './game/elemancer.js';
import { armImbueCast, consumeImbueCast } from './game/elemancerChannel.js';

// Whether the ember bar holds `cost` now. Each Aspect verb reads the bar live, never from a store snapshot taken earlier
// in the frame: the verbs ticked before it on this frame may already have spent from the one bar.
const barPays = (cost) => canAfford(useGameStore.getState().ember, cost);

// music-motif v2: the stinger rarity guards (a stinger repeats no sooner than this)
const MOTIF_COOLDOWN_SEC = 10;
let _lastWildheartMotif = -Infinity;
let _lastVoidhandMotif = -Infinity;
import { ecs, alliesQuery, mobsQuery } from './ecs/world';
import { writeSnareState, clearSnareState, fireBindCeremony } from './game/snareChannel.js';
import { lookupHybrid, applyFusion, fuseKey, FUSE_RADIUS } from './game/hybrids.js';
import { requestHurl, requestSlam } from './game/hurlChannel';
import { phantomWorldPos } from './world/PhantomBlockSystem';
import { PhantomBlockSystem } from './world/PhantomBlockSystem';
import { HurlSystem } from './world/HurlSystem';
import { SnareTetherSystem } from './world/SnareTetherSystem.jsx';
import { SquadAISystem } from './world/SquadAISystem.jsx';
import { ElementZoneSystem } from './world/ElementZoneSystem.jsx';
import { isPointInCone } from './combat/cone.js';
import { swingOrigin, steadyEye, EYE_HEIGHT_M, EYE_BOB_M } from './combat/swingOrigin.js';
import { moveKinematic, placeBody } from './game/kinematicMove.js';
import { routeMouseVerb, AIM_CONE_RANGE, AIM_CONE_ARC } from './input/verbRouter';
import { routeExpressVerb } from './input/expressVerbs.js';
import { isInputLive } from './input/inputLive.js';
import { RigidBody, CapsuleCollider, useRapier } from '@react-three/rapier';
import { useGameStore } from './store/useGameStore';
import { isCaptureMode, getCaptureOpts } from './devtest/captureMode';
import { lookbookPose, applyLookbookPose, subscribeLookbook, lookbookHidesHands } from './render/lookbookSeam.js';
import { isPerfProbe } from './devtest/perfProbe';
import { getInput, setIntent, setActive, resetInput } from './input/inputState';
import { installBlurReset } from './input/blurReset';
import { installPrimaryMouse } from './input/compatMouse.js';
import { installPrimaryInput } from './input/primaryInput.js';
import { registerTestHook } from './devtest/testBridge.js';
import { notifyDenied } from './ui/denyToast';
import { denyAspectPress } from './input/aspectDeny.js';
import { PLAYER_SPAWN } from './game/playerSpawn.js';

// PositionTracker extracted -> src/systems/PositionTracker.jsx (v6 de-monolith A3).




export const Player = ({ isWorldBuilt }) => {
  const isWorldBuiltRef = useRef(isWorldBuilt);
  useEffect(() => {
    isWorldBuiltRef.current = isWorldBuilt;
  }, [isWorldBuilt]);

  const selectedBlock = useGameStore(state => state.selectedBlock);
  const { camera } = useThree();
  const [attackType, setAttackType] = useState(null); // 'melee' | 'spell' | null
  const attackStartTime = useRef(0);
  const rigidBodyRef = useRef();
  const playerVisualAnchorRef = useRef(); // .parent === the RigidBody's Object3D (see settlePlayerToGround)
  const { rapier, world } = useRapier();

  const velocityY = useRef(0);
  const planarVelRef = useRef({ x: 0, z: 0 }); // W4 game-feel: smoothed horizontal velocity (accel/decel ramp)
  const lastGroundedAtRef = useRef(0);     // W4 coyote-time: performance.now()/1000 of the last grounded frame
  const lastJumpPressRef = useRef(null);   // W4 jump-buffer: performance.now()/1000 of the last jump-intent rising edge
  const prevJumpIntentRef = useRef(false); // edge-detect the jump intent so a held key only stamps the buffer once
  const lastStepRef = useRef(0);        // locomotion-audio: stride throttle (footstep cadence)
  const prevGroundedRef = useRef(true); // locomotion-audio: landing-edge detection
  const kickRef = useRef(makeKick());   // game-feel: per-verb camera-kick impulse (decays in the follow-cam)
  const seenHitRef = useRef(0);         // E-ter: last consumed `lastHitDir.t`, so one hit = one hurt-kick
  const controllerRef = useRef(null);
  const knockbackVelocity = useRef(new THREE.Vector3(0, 0, 0));
  // S2-B1-M1: beast-form collider hot-swap. pendingFormSwapRef = a one-shot target capsule enqueued
  // on activeBeastForm transitions, consumed inside useFrame (atomic with the Rapier sweep), where game/formFit.js
  // places the new capsule where it fits. A ref -> zero re-renders (Game-Loop Isolation).
  const pendingFormSwapRef = useRef(null);
  const roarPaidRef = useRef(0); // the ember the roar spent on the queued form, given back if its swap is refused
  // S2-B1-M3: the transform state machine (charge + duration + cooldown) + roar edge-detection.
  const beastSMRef = useRef(makeTransformState());
  const prevRoarRef = useRef(false);
  const voidhandSMRef = useRef(makeVoidhandState()); // S2-B2-M1: the VOIDHAND grab SM state
  const soulbindSMRef = useRef(makeSoulbindState()); // S2-B3-M4: the SOULBIND snare SM state
  const _lastCdMirror = useRef(0); // W3 M-HUD.2: throttle clock for the ability-bar cooldown mirror
  const imbueSMRef = useRef(makeImbueState()); // S2-B4-M5: the ELEMANCER imbue latch
  const prevImbueRef = useRef(false);
  const spawnProbeWaitRef = useRef(0); // KEVIN-FIX C1: the bounded spawn-probe wait, in seconds (game/spawnPlacement.js)
  const resumeProbeFailsRef = useRef(0); // the resumed save's own bounded wait (game/spawnPlacement.js resolveResumeSpawn)
  const blindFollowRef = useRef({ left: 0 }); // the spawn's blind drop, followed (game/spawnPlacement.js followBlindDrop)
  const stuckWatchRef = useRef(makeStuckWatch()); // the stuck-in-rock recovery's readings (game/stuckInRock.js)
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

  const spawnPosSet = useRef(false);
  const spawnRefs = { placed: spawnPosSet, probeWait: spawnProbeWaitRef }; // game/spawnPlacement.js returnToSpawn

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
  const heavyReadyRef = useRef(false); // the heavy's READY tick plays once per charge
  const MELEE_COOLDOWN = SWING_COOLDOWN_MS; // milliseconds: the light string's cooldown (game/meleeString.js)

  // Expose camera globally for magic system
  useEffect(() => {
    useGameStore.setState({ gameCamera: camera });
  }, [camera]);

  // Expose player rigid body globally for raycast filtering
  useEffect(() => {
    if (rigidBodyRef.current) {
      rigidBodyRef.current.applyImpulse = (impulse) => {
        if (import.meta.env.DEV) logImpulse(impulse);
        knockbackVelocity.current.x += impulse.x;
        velocityY.current += impulse.y;
        knockbackVelocity.current.z += impulse.z;
      };
    }
    useGameStore.setState({ playerRigidBodyRef: rigidBodyRef, playerVisualAnchorRef });
    return () => {
      useGameStore.setState({ playerRigidBodyRef: null, playerVisualAnchorRef: null });
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
      // ENTER: queue the swap -> consumed in useFrame so it is ATOMIC with the Rapier sweep.
      pendingFormSwapRef.current = BEAST_FORMS[activeBeastForm] || BASE_CAPSULE;
    } else {
      // EXIT/restore: back to base IMPERATIVELY here -- NOT via the useFrame queue, which sits
      // behind the dead-window early-return (a queued restore would not drain until manual respawn,
      // leaving the live collider a beast shape for the whole death screen). This is the
      // no-permanent-beast restore AT the death/load edge. Not always a shrink (the comet and the hawk
      // are narrower than the base), so the base capsule is placed where it fits (game/formFit.js).
      pendingFormSwapRef.current = null;
      roarPaidRef.current = 0; // a form that ended before its swap ran: its price stays spent, as any ended form's does
      if (rigidBodyRef.current) restoreBaseFitted(world, rapier, rigidBodyRef.current, controllerRef.current, { unindexed: GameMethods.placedCells?.unindexed() });
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
      // KEVIN-FIX C1 (the respawn deadlock): chunk streaming keys on the CAMERA, so it goes to the origin with the body.
      returnToSpawn(world, rigidBodyRef.current, camera, EYE_HEIGHT_M, spawnRefs);
    }
    lastAliveRef.current = isAlive;
  }, [isAlive]);

  const triggerMeleeAttack = useCallback((opts) => {
    const now = performance.now();
    const store = useGameStore.getState();
    // M5: in a beast form the melee re-skins — per-form cooldown, scaled damage, element spark. Read
    // the form once (transient getState); human (null element) = the identity (cooldown/damage x1).
    const beastEl = store.beastFormActive ? store.activeBeastForm : null;
    // HEAVY (game/heavyAttack.js): a charged release — the human sword's, not a beast form's (v1).
    const heavy = !!opts?.heavy && !beastEl;
    // While a heavy is CHARGING the arm is drawn back: no light swing (T tapped during a mouse hold, or LMB during a
    // T hold). It used to swing — and start the 300 ms cooldown that then silently ate the charged release (the T
    // tapped late in the hold, as it lands under load: release 0).
    // The cooldown runs on this handler clock; a charged release is exempt from it: a press handled late and lifted
    // soon after is a full charge on the finger, and the cooldown its own light swing started used to drop that heavy
    // silently. So only a beast form's swing is asked meleeRefusal.
    // THE LIGHT STRING (game/meleeString.js): a human light swing asks the string, which owns its cooldown, its buffer and
    // its step. It does NOT also check lastAttackTime: a 300 ms check in front of pressSwing would refuse every press
    // inside the cooldown before it could buffer. A buffered press (bufferedStep) has already been through the string,
    // and IS the tap of the hold the charge refusal would see, so it skips both. A beast form's swing keeps its own
    // cooldown; a thrown heavy or a form's swing ends the string and holds the next light swing 300 ms.
    // The gate is game/meleeString.js gateSwing: the string step of this swing (0 for a heavy or a beast form's swing),
    // or -1 for none.
    const step = gateSwing(now, {
      heavy,
      form: !!beastEl,
      bufferedStep: opts?.bufferedStep || 0,
      heavyHeld: isHeavyHeld(),
      refused: beastEl ? meleeRefusal(false, now, lastAttackTime.current, MELEE_COOLDOWN * formMeleeCooldownMult(beastEl)) : null,
    });
    if (step < 0) return;
    const shape = swingShape(step); // step 0 -> the light cone
    { const _kf = new THREE.Vector3(); camera.getWorldDirection(_kf); addKick(kickRef.current, localToWorldKick(_kf.x, _kf.z, KICK_PROFILES.melee)); } // game-feel: melee recoil
    lastAttackTime.current = now;
    // M6: every committed swing whooshes (playAttackSounds = swing + attack; was DEFINED-BUT-NEVER-CALLED,
    // so connecting hits had impact but no whoosh + swings only sounded on a MISS). A hit adds the spatial
    // 'hit' impact below; a miss is just the whoosh. Capture never runs the input path -> capture-inert.
    store.playAttackSounds?.();

    setAttackType('melee');
    // The hand plays its sweep out on its own clock (game/meleeString.js handSwing); this clears the attack type after.
    setTimeout(() => setAttackType(null), step ? slashSweep(step).durationS * 1000 : 200);

    const effectiveStats = store.getEffectiveAttributes ? store.getEffectiveAttributes() : { strength: 10, agility: 10 };
    
    // Solve weapon base damage based on equipped weapon
    const equippedWeapon = store.equipment?.weapon;
    const baseWeaponDmg = getWeaponBaseDamage(equippedWeapon);
    
    const { damage, isCrit } = solveMeleeDamage(effectiveStats, baseWeaponDmg);
    // M5: resolveFormMelee applies the form damage mult on TOP of getEffectiveAttributes() (derive-
    // never-bake; x1 for human) AND derives the spark from the LOCKED form element (beastEl ==
    // activeBeastForm) — NOT the live activeSpell, so spell-switching mid-form can't desync the spark
    // from the body (Digit1-4 is ungated in-form). Unit-locked in beasts.test.js (the wiring contract). Apex Predator's
    // beastMeleeMult (game/verbMods.js) scales a form's swing only.
    const { dealt, sparkType } = resolveFormMelee(damage, beastEl, store.getVerbMods ? store.getVerbMods().beastMeleeMult : 1);
    // The string's finisher hits for FINISHER_MULT; steps 1-2 and a beast form's swing deal `dealt` as today.
    const swing = heavy ? Math.round(dealt * HEAVY_MULT) : shape.finisher ? Math.round(dealt * shape.damageMult) : dealt;

    if (GameMethods.checkMobsInMeleeCone && GameMethods.damageMob && rigidBodyRef.current) {
      const lookDir = new THREE.Vector3();
      camera.getWorldDirection(lookDir);
      
      lookDir.y = 0;
      lookDir.normalize();

      const playerPos = swingOrigin(rigidBodyRef.current.translation(), new THREE.Vector3());

      const range = 4.5;
      const angleRad = shape.arcRad; // the full arc: 90 degrees, 140 for the string's finisher

      const hitMobs = GameMethods.checkMobsInMeleeCone(playerPos, lookDir, range, angleRad);

      let hitSomething = false;

      if (hitMobs && hitMobs.length > 0) {
        hitMobs.forEach(mob => {
          GameMethods.damageMob(mob.id, swing, sparkType);
          // A HEAVY staggers what it hits (the perfect dodge's stagger: the riposte then applies) and shoves it harder.
          if (heavy && mob.health > 0) {
            mob.staggerUntil = Math.max(mob.staggerUntil || 0, worldNow() + HEAVY_STAGGER_MS);
            mob.windupUntil = 0;
            if (mob.knockback) mob.knockback = [mob.knockback[0] * HEAVY_SHOVE_MULT, mob.knockback[1], mob.knockback[2] * HEAVY_SHOVE_MULT];
          }
          // The FINISHER shoves harder (no stagger: that is the heavy's).
          if (shape.finisher && mob.knockback) mob.knockback = [mob.knockback[0] * shape.shoveMult, mob.knockback[1], mob.knockback[2] * shape.shoveMult];
        });
        hitSomething = true;
      }

      // Boss-cone branch: the boss is a SEPARATE entity (not in the ECS), so the
      // mob loop above can never hit it. The SAME pure cone test, against the dragon's head, chest and hips
      // (game/bossCombat.js bossHitByCone: its body is longer than the swing), or its centre before its record is up.
      // A single swing can hit BOTH mobs (above) AND the boss (here).
      if (store.bossActive && store.getBossPosition) {
        const bp = store.getBossPosition();
        if (bp) {
          const bossPoint = { x: bp[0], y: bp[1], z: bp[2] };
          const reached = bossCombat.active
            ? bossHitByCone(bossCombat, playerPos, lookDir, range, angleRad)
            : isPointInCone(playerPos, lookDir, bossPoint, range, angleRad);
          if (reached && store.damageBoss) {
            store.damageBoss(swing);
            store.triggerHitstop?.(hitstopForHit(swing, store.juiceIntensity ?? 1)); // the boss's hits land too
            // THE HEAVY CHAIN (game/bossCombat.js registerBossHeavy): a heavy on the staggered dragon refreshes the
            // stagger, and the third knocks it down, landing with a crit's freeze and the slam's thump.
            if (heavy && registerBossHeavy(bossCombat, worldNow()) === 'knockdown') {
              store.triggerHitstop?.(HITSTOP.crit * (store.juiceIntensity ?? 1));
              store.playSpatialSound?.('slam', bp, 0.8, 30);
            }
            // Mirror the melee mob-hit feedback at the player layer: a spatial 'hit'
            // sound at the boss (damageBoss plays no SFX of its own, unlike the spell
            // path) plus the same visceral crit camera-shake the mob path triggers.
            if (store.playSpatialSound) {
              store.playSpatialSound('hit', bp, 1.1, 30);
            }
            // M6 #3: spark spray at the boss-hit point -- verb-consistency with the mob melee path (the
            // mob loop sparks via damageMob; the boss is a separate entity so a melee hit on it sparked
            // NOTHING). Reuses the GPU spark pool + the form sparkType; capture-inert (melee = real input).
            if (store.triggerGPUSparks) {
              const { color: sparkColor, count } = sparkFor(sparkType, isCrit);
              store.triggerGPUSparks(new THREE.Vector3(bp[0], bp[1] + 0.8, bp[2]), sparkColor, count, sparkType, lookDir);
            }
            hitSomething = true;
          }
        }
      }

      if (hitSomething && isCrit && store.triggerCameraShake) {
        store.triggerCameraShake(1.6); // Visceral Crit camera shake
      }
      // A finisher that lands: a heavy-tier hitstop and the slam's thump at the player.
      if (hitSomething && shape.finisher) {
        store.triggerHitstop?.(HITSTOP.heavy * (store.juiceIntensity ?? 1));
        store.playSpatialSound?.('slam', [camera.position.x, camera.position.y, camera.position.z], 1, 30);
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

    // ELEMANCER: the imbue latch resolves here, before the spawn, because the element a projectile carries is read at
    // its spawn; a latch resolved in the frame loop would tag the next cast instead of this one. The mouse and the F key
    // both cast through this function, so neither can leave the stance armed. The reducer decides; this call is its
    // `castFired` input.
    const imbue = decideImbue(imbueSMRef.current, {
      imbueEdge: false,          // arming is the frame loop's job; this call is only ever a cast
      castFired: true,
      active: getInput().active,
      alive: store.isAlive,
      canIgnite: store.unlockedTalents?.['elemancer_imbue'] > 0,
      owned: (store.unlockedTalents?.['elemancer_imbue'] ?? 0) > 0,
      canPay: canAfford(store.ember, IMBUE_COST),
    });
    if (imbue.action === 'consume') armImbueCast(KIND_BY_SPELL[store.activeSpell] || 'burning');

    let cast = false;
    if (store.castSpell) {
      const currentSpell = store.activeSpell || 'fireball';
      cast = store.castSpell(currentSpell) === true;
      if (store.onSpellCast) store.onSpellCast();
    }

    // The latch's decision is applied only to a cast that went out. castSpell refuses one it has no mana for, and says
    // so: that press takes no ember, the stance stays armed, and the kind parked for it is withdrawn so no later cast
    // carries it.
    if ((imbue.action === 'consume' || imbue.action === 'unpaid') && !cast) {
      consumeImbueCast();
    } else {
      imbueSMRef.current = imbue.sm;
      // consume, unpaid and disarm all end the stance; disarm is a cast while dead or with input released, and charges nothing
      if (imbue.action !== 'none') store.setImbueArmed(false);
      if (imbue.action === 'consume') store.spendEmber(IMBUE_COST); // canPay above read the bar with nothing spent since
      else if (imbue.action === 'unpaid') notifyDenied('no-ember'); // spent by another verb since the arm: the cast went out plain
    }

    setAttackType('spell');
    setTimeout(() => setAttackType(null), 150);
  }, [camera]); // reads store.activeSpell via getState (not the closure) -> depend on camera (used), not activeSpell -> stable callback, input-listener effect no longer re-subscribes on every spell switch

  useEffect(() => {
    // WRITER: the keyboard/mouse listeners are the INPUT SOURCE. They mirror movement keys into
    // the input-intent module so the verb loop reads intents, not raw keys. Bindings are UNCHANGED.
    const handleKeyDown = (e) => {
      // WASD -> continuous movement intents (W=forward, S=back, A=left, D=right).
      if (e.code === 'KeyW') setIntent('moveF', true);
      else if (e.code === 'KeyS') setIntent('moveB', true);
      else if (e.code === 'KeyA') setIntent('moveL', true);
      else if (e.code === 'KeyD') setIntent('moveR', true);

      if (e.code === 'Space') {
        setIntent('jump', true);
      }

      // The ONE consumer (useFrame, ~line 891) only clears this intent when input is LOCKED, and there was
      // no keyup branch to clear it either — so a Shift pressed with a panel open, or on the title screen
      // (GameScene mounts this listener before the game starts), latched the intent and spent it as an
      // unrequested 0.4s roll with i-frames the instant pointer lock came back. blurReset only fires on
      // window blur, and the window keeps focus while a panel is open.
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        if (isInputLive(useGameStore.getState(), getInput().active)) setIntent('dodge', true);
      }

      // S2-B1-M3: roar -> the abstract 'roar' intent (consumed by the transform SM in useFrame).
      // A locked Aspect verb teaches the unlock path at the press, once: a held key's auto-repeat says nothing more. An
      // unlocked verb the bar cannot pay for is told by the frame loop, where its reducer sees every other gate.
      if (e.code === 'KeyR') {
        setIntent('roar', true);
        if (!e.repeat) denyAspectPress('roar', useGameStore.getState());
      }

      // S2-B2-M1: grab -> the abstract 'grab' intent (VOIDHAND SM in useFrame). KeyV (KeyG = chest/trade).
      if (e.code === 'KeyV') {
        setIntent('grab', true);
        if (!e.repeat) denyAspectPress('grab', useGameStore.getState());
      }

      // S2-B3-M4: snare -> the abstract 'snare' intent (SOULBIND SM in useFrame).
      // The Aspect-verb row: R=roar, V=grab, X=snare. (KeyT is the melee-attack key below — not an Aspect verb.)
      if (e.code === 'KeyX') {
        setIntent('snare', true);
        if (!e.repeat) denyAspectPress('snare', useGameStore.getState());
      }

      // S2-B4-M5: imbue -> the abstract 'imbue' intent (the ELEMANCER latch in useFrame).
      // The Aspect-verb row completes: R=roar, V=grab, X=snare, Z=imbue.
      if (e.code === 'KeyZ') {
        setIntent('imbue', true);
        if (!e.repeat) denyAspectPress('imbue', useGameStore.getState());
      }

      // 2026-06-28 (Kevin): magic spells are the marquee feature -> the prime F key CASTS the
      // selected spell; melee moves to T. Both gate on input being live, inside the router, like every other live verb.
      const express = routeExpressVerb(e.code, useGameStore.getState(), getInput().active);
      if (express === 'cast') triggerSpellCast();
      else if (express === 'melee' && !e.repeat) { // a held T CHARGES a heavy now; its key-repeat used to spam taps
        triggerMeleeAttack();
        // The heavy is the human sword's: not in a beast form (R9.2), not with the voidhand full (R9.3, as LMB).
        // input/primaryInput.js pressKey, the charge counted from the keydown's own time (review round 3).
        primary.pressKey(e.timeStamp);
      }
    };
    const handleKeyUp = (e) => {
      if (e.code === 'KeyT') releaseHeavySwing('key', e.timeStamp);
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

      // Shift was the ONE held key with no release branch. Releasing it must clear the intent even if the
      // press was refused above, so a Shift held across a panel open/close cannot arrive as a queued roll.
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        setIntent('dodge', false);
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
      if (button !== 0 && button !== 2) return;
      const store = useGameStore.getState();
      // KEVIN-FIX C2: fire shares movement's gates — dead players don't shoot (the old
      // asymmetry presented as "can fire but cannot move" whenever the booleans disagreed). The one predicate
      // (input/inputLive.js) adds the surfaces: no click behind a panel, VICTORY or the context-loss panel is a verb.
      if (!isInputLive(store, getInput().active)) return;
      if (!rigidBodyRef.current) return;

      const lookDir = new THREE.Vector3();
      camera.getWorldDirection(lookDir);
      const aimDir = lookDir.clone();              // true aim (vertical kept) for the aim cone
      lookDir.y = 0; lookDir.normalize();          // the flattened melee-arc dir (damage parity)
      const playerPos = swingOrigin(rigidBodyRef.current.translation(), new THREE.Vector3()); // the swing's own apex

      // meleeHit — the EXACT live-damage test (mobs + boss). The arc is the one this press would swing: the string's
      // finisher sweeps 140 degrees (game/meleeString.js peekStep, no side effect), so a mob only it reaches still
      // routes the click to 'attack' instead of letting the ground behind win it for 'mine'. A human light swing only.
      const lightSwing = !store.voidhandHeld && !store.beastFormActive;
      const meleeArc = lightSwing && peekStep(performance.now()) === 3 ? FINISHER_ARC_RAD : Math.PI / 2;
      let meleeHit = false;
      if (GameMethods.checkMobsInMeleeCone) {
        meleeHit = GameMethods.checkMobsInMeleeCone(playerPos, lookDir, 4.5, meleeArc).length > 0;
      }
      if (!meleeHit && store.bossActive && store.getBossPosition) {
        const bp = store.getBossPosition();
        if (bp) {
          meleeHit = bossCombat.active
            ? bossHitByCone(bossCombat, playerPos, lookDir, 4.5, meleeArc)
            : isPointInCone(playerPos, lookDir, { x: bp[0], y: bp[1], z: bp[2] }, 4.5, meleeArc);
        }
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
      if (store.bossActive && store.getBossPosition) {
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
        chestHasItems: !!(hit && hit.chestHasItems),
      });

      if (verb === 'attack') {
        if (store.voidhandHeld) voidhandVerbRef.current.attack = true; // M3: HELD re-skin -> SM 'hurl'
        else triggerMeleeAttack();
      } else if (verb === 'cast') {
        if (store.voidhandHeld) voidhandVerbRef.current.cast = true;   // M3: HELD re-skin -> SM 'slam'
        else triggerSpellCast(); // S2-B4-M5: the latch resolves INSIDE this call, before the spawn
      } else if (verb === 'mine') GameMethods.terrainVerbs?.mine(hit);
      else if (verb === 'place') GameMethods.terrainVerbs?.place(hit);
      else if (verb === 'interact') GameMethods.terrainVerbs?.open(hit);
      return verb;
    };
    // HEAVY MELEE (game/heavyAttack.js): the tap has already swung inside performVerb; HOLDING the primary on an attack
    // starts the charge, and the release throws the heavy. ONE press path for every input that HAS a release: the real
    // mouse here, and (Phase 0c) the touch overlay's action button through the store seams published below. Touch used
    // to call performVerb with no release event at all — which is why it could never charge, and why a press it never
    // released would have slowed the walk forever; its button now releases on up, cancel, lost capture and leave.
    // `source` names the input holding the charge, so another input's release cannot end it (R9.3).
    // A beast form's hold charges nothing (R9.2): triggerMeleeAttack drops `heavy` in a form, so a charge there only
    // slowed the walk, ticked "ready" and threw a free extra light swing on release.
    // input/primaryInput.js owns the press, the release and their publication to the store (review round 3: inline here,
    // a store wrapper that dropped the lift's time stayed green across the suite; tests/gates/primary-input-gates.test.jsx
    // drives the published seams). Each takes `at`, the event's own time, so the hold is read on the input and not on a
    // handler a stall delayed (heavyAttack inputTime): the touch overlay, the mouse pair (compatMouse) and T (pressKey,
    // and its keyup through releasePrimary) all pass it. The touch
    // overlay dispatches through the store: performVerb (M1: cast), pressPrimary / releasePrimary (Phase 0c: the held
    // action button — the same press and release the mouse uses, as the 'touch' source).
    const primary = installPrimaryInput({
      performVerb,
      setState: useGameStore.setState,
      getState: useGameStore.getState,
      isInputLive: () => isInputLive(useGameStore.getState(), getInput().active),
      throwHeavy: () => triggerMeleeAttack({ heavy: true }),
      now: () => performance.now(),
    });
    const { pressPrimary, releasePrimary: releaseHeavySwing } = primary;
    // Centralized active gate: the ONE pointer-lock read in the controller. Pointer-lock is the
    // KB+mouse "input is live" source today; setActive() routes it into the intent module so the
    // verb loop gates on getInput().active (a future touch layer sets active from its own focus).
    const handlePointerLockChange = () => {
      const locked = !!document.pointerLockElement;
      setActive(locked);
      // W1: the FIRST real pointer-lock = the player has entered play -> latch the gameStarted flag
      // (the single authoritative writer; the one-way latch makes repeated calls a no-op).
      if (locked) useGameStore.getState().markGameStarted();
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
    // REVIEW F2 (input/compatMouse.js): a touch tap is followed by compatibility mousedown / mouseup events, which reached
    // the window mouse listeners and pressed the primary AGAIN as 'mouse' — the touch action button swung twice per tap,
    // and a tap on any other touch control swung, mined or placed. An echo is not input: installPrimaryMouse is the
    // echo-filtered mousedown / mouseup pair, and a mouseup takes its mousedown's verdict.
    const primaryMouse = installPrimaryMouse({ pressPrimary, releaseHeavySwing, now: () => performance.now() });
    // dev bridge: the e2e F2 case reads what was dropped per event type, and the presses per source; talents.spec reads
    // the verb its click's press was routed to
    registerTestHook('readCompatMouse', () => ({ dropped: primaryMouse.dropped(), presses: primary.presses(), verbs: primary.verbs() }));
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    document.addEventListener('pointerlockerror', handlePointerLockError);
    // B8: clear held movement intents on focus loss (alt-tab drops the keyup -> keys stuck ON).
    const removeBlurReset = installBlurReset();
    return () => {
      primaryMouse.remove();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      document.removeEventListener('pointerlockerror', handlePointerLockError);
      removeBlurReset();
      primary.remove(); // clears performVerb / pressPrimary / releasePrimary: symmetry with the playerRigidBodyRef teardown — don't retain a stale closure across remount
    }
  }, [camera, triggerMeleeAttack, triggerSpellCast]);

  useFrame((state, frameDelta) => {
    // R2.6: the player controller runs on REAL time — the camera and input never freeze — and applies the
    // hitstop to its own motion below (hitstopScale), so the blow lands without the view seizing up.
    const delta = realDelta(frameDelta);
    // Cleared every frame, set only where the follow places the camera below (render/followView.js): every other branch
    // that places it, and every early return, leaves the view marked as not the follow.
    markFollowView(false);
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

    // The lookbook probe's camera pin (render/lookbookSeam.js): null unless the page was opened with ?lookbook=1 AND
    // a script posed it, so this is one null read per frame in play. Same early-return shape as capture above, but
    // the world is NOT paused: the physics step, mobs, weather and the clock keep running — motion-on frames are its
    // whole point. What stops is THIS controller, from this return to the end of the callback: movement and the KCC,
    // the death branch, the void-fall guard and the beast / voidhand / imbue state machines. And PositionTracker
    // publishes camera.position as store.playerPosition, so while posed allies, chunk streaming, the spawner and a
    // manual save see the hero-shot camera, not the body; the mobs' senses read the body (render/lookbookSeam.js).
    const lookPose = lookbookPose();
    if (lookPose) {
      applyLookbookPose(state.camera, lookPose);
      return;
    }

    // Wake up physics body
    rigidBodyRef.current.wakeUp();

    // Input is live (input/inputLive.js): the gate is open, the player is alive and no surface covers the game. Read once
    // for the frame; the Aspect machines and the walk below all take it, so a chest opened from the world on touch, which
    // drops no gate, stops them too. Transient reads, no subscription (Game-Loop Isolation).
    const inputLive = isInputLive(useGameStore.getState(), getInput().active);

    // S2-B1-M3: tick the beast-transform state machine (the ROAR verb) HERE — below the capture
    // early-return (so it NEVER ticks under the visual gate) but ABOVE the dead-window early-return
    // below, so an in-flight roar charge CANCELS at the death edge via the SM's own `!alive` guard
    // instead of tunnelling through the dead window and auto-firing on respawn (review B1). Reads the
    // abstract `roar` intent transiently (never a raw key) + drives the M1 enter/exitBeastForm store
    // authority; the store's beastFormActive is the single active-truth, the SM owns only the charge +
    // duration/cooldown timers. `active` is the frame's inputLive above, so no transform starts under a
    // panel or any other surface, whichever way it opened. (No setIntent('roar',false) on
    // exit: the roarEdge + cooldown already block instant re-trigger.) `canEnter` is the wildheart_roar talent and
    // `canPay` a full ember bar. set() fires only on transitions.
    //
    // NOT ENOUGH EMBER is said here, once a frame at most, from the Aspect reducers below: each returns 'short' for a
    // press only the price refused and 'unpaid' for a started verb whose price another verb spent before it landed (the
    // imbue's 'unpaid', which needs the cast's outcome, is said in triggerSpellCast instead). The
    // reducers hold every other gate, so a press that would do nothing at any bar says nothing, and the keyboard and the
    // touch ring, which write the same intents, are told alike.
    let emberShort = false;
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
        active: inputLive,
        alive: st.isAlive,
        now: state.clock.getElapsedTime(),
        // The Primal Roar talent and a full ember bar (the roar is a signature ability, not free); both gate the charge's
        // start and its commit, and canPay is read this frame, so the spend below is covered.
        canEnter: st.unlockedTalents?.['wildheart_roar'] > 0,
        canPay: barPays(ROAR_COST),
        // A longer roar (Primal Endurance, Untamed, Ember Fang): the form's length from the verb numbers.
        formDurationSec: st.getVerbMods().roarSec,
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
        // UNLEASH: the bar is spent only on a real transform (enterBeastForm returns false when it rejects: already in a
        // form, or dead), so a no-op enter drains nothing. A form with no room where the player stands (the golem in a
        // two-high tunnel) is refused before that, and said (game/formFit.js).
        const element = elementForSpell(st.activeSpell);
        if (!formHasRoom(world, rapier, rigidBodyRef.current, BEAST_FORMS[element], { unindexed: GameMethods.placedCells?.unindexed() })) {
          notifyDenied('no-room');
          cutTransformCam(transformCamRef.current);
        } else if (st.enterBeastForm(element)) {
          // Kept until the frame's swap places the form: a refusal there gives it back (game/formRefusal.js).
          roarPaidRef.current = st.spendEmber(ROAR_COST) ? ROAR_COST : 0;
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
      } else if (action === 'cancel' || action === 'unpaid') {
        // M7a: roar released early, or its price spent by another verb -> ease the transform-cam back to FPV (jump it
        // to the return phase).
        cutTransformCam(transformCamRef.current);
        st.setBeastCharging(false); // M7c: charge cancelled
        if (action === 'unpaid') emberShort = true;
      } else if (action === 'short') {
        emberShort = true;
      } else if (action === 'exitTimer' || action === 'exitManual') {
        st.exitBeastForm();
      }
    }

    // S2-B2-M1: the VOIDHAND grab SM — tap V to grab a phantom block (orbits as a shield), re-press V to
    // release. Transient intent reads; the store holds the single held-truth; set() only on transitions
    // (Game-Loop-Isolation). A grab is ALWAYS a phantom (never a voxel edit -> no re-mesh). canGrab is the
    // voidhand_grasp talent and canPay the ember bar; release is a hurl or slam (the attack/cast edges), a re-press, or
    // the max-hold timer.
    // S2-B2-M2: under perf-probe mode the runner writes `voidhandHeld` directly (no real grab happened,
    // so the SM's hold timer never started and would auto-drop it) — the probe's store-driven
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
      const vmods = stv.getVerbMods(); // the grab's and the snare's numbers for this frame (talents and relic)
      const { sm: vsm, action: vaction, keep: vkeep } = decideVoidhand(voidhandSMRef.current, {
        held: stv.voidhandHeld,
        grabEdge,
        attack: vAtk,
        cast: vCast,
        active: inputLive,
        alive: stv.isAlive,
        now: state.clock.getElapsedTime(),
        canGrab: stv.unlockedTalents?.['voidhand_grasp'] > 0,
        // Read this frame, which is the frame a 'grab' commits, so the spend below is covered.
        canPay: barPays(GRAB_COST),
        throws: vmods.grabThrows, // a second grab (Twin Grasp, Lodestone): a hurl or slam keeps the next block
        holdSec: vmods.holdSec,
      });
      voidhandSMRef.current = vsm;
      if (vaction === 'grab') {
        stv.spendEmber(GRAB_COST); // canPay vetted it this frame
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
        const ho = steadyEye(rigidBodyRef.current.translation(), new THREE.Vector3()).add(hd.clone().multiplyScalar(1.2));
        requestHurl({ x: ho.x, y: ho.y, z: ho.z }, { x: hd.x, y: hd.y, z: hd.z }, stv.heldPhantom && stv.heldPhantom.color);
        if (stv.playSpatialSound) stv.playSpatialSound('hurl', [ho.x, ho.y, ho.z], 1, 25); // AUDIO: launch whoosh
        if (!vkeep) { // a grab that held another block keeps it in hand
          stv.setVoidhandHeld(false);
          stv.setHeldPhantom(null);
        }
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
        if (!vkeep) {
          stv.setVoidhandHeld(false);
          stv.setHeldPhantom(null);
        }
      } else if (vaction === 'drop' || vaction === 'cancel' || vaction === 'unpaid') {
        stv.setVoidhandHeld(false);
        stv.setHeldPhantom(null);
      }
      if (vaction === 'short' || vaction === 'unpaid') emberShort = true;

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
        const sFrom = steadyEye(rigidBodyRef.current.translation(), new THREE.Vector3());
        // A wider snare (Wide Snare, Snare Knot) widens the aim cone; Communion raises the share of health a target binds at.
        const candidates = GameMethods.checkMobsInMeleeCone(sFrom, sDir, SNARE_RANGE, vmods.snareArc) || [];
        // nearest snareable: weakened (at or under snareHpFrac of its health), hostile (not passive; villager converter-blocked too)
        let best = null, bestD = Infinity;
        for (const e of candidates) {
          if (!e || e.passive || e.health <= 0 || e.health > vmods.snareHpFrac * e.maxHealth) continue;
          const dx = e.position.x - sFrom.x, dz = e.position.z - sFrom.z;
          const d = dx * dx + dz * dz;
          if (d < bestD) { bestD = d; best = e; }
        }
        if (best) { snareTargetId = best.id; snareTarget = best; }
      }
      const squadCap = vmods.squadCap;
      const { sm: ssm, action: saction } = decideSoulbind(soulbindSMRef.current, {
        snareEdge,
        active: inputLive,
        alive: stv.isAlive,
        now: state.clock.getElapsedTime(),
        canSnare: (stv.unlockedTalents?.['soulbind_snare'] > 0) && alliesQuery.entities.length < squadCap,
        // Read at the start and again at the bind: another verb may spend from the bar while the channel runs.
        canPay: barPays(SNARE_COST),
        targetId: snareTargetId,
      });
      soulbindSMRef.current = ssm;
      if (saction === 'short' || saction === 'unpaid') emberShort = true;
      if (saction === 'unpaid') {
        clearSnareState();
      } else if (saction === 'bind') {
        stv.spendEmber(SNARE_COST); // canPay above read the bar with nothing spent since
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
      // The channel only STARTS when fusion CAN complete (a recipe for the pair near the player) and the bar pays.
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
      const { sm: fsm, action: faction } = decideFuse(fuseSMRef.current, {
        fuseEdge: snareEdge, // the same key edge; the arbiter above kept it exclusive
        active: inputLive,
        alive: stv.isAlive,
        now: state.clock.getElapsedTime(),
        canStart: !!fusePair && !!lookupHybrid(fusePair[0].baseType || fusePair[0].type, fusePair[1].baseType || fusePair[1].type),
        canPay: barPays(FUSE_COST),
        pairKey: fusePair ? fuseKey(fusePair[0].id, fusePair[1].id) : null,
      });
      fuseSMRef.current = fsm;
      if (faction === 'short' || faction === 'unpaid') {
        emberShort = true;
      } else if (faction === 'fuse' && fusePair) {
        const hy = applyFusion(ecs, fusePair[0], fusePair[1]);
        if (hy) {
          stv.spendEmber(FUSE_COST); // only for a hybrid made; canPay above read the bar with nothing spent since
          if (stv.playSpatialSound) {
            // the bind chime down-pitched = the v1 fuse swell (deliberate reuse; M7 may upgrade)
            stv.playSpatialSound('bind', [hy.position.x, hy.position.y, hy.position.z], 0.7, 25);
            // music-motif v2: a soul JOINS — the fuse is SOULBIND's signature (rare by its 50-ember price)
            stv.playSpatialSound('motifSoulbind', [hy.position.x, hy.position.y, hy.position.z], 1, 40);
          }
          fireBindCeremony(hy.position); // the halo marks the hybrid's birth too
        }
      } else if (fsm.channeling && fusePair) {
        // the tether doubles as the fusion thread — drawn BETWEEN the two creatures
        writeSnareState({
          channeling: true, targetId: fusePair[0].id,
          progress: Math.min((state.clock.getElapsedTime() - fsm.channelStart) / FUSE_CHANNEL_SEC, 1),
          from: { x: fusePair[0].position.x, y: fusePair[0].position.y + 0.4, z: fusePair[0].position.z },
          to: { x: fusePair[1].position.x, y: fusePair[1].position.y + 0.4, z: fusePair[1].position.z },
        });
      }

      // ELEMANCER (S2-B4-M5): the imbue LATCH — Z arms the next cast (talent- and ember-gated), and
      // death or released input drops the stance. The CONSUME is not decided here: it belongs to
      // triggerSpellCast, which is the call that spawns the projectile that reads the element. Deciding
      // it here meant deciding it one frame after the projectile had already been built. `castFired` is
      // therefore always false on this path — the frame loop cannot observe a cast that has, by
      // construction, already resolved its own latch.
      const imbueIn = vin.imbue;
      const imbueEdge = imbueIn && !prevImbueRef.current;
      prevImbueRef.current = imbueIn;
      const { sm: ism, action: iaction } = decideImbue(imbueSMRef.current, {
        imbueEdge,
        castFired: false,
        active: inputLive,
        alive: stv.isAlive,
        canIgnite: stv.unlockedTalents?.['elemancer_imbue'] > 0,
        owned: (stv.unlockedTalents?.['elemancer_imbue'] ?? 0) > 0,
        canPay: barPays(IMBUE_COST),
      });
      imbueSMRef.current = ism;
      if (iaction === 'arm') stv.setImbueArmed(true);
      else if (iaction === 'disarm') stv.setImbueArmed(false);
      else if (iaction === 'short') emberShort = true;
    }
    if (emberShort) notifyDenied('no-ember');

    // Phase 29: Freeze physics body on death to prevent void-falling loops and camera jitter
    const isPlayerAlive = useGameStore.getState().isAlive;
    if (!isPlayerAlive) {
      cancelHeavy(); // a heavy's charge dies with the player (this branch returns before the input checks below)
      endString(); // and so does the light string, with any buffered press
      resetStance(); // and so does the stance: no fight carries across a respawn
      rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      const translation = rigidBodyRef.current.translation();
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, translation.x, 0.85);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, translation.y + EYE_HEIGHT_M, 0.85);
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, translation.z, 0.85);
      return;
    }

    // M5: per-form locomotion re-skin. Read the form transiently (Game-Loop-Isolation — never a
    // subscription in useFrame); human (null) = the identity (all mults 1). `loco` is reused at the
    // jump + gravity sites below.
    const locoState = useGameStore.getState();
    const loco = formLocomotion(locoState.beastFormActive ? locoState.activeBeastForm : null);
    const now = performance.now();
    const walkMult = heavyWalkMult(now) * stringWalkMult(now); // charging a heavy, or throwing a swing, slows the walk
    const speed = moveSpeed(loco) * walkMult;
    const currentTrans = rigidBodyRef.current.translation();
    // COMBAT STANCE (game/combatStance.js): once a fight is joined you cannot outwalk it. One transient step per frame
    // (Game-Loop-Isolation), through the seam stanceFrame: the player's height is the point the AI worker strikes from,
    // so the stance and the worker agree on which mobs can reach the player, and the away vector is measured from this
    // frame's body, the point the frame's step starts from.
    // nextTranslation, not translation: a move given on a frame that took no world step is where this one starts from
    // (game/kinematicMove.js). The seam reads the world clock itself, so a pause holds the fight.
    const stance = stanceFrame(mobsQuery.entities, rigidBodyRef.current.nextTranslation(), delta);

    // Void Skyfall Guard: if player clips/falls through floor into the void, reset (game/spawnPlacement.js)
    if (spawnPosSet.current && isVoidFall(currentTrans.y)) {
      console.warn('Player fell into void; teleporting to safety.');
      returnToSpawn(world, rigidBodyRef.current, camera, EYE_HEIGHT_M, spawnRefs); // the respawn's way: the camera goes too
      return;
    }

    // Freeze player in sky until world is built to prevent falling through floor
    if (!isWorldBuiltRef.current) {
      rigidBodyRef.current.setTranslation({ x: 0, y: SPAWN_FREEZE_Y, z: 0 }, true);
      rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      return;
    } else if (!spawnPosSet.current || useGameStore.getState().resumeSpawn) {
      const store = useGameStore.getState();
      // 0. a LOADED save (the World Manager's Load, or the context-loss reload) stands the player where they were saved,
      //    once that column's colliders exist (game/spawnPlacement.js resolveResumeSpawn); a load in play enters here too,
      //    and the body is held until the new world's column is in. The camera goes there while it waits: chunk streaming
      //    follows it. Until the old world's wipe has committed the probe is not asked (store worldReloading).
      if (store.resumeSpawn) {
        const r = store.resumeSpawn;
        const probeY = store.getMobGroundLevel && !store.worldReloading ? resumeColumnProbe(store.getMobGroundLevel, r) : null;
        const resume = resolveResumeSpawn(r, probeY, resumeProbeFailsRef.current);
        if (resume.hold) {
          resumeProbeFailsRef.current += 1;
          rigidBodyRef.current.setTranslation({ x: r.x, y: r.y, z: r.z }, true);
          rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
          camera.position.set(r.x, r.y + EYE_HEIGHT_M, r.z);
          return;
        }
        useGameStore.setState({ resumeSpawn: null }); // one-shot: placed, or given up for the origin spawn below
        resumeProbeFailsRef.current = 0;
        if (resume.place) {
          // Where the base capsule stands clear nearest the saved centre (game/formFit.js fitLoadedSpot): a save on disk
          // can hold a spot in a wall or under the ground (the old Save button's rounded camera).
          // The collider goes with it (game/kinematicMove.js placeBody): the next frame sweeps from the fitted spot, not
          // from the held one in the wall.
          const spot = fitLoadedSpot(world, rapier, rigidBodyRef.current, resume.place, store.getMobGroundLevel, { unindexed: GameMethods.placedCells?.unindexed() });
          const at = { x: spot.x, y: spot.y, z: spot.z };
          placeBody(world, rigidBodyRef.current, at);
          rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
          camera.position.set(at.x, at.y + EYE_HEIGHT_M, at.z);
          spawnPosSet.current = true;
          return;
        }
      }
      // The physics raycast over the four columns the spawn stands across, placed blocks and terrain alike: the
      // spawn-ground DECISION (bounded probe wait + y=60 fallback + the physicsY<=15 reject) lives in
      // game/spawnPlacement.js (spawnCornerGround, resolveSpawnGround). KEVIN-FIX C1. The placed blocks of the
      // column are not read on their own: that read counted a mined cell as ground and stood the player a block too
      // low, inside it.
      const probeAvailable = !!store.getMobGroundLevel;
      const physicsY = probeAvailable ? spawnCornerGround(store.getMobGroundLevel) : null;
      const spawn = resolveSpawnGround(null, physicsY, spawnProbeWaitRef.current, probeAvailable, delta);
      if (spawn.incFails) spawnProbeWaitRef.current += delta;
      if (spawn.retry) {
        rigidBodyRef.current.setTranslation({ x: 0, y: SPAWN_FREEZE_Y, z: 0 }, true);
        rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
        return; // Wait for next frame (the streamer is loading origin chunks)
      }

      // Player center 1.2 above ground (instant land), the collider with it: the next frame sweeps from here, not from
      // the sky the body waited in (game/kinematicMove.js placeBody).
      const safeY = spawnTargetY(spawn.groundY);
      placeBody(world, rigidBodyRef.current, { x: 0, y: safeY, z: 0 });
      rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);

      // Cancel skyfall lerp transition: set camera position instantly
      camera.position.set(0, safeY + EYE_HEIGHT_M, 0);

      spawnPosSet.current = true;
      if (spawn.blind) blindFollowRef.current.left = SPAWN_PROBE_MAX_SEC; // dropped over a corner that never answered: followed as long again
      return;
    }

    // A BODY LEFT IN THE ROCK IS STOOD CLEAR WHERE IT IS, never sent to the origin: after the spawn's blind drop, on the
    // corner's ground once it answers (game/spawnPlacement.js followBlindDrop); anywhere else, once its centre has read
    // solid for a fifth of a second (game/stuckInRock.js). The collider goes with the body (game/kinematicMove.js
    // placeBody) and the fall it carried is dropped.
    {
      const store = useGameStore.getState();
      const body = rigidBodyRef.current;
      let standAt = null;
      if (blindFollowRef.current.left > 0) {
        const c = body.collider(0);
        const y = followBlindDrop(blindFollowRef.current, store.getMobGroundLevel ? spawnCornerGround(store.getMobGroundLevel) : null, currentTrans, c.halfHeight() + c.radius(), delta);
        if (y !== null) standAt = { x: 0, y, z: 0 };
      }
      if (!standAt) standAt = stuckInRock(stuckWatchRef.current, world, rapier, body, delta, store.getMobGroundLevel, GameMethods.placedCells?.unindexed());
      if (standAt) {
        console.warn('Player was in the rock; stood clear where they were.');
        placeBody(world, body, standAt);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        velocityY.current = 0;
        camera.position.set(standAt.x, standAt.y + EYE_HEIGHT_M, standAt.z);
        return;
      }
    }
    if (isNaN(velocityY.current) || isNaN(currentTrans.y)) {
      console.error('Physics corrupted', velocityY.current, currentTrans);
    }

    // A per-frame "defensive" rebind of applyImpulse stood here and was DELETED 2026-08-11: it could
    // never run. @react-three/rapier hands back the RAW @dimforge RigidBody, which declares applyImpulse
    // on its prototype, so `!rigidBodyRef.current.applyImpulse` is false whether or not the mount
    // override above ran -- 60 truthiness tests a second that no state could satisfy. Worse, being
    // prototype-satisfied means a genuinely MISSED mount bind would route boss knockback into rapier's
    // native applyImpulse, which is inert on a kinematicPosition body, and this "repair" would not
    // notice. A guard that cannot fire is not insurance; it is a claim that something is handled.

    // READER: read the live intent object ONCE per frame (transient, alloc-free — Game-Loop
    // Isolation). The frame's inputLive (above) is the gate, built on getInput().active, which replaced
    // the old scattered raw pointer-lock reads; movement/dodge read input.moveF/.moveB/.moveL/.moveR.
    const input = getInput();
    const isLocked = inputLive;

    // Handle dodge roll state machine
    const dodge = dodgeStateRef.current;
    const nowTime = state.clock.getElapsedTime();
    // A heavy's charge dies with the input (a release then throws nothing); death is handled above.
    if (!isLocked || locoState.beastFormActive) {
      cancelHeavy(); // a form entered mid-charge drops it too (R9.2)
      endString(); // the light string is the human sword's: lost input or a form ends it, buffered press and all
    }
    const heavyReady = isHeavyReady(performance.now());
    if (heavyReady && !heavyReadyRef.current) useGameStore.getState().playSpatialSound?.('heavyReady', currentTrans, 0.7, 8);
    heavyReadyRef.current = heavyReady;

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

        cancelHeavy(); // a dodge drops a heavy's charge
        cancelIntoDodge(performance.now()); // and keeps the light string alive (an open window restarts; the step is kept)
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

        // PERFECT DODGE (game/perfectDodge.js): pressed in the last moments of a nearby mob's windup, its strike
        // never lands and it staggers — open to a 1.5x riposte. The dodge is refunded, so perfect dodges chain. The
        // dragon is a target too while it fights (game/bossCombat.js withBossTarget: its bite and dive-bite are
        // parryable; a new list only here, at a dodge's start).
        const perfect = applyPerfectDodge(withBossTarget(mobsQuery.entities), currentTrans, worldNow());
        if (perfect.length > 0) {
          dodge.lastDodgeTime = nowTime - dodge.cooldown;
          const st = useGameStore.getState();
          st.triggerHitstop?.(PERFECT_HITSTOP_MS);
          for (const m of perfect) {
            st.triggerGPUSparks?.(new THREE.Vector3(m.position.x, m.position.y + 0.8, m.position.z), '#d8f4ff', 22, 'lightning');
          }
          st.playSpatialSound?.('parry', currentTrans, 1.2, 20);
          GameMethods.spawnPerfectText?.(perfect[0].position);
        }
      }
    }

    // THE LIGHT STRING's buffered press (game/meleeString.js) fires the frame its cooldown ends. Lost input, a form and
    // death have already ended the string above, so a press buffered before them fires nothing.
    const bufferedStep = takeBufferedSwing(performance.now());
    if (bufferedStep) triggerMeleeAttack({ bufferedStep });

    // W3 M-HUD.2: Mirror the Aspect/dodge cooldown timers into the store ~6.7x/s so the HUD ability bar
    // can sweep them WITHOUT reading these component-local SM refs (Game-Loop-Isolation: a throttled
    // setState, never per-frame React state). All SMs + the dodge ref share the getElapsedTime() seconds
    // clock (`nowTime`), so cooldownUntil/lastDodgeTime are in the same domain `buildCooldownMirror` reads.
    // owned flags come from unlockedTalents (the same gate the SM canEnter/canGrab/canSnare checks use).
    if (nowTime - _lastCdMirror.current > 0.15) {
      _lastCdMirror.current = nowTime;
      const t = useGameStore.getState().unlockedTalents || {};
      useGameStore.getState().setAbilityCooldowns(buildCooldownMirror({
        now: nowTime,
        voidhand: voidhandSMRef.current,
        soulbind: soulbindSMRef.current,
        beast: beastSMRef.current,
        dodge: dodgeStateRef.current,
        owned: {
          grab: (t['voidhand_grasp'] ?? 0) > 0,
          snare: (t['soulbind_snare'] ?? 0) > 0,
          roar: (t['wildheart_roar'] ?? 0) > 0,
          imbue: (t['elemancer_imbue'] ?? 0) > 0,
        },
      }));

      // W3 M-HUD.7: mirror the looked-at mob/NPC for the HUD TargetFrame nameplate. Reuses the EXACT
      // aim-cone seam performVerb uses for aimedMobDist (checkMobsInMeleeCone + AIM_CONE_RANGE/ARC off
      // the true, unflattened look dir) and picks the NEAREST cone hit. JSON-safe + transient store
      // write (Game-Loop-Isolation); null when nothing is aimed at. Same ~150ms throttle as the
      // cooldown mirror above (piggybacks _lastCdMirror).
      const _aimDir = new THREE.Vector3();
      camera.getWorldDirection(_aimDir);
      const _aimPos = swingOrigin(currentTrans, new THREE.Vector3()); // performVerb's aim apex
      let _aimed = null;
      let _aimedDist = Infinity;
      if (GameMethods.checkMobsInMeleeCone) {
        for (const m of GameMethods.checkMobsInMeleeCone(_aimPos, _aimDir, AIM_CONE_RANGE, AIM_CONE_ARC)) {
          if (!m || m.health <= 0) continue;
          const dx = m.position.x - _aimPos.x, dy = m.position.y - _aimPos.y, dz = m.position.z - _aimPos.z;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d < _aimedDist) { _aimedDist = d; _aimed = m; }
        }
      }
      useGameStore.getState().setTargetEntity(_aimed
        ? { id: _aimed.id, type: _aimed.type, name: _aimed.npcName || _aimed.type, health: _aimed.health, maxHealth: _aimed.maxHealth, isAlly: !!_aimed.isAlly }
        : null);
    }

    // Set up robust player physics exclusions to prevent self-collision
    const playerHandle = rigidBodyRef.current.handle;
    const filterPredicate = (collider) => {
      const parent = collider.parent();
      return !parent || parent.handle !== playerHandle;
    };

    // Kinematic ground check from Rapier character controller
    const isGrounded = controllerRef.current ? controllerRef.current.computedGrounded() : false;

    // W4 game-feel: maintain coyote + jump-buffer timestamps (seconds; pure refs, no React state).
    const nowSec = performance.now() / 1000;
    if (isGrounded) lastGroundedAtRef.current = nowSec; // refresh the coyote anchor each grounded frame
    // jump-buffer: stamp the RISING edge of the jump intent so a slightly-early press still fires on land.
    if (input.jump && !prevJumpIntentRef.current) lastJumpPressRef.current = nowSec;
    prevJumpIntentRef.current = !!input.jump;

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
          // traversal-reliability / kid-floor choice (every form mantles a ledge identically). Per-
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

    // Handle jumping & gravity (W4 coyote-time + jump-buffer, ADDITIVE over the original grounded jump).
    // `groundedPress` is the EXACT original condition (isGrounded && jump) so held-Space bunny-hop is
    // preserved byte-identically (OS key-repeat re-raises the consumed intent each frame). `gracePress`
    // only ADDS forgiveness — a ledge-edge jump (coyote: <=COYOTE_TIME after leaving ground) or a slightly-
    // early press (buffer: queued <=JUMP_BUFFER before landing) — guarded by velocityY<=~0 so it can never
    // become an air double-jump. The grace path is a strict SUPERSET: it never suppresses a jump the
    // original allowed, so this cannot regress existing movement (the FEEL of the windows is Kevin's call).
    const groundedPress = isGrounded && input.jump;
    const gracePress = velocityY.current <= 0.001
      && coyoteOk(isGrounded, nowSec, lastGroundedAtRef.current, COYOTE_TIME)
      && bufferOk(lastJumpPressRef.current, nowSec, JUMP_BUFFER);
    if (isLocked && !dodge.isActive && (groundedPress || gracePress)) {
      velocityY.current = jumpVelocity(loco); // M5: hawk hops higher (low-gravity), bull/golem lower
      useGameStore.getState().playSpatialSound?.('jump', [camera.position.x, camera.position.y, camera.position.z], 1, 6); // locomotion-audio: jump cue
      // Consume the live intent (OS key-repeat re-raises it -> bunny-hop) + the buffer/coyote stamps so one
      // press = one jump (no buffer re-fire next frame, no second coyote hop in the same window).
      setIntent('jump', false);
      lastJumpPressRef.current = null;
      lastGroundedAtRef.current = 0;
    } else if (isGrounded) {
      // Small downward force to stay glued to slopes and stairs
      velocityY.current = GLUE_VELOCITY;
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
        // W4: while dodging, the ramp is bypassed (burst velocity); keep the smoothed planar velocity in
        // sync with the dodge so the first post-dodge walk frame ramps from the real speed, not a stale 0.
        // Marked as a burst, so the stance lets the ramp decay it instead of cutting it to the retreat cap.
        planarVelRef.current = dodgeBurst(desiredVelX, desiredVelZ);
      }
    } else if (isLocked) {
      // Normal WASD movement — camera-relative planar velocity (pure, game/locomotion.moveVector),
      // then a W4 accel/decel ramp toward it (weight on start, crisp stop). Dodge is left INSTANTANEOUS
      // above (the i-frame burst must be immediate); only walking carries momentum.
      const cameraDir = new THREE.Vector3();
      camera.getWorldDirection(cameraDir);
      const mv = moveVector(cameraDir.x, cameraDir.z, input, speed);
      // The stance's clamp, then the ramp (game/combatStance.js stanceWalk, the unit-tested seam): at w = 0 the clamp is
      // the identity, so travel keeps 14 m/s. The ramped velocity is what the KCC is fed below.
      const ramped = stanceWalk(mv, stance, loco, walkMult, planarVelRef.current, delta);
      planarVelRef.current = ramped;
      desiredVelX = ramped.x;
      desiredVelZ = ramped.z;
    }

    // Combine keyboard input velocity and knockback
    const nextVelX = desiredVelX + knockbackVelocity.current.x;
    const nextVelZ = desiredVelZ + knockbackVelocity.current.z;

    // S1-D-M1: Non-blocking hitstop. While `hitstopUntil` is in the future, clamp the
    // player's per-frame motion toward zero — a brief micro-freeze that reads as impact
    // weight. Replaces the old main-thread busy-wait (which froze the whole tab). Cheap
    // store read; 0 = inactive. Capture mode never reaches here (early return above).
    const hitstopScale = worldTimeScale(performance.now(), useGameStore.getState().hitstopUntil);

    // E-ter: kick the camera when the PLAYER is hit. Every other kick fires from the verb that caused it;
    // this one originates in the store (damagePlayer), which has no camera, so the controller polls the hit
    // stamp instead of subscribing — a reactive subscription here is exactly the Game-Loop-Isolation trap.
    // `isNewHit` is the edge detector: without it one hit would kick every frame until the next one.
    if (isNewHit(seenHitRef.current, useGameStore.getState().lastHitDir)) {
      seenHitRef.current = useGameStore.getState().lastHitDir.t;
      cancelHeavy(); // a hit taken breaks a heavy's charge
      const _hf = new THREE.Vector3(); camera.getWorldDirection(_hf);
      addKick(kickRef.current, localToWorldKick(_hf.x, _hf.z, KICK_PROFILES.hurt));
    }

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
    // setShape preserves the collider handle/index/groups -> no re-bind, ZERO voxel edits. The new capsule is placed
    // where it fits (game/formFit.js), so this frame's sweep starts clear; where nothing near fits any more (a block
    // placed since the roar's commit checked), the form is refused. (EXIT/restore is done imperatively in the
    // activeBeastForm effect -- it must drain even while the dead-window early-return is active.)
    if (pendingFormSwapRef.current && rapier && controllerRef.current) {
      const target = pendingFormSwapRef.current;
      pendingFormSwapRef.current = null;
      const paid = roarPaidRef.current;
      roarPaidRef.current = 0;
      if (enterFormFitted(world, rapier, rigidBodyRef.current, target, { unindexed: GameMethods.placedCells?.unindexed() })) {
        // defensive base reset (M1 forms never shove dynamics; the bull enables this in M5).
        if (controllerRef.current.setApplyImpulsesToDynamicBodies) {
          controllerRef.current.setApplyImpulsesToDynamicBodies(false);
        }
      } else {
        refuseFormSwap(useGameStore.getState(), { paid, transformCam: transformCamRef.current, notify: notifyDenied });
      }
    }

    // The Rapier KCC sweep and the frame's one kinematic write (game/kinematicMove.js: it also sweeps a move given on a
    // frame that took no world step, which a plain write would lose). The colliders made since the last world step (a
    // placed cell's stand-in, a rebuilt chunk) are ones the KCC's sweep cannot see yet, so the move is cut at them
    // (world/placedCellColliders.js).
    const collider = rigidBodyRef.current.collider(0);
    if (collider && controllerRef.current) {
      moveKinematic(rigidBodyRef.current, controllerRef.current, collider, displacement, 0, filterPredicate, GameMethods.placedCells?.unindexed());
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
      bobOffset = Math.sin(time * 15) * EYE_BOB_M;
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
    const trauma0 = shakeTrauma(); // module transient, not the store -- see game/cameraShakeChannel.js
    if (trauma0 > 0.01) {
      // SOTA game-feel: the decaying cameraShakeIntensity IS the "trauma" value -> shake magnitude scales
      // with trauma^2 (a light hit barely shakes, a crit PUNCHES), via seeded value-noise (game/trauma.js)
      // scaled by the global juiceIntensity dial. Seed off the wall clock (this block is below the
      // isCaptureMode early-return -> never in a baseline, so non-determinism here is fine). Quadratic
      // falloff + the dial replace the old flat linear Math.random jitter.
      const trauma = trauma0;
      const ji = store.juiceIntensity ?? 1;
      // M2 #9: bias the shake along the hit vector (set at trigger, preserved through decay) so a hit
      // lurches the camera away from the player toward the impact, not a direction-less jitter.
      const [dx, dz] = shakeDir();
      // SHAKE_WEIGHT_MAX squared undoes the weight->trauma mapping the store now applies, so a single
      // hit produces the EXACT offset that shipped; what changed is that trauma is bounded and stacks.
      const o = shakeOffset(trauma, performance.now() * 0.05, dx, dz, 0.55 * SHAKE_WEIGHT_MAX * SHAKE_WEIGHT_MAX * ji);
      shakeX = o.x;
      shakeY = o.y;
      shakeZ = o.z;
      decayShake(delta); // dt-driven falloff; snaps to 0 at the floor
    } else if (trauma0 > 0) {
      decayShake(delta);
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
      const targetY = translation.y + EYE_HEIGHT_M + bobOffset + shakeY + kick.y;
      const targetZ = translation.z + shakeZ + kick.z;

      // Use 0.85 lerp factor: eliminates camera coupling latency entirely while absorbing micro-stutter
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 0.85);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, 0.85);
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, 0.85);
      markFollowView(true);
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

    // Sync attackStartTime at-action-time in game loop
    if (attackType !== lastAttackTypeRef.current) {
      if (attackType !== null) {
        attackStartTime.current = state.clock.getElapsedTime();
      }
      lastAttackTypeRef.current = attackType;
    }
  });

  // Hide the first-person hands and held FX during capture, so the capture frame is the world alone.
  const inCapture = useGameStore((s) => s.isCaptureMode);
  // The same for a lookbook hero pose (render/lookbookSeam.js): an elevated shot with the hands in the corner would
  // misrepresent the frame. An eye pose keeps them. Changes only when the probe poses or clears, never per frame.
  const lookbookOn = useSyncExternalStore(subscribeLookbook, lookbookHidesHands);

  return (
    <group>
      <RigidBody
        ref={rigidBodyRef}
        colliders={false}
        type="kinematicPosition"
        position={PLAYER_SPAWN}
        enabledRotations={[false, false, false]}
      >
        <CapsuleCollider args={[0.5, 0.4]} />
        {/* Anchor whose PARENT is the RigidBody's own Object3D. Physics is paused during capture, so
            rapier never syncs that Object3D from the body — `setTranslation` moves the physics side only
            and the VISUAL side stays at its declared transform. `settlePlayerToGround` needs a handle on
            the visual side to move BOTH, so the captured world is deterministic. A marker child is the
            stable way to reach it: it exists from mount, unlike the beast avatar. */}
        <group ref={playerVisualAnchorRef} />
        {/* S2-B1-M7b: the visible beast (self-gates on beastFormActive -> nothing as human). At the
            player (RigidBody child); revealed by the M7a transform-cam. */}
        <BeastAvatar />
        <PhantomBlockSystem />
        {/* SquadAISystem and ElementZoneSystem render null — pure logic, so their parent is irrelevant
            and moving them would be churn. PhantomBlockSystem must STAY: it orbits the player's origin
            and reads its own getWorldPosition, so being a body child is the whole mechanism. */}
        <SquadAISystem />
        <ElementZoneSystem />
      </RigidBody>
      {/* WORLD-SPACE effects, mounted at the scene root — NOT inside the RigidBody. 2026-08-09 audit:
          both were children of the body, which rapier drives to the player's world translation every
          step, while both assign mesh positions from world data (hurl origin from the camera, which is
          a sibling of the body; tether endpoints from ECS mob world vectors). A child of a body at world
          P given world W renders at P + W, and the player spawns at y=100. The tether hid it especially
          well: length and angle are translation-invariant, so it had the right shape in the wrong place.
          Each now asserts an untransformed parent at dev time via sceneSpace.js, so re-parenting either
          of them back under a moving node says so out loud instead of silently offsetting the render. */}
      <HurlSystem />
      <SnareTetherSystem />
      <primitive object={camera} />
      {/* The hands live in the viewmodel scene, not on the camera: the composer draws them after the world with their
          own FOV and depth range, so they never sink into a wall and cast no shadow (render/viewmodel.js). */}
      <ViewmodelLayer>
        {!inCapture && !lookbookOn && (
          <StableMagicHands selectedBlock={selectedBlock} attackType={attackType} attackStartTime={attackStartTime} />
        )}
      </ViewmodelLayer>
    </group>
  );
};
