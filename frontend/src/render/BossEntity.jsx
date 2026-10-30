// BossEntity.jsx — the Shadow Dragon R3F render + its destroyVoxelsInRadius terrain-destruction
// helper (extracted from AdvancedGameFeatures S3-M4 p4 T4; byte-exact). The capture-determinism
// freeze (if (isCaptureMode()) { ... } before the bossPositionRef movement) is preserved verbatim.
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Outlines } from '@react-three/drei';
import * as THREE from 'three';
// The boss's body light and each fireball's light mount with them: from the fixed light pool (render/lightPool.jsx).
import { PooledLight } from './lightPool.jsx';
import { useGameStore } from '../store/useGameStore';
import { isCaptureMode } from '../devtest/captureMode';
import { bossEmissiveIntensity, OUTLINE } from './characterStyle';
import { TIERS } from './quality';
import { BOSS_CONFIG } from '../game/bossConfig.js';
import { bossTierStats } from '../game/bossTier.js';
import { bossCombat, resetBossCombat } from '../game/bossCombat.js';
import { stepDragon, dragonCtx, DRAGON_MOVES } from '../game/dragonMoves.js';
import { worldDelta, isWorldFrozen, worldNow } from '../game/worldClock.js';
import { chunkOf, CHUNK_SIZE } from '../world/loadedChunks.js';
import { windupRamp } from '../game/attackTelegraph.js';
import { bossCaptureReset, BOSS_REST } from '../game/captureRest.js';
import { lookbookDragonHold } from './lookbookSeam.js';
import { decalFor, decalOpacity, decalSpin, BITE_DECAL_ARC } from './dragonTelegraphs.js';
import { UI } from '../theme/tokens.js';
import { registerTestHook } from '../devtest/testBridge.js';

// M2 #4 Slice 3: boss lava-AoE telegraph. The lava ring (already a ground decal) now appears + grows as
// a HARMLESS warning for this window before it arms (starts dealing damage), so the player can read it
// and step out -- it used to spawn instantly at the player's feet (undodgeable). Heavier than the mob
// 380ms windup: it's a big AoE you must walk clear of. Tunable -> Kevin FEEL #50.
const LAVA_WINDUP_MS = 750;

const destroyVoxelsInRadius = (centerPos, radius, maxCount) => {
    const store = useGameStore.getState();
    const worker = store.terrainWorker;
    const getGround = store.getMobGroundLevel;
    if (!worker || !getGround) return;

    const blocksToBreak = [];
    const minX = Math.floor(centerPos.x - radius);
    const maxX = Math.ceil(centerPos.x + radius);
    const minZ = Math.floor(centerPos.z - radius);
    const maxZ = Math.ceil(centerPos.z + radius);

    for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
            const dx = x + 0.5 - centerPos.x;
            const dz = z + 0.5 - centerPos.z;
            if (dx * dx + dz * dz <= radius * radius) {
                const groundY = getGround(x, z);
                if (groundY !== null && !isNaN(groundY)) {
                    const blockY = Math.floor(groundY);
                    const dy = blockY + 0.5 - centerPos.y;
                    if (dx * dx + dy * dy + dz * dz <= radius * radius) {
                        if (blockY > 1) {
                            blocksToBreak.push({ x, y: blockY, z });
                            if (blockY - 1 > 1) {
                                const dy2 = blockY - 0.5 - centerPos.y;
                                if (dx * dx + dy2 * dy2 + dz * dz <= radius * radius) {
                                    blocksToBreak.push({ x, y: blockY - 1, z });
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (blocksToBreak.length === 0) return;

    const countToBreak = Math.min(blocksToBreak.length, maxCount);
    const chosen = [];
    for (let i = 0; i < countToBreak; i++) {
        const randIdx = Math.floor(Math.random() * blocksToBreak.length);
        chosen.push(blocksToBreak.splice(randIdx, 1)[0]);
    }

    const newBlocks = new Map(store.worldBlocks);
    chosen.forEach(b => {
        const cx = chunkOf(b.x); // the ONE chunk index (world/loadedChunks.js, review #5 R6.7)
        const cz = chunkOf(b.z);
        const lx = b.x - cx * CHUNK_SIZE;
        const lz = b.z - cz * CHUNK_SIZE;

        worker.postMessage({
            type: 'update_block',
            payload: { cx, cz, x: lx, y: b.y, z: lz, blockType: 0 }
        });

        newBlocks.set(`${b.x}_${b.y}_${b.z}`, 0);
    });

    store.setWorldBlocks(newBlocks);
};

// Dragon SILHOUETTE features (iter-172, the mob-distinctness treatment for the apex creature): static
// bold-flat boxes in the dragon body-local frame (dragon faces +Z, head/eyes forward). Swept-back horns,
// a tapering down-back tail, and a back-ridge of spine spikes — the cues that push the blocky winged
// torso to read unmistakably as a DRAGON. Rendered with the torso material (flash/phase together) + the
// boss outline. Static (no anim) -> capture-frozen with the boss group, byte-deterministic.
const DRAGON_FEATURES = [
  // swept-back horns off the head top (head box at [0,1.4,1.8]; tilt back = negative rot.x)
  { box: [0.22, 1.0, 0.22], pos: [-0.5, 2.3, 1.4], rot: [-0.5, 0, 0.18] },
  { box: [0.22, 1.0, 0.22], pos: [0.5, 2.3, 1.4], rot: [-0.5, 0, -0.18] },
  // tapering tail behind the torso (-Z), drooping down
  { box: [0.8, 0.8, 1.8], pos: [0, 0.05, -2.7], rot: [0.28, 0, 0] },
  { box: [0.45, 0.45, 1.7], pos: [0, -0.55, -4.05], rot: [0.5, 0, 0] },
  // back-ridge spine spikes along the torso top (y top ~1.0)
  { box: [0.16, 0.5, 0.34], pos: [0, 1.2, 1.2], rot: [0.35, 0, 0] },
  { box: [0.18, 0.62, 0.34], pos: [0, 1.28, 0.4], rot: [0.18, 0, 0] },
  { box: [0.18, 0.62, 0.34], pos: [0, 1.28, -0.4], rot: [0, 0, 0] },
  { box: [0.16, 0.5, 0.34], pos: [0, 1.2, -1.2], rot: [-0.2, 0, 0] },
];

// The dragon's flight around the move machine: how far above its ground it counts as airborne (zones and allies then
// cannot reach it, game/bossCombat.js bossTargets), where it lands when staggered, where a dive-bite takes it.
const AIRBORNE_GAP_M = 3;
const LANDED_Y = 0.8;
const DIVE_OVER_FEET_M = 1.2;
// Where its three melee hit points sit on today's model: the head ahead of the chest, the hips behind.
const HEAD_AHEAD_M = 2.6;
const HEAD_UP_M = 1.4;
const HIPS_BEHIND_M = 2;
// The damage sources a hit reports (attribution in the DEV console; store/useGameStore.jsx damagePlayer).
const STRIKE_SOURCE = { bite: 'Shadow Dragon Bite', diveBite: 'Shadow Dragon Dive', roar: 'Shadow Dragon Shockwave' };
// The lookbook's tells (render/lookbookSeam.js DRAGON_POSES) are held this far through their windup, and drawn this far
// from the dragon toward the camera when the tell marks the ground where the player stands.
const HOLD_RAMP = 0.7;
const HOLD_TARGET_M = 4;
const LAVA_RADIUS_M = 2.75;
// The tells' red: the HUD's danger token, so a ground decal and the boss bar speak one colour.
const DECAL_COLOR = UI.color.danger;
const DANGER = new THREE.Color(DECAL_COLOR);
const HEAD_GLOW = new THREE.Color(BOSS_CONFIG.secondaryColor);
const HIT_RED = new THREE.Color('#ef4444');

// The stagger on today's model: head down, wings folded down.
const STAGGER_PITCH = 0.3;
const STAGGER_WING_Z = 1.0;
// The head's emissive at rest (the declarative value) and at the strike of a windup.
const HEAD_REST_GLOW = 0.6;
const HEAD_TELL_GLOW = 3.0;
// The camera stands at the player's eye; their feet are this far below it (the Player rig's eye height).
const PLAYER_EYE_M = 1.62;
// The tells the lookbook can hold that mark the ground with a decal from the pool (the lava has its own ring).
const HELD_TELLS = ['bite', 'roar', 'summon', 'fireball'];


export const BossEntity = React.memo(({ bossActive, bossPositionRef, bossPhase, bossHealth, bossTier = 0 }) => {
    // C3: a returning dragon's per-phase speed and damage are its TIER's (game/bossTier.js); tier 0 is BOSS_CONFIG.
    const tierPhases = useMemo(() => bossTierStats(bossTier).phases, [bossTier]);
    const meshRef = useRef();
    const headMatRef = useRef();
    const { camera } = useThree();

    // Inverted-hull contour outline gate (matches mob/prop pattern). The boss keeps its
    // emissive telegraph + standard materials — the outline is purely additive ink.
    const qualityTier = useGameStore(s => s.qualityTier) || 'low';
    const charOutline = (TIERS[qualityTier] || TIERS.low).charOutline;

    // Premium visual animation and hit reaction refs
    const leftWingRef = useRef();
    const rightWingRef = useRef();
    const prevHealth = useRef(bossHealth);
    const flashTime = useRef(0);
    // MEMBERSHIP STATE, not a ref. The flash is read DURING RENDER (isFlashing below), and a ref write
    // schedules nothing -- so writing flashTime in an effect meant the hit's own render had already read
    // the pre-effect 0, and useFrame decayed the timer back to zero within 180ms with no render in
    // between. The flash reached the screen only when some unrelated setEffects call happened to
    // re-render inside that window: coincidence-driven, never hit-driven. setState here runs on the rare
    // membership transition, never per frame, so Game-Loop-Isolation holds: a boss hit is a rare event, not a
    // per-frame one.
    const [isFlashing, setIsFlashing] = useState(false);

    useEffect(() => {
        if (bossHealth < prevHealth.current) {
            flashTime.current = 0.18; // Flash red for 180ms
            setIsFlashing(true);
        }
        prevHealth.current = bossHealth;
    }, [bossHealth]);

    // The shared record (game/bossCombat.js) outlives this component; an unmount (the kill, a give-up) must not leave an
    // active record with a pending windup for a perfect dodge to "parry".
    useEffect(() => () => { resetBossCombat(bossCombat); }, []);

    // The move machine's context, written in place each frame (game/dragonMoves.js dragonCtx).
    const ctxInRef = useRef({ bossTier: 0, phase: 0, player: { x: 0, y: 0, z: 0 }, playerAlive: true, invincible: false, groundY: 0, damage: 0 });
    const ctxRef = useRef({});

    // THE GROUND DECALS (render/dragonTelegraphs.js): one mesh per shape, always mounted, one shown at a time while a
    // windup runs (one move at a time), so an idle dragon draws none of them.
    const decalRingRef = useRef();
    const decalDiscRef = useRef();
    const decalArcRef = useRef();
    const decalRef = useRef({ mesh: null, until: 0, windupMs: 0, pose: null });
    const decalMesh = (shape) => (shape === 'ring' ? decalRingRef.current : shape === 'disc' ? decalDiscRef.current : decalArcRef.current);
    const showDecal = (d, until, windupMs) => {
        const cur = decalRef.current;
        if (cur.mesh) cur.mesh.visible = false;
        cur.pose = null;
        const mesh = d ? decalMesh(d.shape) : null;
        cur.mesh = mesh; cur.until = until; cur.windupMs = windupMs;
        if (!mesh) return;
        const gy = useGameStore.getState().getMobGroundLevel?.(d.x, d.z);
        mesh.position.set(d.x, (Number.isFinite(gy) ? gy : bossPositionRef.current[1] - LANDED_Y) + 0.06, d.z);
        mesh.scale.setScalar(d.radius);
        mesh.rotation.set(-Math.PI / 2, 0, d.shape === 'arc' ? decalSpin(d.heading) : 0);
        mesh.visible = true;
    };

    // DEV: what the e2e reads of the fight (tests/e2e/dragon-fight.spec.js): the record, where the dragon is, and the
    // decal a windup shows. Registered while the dragon is mounted.
    useEffect(() => {
        if (!import.meta.env.DEV) return undefined;
        registerTestHook('readDragon', () => {
            const r = bossCombat;
            const m = decalRef.current.mesh;
            return {
                active: r.active, health: r.health, move: r.move, windupUntil: r.windupUntil, castUntil: r.castUntil,
                staggerUntil: r.staggerUntil, knockdownUntil: r.knockdownUntil, immuneUntil: r.immuneUntil, heavyChain: r.heavyChain,
                airborne: r.airborne, pinned: r.pinned, position: { ...r.position }, now: worldNow(),
                decal: m && m.visible ? { shape: m === decalRingRef.current ? 'ring' : m === decalDiscRef.current ? 'disc' : 'arc',
                    radius: m.scale.x, opacity: m.material.opacity, colour: `#${m.material.color.getHexString()}`, at: m.position.toArray() } : null,
            };
        });
        // Pin it (no flight step) and, `calm`, put every move on an endless cooldown, so only a planted move runs.
        registerTestHook('pinDragon', ({ pinned = true, calm = false } = {}) => {
            bossCombat.pinned = pinned;
            if (calm) for (const k of Object.keys(DRAGON_MOVES)) bossCombat.cooldowns[k] = Infinity;
        });
        // Wind up `move` due `dueMs` world ms from now, as the machine starts one: its until, and its decal.
        registerTestHook('plantDragonMove', (move, dueMs) => {
            const m = DRAGON_MOVES[move];
            if (!m) throw new TypeError(`plantDragonMove: no move ${JSON.stringify(move)}`);
            const r = bossCombat;
            const until = worldNow() + dueMs;
            r.move = move;
            if (m.parryable) { r.windupUntil = until; r.castUntil = 0; } else { r.castUntil = until; r.windupUntil = 0; }
            const p = r.position, c = camera.position;
            showDecal(decalFor({ type: 'windup', move, until, at: { x: c.x, z: c.z }, radius: m.reach ?? m.radius,
                heading: Math.atan2(c.x - p.x, c.z - p.z) }, p), until, m.windupMs);
            return until - worldNow();
        });
        return () => {
            registerTestHook('readDragon', () => null);
            registerTestHook('pinDragon', () => null);
            registerTestHook('plantDragonMove', () => null);
        };
    }, []);

    // High-performance bullet references to bypass React overhead
    const fireballsRef = useRef([]);
    const lavaZonesRef = useRef([]);
    const fireballMeshes = useRef({});
    const lavaZoneMeshes = useRef({});

    // Low-frequency trigger state to spawn/de-spawn bullet groups in the React tree
    const [effects, setEffects] = useState({ fireballs: [], lavaZones: [] });
    const effectId = useRef(0); // monotonic effect ids — Math.random() collided React keys + the ref-map keys

    // Instanced Spawner callbacks
    const spawnFireball = useCallback((startPos, dir) => {
        const id = effectId.current++;
        const fireball = {
            id,
            position: startPos.clone(),
            velocity: dir.clone().multiplyScalar(16.0), // Fast flight
            life: 3.5
        };
        fireballsRef.current.push(fireball);
        setEffects(prev => ({ ...prev, fireballs: [...fireballsRef.current] }));
    }, []);

    const spawnLavaZone = useCallback((pos) => {
        const id = effectId.current++;
        const lava = {
            id,
            position: pos.clone(),
            life: 6.0,
            lastDamageTime: 0,
            telegraphUntil: worldNow() + LAVA_WINDUP_MS // harmless warning window before it arms (world clock: a freeze holds it)
        };
        lavaZonesRef.current.push(lava);
        setEffects(prev => ({ ...prev, lavaZones: [...lavaZonesRef.current] }));
    }, []);

    useFrame((state, rawDelta) => {
        // Hitstop holds the WORLD, the boss included: its flight, pitch and fireballs take no step while frozen.
        const delta = worldDelta(rawDelta);
        if (!bossActive || !bossPositionRef?.current || !meshRef.current) {
            // Clean up any remaining visual effects if boss becomes inactive
            if (fireballsRef.current.length > 0 || lavaZonesRef.current.length > 0) {
                fireballsRef.current = [];
                lavaZonesRef.current = [];
                setEffects({ fireballs: [], lavaZones: [] });
            }
            return;
        }
        const rec = bossCombat;

        // Capture-determinism freeze: pin the dragon to its forced spawn pose and skip
        // ALL movement / attacks / fireballs / wing-flap so the boss-closeup fixture is
        // byte-stable. No-op in gameplay (isCaptureMode() is always false there).
        if (isCaptureMode()) {
            // Declared rest pose, via the shared seam. The old inline version reset the wings and the
            // position and left ROTATION alone — while the flight loop below writes rotation.y (turn) and
            // rotation.x (pitch) every frame — so the captured dragon faced a different way each run,
            // from the very guard that existed to stop that.
            bossCaptureReset(
                { mesh: meshRef.current, leftWing: leftWingRef.current, rightWing: rightWingRef.current },
                bossPositionRef.current
            );
            return;
        }

        // The record a perfect dodge, the heavy and the systems that hit mobs read: written before the freeze below, so
        // a fight that begins inside a hitstop is already a target.
        const [bx, by, bz] = bossPositionRef.current;
        rec.active = true;
        rec.health = bossHealth;
        rec.position.x = bx; rec.position.y = by; rec.position.z = bz;

        // A dragon the lookbook holds (render/lookbookSeam.js dragon()) stays where it was woken, facing the camera, and
        // starts no attack: a frame of the fight is the same frame on every run. A held tell shows its decal and its glow
        // HOLD_RAMP of the way through its windup; 'staggered' shows the stagger.
        const hold = lookbookDragonHold();
        if (hold !== null) {
            meshRef.current.position.set(bx, by, bz);
            const yaw = Math.atan2(camera.position.x - bx, camera.position.z - bz);
            meshRef.current.rotation.set(hold === 'staggered' ? STAGGER_PITCH : 0, yaw, 0);
            rec.move = null; rec.windupUntil = 0; rec.castUntil = 0;
            poseWings(leftWingRef.current, rightWingRef.current, hold === 'staggered' ? STAGGER_WING_Z : BOSS_REST.leftWingZ);
            const toward = { x: bx + Math.sin(yaw) * HOLD_TARGET_M, z: bz + Math.cos(yaw) * HOLD_TARGET_M };
            const held = hold === 'lava' ? { shape: 'ring', x: toward.x, z: toward.z, radius: LAVA_RADIUS_M }
                : HELD_TELLS.includes(hold) ? decalFor({ move: hold, radius: DRAGON_MOVES[hold].reach ?? DRAGON_MOVES[hold].radius,
                    heading: yaw, at: toward }, rec.position) : null;
            // Placed (with its ground read) when the held pose changes; turned toward the camera every frame.
            if (held) {
                if (decalRef.current.pose !== hold) { showDecal(held, Infinity, 1); decalRef.current.pose = hold; }
                const m = decalRef.current.mesh;
                m.rotation.z = held.shape === 'arc' ? decalSpin(held.heading) : 0;
                m.material.opacity = 0.25 + 0.5 * HOLD_RAMP;
            } else if (decalRef.current.mesh) {
                showDecal(null, 0, 0);
            }
            glowHead(headMatRef.current, isFlashing, held || hold === 'fireball' ? HOLD_RAMP : 0);
            return;
        }

        // FROZEN (review #3, R4.1): a hitstop holds the dragon WHOLE — no flight step, and no bite, roar, fireball,
        // lava or summon either. With only the movement scaled the dragon stood still and kept attacking through
        // the freeze its own hit had caused. Its timers read the WORLD clock below, so the freeze also HOLDS them
        // rather than spending them (review #4, R5.4: a wall-clock cooldown expired inside the freeze and fired a
        // burst of attacks on the first frame after it, and the lava's warning window was eaten).
        if (isWorldFrozen()) return;

        const now = worldNow();
        const phase = tierPhases[bossPhase] || tierPhases[0];
        const playerX = camera.position.x;
        const playerZ = camera.position.z;

        // --- Step 1: Phase-Specific Tactical Flight & Movement Vector Solvers ---
        let targetX = playerX;
        let targetZ = playerZ;
        let targetY = by;

        let currentGroundY = 16;
        if (useGameStore.getState().getMobGroundLevel) {
            const gy = useGameStore.getState().getMobGroundLevel(bx, bz);
            if (gy !== null && !isNaN(gy)) currentGroundY = gy;
        }

        const downed = rec.staggerUntil > now || rec.knockdownUntil > now;
        if (rec.pinned || rec.move) {
            // Pinned by a test, or holding still through a windup, so the tell stays where it was read.
            targetX = bx; targetZ = bz;
        } else if (downed) {
            // A perfect dodge or the heavy chain grounds it: wings fold, it lands where it is.
            targetX = bx; targetZ = bz;
            targetY = currentGroundY + LANDED_Y;
        } else if (bossPhase === 0) {
            if (now >= (rec.cooldowns.diveBite || 0)) {
                // The dive: down to the player, low enough for its bite (and the player's sword) to reach.
                targetY = camera.position.y - PLAYER_EYE_M + DIVE_OVER_FEET_M;
            } else {
                // Phase 1 (Aerial Strike Mode): Dragon circles high in the sky and swoops
                const time = state.clock.elapsedTime;
                const orbitRadius = 14;
                const orbitSpeed = 0.6;
                targetX = playerX + Math.cos(time * orbitSpeed) * orbitRadius;
                targetZ = playerZ + Math.sin(time * orbitSpeed) * orbitRadius;
                targetY = currentGroundY + 13.0 + Math.sin(time * 1.5) * 2.0; // Graceful vertical bobbing
            }
        } else {
            // Phase 2 & 3 (Grounded Modes): Charge direct at player on the ground surface
            targetX = playerX;
            targetZ = playerZ;
            targetY = currentGroundY + LANDED_Y;
        }

        // Interpolate 3D position smoothly towards coordinates targets
        const moveSpeed = phase.speed * delta;
        const tdx = targetX - bx;
        const tdz = targetZ - bz;
        const tdy = rec.pinned ? 0 : targetY - by;
        const tdist = Math.sqrt(tdx * tdx + tdz * tdz);

        let nextX = bx;
        let nextZ = bz;
        if (tdist > 0.5) {
            nextX = bx + (tdx / tdist) * Math.min(moveSpeed, tdist);
            nextZ = bz + (tdz / tdist) * Math.min(moveSpeed, tdist);
        }
        const nextY = by + tdy * delta * 2.0; // Smooth vertical interpolation

        bossPositionRef.current = [nextX, nextY, nextZ];
        meshRef.current.position.set(nextX, nextY, nextZ);

        // Rotate facing direction towards target path; a winding-up or pinned dragon faces the player it is aiming at.
        const fx = rec.move || rec.pinned ? playerX - nextX : tdx;
        const fz = rec.move || rec.pinned ? playerZ - nextZ : tdz;
        if (!downed && Math.hypot(fx, fz) > 0.1) {
            meshRef.current.rotation.y = Math.atan2(fx, fz);
        }

        // The record, at the dragon's new place: its centre, whether it is out of a ground fighter's reach, and the three
        // points the melee cone looks for.
        const yaw = meshRef.current.rotation.y;
        const hx = Math.sin(yaw), hz = Math.cos(yaw);
        rec.position.x = nextX; rec.position.y = nextY; rec.position.z = nextZ;
        rec.airborne = nextY - currentGroundY > AIRBORNE_GAP_M;
        const [head, chest, hips] = rec.hitPoints;
        head.x = nextX + hx * HEAD_AHEAD_M; head.y = nextY + HEAD_UP_M; head.z = nextZ + hz * HEAD_AHEAD_M;
        chest.x = nextX; chest.y = nextY; chest.z = nextZ;
        hips.x = nextX - hx * HIPS_BEHIND_M; hips.y = nextY; hips.z = nextZ - hz * HIPS_BEHIND_M;

        // --- Step 2: The move machine (game/dragonMoves.js): one move at a time, each with its tell ---
        const s = useGameStore.getState();
        const cin = ctxInRef.current;
        cin.bossTier = bossTier;
        cin.phase = bossPhase;
        cin.player.x = playerX; cin.player.y = camera.position.y - PLAYER_EYE_M; cin.player.z = playerZ;
        cin.playerAlive = s.isAlive !== false;
        cin.invincible = !!s.isPlayerInvincible?.();
        cin.groundY = currentGroundY;
        cin.damage = phase.damage;
        const events = stepDragon(rec, dragonCtx(cin, ctxRef.current), now);
        for (let i = 0; i < events.length; i++) {
            const ev = events[i];
            if (ev.type === 'windup') {
                showDecal(decalFor(ev, rec.position), ev.until, DRAGON_MOVES[ev.move].windupMs);
            } else if (ev.type === 'strike') {
                s.damagePlayer?.(ev.damage, STRIKE_SOURCE[ev.move], [nextX, nextY, nextZ]);
                if (ev.knockback) s.playerRigidBodyRef?.current?.applyImpulse(ev.knockback, true);
            } else if (ev.type === 'launch') {
                // Spawn fireball starting at mouth and aiming directly at player capsule core
                // rotate the LOCAL mouth offset by the boss rotation, THEN add the boss world pos.
                const headPos = new THREE.Vector3(0, 1.2, 1.5).applyEuler(meshRef.current.rotation).add(new THREE.Vector3(nextX, nextY, nextZ));
                const targetPos = new THREE.Vector3(playerX, camera.position.y - 0.5, playerZ);
                spawnFireball(headPos, targetPos.sub(headPos).normalize());
            } else if (ev.type === 'lava') {
                let playerGroundY = camera.position.y - 1.5;
                const pgy = s.getMobGroundLevel?.(ev.at.x, ev.at.z);
                if (pgy !== null && pgy !== undefined && !isNaN(pgy)) playerGroundY = pgy;
                spawnLavaZone(new THREE.Vector3(ev.at.x, playerGroundY + 0.05, ev.at.z));
                destroyVoxelsInRadius(new THREE.Vector3(ev.at.x, playerGroundY, ev.at.z), 5.0, Math.floor(Math.random() * 5) + 4);
            } else if (ev.type === 'summon') {
                for (const p of ev.at) s.spawnMob?.(p.x, p.z, 'skeleton');
            }
            if ((ev.type === 'strike' || ev.type === 'whiff') && ev.move === 'roar') {
                // The roar happened whether or not it reached the player: the camera shakes (the trauma model, which
                // decays itself) and the blocks break around the dragon, where they are.
                s.triggerCameraShake?.(1.8);
                destroyVoxelsInRadius(new THREE.Vector3(nextX, nextY, nextZ), 5.0, Math.floor(Math.random() * 5) + 4);
            }
        }

        // The decal brightens as its windup closes, and goes when the move resolves or a perfect dodge cancels it.
        const decal = decalRef.current;
        if (decal.mesh) {
            if (!rec.move || now >= decal.until) showDecal(null, 0, 0);
            else decal.mesh.material.opacity = decalOpacity(now, decal.until, decal.windupMs);
        }
        const moveDef = rec.move ? DRAGON_MOVES[rec.move] : null;
        glowHead(headMatRef.current, isFlashing, moveDef ? windupRamp(now, rec.windupUntil || rec.castUntil, moveDef.windupMs) : 0);

        // --- Step 3: High-Performance Visual Bullets Solver Loops ---

        // 1. Move active fireballs in 3D WebGL Canvas
        let hasDeadFireball = false;
        fireballsRef.current.forEach(f => {
            f.position.addScaledVector(f.velocity, delta);
            f.life -= delta;

            // Direct mesh property manipulation to bypass React DOM updates
            const mesh = fireballMeshes.current[f.id];
            if (mesh) {
                mesh.position.copy(f.position);
                mesh.rotation.x += delta * 10;
                mesh.rotation.y += delta * 10;
            }

            // Target collision detector
            const distToPlayer = f.position.distanceTo(camera.position);
            if (distToPlayer < 1.6) {
                f.life = -1; // Flag as dead to explode
                if (useGameStore.getState().damagePlayer) {
                    useGameStore.getState().damagePlayer(18, 'Dragon Fireball impact');
                }
                // Camera shake via the trauma model; damagePlayer already owns the red damage vignette
                // (the old setScreenShake here stomped that vignette's intensity + zeroed it early).
                useGameStore.getState().triggerCameraShake?.(1.4);
            }

            if (f.life <= 0) hasDeadFireball = true;
        });

        // 2. Process active lava circles
        let hasDeadLava = false;
        lavaZonesRef.current.forEach(l => {
            l.life -= delta;

            const mesh = lavaZoneMeshes.current[l.id];
            const forming = now < l.telegraphUntil;
            if (mesh) {
                if (forming) {
                    // TELEGRAPH: the ring grows in + blinks fast as a danger warning (no damage yet) so
                    // the player can read where the lava lands and step out before it arms.
                    const wr = windupRamp(now, l.telegraphUntil, LAVA_WINDUP_MS); // 0 -> 1 as it arms
                    mesh.material.opacity = 0.25 + 0.4 * Math.abs(Math.sin(now * 0.012));
                    mesh.scale.setScalar(0.4 + 0.6 * wr);
                } else {
                    // ARMED hot lava: fade out over its life, gentle pulse.
                    mesh.material.opacity = 0.5 * Math.max(0, l.life / 6.0);
                    mesh.scale.setScalar(1.0 + Math.sin(state.clock.elapsedTime * 4) * 0.05);
                }
            }

            // Lava burning area-of-effect solver (only once ARMED -- the telegraph window is harmless)
            const pX = camera.position.x;
            const pZ = camera.position.z;
            const dxL = pX - l.position.x;
            const dzL = pZ - l.position.z;
            const distSq = dxL * dxL + dzL * dzL;

            if (!forming && distSq < 7.56) { // 2.75 units radius burning threshold
                if (now - l.lastDamageTime > 500) {
                    l.lastDamageTime = now;
                    if (useGameStore.getState().damagePlayer) {
                        useGameStore.getState().damagePlayer(6, 'Burning Lava AOE');
                    }
                }
            }

            if (l.life <= 0) hasDeadLava = true;
        });

        // Re-mesh cleanup on bullet destruction (very low frequency compared to frame ticks)
        if (hasDeadFireball) {
            fireballsRef.current = fireballsRef.current.filter(f => f.life > 0);
            setEffects(prev => ({ ...prev, fireballs: [...fireballsRef.current] }));
        }
        if (hasDeadLava) {
            lavaZonesRef.current = lavaZonesRef.current.filter(l => l.life > 0);
            setEffects(prev => ({ ...prev, lavaZones: [...lavaZonesRef.current] }));
        }

        // Damage hit visual flash timer decay. The transition OUT is a membership change too: without
        // it the flash would latch on until the next hit re-rendered it.
        if (flashTime.current > 0) {
            flashTime.current -= delta;
            if (flashTime.current <= 0) setIsFlashing(false);
        }

        // Animate Boss wings/tail mesh. A staggered or knocked-down dragon droops its head and folds its wings.
        if (downed) {
            meshRef.current.rotation.x = STAGGER_PITCH;
            poseWings(leftWingRef.current, rightWingRef.current, STAGGER_WING_Z);
            return;
        }
        meshRef.current.position.y += Math.sin(state.clock.elapsedTime * 2.5) * 0.015;
        meshRef.current.rotation.x = bossPhase > 0 ? Math.sin(state.clock.elapsedTime * 4) * 0.08 : 0;

        // Premium wing flapping motion
        const flapSpeed = bossPhase === 0 ? 5.5 : 2.5;
        poseWings(leftWingRef.current, rightWingRef.current, 0.2 + Math.sin(state.clock.elapsedTime * flapSpeed) * 0.4);
    });

    if (!bossActive || !bossPositionRef?.current) return null;

    const phase = tierPhases[bossPhase] || tierPhases[0];

    // Satisfying damage indicator color values and majestic obsidian styling
    const bodyColor = isFlashing ? "#ef4444" : "#111029"; // Hyper-obsidian deep indigo black — UNCHANGED
    const bodyEmissive = isFlashing ? "#ef4444" : phase.color; // the phase colour; WHERE it lands is the fix
    // B3/Q15: emissive by surface KIND, not one value flooding the armour. See characterStyle.js —
    // plates get a sheen, membranes carry the phase colour. The old single `emissiveIntensityVal` put
    // 0.8-2.2 on the torso and 40% of that on the wings, which is backwards: the surface light should
    // pass through was dimmer than the surface it should only graze.
    const plateEmissive = bossEmissiveIntensity('plate', bossPhase, isFlashing);
    const membraneEmissive = bossEmissiveIntensity('membrane', bossPhase, isFlashing);
    const eyeColor = isFlashing ? "#ffffff" : (bossPhase === 2 ? "#f43f5e" : (bossPhase === 1 ? "#fbbf24" : "#c084fc"));

    return (
        <group name="crafty:dragon-chunk">
            {/* --- Dragon Core 3D Mesh Representation --- */}
            <group ref={meshRef} position={bossPositionRef.current} rotation={BOSS_REST.rotation}>
                {/* Torso */}
                <mesh castShadow receiveShadow>
                    <boxGeometry args={[3, 2, 4]} />
                    <meshStandardMaterial
                        roughness={0.15}
                        metalness={0.9}
                        color={bodyColor}
                        emissive={bodyEmissive}
                        emissiveIntensity={plateEmissive}
                    />
                    {charOutline && <Outlines thickness={OUTLINE.boss.thickness} color={OUTLINE.color} toneMapped={false} />}
                </mesh>
                {/* Neck & Head. Its glow is the interim tell (until the segmented dragon): it climbs toward the danger red
                    as a windup closes (glowHead, written each frame), over the declarative rest value here. */}
                <mesh castShadow receiveShadow position={[0, 1.4, 1.8]}>
                    <boxGeometry args={[1.4, 1.4, 2]} />
                    <meshStandardMaterial
                        ref={headMatRef}
                        roughness={0.15}
                        metalness={0.9}
                        color={bodyColor}
                        emissive={isFlashing ? "#ef4444" : BOSS_CONFIG.secondaryColor}
                        emissiveIntensity={isFlashing ? 3.0 : HEAD_REST_GLOW}
                    />
                    {charOutline && <Outlines thickness={OUTLINE.boss.thickness} color={OUTLINE.color} toneMapped={false} />}
                </mesh>
                {/* Wings (Left / Right flapping) */}
                <mesh ref={leftWingRef} castShadow receiveShadow position={[-2.6, 0.8, 0]} rotation={[0, 0, 0.2]}>
                    <boxGeometry args={[2.2, 0.15, 3]} />
                    <meshStandardMaterial
                        roughness={0.1}
                        metalness={0.95}
                        color={isFlashing ? "#ef4444" : BOSS_CONFIG.secondaryColor}
                        emissive={isFlashing ? "#ef4444" : phase.color}
                        emissiveIntensity={membraneEmissive}
                        transparent
                        opacity={0.85}
                    />
                </mesh>
                <mesh ref={rightWingRef} castShadow receiveShadow position={[2.6, 0.8, 0]} rotation={[0, 0, -0.2]}>
                    <boxGeometry args={[2.2, 0.15, 3]} />
                    <meshStandardMaterial
                        roughness={0.1}
                        metalness={0.95}
                        color={isFlashing ? "#ef4444" : BOSS_CONFIG.secondaryColor}
                        emissive={isFlashing ? "#ef4444" : phase.color}
                        emissiveIntensity={membraneEmissive}
                        transparent
                        opacity={0.85}
                    />
                </mesh>
                {/* Glowing Eyes */}
                <mesh castShadow receiveShadow position={[-0.4, 1.7, 2.7]}>
                    <sphereGeometry args={[0.22, 8, 8]} />
                    <meshBasicMaterial color={eyeColor} toneMapped={false} />
                </mesh>
                <mesh castShadow receiveShadow position={[0.4, 1.7, 2.7]}>
                    <sphereGeometry args={[0.22, 8, 8]} />
                    <meshBasicMaterial color={eyeColor} toneMapped={false} />
                </mesh>
                <PooledLight color={phase.color} intensity={2.5} distance={15} />
                {/* iter-172 dragon silhouette features (horns / tail / back-ridge) — torso material so
                    they flash + phase-color with the body; the boss outline carries the silhouette. */}
                {DRAGON_FEATURES.map((f, i) => (
                    <mesh key={`dragf-${i}`} castShadow receiveShadow position={f.pos} rotation={f.rot}>
                        <boxGeometry args={f.box} />
                        <meshStandardMaterial
                            roughness={0.15}
                            metalness={0.9}
                            color={bodyColor}
                            emissive={bodyEmissive}
                            emissiveIntensity={plateEmissive}
                        />
                        {charOutline && <Outlines thickness={OUTLINE.boss.thickness} color={OUTLINE.color} toneMapped={false} />}
                    </mesh>
                ))}
            </group>

            {/* --- The ground decals: one per shape, hidden until a windup shows one (render/dragonTelegraphs.js). In
                world space, outside the dragon's group, so they lie where the move lands, not where the dragon turns. --- */}
            <mesh ref={decalRingRef} visible={false} renderOrder={2}>
                <ringGeometry args={[0.9, 1, 64]} />
                <meshBasicMaterial color={DECAL_COLOR} transparent opacity={0} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
            </mesh>
            <mesh ref={decalDiscRef} visible={false} renderOrder={2}>
                <circleGeometry args={[1, 40]} />
                <meshBasicMaterial color={DECAL_COLOR} transparent opacity={0} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
            </mesh>
            <mesh ref={decalArcRef} visible={false} renderOrder={2}>
                <ringGeometry args={[0.2, 1, 32, 1, -BITE_DECAL_ARC / 2, BITE_DECAL_ARC]} />
                <meshBasicMaterial color={DECAL_COLOR} transparent opacity={0} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
            </mesh>

            {/* --- High Performance Instanced/Mesh Effects Rendering Sheets --- */}

            {/* 1. Aerial Fireballs */}
            {effects.fireballs.map(f => (
                <mesh key={f.id} ref={el => { if (el) fireballMeshes.current[f.id] = el; else delete fireballMeshes.current[f.id]; }} position={f.position}>
                    <sphereGeometry args={[0.45, 12, 12]} />
                    <meshBasicMaterial color="#f97316" toneMapped={false} />
                    <PooledLight color="#f97316" intensity={2.0} distance={6} />
                </mesh>
            ))}

            {/* 2. Dynamic Burn Lava Zones */}
            {effects.lavaZones.map(l => (
                <mesh
                    key={l.id}
                    ref={el => { if (el) lavaZoneMeshes.current[l.id] = el; else delete lavaZoneMeshes.current[l.id]; }}
                    position={l.position}
                    rotation={[-Math.PI / 2, 0, 0]}
                    receiveShadow
                >
                    <ringGeometry args={[0.1, 2.75, 32]} />
                    <meshBasicMaterial color="#ef4444" transparent opacity={0.4} depthWrite={false} />
                </mesh>
            ))}
        </group>
    );
});

/** Wings at `z` (left) and its mirror (right). */
function poseWings(left, right, z) {
    if (!left || !right) return;
    left.rotation.z = z;
    right.rotation.z = -z;
}

/** The head's glow `ramp` (0..1) of the way through a windup, toward the danger red; a hit's flash wins. An imperative
 *  write each frame, over the declarative rest value the head renders with. */
function glowHead(mat, flashing, ramp) {
    if (!mat) return;
    if (flashing) { mat.emissive.copy(HIT_RED); mat.emissiveIntensity = HEAD_TELL_GLOW; return; }
    mat.emissive.copy(HEAD_GLOW).lerp(DANGER, ramp);
    mat.emissiveIntensity = HEAD_REST_GLOW + (HEAD_TELL_GLOW - HEAD_REST_GLOW) * ramp;
}
