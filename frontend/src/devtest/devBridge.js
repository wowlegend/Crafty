// The DEV test bridge: the hooks a Playwright spec, a probe or the lookbook calls through window.__craftyTest to drive
// the running game into known states. App imports this module only in a DEV build (App.jsx), so production carries
// none of it.
import { useGameStore } from '../store/useGameStore';
import { setActive, getInput } from '../input/inputState';
import { ecs, mobsQuery, alliesQuery } from '../ecs/world';
import { readSnareState } from '../game/snareChannel';
import { getStance, readMoveTarget } from '../game/combatStance.js';
import { readString } from '../game/meleeString.js';
import { worldNow } from '../game/worldClock.js';
import { isCaptureMode, enterCaptureMode, exitCaptureMode } from './captureMode.js';
import { resetCaptureClock, stepCaptureFrames, captureFrameIndex, setCaptureFrame } from './captureClock.js';
import { registerTestHook, installTestBridge } from './testBridge.js';
import { PLAYER_SPAWN } from '../game/playerSpawn.js';
import { beastRevealCamera } from '../game/beastRevealCamera.js';
import { resolveSpawnGround, spawnTargetY, SPAWN_PROBE_MAX_FAILS } from '../game/spawnPlacement.js';
import { surfaceBlockAt } from '../world/climate.js';
import { HEARTH_Y } from '../world/homeAnchor.js';
import { FEET_OFFSET } from '../render/BeastAvatar.jsx';
import { GameMethods } from '../GameMethods';
import { applyFusion } from '../game/hybrids';
import { getLiveZones } from '../world/ElementZoneSystem';
import { spawnZone, clearZones } from '../game/elementZones';
import { loadPanels } from '../ui/panels/lazyPanels.js';

/** Register every hook and expose window.__craftyTest. The two setters are App's panel flags, held in React state. */
export function installDevBridge({ setShowAchievements, setShowSpellUpgrades }) {
  // `start` mirrors the "Start Adventure" button (MenuSystem): flip the menu
  // gate via the optimistic setActive writer (the active SoT), then best-effort
  // pointer lock (Components.jsx's listener is the authoritative active writer).
  registerTestHook('start', () => {
    setActive(true);
    const state = useGameStore.getState();
    if (state.requestPointerLock) {
      state.requestPointerLock();
    } else if (document.body.requestPointerLock) {
      document.body.requestPointerLock().catch(() => {});
    }
  });
  // `forcePlay` is the deterministic, headless-safe play-entry for E2E: it flips ONLY the
  // active gate (the menu hides on active; the in-game HUD mounts on active+alive+worldBuilt)
  // WITHOUT requestPointerLock (whose headless rejection resets active) and WITHOUT
  // markGameStarted (which would arm the ESC-unlock->Settings path and cover the HUD).
  registerTestHook('forcePlay', () => {
    setActive(true);
  });
  // Read the live intent map. Held-key intents are the one part of the input path with no store
  // mirror, so a latched intent — a Shift pressed with a panel open that spends itself as a roll the
  // moment lock returns — was unobservable from any test. Read-only; DEV-only like the whole bridge.
  registerTestHook('readIntents', () => ({ ...getInput() }));
  // Read the live mobs (ECS authority, not the damped render group). The world-hitstop E2E needs to see
  // a knockback impulse HELD across a freeze and spent after it, and the ECS is otherwise unreachable
  // from a page. Read-only; a copy, so a spec cannot mutate an entity through it.
  // `y` for the mob-floor E2E (R7.1): a mob under a roof must stay on the ground, which only its y can show.
  // windupUntil / staggerUntil for the perfect-dodge E2E: the press is timed against the first, judged by the second.
  registerTestHook('readMobs', () => mobsQuery.entities.map((e) => ({
    id: e.id, type: e.type, role: e.role ?? null, health: e.health, passive: !!e.passive, x: e.position.x, y: e.position.y, z: e.position.z,
    knockback: !!e.knockback, windupUntil: e.windupUntil || 0, staggerUntil: e.staggerUntil || 0,
  })));
  // The squad, for the ember E2E: a bind is seen as a mob joining it, a fuse as a pair leaving it for one hybrid.
  registerTestHook('readAllies', () => alliesQuery.entities.map((e) => ({
    id: e.id, type: e.type, baseType: e.baseType || null, hybridId: e.hybridId || null, x: e.position.x, z: e.position.z,
  })));
  // The snare tether's channel state, which a fuse channel writes too (its thread drawn from the pair's first ally):
  // the ember E2E sees a fuse channel running before it moves the squad around it. A copy of the scalar fields.
  registerTestHook('readSnareState', () => {
    const s = readSnareState();
    return { channeling: s.channeling, targetId: s.targetId, progress: s.progress };
  });
  // The combat stance (game/combatStance.js) and the controller's own move-target record, for the combat-stance E2E.
  // The stance records the threat's and the player's positions as it read them, before deriving `away`, so the spec
  // rebuilds the direction itself and judges the command against literal caps. Read-only copies; DEV-only.
  registerTestHook('readStance', () => ({ ...getStance() }));
  registerTestHook('readMoveTarget', () => ({ ...readMoveTarget() }));
  // The light string (game/meleeString.js), for the melee-string and combat-touch E2Es: they judge a buffered fire by
  // its state (lastSwingAt / lastSwingStep), not by a delay, and a dodge by its own stamp (cancelAt). A read-only copy.
  registerTestHook('readString', () => ({ ...readString() }));
  // PLANT a windup on a live mob, due `dueMs` from now on the WORLD clock — for the perfect-dodge E2E, which must
  // press INTO a windup's last 220 ms. A natural windup is 380 ms; a loaded CI runner draws a frame every few
  // hundred, so a windup there is visible for one frame or none and a press cannot be timed into it. The spec
  // freezes the world and plants the state the
  // worker itself would hold mid-windup — aggro, off cooldown, winding up — every field of which rides the payload
  // back to the worker (game/mobStateSync.js), so the worker strikes when it expires unless something stops it.
  // Returns the due read back, not the one asked for. DEV-only like the whole bridge.
  registerTestHook('plantWindup', (id, dueMs) => {
    const e = mobsQuery.entities.find((m) => m.id === id);
    if (!e || !(e.health > 0)) return null;
    const wnow = worldNow(); // not `now`: world-delta-census pins which files carry that line
    e.isAggro = true;
    e.lastAttackTime = 0;
    e.staggerUntil = 0;
    e.windupUntil = wnow + dueMs;
    return e.windupUntil - wnow;
  });
  // The XP orbs a kill scatters (R2.6): the world-hitstop E2E needs a SECOND world consumer, one that was
  // not already opted in, to see the freeze reach the systems the review found still moving. `age` is the
  // orb's own clock — it advances only when XPOrbSystem steps it. Read-only copy.
  registerTestHook('readOrbs', () => ecs.entities.filter((e) => e.isXPOrb).map((e) => ({ id: e.id, age: e.age })));
  // The WORLD clock (game/worldClock.js, R2.7): the world-hitstop E2E proves it holds through a freeze in the
  // running game — the ticker mounted and ordered — which no unit test can see. Read-only.
  registerTestHook('worldNow', () => worldNow());
  // `setTimeOfDay` writes the same `isDay` state the day/night cycle reads.
  registerTestHook('setTimeOfDay', (t) => useGameStore.getState().setTimeOfDay(t));
  // `setWeatherMoodBoost(n)` pins the storm overlay's input: the live weather flips clear and storm every 90 s
  // (render/WeatherSystem.jsx), so a spec reading the sky pins it first. It reads back what the store now holds.
  registerTestHook('setWeatherMoodBoost', (n) => {
    useGameStore.getState().setWeatherMoodBoost(n);
    return useGameStore.getState().weatherMoodBoost;
  });
  // `enterCapture` flips the visual-regression capture-determinism layer ON: seeded
  // decorative RNG, paused physics, pinned follow-cam, suppressed mob spawns. Optional
  // { timeOfDay } pins the lighting in the same call. No-op in prod (bridge tree-shaken).
  // STEP-THEN-SHOOT. Advance the deterministic capture clock to a DECLARED frame index, then shoot.
  // Needed because a frame-indexed clock alone gives determinism without motion: measured live, two
  // seconds of wall time under capture advanced the world by two frames (SwiftShader ~1fps), so an
  // un-suppressed animation would be captured at its start pose. Stepping makes the captured phase an
  // explicit constant a reviewer can read, rather than whatever the machine's frame rate produced.
  // Returns the clock's OWN count, not a guess from the store mirror. Those two flags provably diverge:
  // eleven fixture hooks here call enterCaptureMode() without setting the mirror, so the clock steps
  // while the mirror says no.
  registerTestHook('stepCaptureFrames', (n) => stepCaptureFrames(n));
  // READ the clock. A phase you cannot read is a phase you cannot assert, and the harness has to
  // record the one it captured at -- "the frames depict t=1.5s" is a claim, and a claim nothing can
  // falsify is how this repo has shipped green gates over frozen worlds.
  registerTestHook('captureFrameIndex', () => captureFrameIndex());
  // DECLARE the phase absolutely and hold it there. `stepCaptureFrames` advances by a delta, which is
  // a declared phase only if you know where the clock already was -- and you do not, because the
  // ticker climbs once per RENDERED frame. Measured on one machine, same schedule, two runs:
  // [6,10,13,15,16] against [6,11,13,14,16]. This is the hook the capture harness actually drives.
  registerTestHook('setCaptureFrame', (n) => setCaptureFrame(n));
  registerTestHook('enterCapture', (opts = {}) => {
    enterCaptureMode(opts);
    // CLEAR THE CHEST BOARD AT CAPTURE ENTRY. The initial-chest effect in useTreasureChests has `[]`
    // deps, so it runs at MOUNT -- before this hook exists, let alone before it is called -- and its own
    // isCaptureMode() guard is therefore provably false every time. A randomly-positioned chest was
    // spawned on every capture run, at `Math.random() * 2PI` around the player, so the declared resting
    // state of zero chests was never achieved and the position varied per run. Four fixtures already
    // cleared this list by hand, one at a time; doing it here makes it true for all of them, at the one
    // moment the flag actually flips. The publish effect refuses to write while capture is on, so the
    // clear holds.
    useGameStore.setState({ treasureChestsList: [] });
    // Frame 0. The harness captures ~31 states in ONE browser session, so without this each state's
    // phase would depend on how many frames the previous states happened to take — run-dependent
    // phase at a coarser grain, which is the defect the whole clock exists to remove.
    resetCaptureClock();
    useGameStore.getState().setCaptureMode(true);
    // Force a deterministic tier so visual baselines never depend on the
    // capture machine's deviceMemory/cores.
    useGameStore.getState().setQualityTier('high');
    // Purge any mobs that won the spawn race before this flag flipped. The mob
    // spawn setInterval starts when the Canvas mounts (page-load), BEFORE the
    // harness calls enterCapture; whether the spawn condition (chunks loaded +
    // spawn chunk ready) is met before or after this flip is a wall-clock race,
    // so an inconsistent set of hostile mobs would otherwise appear in the
    // foreground of the world-scene frames (dominant explore-night flake source).
    // Clearing here + the spawn suppression in NPCSystem guarantees a
    // deterministically mob-free world scene. Dev-capture-only: this hook is only
    // reachable through the test bridge (tree-shaken out of prod). The character/
    // boss close-up fixtures spawn their subject AFTER calling enterCaptureMode
    // directly (not this hook), so they are unaffected.
    for (const entity of [...mobsQuery.entities]) ecs.remove(entity);
    if (typeof opts.timeOfDay === 'number') {
      useGameStore.getState().setTimeOfDay(opts.timeOfDay);
    }
    // RETURN THE RESULTING STATE, so the caller can check the mode took. Capture mode's whole job is SUPPRESSION
    // (isCaptureMode() guards turn weather, mob AI, NPC routines, particles and spawning OFF), so a call that failed
    // in silence would produce frames that render perfectly, look plausible and are not deterministic, which reads
    // as gate flakiness. `captureFrameIndex` returns its phase for the same reason.
    return isCaptureMode();
  });
  registerTestHook('setQualityTier', (tier) => useGameStore.getState().setQualityTier(tier));
  registerTestHook('setDangerLevel', (n) => useGameStore.getState().setDangerLevel(n));
  // Character-render fixture: a deterministic close-up of ONE zombie, framed
  // against the sky horizon. Capture pauses physics -> getMobGroundLevel (raycast)
  // is null, so we place the subject at a FIXED elevated Y and frame the camera so
  // the terrain sits below the frame (clean sky backdrop showcases toon/rim/outline).
  registerTestHook('spawnCharacterCloseup', () => {
    const store = useGameStore.getState();
    store.setDangerLevel(0);
    store.setHudHidden(true); // clean character-studio card: suppress HUD + its toast
    store.setCaptureStudio(true); // sky-studio subject card -> suppress explore-scene motes
    store.setTimeOfDay(0.5); // flattering midday
    const SX = 0, SZ = -8, SY = 140; // far above the ~y53 terrain so even the distant
    // terrain horizon falls >37.5° (half the 75° vFOV) below a level camera and
    // drops out of frame entirely -> clean, uninterrupted sky backdrop.
    if (store.spawnMob) store.spawnMob(SX, SZ, 'zombie', SY);
    // ONE chest beside the zombie (lower-right, near the zombie's depth so it reads
    // as a smaller secondary prop, not a foreground giant) so the prop inverted-hull
    // outline is verified in-frame while the zombie stays the dominant hero.
    useGameStore.setState({
      treasureChestsList: [{ id: 'closeup-chest', position: [SX + 2.2, SY + 0.3, SZ - 0.3] }],
    });
    // The mob group sits at world y=SY+0.5; the body spans ~y(SY+0.2 feet)->(SY+2.3
    // head-top). Camera: a +X 3/4 angle, pulled back and only mildly downward (lookAt
    // near the body center) so BOTH the hero zombie (dominant, left-of-center) and the
    // secondary chest (lower-right) fit while the distant terrain horizon still falls
    // below the frame. Showcases toon body, red eyes, rim light, and the dark contour
    // outline on BOTH the character and the prop chest. HealthBar/beacon suppressed.
    enterCaptureMode({ camera: { position: [SX + 1.0, SY + 1.5, SZ + 4.0], lookAt: [SX + 0.4, SY + 1.0, SZ] } });
  });
  // S2-B1-M7d: the WILDHEART beast TRANSFORM reveal — the LEAD (comet/fire) beast IN-WORLD (real
  // sky+terrain, captureStudio:false, NOT a studio card) at a third-person reveal angle, so the
  // ③·5 silhouette + glow is judged in its TRUE context (the VFX discipline). Deterministic/frozen.
  registerTestHook('spawnBeastTransform', (element) => {
    const store = useGameStore.getState();
    store.setHudHidden(true);
    store.setCaptureStudio(false);          // IN-WORLD — keep the real scene (not a sky-studio card)
    store.setDangerLevel(0);
    store.setTimeOfDay(0.0);                // night (cool/dark) — contrasts the glow; the beast's true ctx
    store.setBeastFormActive(true, element || 'fire'); // the roster element (default fire = the LEAD)
    // Frame from where the avatar RENDERS (PLAYER_SPAWN), NOT from rb.translation(), which is a different point
    // under capture: physics is paused, so rapier never syncs the RigidBody's visual transform from the body. Framed
    // from the body (y=120, camera at 121.45), the beast meshes at worldY 100.0-101.6 sit off the bottom of the
    // screen (ndc.y ~= -3) and a beast frame shows only the distant mountain.
    // PROVISIONAL framing off the declared spawn. It is only a first guess: the avatar has not mounted
    // yet (setBeastFormActive above triggers the mount, React has not run it), so its group does not
    // exist to measure. `frameBeastReveal` below re-derives the shot once it does.
    enterCaptureMode({ camera: beastRevealCamera(element, PLAYER_SPAWN) });
  });

  // Place the player DETERMINISTICALLY on the settled ground — the capture harness calls this once,
  // after terrain is stable, before any state is shot.
  //
  // WHY. `enterCapture` runs BEFORE the world builds, and the Player's spawn-settle lives BELOW the
  // capture early-return in its useFrame — so once capture mode is on, the settle can never finish. The
  // body freezes at whichever stage it had reached, and which stage that is depends on how many frames
  // slipped through before `enterCapture` landed. All three are observed:
  //     100 = the declared RigidBody position (settle never ran)
  //     120 = SPAWN_FREEZE_Y  ("hold in the sky until the world builds")
  //    ~53 = spawnTargetY(groundY) (settled — the INTENDED in-world state)
  // Counter-intuitively the SLOW machine settled and the fast one did not: a loaded box takes longer to
  // round-trip the `enterCapture` evaluate, giving the app more frames first. That made every
  // position-dependent state non-deterministic, and the four beast frames differed 44-56% between runs purely
  // from the backdrop.
  //
  // This runs the SAME pure decision the Player uses (`resolveSpawnGround` + `spawnTargetY`), so it
  // cannot drift from real spawn behaviour — it just runs it ON DEMAND instead of racing a frame loop.
  registerTestHook('settlePlayerToGround', ({ force = false } = {}) => {
    const store = useGameStore.getState();
    const rb = store.playerRigidBodyRef?.current;
    if (!rb) return false; // caller decides; a silent fallback here is what hid the original bug
    let blockGroundY = null;
    if (store.worldBlocks && store.worldBlocks.size > 0) {
      for (let y = 150; y > 0; y--) if (store.worldBlocks.has(`0_${y}_0`)) { blockGroundY = y; break; }
    }
    // DO NOT consult the physics probe here. `getMobGroundLevel` is a rapier `castRay` that needs
    // streamed ORIGIN COLLIDERS, so whether it answers is a TIMING race — measured across runs it
    // resolved sometimes and not others, and the settle landed at 53.2 / 61.2 / 50.2 on identical code.
    // Different ground source -> different Y -> different BACKDROP -> the frames cannot be baselined.
    // Capture wants DETERMINISM over gameplay-accuracy, so take the pure path every time: it is always
    // available, needs zero physics steps, and cannot vary with machine load. The probe stays the right
    // answer for real gameplay; it is simply the wrong tool for a fixture.
    const probeAvailable = !!store.getMobGroundLevel;
    // NO physicsY: this hook never reads physics, so the diagnostic below names only causes that can occur (the
    // caller prints it as its warning, and a cause that cannot have occurred sends the reader to the wrong
    // subsystem). Passing the literal at the one call site keeps resolveSpawnGround's signature honest about what
    // this hook deliberately does NOT consult.
    // `force` passes the EXHAUSTED fail count so resolveSpawnGround takes its documented
    // SPAWN_FALLBACK_Y branch instead of asking to retry — the same landing the Player reaches after
    // SPAWN_PROBE_MAX_FAILS frames. Without it this hook passed 0 every call, so the retry budget could
    // never be exhausted and it returned false forever: THAT is why two runs logged "never resolved a
    // ground" and then silently agreed on the declared y=100. A retry counter that never counts is not
    // a retry counter.
    // The physics probe CANNOT work under capture, and this is why the settle never resolved:
    // `getMobGroundLevel` is a rapier `world.castRay` (Terrain.jsx), and physics is
    // `paused={isCaptureMode}` — a world that never steps never updates its query pipeline, so the ray
    // hits nothing and returns null forever. That is also why the settle DID resolve before
    // `enterCapture` landed (physics was still live) and never after.
    //
    // So under capture, ask the TERRAIN FORMULA instead of the physics engine: `surfaceBlockAt` uses the same
    // seeded noise as terrain.worker.js (the world's seed, through worldNoise.js) and the same `computeHeight`, so
    // it is the generator's own answer — pure, deterministic, and available with zero physics steps. Far
    // better than SPAWN_FALLBACK_Y=60, which left the beast hovering ~8 units above real ground (~52).
    if (blockGroundY === null) {
      // The settle always places at the ORIGIN, and the origin is the Hearth. `surfaceBlockAt` is the
      // generator's raw grade and its own comment says it IGNORES the Hearth stamp — using it put the
      // player 2 blocks UNDER the stone cap and the capture came back with the dragon buried in terrain,
      // walls either side, lodge roof overhead. (Predicted from the 49-vs-52 gap, then confirmed by
      // opening the image — the formula was right and the ground was not where it said.)
      // `stampHomeAnchor` caps the footprint at HEARTH_Y and clears everything above, so at (0,0) the
      // real walkable surface IS HEARTH_Y. Take the higher of the two so this stays correct if the
      // fixture ever moves off the pad.
      const surf = surfaceBlockAt(0, 0);
      if (surf && Number.isFinite(surf.surfaceY)) {
        const groundY = Math.max(surf.surfaceY, HEARTH_Y);
        const yT = spawnTargetY(groundY);
        rb.setTranslation({ x: 0, y: yT, z: 0 }, true);
        rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
        const vis0 = useGameStore.getState().playerVisualAnchorRef?.current?.parent;
        if (vis0) { vis0.position.set(0, yT, 0); vis0.updateMatrixWorld(true); }
        return { y: +yT.toFixed(2), visual: !!vis0, source: 'terrain-formula+hearth', surfaceY: surf.surfaceY, hearthY: HEARTH_Y };
      }
    }
    const spawn = resolveSpawnGround(blockGroundY, null, force ? SPAWN_PROBE_MAX_FAILS : 0, probeAvailable);
    if (spawn.retry || spawn.groundY == null) {
      // Name the BRANCH, and name only branches that can happen. This hook never consults the physics
      // probe, so no reason here may blame it.
      return {
        retry: true,
        reason: blockGroundY == null && !force
          ? 'no placed block at the origin and the terrain formula gave no finite surface; retrying'
          : 'no ground could be resolved at the origin (placed blocks, terrain formula and fallback all declined)',
        probeAvailable,
        blocks: store.worldBlocks ? store.worldBlocks.size : 0,
      };
    }
    // 'physics-probe' was a third label here that NO path could emit -- a leftover of the probe branch
    // removed by design. A source that can never be reported is a broken instrument in a report whose
    // whole job is to say which source answered.
    const source = blockGroundY != null ? 'placed-blocks' : 'fallback';
    const y = spawnTargetY(spawn.groundY);
    rb.setTranslation({ x: 0, y, z: 0 }, true);
    rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
    // ...and the VISUAL side, which does NOT follow. Physics is paused during capture, so rapier never
    // syncs the RigidBody's Object3D from the body: moving only the physics side leaves the avatar (and
    // therefore the whole backdrop) at its declared transform, framed at y=120 or y=100, never the settled value.
    // A fix that moves one representation and leaves its twin behind is not a fix.
    const visual = useGameStore.getState().playerVisualAnchorRef?.current?.parent;
    if (visual) {
      visual.position.set(0, y, 0);
      visual.updateMatrixWorld(true);
    }
    return { y: +y.toFixed(2), visual: !!visual, source };
  });

  // Re-frame the reveal from WHERE THE AVATAR ACTUALLY RENDERED. Must be called AFTER spawnBeastTransform
  // and after a frame flush, because that is the earliest the group exists.
  //
  // Three framings were tried and two were wrong, so the ordering matters more than it looks:
  //   rb.translation() -> the PHYSICS body. Physics is paused in capture, so rapier never syncs it to the
  //                       visual transform; they measured 120 vs ~100 and the beast sat below frame.
  //   PLAYER_SPAWN     -> the DECLARED transform. Correct only when the group happens to land there; it
  //                       did at load ~5 and did not at load ~17, so beast frames passed and failed with
  //                       no source change at all.
  //   getWorldPosition -> where it IS. The only one that cannot disagree with the render.
  registerTestHook('frameBeastReveal', (element) => {
    const g = useGameStore.getState().beastGroupRef?.current;
    if (!g) return false; // caller decides — a silent fallback here is what hid this for weeks
    const w = g.getWorldPosition(new (Object.getPrototypeOf(g.position).constructor)());
    // The published group sits at FEET_OFFSET below the capsule CENTRE, and the reveal offsets were
    // authored against the CENTRE (ice looks at -0.15, i.e. BELOW its origin — only meaningful from a
    // centre, never from feet). Framing straight off the group put the dragon's head out of frame.
    // Subtracting the offset re-derives the centre WITHOUT re-typing 0.9 anywhere.
    const origin = { x: w.x, y: w.y - FEET_OFFSET, z: w.z };
    enterCaptureMode({ camera: beastRevealCamera(element, origin) });
    return { x: +origin.x.toFixed(2), y: +origin.y.toFixed(2), z: +origin.z.toFixed(2), feet: +w.y.toFixed(2) };
  });

  // Boss-render fixture: a deterministic close-up of the (frozen) Shadow Dragon against a bright sky
  // studio, so the dark obsidian body + emissive telegraph + inverted-hull contour read clearly (a
  // character card, not an in-context danger scene). force-spawn bypasses the level/HP gate; BossEntity
  // freezes in capture.
  registerTestHook('spawnBossCloseup', () => {
    const store = useGameStore.getState();
    store.setHudHidden(true);
    store.setCaptureStudio(true); // sky-studio subject card -> suppress explore-scene motes
    store.setDangerLevel(0);
    store.setTimeOfDay(0.5);
    // Clear leaks: the chest + ALL mobs (the character-closeup zombie at x=0 would otherwise creep
    // into the wider 3/4 frame). ecs.remove IS hook-clearable (the mobShowcase/mobBestiary pattern;
    // the old "the zombie can't be cleared from a hook" note was stale). The boss is a bossSystem
    // entity, not an ECS mob, so this clears the leak without touching the boss.
    useGameStore.setState({ treasureChestsList: [] });
    for (const entity of [...mobsQuery.entities]) ecs.remove(entity);
    const BX = 40, BY = 140, BZ = -8; // sky-studio lane
    if (store.forceBossSpawn) store.forceBossSpawn([BX, BY, BZ]);
    // Front-on (+Z) sky-studio card framing the full body+head+wings + (iter-172) the HORNS (the
    // gate-visible silhouette cue). A 3/4 reveal would also show the tail/back-ridge but its down-tilt
    // catches the distant terrain (clutters the clean sky card), so this stays front-on + level; the
    // tail/ridge read in-world from gameplay angles (validated during the iter-172 3/4 eyeball).
    enterCaptureMode({ camera: { position: [BX + 1.8, BY + 1.2, BZ + 6.5], lookAt: [BX, BY + 0.7, BZ] } });
  });
  // Spell-cast fixture (S1-D-M2): a deterministic, FROZEN fireball cast framed against
  // the sky studio so the spell VFX LOOK is gate-verifiable + eyeball-able for the first
  // time. Capture pauses physics + freezes the magic clock, so the cast holds its placed
  // pose: a rune-circle telegraph at the muzzle, a fireball frozen mid-flight with its
  // velocity-stretch trail, and a SEEDED GPU spark spray + shockwave ring at the impact
  // point (the GPUSparkSystem capture-phase fix renders the spray visibly at uTime=0).
  // Coordinates sit at y~140 (the same sky-studio band as the character/boss close-ups)
  // so the terrain horizon falls out of frame -> a clean backdrop for the VFX read.
  registerTestHook('spawnSpellCast', (spellType = 'fireball') => {
    const store = useGameStore.getState();
    store.setHudHidden(true);
    store.setCaptureStudio(true); // sky-studio subject card -> suppress explore-scene motes
    store.setDangerLevel(0);
    store.setTimeOfDay(0.5); // flattering midday so the additive VFX reads against sky
    useGameStore.setState({ treasureChestsList: [] });
    // A stray character-closeup zombie can sit at (0,140,-8) in the ECS. This fixture doesn't clear it
    // (the sibling boss-closeup DOES, via ecs.remove — mobs ARE hook-clearable); instead it stages the
    // cast far away on +X (the boss-closeup band) where that zombie falls fully off-frame, giving a
    // clean sky backdrop for the VFX read. Origin X used below: 60.
    // Enter capture FIRST (freezes the magic clock + pins the cam) so the injected cast
    // is placed into an already-frozen world and holds a stable pose across runs. Camera:
    // a 3/4 side angle pulled back so the full arc (muzzle -> mid-flight head -> impact
    // spray) fits with the impact spray under ~15% viewport.
    // Sky studio centered far on +X (x=120): clear of BOTH the stray character-closeup
    // zombie (x=0) and the force-spawned boss-closeup dragon (x=40) by >=80 units, so
    // neither leaks into frame. The cast ARC is laid out left->right along the world +X
    // axis (telegraph muzzle on the left, projectile mid-flight at center, impact spray
    // on the right), viewed front-on from +Z and aimed slightly UP so the terrain horizon
    // falls out of frame -> clean sky backdrop. Subjects at y~146 (well above ~y53 terrain).
    const OX = 120, OY = 146, OZ = -8;
    enterCaptureMode({ camera: { position: [OX, OY + 0.6, OZ + 12.5], lookAt: [OX, OY + 1.4, OZ] } });
    if (store.spawnDeterministicCast) {
      store.spawnDeterministicCast({
        spellType,                            // v7-S3.5a: parameterized so capture can cast all 4 elements
        muzzle: [OX - 4.0, OY + 0.6, OZ],     // cast-start rune-circle, left
        projectile: [OX - 0.6, OY + 1.0, OZ], // fireball frozen mid-flight, center
        impact: [OX + 3.8, OY + 1.2, OZ],     // spark spray + shockwave, right
        direction: [1, 0.1, 0],               // travelling left->right (+X), slight rise
      });
    }
  });
  // W2-T5 death-FX LIVE-LOOK fixture: a deterministic sky-studio card of a GREEN zombie being
  // KILLED, so the hue-preserving death burst (a rising green spark soul-burst, NOT a white/black
  // puff), the t=0 hot flash, and the fading ground-ring decal are eyeball-able in one frame.
  // Capture mode pins the camera + freezes clocks: the GPU spark burst renders mid-flight at
  // uTime=0 (the GPUSparkSystem capture-phase fix), the DeathFxRender holds a fixed early-life
  // pose (flash bright, decal mid-expand), and the corpse-removal sweep is frozen (mob AI early-
  // returns in capture) so the dying zombie + its FX stay in-frame. The kill is forced AFTER
  // entering capture so it's injected into an already-frozen world. DEV-only (tree-shaken).
  registerTestHook('killMobShowcase', (opts = {}) => {
    const store = useGameStore.getState();
    store.setHudHidden(true);     // clean studio card: suppress HUD + toasts
    store.setCaptureStudio(true); // sky-studio subject card -> suppress explore-scene motes
    store.setDangerLevel(0);
    // Additive VFX hue READS against a backdrop -- a near-white midday sky desaturates a green
    // additive spark; the dark night sky (the real gameplay context for a kill) lets the green
    // survive. Default to night so the hue-preservation claim is honestly judged; opts.day forces
    // the bright midday card for a contrast read.
    store.setTimeOfDay(opts.day ? 0.5 : 0.0);
    useGameStore.setState({ treasureChestsList: [] });
    // Sky studio centered far on +X (x=160): clear of the character-closeup zombie (x=0), the
    // boss dragon (x=40), the spell-cast (x=120) and the loot row (x=80) by >=40 units.
    const MX = 160, MY = 146, MZ = -8;
    // Clear any stray mobs, then spawn the hero green zombie at the studio spot.
    for (const e of [...mobsQuery.entities]) ecs.remove(e);
    if (store.spawnMob) store.spawnMob(MX, MZ, 'zombie', MY);
    // Enter capture (pins cam + freezes clocks) BEFORE the kill so the FX is frozen mid-burst.
    // 3/4 side angle, pulled back + aimed slightly UP so the rising spark burst (vy up to ~11)
    // fits and the terrain horizon stays out of frame -> clean sky backdrop for the additive read.
    enterCaptureMode({ camera: { position: [MX + 1.6, MY + 1.8, MZ + 4.2], lookAt: [MX, MY + 1.2, MZ] } });
    // Force the lethal hit (massive damage) on the just-spawned zombie -> fires the death path
    // (hue-preserving GPU spark burst + spawnDeathFx flash + ground decal). source 'player' so the
    // full finisher path runs. The mob group sits at world y=MY+0.5; the burst centre is +0.8 above.
    const z = mobsQuery.entities.find((e) => e.type === 'zombie' && Math.abs(e.position.x - MX) < 1);
    if (z && GameMethods.damageMob) GameMethods.damageMob(z.id, 9999, 'physical', 'player');
  });
  // Loot-showcase fixture (S2-A-M4b / M3c eyeball gap): a deterministic sky-studio card
  // showing FOUR loot drops -- one per rarity (common/rare/epic/legendary) -- laid out
  // left->right so all four rarity BEAMS stand side by side, ascending in height + bright-
  // ness (common short/dim -> legendary tall/bright, per lootJuice.rarityBeam). Capture mode
  // freezes the loot bob/spin + the LootSystem physics/magnet/collection loop (see
  // SimplifiedNPCSystem), so each drop holds its exact spawn pose -> the frame is byte-stable.
  // Positions are fixed (no RNG). Coordinates sit at y~146 (the same sky-studio band as the
  // character/boss/spell-cast close-ups) so the terrain horizon falls out of frame -> a clean
  // sky backdrop that showcases the additive beams. DEV-only (tree-shaken from prod).
  registerTestHook('lootShowcase', () => {
    const store = useGameStore.getState();
    store.setHudHidden(true);     // clean studio card: suppress HUD + toasts
    store.setCaptureStudio(true); // sky-studio subject card -> suppress explore-scene motes
    store.setDangerLevel(0);
    store.setTimeOfDay(0.5);      // flattering midday so the additive beams read against sky
    useGameStore.setState({ treasureChestsList: [] }); // clear any close-up chest leak
    // Sky studio centered far on +X (x=80): clear of the stray character-closeup zombie (x=0),
    // the boss-closeup dragon (x=40) and the spell-cast (x=120) by >=40 units, so none leak in.
    // spawnLootDrop adds +0.3 to the given Y; the four drops sit on a level line at world
    // y~OY+0.3, spaced 2.4 units apart along +X so the beams (tallest = legendary 4.2 tall)
    // stand clearly separated. Order low->high left->right so beam heights ascend across frame.
    const OX = 80, OY = 146, OZ = -8, GAP = 2.4;
    // Enter capture FIRST (pins the camera + freezes clocks) so the drops are injected into an
    // already-frozen world. Camera: front-on from +Z, pulled back ~13 units and aimed slightly
    // UP (lookAt above the drop line) so the full beam stack fits and the terrain horizon stays
    // out of frame. Centered on the middle of the four-drop row (between epic + the rare/epic mid).
    const CX = OX + GAP * 1.5; // row center (between the 2nd and 3rd drop)
    enterCaptureMode({ camera: { position: [CX, OY + 2.2, OZ + 13.0], lookAt: [CX, OY + 2.4, OZ] } });
    // spawnLootDrop lives on the shared GameMethods singleton (assigned at NPCSystem import
    // time, available immediately -- the same imperative-method registry the loot/XP loops use).
    if (GameMethods.spawnLootDrop) {
      // One drop per rarity, representative items from src/data/items.js whose getItemRarity
      // matches: bone=common, health_potion=rare, emerald=epic, diamond_gem=legendary.
      const drops = [
        ['bone', OX + GAP * 0],          // common    (beam 1.6)
        ['health_potion', OX + GAP * 1], // rare      (beam 2.4)
        ['emerald', OX + GAP * 2],       // epic      (beam 3.2)
        ['diamond_gem', OX + GAP * 3],   // legendary (beam 4.2)
      ];
      for (const [item, x] of drops) {
        GameMethods.spawnLootDrop(item, 0, [x, OY, OZ]);
      }
    }
  });
  // MOB-VARIETY showcase: three mob types judged in a row at lane x=240.
  // Raw hostile spawns via store.spawnMob with explicitY (faces +Z toward the camera —
  // the proven creature-card path); no capture/ally conversion needed. DEV-only.
  registerTestHook('mobShowcase', () => {
    const store = useGameStore.getState();
    store.setHudHidden(true);
    store.setCaptureStudio(true);
    store.setDangerLevel(0);
    store.setTimeOfDay(0.5);
    const OX = 240, OY = 146, OZ = -8, GAP = 5;
    for (const entity of [...mobsQuery.entities]) ecs.remove(entity);
    enterCaptureMode({ camera: { position: [OX, OY + 1.8, OZ + 14], lookAt: [OX, OY + 1, OZ] } });
    ['skitterling', 'duskhound', 'moss_brute'].forEach((type, i) => {
      if (store.spawnMob) store.spawnMob(OX + (i - 1) * GAP, OZ, type, OY - 0.5);
    });
  });
  // MOB-BESTIARY fixture (mob-distinctness milestone T2): the FEATURED mob types in a studio row,
  // left->right, so each species' silhouette is judged in ONE frame (the T3 eyeball surface). Sky-
  // studio lane x=280 (next free slot, clear of the other cards by >=40u). Self-clears mobs first +
  // stages off-frame from every other fixture camera, so it is order-independent. DEV-only.
  registerTestHook('mobBestiary', () => {
    const store = useGameStore.getState();
    store.setHudHidden(true);
    store.setCaptureStudio(true);
    store.setDangerLevel(0);
    store.setTimeOfDay(0.5);
    const OX = 280, OY = 146, OZ = -8, GAP = 4.2;
    for (const entity of [...mobsQuery.entities]) ecs.remove(entity);
    // Pulled back to fit 6 subjects (incl. the 2.0-tall moss_brute); front-on (+Z), the proven card path.
    enterCaptureMode({ camera: { position: [OX, OY + 2.2, OZ + 20], lookAt: [OX, OY + 0.9, OZ] } });
    ['skitterling', 'duskhound', 'skeleton', 'emberhusk', 'cow', 'moss_brute'].forEach((type, i) => {
      if (store.spawnMob) store.spawnMob(OX + (i - 2.5) * GAP, OZ, type, OY - 0.5);
    });
  });
  // ELEMANCER-showcase fixture (S2-B4-M6): the four element ZONES judged in a row.
  // Sky-studio lane x=200 (the next 40u slot). The bridge is capture-gated so the live
  // registry stays empty in every NORMAL capture; THIS hook injects zones directly via
  // spawnZone -- the UN-gated renderer (the M6 capture stance: gate the LOGIC, not the
  // RENDER) draws them with the breathing pulse frozen at now=0. Order puts RESONANT
  // LAST so the rune can't amplify a neighbor (GAP 7 > every interaction radius).
  // Ground rings need declination: the camera looks down ~28 degrees. DEV-only.
  registerTestHook('elemancerShowcase', () => {
    const store = useGameStore.getState();
    store.setHudHidden(true);
    store.setCaptureStudio(true);
    store.setDangerLevel(0);
    store.setTimeOfDay(0.5);
    const OX = 200, OY = 146, OZ = -8, GAP = 7;
    for (const entity of [...mobsQuery.entities]) ecs.remove(entity);
    enterCaptureMode({ camera: { position: [OX, OY + 7, OZ + 13], lookAt: [OX, OY, OZ] } });
    const reg = getLiveZones();
    clearZones(reg);
    const kinds = ['burning', 'frozen', 'conductive', 'resonant'];
    kinds.forEach((kind, i) => {
      spawnZone(reg, { kind, pos: { x: OX + (i - 1.5) * GAP, y: OY, z: OZ } }, 0);
    });
  });
  // SOULBIND-showcase fixture (S2-B3-M7): the deterministic creature-judge card the M4-M6
  // look-debt forensics proved missing. Sky-studio lane x=160 (clear of character 0 / boss 40 /
  // loot 80 / spell 120 by >=40u). Five subjects left->right: jade-tinted spider ally, zombie
  // ally, then the 3 hybrids (dreadweaver / bonehide_bulwark / marrowspinner) — silhouette
  // distinctness reads across the row. (The snare tether intentionally absent: it hides under
  // capture by design; its judge rides Kevin's live playtest.) DEV-only (tree-shaken from prod).
  registerTestHook('soulbindShowcase', () => {
    const store = useGameStore.getState();
    store.setHudHidden(true);
    store.setCaptureStudio(true);
    store.setDangerLevel(0);
    store.setTimeOfDay(0.5);
    const OX = 160, OY = 146, OZ = -8, GAP = 3.2;
    // THE REAL PIPELINE (iter-57): subjects come from store.spawnMob (THE position contract —
    // a THREE.Vector3; plain {x,y,z} leaves MobModel's mesh stranded at the origin, the root
    // cause of the empty iter-56 cards) then GameMethods.captureMob (the M3 seam) + the jade
    // tint — exactly what live SNARE does. Hybrids = applyFusion of two such captures (the
    // live FUSE path; its Vector3 fix landed with this fixture).
    // clear the live mob population FIRST (the spawnCharacterCloseup :237 precedent) — the
    // spawner refuses past the siege cap, which silently dropped subjects from the iter-57 card.
    for (const entity of [...mobsQuery.entities]) ecs.remove(entity);
    const slotX = (i) => OX + (i - 2) * GAP;
    window.__showcaseDebug = [];
    const grab = (type, x) => {
      if (!store.spawnMob || !GameMethods.captureMob) return null;
      const ok = store.spawnMob(x, OZ, type, OY - 0.5); // spawnMob adds +0.5
      const mob = [...mobsQuery.entities].reverse().find((e) => e.type === type && Math.abs(e.position.x - x) < 0.1);
      if (!mob) { window.__showcaseDebug.push(['spawn-miss', type, x, ok]); return null; }
      const ally = GameMethods.captureMob(mob.id);
      if (!ally) window.__showcaseDebug.push(['capture-miss', type, x]);
      return ally || null;
    };
    const tint = (e, c) => { if (e) e.color = c; };
    tint(grab('spider', slotX(0)), '#2F8F5F');
    tint(grab('zombie', slotX(1)), '#3DAF70');
    // the 3 hybrids: spawn+capture each base pair AT the hybrid's slot, then fuse in place
    const pairs = [['spider', 'zombie'], ['cow', 'skeleton'], ['skeleton', 'spider']];
    pairs.forEach((pr, j) => {
      const x = slotX(2 + j);
      const a = grab(pr[0], x - 0.6);
      const b = grab(pr[1], x + 0.6);
      const hy = (a && b) ? applyFusion(ecs, a, b) : null;
      if (!hy) window.__showcaseDebug.push(['fuse-miss', pr.join('+'), !!a, !!b]);
    });
    // camera: front-on from +Z (the lootShowcase framing), centered on the 5-subject row,
    // pulled back ~14u so the Bulwark (the widest) fits with air on both sides.
    enterCaptureMode({ camera: { position: [OX, OY + 1.6, OZ + 14.0], lookAt: [OX, OY + 1.0, OZ] } });
  });
  // Primitives-showcase fixture: drives the locale, shows the DEV gallery overlay,
  // and (for zh-CN) loads CJK fonts. A caller screenshotting it waits for
  // document.fonts.ready, or the frame shows the pre-swap font.
  registerTestHook('showPrimitivesShowcase', (locale = 'en') => {
    const store = useGameStore.getState();
    store.setHudHidden(true);
    store.setLocale(locale);          // zh-CN triggers the lazy CJK load (async)
    store.setShowcaseView(true);
  });
  registerTestHook('exitCapture', () => {
    exitCaptureMode();
    useGameStore.getState().setCaptureMode(false);
    useGameStore.getState().setHudHidden(false);
    useGameStore.getState().setCaptureStudio(false); // leaving capture -> motes return
  });
  // Open a modal (inventory/the Forge) for the visual gate. DEV-only. The panels are a lazy chunk now, so this
  // WAITS for it first (page.evaluate awaits the promise): a capture must never shoot the empty Suspense frame.
  registerTestHook('openModal', async (which = 'inventory') => {
    await loadPanels();
    const store = useGameStore.getState();
    store.setCaptureStudio(false); // modal OVER the explore world is an in-world frame -> motes on
    if (which === 'inventory') store.setShowInventory(true);
    else if (which === 'forge') store.setShowForge(true);
    else if (which === 'settings') store.setShowSettings(true);
    else if (which === 'credits') store.setShowCredits(true);
    // #51 S2: the progression panel (the Talents page). showSpellUpgrades is a useState setter
    // in the input-manager hook (not the store), so drive it directly like openAchievements below.
    // Close the sibling panels first so the captured frame is a clean progression panel.
    else if (which === 'spellUpgrades') { store.setShowInventory?.(false); setShowAchievements?.(false); setShowSpellUpgrades(true); }
  });
  // Open the Achievements panel for the visual gate. DEV-only. `showAchievements`
  // is useState inside useInputManager (not the store), so we drive the local
  // setter directly. useState setters are identity-stable, so capturing it in
  // this []-dep effect is safe.
  registerTestHook('openAchievements', () => {
    useGameStore.getState().setCaptureStudio(false); // panel OVER the explore world -> motes on
    setShowAchievements?.(true);
  });
  installTestBridge();
}
