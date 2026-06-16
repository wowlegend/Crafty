import { useShallow } from 'zustand/react/shallow';
import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import './App.css';
import { AuthProvider, useAuth } from './AuthContext';
import { SoundProvider, useSounds, useGameSounds } from './SoundManager';
import { useSimpleExperience } from './SimpleExperienceSystem';
import { GameSystemsProvider, useGameSystems } from './GameSystems';
import { useGameStore } from './store/useGameStore';
import { useQuestSystem, useTreasureChests } from './QuestSystem';
import { useBossSystem } from './world/bossSystem';
import { usePetSystem } from './world/petSystem';
import { useSpellUpgrades } from './world/spellUpgrades';
import { useSurvivalMode } from './world/survivalSystem';
import { useFerocityAccrual, useKineticAccrual, useSoulAccrual } from './world/accrualHooks';

import { HUD } from './HUD';
import { useInputManager } from './InputManager';
import { setActive, getInput } from './input/inputState';
import { useActiveInput } from './input/useActiveInput';
import TouchControls from './ui/TouchControls';
import { isTouchDevice } from './input/touchDevice';
import { GameScene } from './GameScene';
import { MenuSystem } from './MenuSystem';
import { DebugOverlay } from './ui/DebugOverlay';
import { installTestBridge, registerTestHook } from './devtest/testBridge.js';
import { enterCaptureMode, exitCaptureMode } from './devtest/captureMode.js';
import { PerfProbeRunner } from './devtest/PerfProbeRunner';
import { ecs, mobsQuery } from './ecs/world';
import { applyFusion } from './game/hybrids';
import { getLiveZones } from './world/ElementZoneSystem';
import { spawnZone, clearZones } from './game/elementZones';
import { GameMethods } from './GameMethods';
import { selectTier, readDeviceSignals } from './render/quality';
import { createAutosave } from './game/autosave';
import { useDayNightClock } from './game/useDayNightClock';
import { isAnyPanelOpen } from './ui/panelState.js';

// DEV-only lazy import: in prod `import.meta.env.DEV` is statically false, so the
// whole PrimitivesShowcase subtree (incl. showcase-scene.png + baked game-icons)
// is tree-shaken out of the production bundle.
const PrimitivesShowcase = import.meta.env.DEV
  ? lazy(() => import('./ui/PrimitivesShowcase').then((m) => ({ default: m.PrimitivesShowcase })))
  : () => null;

// DEV-only mascot studio overlay (S1-D-M4): renders the chosen "Crafty Hero" brand face
// via the `showMascot` test hook (used to capture the `title-mascot` review frame). Lazy +
// DEV-gated so the whole subtree tree-shakes out of prod builds.
const MascotStudio = import.meta.env.DEV
  ? lazy(() => import('./render/mascots/MascotStudio').then((m) => ({ default: m.MascotStudio })))
  : () => null;

function App() {
  return (
    <AuthProvider>
      <SoundProvider>
        <GameAppWrapper />
      </SoundProvider>
    </AuthProvider>
  );
}

function GameAppWrapper() {
  const experienceSystem = useSimpleExperience();
  return (
    <GameSystemsProvider>
      <GameApp experienceSystem={experienceSystem} />
    </GameSystemsProvider>
  );
}

function GameApp({ experienceSystem }) {
  const gameState = useGameStore(useShallow(state => ({
        isSpawnChunkLoaded: state.isSpawnChunkLoaded,
        isDay: state.isDay,
        isAlive: state.isAlive,
        inventory: state.inventory,
        addToInventory: state.addToInventory,
        removeFromInventory: state.removeFromInventory,
        setShowInventory: state.setShowInventory,
        setShowCrafting: state.setShowCrafting,
        setShowMagic: state.setShowMagic,
        setShowBuildingTools: state.setShowBuildingTools,
        setShowSettings: state.setShowSettings,
        setShowTradingInterface: state.setShowTradingInterface,
        showInventory: state.showInventory,
        showCrafting: state.showCrafting,
        showMagic: state.showMagic,
        showBuildingTools: state.showBuildingTools,
        showSettings: state.showSettings,
        showTradingInterface: state.showTradingInterface,
        showWorldManager: state.showWorldManager,
        setShowWorldManager: state.setShowWorldManager,
        selectedVillager: state.selectedVillager,
        loadWorldData: state.loadWorldData,
        selectedBlock: state.selectedBlock,
        activeSpell: state.activeSpell,
        setActiveSpell: state.setActiveSpell
    })));
  // Capture-only HUD suppression (character-studio shots). Default false in gameplay.
  const hudHidden = useGameStore(s => s.hudHidden);
  const showcaseView = useGameStore(s => s.showcaseView);
  const { isAuthenticated, loading } = useAuth();
  const { musicEnabled, playBackgroundMusic, resumeAudio } = useSounds();
  const { playAttack, playSwing, playHit, playDefeat, playLevelUpSound, playFanfare, playVictory, playCraft } = useGameSounds();

  // Reward-beat sound bridge: the codebase triggers reward sounds via window.* globals
  // (SimpleExperienceSystem's window.playLevelUpSound, QuestSystem's window.playFanfare), but nothing
  // assigned them -> level-up was SILENT (dead reference). Set them here from the live sound API. Null in
  // capture/headless (playSound no-ops without an AudioContext), so this is capture-safe.
  useEffect(() => {
    window.playLevelUpSound = playLevelUpSound;
    window.playFanfare = playFanfare;
    window.playVictory = playVictory; // the climax sting, fired on VictoryOverlay mount
    window.playCraft = playCraft;     // crafting was silent (dead voice, zero callers) -> wire it to doCraft
  }, [playLevelUpSound, playFanfare, playVictory, playCraft]);

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isWorldBuilt, setIsWorldBuilt] = useState(false);
  // DEV-only mascot studio overlay: false = hidden, true = the chosen Crafty Hero brand
  // face. Driven by the `showMascot` test hook (visual harness). No-op in prod.
  const [showMascotStudio, setShowMascotStudio] = useState(false);

  useEffect(() => {
    if (gameState.isSpawnChunkLoaded && !isWorldBuilt) {
      setIsWorldBuilt(true);
      // First-session onboarding (broad-audience legibility): the title screen teaches the KEYS; this
      // teaches the GOAL LOOP in-world, ONCE (localStorage flag) — a brand-new player otherwise spawns
      // with no sense of the day-build / night-survive objective. Capture-SUPPRESSED (no toast in the
      // gated frames) + null-safe (addNotification is bridged by QuestSystem once it mounts).
      if (!useGameStore.getState().isCaptureMode) {
        try {
          if (!localStorage.getItem('crafty_onboarded')) {
            localStorage.setItem('crafty_onboarded', '1');
            setTimeout(() => {
              const add = useGameStore.getState().addNotification;
              if (add) add('Build by day, survive the night siege — defeat foes to unlock powerful Aspect abilities.', 'info');
            }, 1600);
            // S10: name the CAMPAIGN goal once (after the loop toast) so a new player knows the point. The
            // compass already shows the SHRINE + BLIGHT HEART markers this references. Capture-safe (inside
            // the !isCaptureMode + localStorage-once guard).
            setTimeout(() => {
              const add2 = useGameStore.getState().addNotification;
              if (add2) add2('Your goal: journey to the frontier shrines, then shatter the Blight Heart at the world\'s edge — follow the compass.', 'quest');
            }, 8600);
          }
        } catch (e) { /* localStorage blocked -> skip onboarding (non-fatal) */ }
      }
      setTimeout(() => {
        const state = useGameStore.getState();
        // Dev capture mode: keep the menu overlay visible by NOT auto-locking the pointer;
        // the harness drives the menu->explore transition explicitly via the `start` hook.
        if (state.isCaptureMode) return;
        if (state.requestPointerLock) {
          state.requestPointerLock();
        } else {
          const canvas = document.querySelector('canvas');
          if (canvas && canvas.requestPointerLock) {
            canvas.requestPointerLock();
          } else if (document.body.requestPointerLock) {
            document.body.requestPointerLock().catch(e => console.warn('Auto-lock failed:', e));
          }
        }
      }, 100);
    }
  }, [gameState.isSpawnChunkLoaded, isWorldBuilt]);

  const gameSystems = useGameSystems();
  // Day/night CLOCK ticker (M3a): advances gameTime over real time so the cycle
  // runs. Coarse 1s setInterval (Game-Loop Isolation -- NOT useFrame); pauses in
  // menus / at click-to-play / on death / during visual capture.
  useDayNightClock({ isWorldBuilt, isAlive: gameSystems?.isAlive });
  const questSystem = useQuestSystem();
  const treasureChests = useTreasureChests();
  const survivalMode = useSurvivalMode(gameState.isDay);
  useFerocityAccrual(); // S2-B1-M4: subscribe the kill-bus -> bank Ferocity on day kills
  useKineticAccrual(); // S2-B2-M4: twin — bank Kinetic on day kills (spent per combat grab)
  useSoulAccrual(); // S2-B3-M2: twin — bank Soul on day kills (spent per bind/fuse)
  const bossSystem = useBossSystem(experienceSystem.playerLevel);
  const petSystem = usePetSystem();
  const spellUpgrades = useSpellUpgrades();

  const {
    showStats, setShowStats,
    showAchievements, setShowAchievements,
    showSpellUpgrades, setShowSpellUpgrades
  } = useInputManager(gameState, gameSystems, questSystem);

  // Reactive projection of inputState.active (the single pointer-lock/active SoT).
  // active changes only on a rare pointer-lock enter/exit gesture (NOT per-frame),
  // so this useSyncExternalStore subscription is SAFE under Game-Loop Isolation.
  const isPointerLocked = useActiveInput();

  // KEVIN-FIX C5: ESC = PAUSE. While locked the browser CONSUMES the Escape keydown (only
  // the lock-change event arrives), so the old keydown-driven settings branch was
  // unreachable in the very state it targeted — ESC dumped players on the title menu
  // instead. The pause menu now opens on the active true->false TRANSITION, here in App
  // where ALL panel flags (store + the 4 React-local) are visible: a panel-open unlock is
  // suppressed (the flag is set before the lock exits), death is suppressed (the
  // DeathScreen owns it), pre-game is suppressed (gameStarted).
  const prevLockedRef = useRef(false);
  useEffect(() => {
    const was = prevLockedRef.current;
    prevLockedRef.current = isPointerLocked;
    if (was && !isPointerLocked) {
      const s = useGameStore.getState();
      if (!isTouchDevice() && s.isAlive && s.gameStarted &&
          !isAnyPanelOpen({ ...s, showSpellUpgrades, showAchievements, showStats, showAuthModal })) {
        s.setShowSettings(true);
      }
    }
  }, [isPointerLocked, showSpellUpgrades, showAchievements, showStats, showAuthModal]);

  // Select the device quality tier once at startup (runs in prod + dev).
  useEffect(() => {
    useGameStore.getState().setQualityTier(selectTier(readDeviceSignals()));
  }, []);

  // Local-first autosave: debounce on progression/world TRANSITIONS, flush on tab-hide/close.
  useEffect(() => {
    const autosave = createAutosave({
      save: () => {
        const st = useGameStore.getState();
        if (st.isCaptureMode) return;
        const rb = st.playerRigidBodyRef && st.playerRigidBodyRef.current;
        const t = rb && rb.translation ? rb.translation() : null;
        st.saveActiveWorld(t ? { x: t.x, y: t.y, z: t.z } : st.playerPosition);
      },
      delayMs: 5000,
    });
    // zustand v5 vanilla subscribe gives (state, prevState). Schedule only when a TRANSITION
    // key changes — NOT on the per-frame playerPosition writes (which also pass through here).
    const unsub = useGameStore.subscribe((s, prevS) => {
      if (
        s.level !== prevS.level ||
        s.equipment !== prevS.equipment ||
        s.chests !== prevS.chests ||
        s.talentPoints !== prevS.talentPoints ||
        s.gameMode !== prevS.gameMode ||
        s.worldBlocks !== prevS.worldBlocks ||
        s.inventory !== prevS.inventory ||
        s.questState !== prevS.questState ||
        s.ferocityBanked !== prevS.ferocityBanked || // S2-B1-M4: a day-banked roar survives a tab-close
        s.kineticBanked !== prevS.kineticBanked || // S2-B2-M4: a day-banked kinetic charge survives a tab-close
        s.soulBanked !== prevS.soulBanked || // S2-B3-M2: twin
        s.resonanceBanked !== prevS.resonanceBanked // S2-B4-M2: twin
      ) {
        autosave.schedule();
      }
    });
    const onVisibility = () => { if (document.visibilityState === 'hidden') autosave.flush(); };
    const onUnload = () => autosave.flush();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      unsub();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onUnload);
      autosave.cancel();
    };
  }, []);

  // Dev-only test bridge: lets the visual-regression harness drive the running
  // game into known states (leave the menu, force day/night). No-op in prod.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
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
    // `setTimeOfDay` writes the same `isDay` state the day/night cycle reads.
    registerTestHook('setTimeOfDay', (t) => useGameStore.getState().setTimeOfDay(t));
    // `enterCapture` flips the visual-regression capture-determinism layer ON: seeded
    // decorative RNG, paused physics, pinned follow-cam, suppressed mob spawns. Optional
    // { timeOfDay } pins the lighting in the same call. No-op in prod (bridge tree-shaken).
    registerTestHook('enterCapture', (opts = {}) => {
      enterCaptureMode(opts);
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
    // Boss-render fixture: a deterministic close-up of the (frozen) Shadow Dragon
    // against a bright sky studio, so the dark obsidian body + emissive telegraph +
    // inverted-hull contour read clearly (a character card, not an in-context danger
    // scene). force-spawn bypasses the level/HP gate; BossEntity freezes in capture.
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
      const rb = store.playerRigidBodyRef?.current;
      const t = rb ? rb.translation() : { x: 0, y: 55, z: 0 };
      // per-beast 3/4-side reveal framing (the big DRAGON gets a CLOSER, looming angle).
      const CAMS = {
        fire:      { position: [t.x + 1.7, t.y + 1.45, t.z + 2.8], lookAt: [t.x, t.y + 0.55, t.z] }, // DRAGON — close + looming
        ice:       { position: [t.x + 2.1, t.y + 0.8, t.z + 3.0], lookAt: [t.x, t.y - 0.15, t.z] },  // low wide bull
        lightning: { position: [t.x + 2.1, t.y + 1.1, t.z + 3.2], lookAt: [t.x, t.y + 0.2, t.z] },   // tall raptor
        arcane:    { position: [t.x + 2.1, t.y + 1.2, t.z + 3.2], lookAt: [t.x, t.y + 0.3, t.z] },    // tall golem
      };
      enterCaptureMode({ camera: CAMS[element] || CAMS.fire });
    });

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
    registerTestHook('spawnSpellCast', () => {
      const store = useGameStore.getState();
      store.setHudHidden(true);
      store.setCaptureStudio(true); // sky-studio subject card -> suppress explore-scene motes
      store.setDangerLevel(0);
      store.setTimeOfDay(0.5); // flattering midday so the additive VFX reads against sky
      useGameStore.setState({ treasureChestsList: [] });
      // The character-closeup zombie lives at (0,140,-8) in the ECS and CANNOT be cleared
      // from a hook (same constraint boss-closeup documents). So we stage the cast far
      // away on +X (the boss-closeup band) where that stray zombie falls fully off-frame,
      // giving a clean sky backdrop for the VFX read. Origin X used below: 60.
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
          spellType: 'fireball',
          muzzle: [OX - 4.0, OY + 0.6, OZ],     // cast-start rune-circle, left
          projectile: [OX - 0.6, OY + 1.0, OZ], // fireball frozen mid-flight, center
          impact: [OX + 3.8, OY + 1.2, OZ],     // spark spray + shockwave, right
          direction: [1, 0.1, 0],               // travelling left->right (+X), slight rise
        });
      }
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
    // MOB-VARIETY showcase (2026-06-11): the three new types judged in a row at lane x=240.
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
    // and (for zh-CN) loads CJK fonts. The capture script waits for document.fonts.ready
    // before screenshotting so the font swap is fully painted.
    registerTestHook('showPrimitivesShowcase', (locale = 'en') => {
      const store = useGameStore.getState();
      store.setHudHidden(true);
      store.setLocale(locale);          // zh-CN triggers the lazy CJK load (async)
      store.setShowcaseView(true);
    });
    // Mascot-studio fixture (S1-D-M4): mount the standalone mascot studio overlay rendering
    // the chosen "Crafty Hero" brand face. Enters capture mode so the idle animation is
    // frozen and the frame renders byte-stable, and hides the HUD so the overlay is clean.
    // The studio has its OWN Canvas/camera/lighting, so it renders identically regardless
    // of the gameplay scene state behind it. DEV-only (tree-shaken from prod). The `variant`
    // arg is ignored now (A/C pruned) but accepted for back-compat with the capture loop.
    registerTestHook('showMascot', () => {
      const store = useGameStore.getState();
      store.setHudHidden(true);
      enterCaptureMode();
      store.setCaptureMode(true);
      store.setQualityTier('high');
      setShowMascotStudio(true);
    });
    registerTestHook('exitCapture', () => {
      exitCaptureMode();
      useGameStore.getState().setCaptureMode(false);
      useGameStore.getState().setHudHidden(false);
      useGameStore.getState().setCaptureStudio(false); // leaving capture -> motes return
    });
    // Open a modal (inventory/crafting) for the visual gate. DEV-only.
    registerTestHook('openModal', (which = 'inventory') => {
      const store = useGameStore.getState();
      store.setCaptureStudio(false); // modal OVER the explore world is an in-world frame -> motes on
      if (which === 'inventory') store.setShowInventory(true);
      else if (which === 'crafting') store.setShowCrafting(true);
      else if (which === 'settings') store.setShowSettings(true);
      else if (which === 'credits') store.setShowCredits(true);
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
  }, []);

  // SINGLE canonical panel set (panelState.js) — was a 4th hand-kept list (missing showCredits/showStats);
  // the click-to-play overlay gates on it just like the title menu + the key handlers.
  const anyPanelOpen = isAnyPanelOpen({ ...gameState, showAchievements, showSpellUpgrades, showStats, showAuthModal });

  const showClickToPlay = isWorldBuilt && !isPointerLocked && !anyPanelOpen && (gameSystems?.isAlive !== false);

  useEffect(() => {
    const handleResizeError = (e) => {
      if (e.message === 'ResizeObserver loop limit exceeded' ||
        e.message === 'ResizeObserver loop completed with undelivered notifications.') {
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener('error', handleResizeError);
    return () => window.removeEventListener('error', handleResizeError);
  }, []);

  useEffect(() => {
    useGameStore.setState({ playAttackSounds: () => {
      playSwing();
      setTimeout(() => playAttack(), 100);
    }});
    useGameStore.setState({ playHitSound: playHit });
    useGameStore.setState({ playDefeatSound: playDefeat });
  }, [playAttack, playSwing, playHit, playDefeat]);

  useEffect(() => {
    const handleContextMenu = (e) => {
      if (getInput().active) {
        e.preventDefault();
      }
    };
    document.addEventListener('contextmenu', handleContextMenu);
    return () => document.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  useEffect(() => {
    if (isPointerLocked) {
      // Resume the audio ctx on the entry gesture regardless of music -> SFX work even with music off
      // (the music-start path resumes too but early-returns when music is disabled). Idempotent.
      resumeAudio();
      if (musicEnabled) playBackgroundMusic();
    }
  }, [isPointerLocked, musicEnabled, playBackgroundMusic, resumeAudio]);

  if (loading) {
    return (
      <div className="w-full h-screen bg-gradient-to-b from-blue-400 to-blue-600 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-xl">Loading Crafty...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full h-screen bg-gradient-to-b from-blue-400 to-blue-600 overflow-hidden relative"
      style={{ width: '100vw', height: '100vh', position: 'fixed', top: 0, left: 0 }}
    >
      <GameScene
        gameState={gameState}
        isWorldBuilt={isWorldBuilt}
        bossSystem={bossSystem}
        petSystem={petSystem}
        showStats={showStats}
        showAchievements={showAchievements}
        showSpellUpgrades={showSpellUpgrades}
        showAuthModal={showAuthModal}
      />

      {/* S2-B2-M2 perf probe (dev-only, self-nulls unless ?perf=A..E) — DOM layer, outside the Canvas */}
      {import.meta.env.DEV && <PerfProbeRunner />}

      {!isWorldBuilt && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm pointer-events-auto">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-green-500 mb-6 shadow-lg shadow-green-500/50"></div>
          <h2 className="text-3xl font-bold text-white mb-2 font-mono tracking-widest" style={{ textShadow: '0 0 10px rgba(74, 222, 128, 0.8)' }}>
            GENERATING WORLD
          </h2>
          <p className="text-green-400 font-mono text-sm animate-pulse">Building Terrain and Physics Colliders...</p>
        </div>
      )}

      {showClickToPlay && (
        <div 
          onClick={() => {
            const state = useGameStore.getState();
            if (state.requestPointerLock) {
              state.requestPointerLock();
            } else {
              const canvas = document.querySelector('canvas');
              if (canvas && canvas.requestPointerLock) {
                canvas.requestPointerLock();
              } else if (document.body.requestPointerLock) {
                document.body.requestPointerLock();
              }
            }
          }}
          className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-slate-950/60 backdrop-blur-md cursor-pointer transition-all duration-300 hover:bg-slate-950/50 pointer-events-auto"
        >
          <div className="max-w-md p-8 rounded-2xl bg-slate-900/80 border border-slate-700/50 shadow-2xl flex flex-col items-center justify-center text-center transform scale-100 transition-transform duration-300 hover:scale-105" style={{ boxShadow: '0 0 40px rgba(59, 130, 246, 0.15)' }}>
            <div className="w-20 h-20 rounded-full bg-blue-500/20 border border-blue-500/50 flex items-center justify-center mb-6 animate-pulse" style={{ boxShadow: '0 0 20px rgba(59, 130, 246, 0.4)' }}>
              <svg className="w-8 h-8 text-blue-400 fill-current translate-x-0.5" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            
            <h1 className="text-3xl font-extrabold text-white mb-2 tracking-wide font-sans bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-indigo-200 to-blue-400">
              CRAFTY RPG
            </h1>
            <p className="text-slate-300 mb-6 text-sm">
              Click anywhere on the screen to capture mouse and resume gameplay
            </p>

            <div className="w-full border-t border-slate-800 my-4"></div>

            <div className="w-full text-left space-y-2.5 mt-2">
              <h3 className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-1.5 font-mono">Quick Controls</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-mono text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700/60 shadow-sm">W A S D</span>
                  <span>Move</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700/60 shadow-sm">Left-Click</span>
                  <span>Melee Attack</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700/60 shadow-sm">Right-Click</span>
                  <span>Cast Active Spell</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700/60 shadow-sm">1-4</span>
                  <span>Select Spells</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700/60 shadow-sm">E / C / B</span>
                  <span>Inventory / Craft / Build</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700/60 shadow-sm">G</span>
                  <span>Interact (NPC/Chest)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700/60 shadow-sm">Tab</span>
                  <span>Quests & Achievements</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700/60 shadow-sm">U</span>
                  <span>Upgrade Spells</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* setIsPointerLocked prop on HUD + MenuSystem is wired to setActive — the
          OPTIMISTIC active writer (the prop NAME is kept to avoid churn in those
          components). Components.jsx's pointerlock listener is the AUTHORITATIVE
          active writer (the single source of truth). */}
      {!hudHidden && (
        <HUD
          isPointerLocked={isPointerLocked}
          isWorldBuilt={isWorldBuilt}
          gameState={gameState}
          gameSystems={gameSystems}
          experienceSystem={experienceSystem}
          questSystem={questSystem}
          treasureChests={treasureChests}
          survivalMode={survivalMode}
          bossSystem={bossSystem}
          petSystem={petSystem}
          spellUpgrades={spellUpgrades}
          showStats={showStats}
          setShowStats={setShowStats}
          setIsPointerLocked={setActive}
        />
      )}

      <TouchControls isWorldBuilt={isWorldBuilt} />

      <MenuSystem
        gameState={gameState}
        showAchievements={showAchievements}
        setShowAchievements={setShowAchievements}
        showSpellUpgrades={showSpellUpgrades}
        setShowSpellUpgrades={setShowSpellUpgrades}
        isPointerLocked={isPointerLocked}
        setIsPointerLocked={setActive}
        showStats={showStats}
        setShowStats={setShowStats}
        questSystem={questSystem}
        spellUpgrades={spellUpgrades}
        isAuthenticated={isAuthenticated}
        showAuthModal={showAuthModal}
        setShowAuthModal={setShowAuthModal}
      />

      {import.meta.env.DEV && !hudHidden && <DebugOverlay isWorldBuilt={isWorldBuilt} />}

      {import.meta.env.DEV && showcaseView && (<Suspense fallback={null}><PrimitivesShowcase /></Suspense>)}

      {import.meta.env.DEV && showMascotStudio && (
        <Suspense fallback={null}><MascotStudio /></Suspense>
      )}
    </div>
  );
}

export default App;
