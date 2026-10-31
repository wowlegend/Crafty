import { useShallow } from 'zustand/react/shallow';
import { useT } from './i18n/i18n.js';
import React, { useState, useEffect, useLayoutEffect, useRef, lazy, Suspense } from 'react';
import './App.css';
import { SoundProvider, useSounds, useGameSounds } from './SoundManager';
import { useSimpleExperience } from './SimpleExperienceSystem';
import { GameSystemsProvider, useGameSystems } from './GameSystems';
import { useGameStore } from './store/useGameStore';
import { selectHudState } from './store/hudState.js';
import { makeAttackSoundPlayer } from './game/attackSounds.js';
import { isCaptureMode } from './devtest/captureMode';
import { useQuestSystem, useTreasureChests } from './QuestSystem';
import { useBossSystem } from './world/bossSystem';
import { useSurvivalMode } from './world/survivalSystem';
import { useEmberAccrual } from './world/accrualHooks';

import { HUD } from './HUD';
import { useInputManager } from './InputManager';
import { setActive, getInput } from './input/inputState';
import { useActiveInput } from './input/useActiveInput';
import TouchControls from './ui/TouchControls';
import { openTalents } from './ui/touchTray';
import { isTouchDevice } from './input/touchDevice';
import { GameScene } from './GameScene';
import { MenuSystem } from './MenuSystem';
import { MotionProvider } from './ui/MotionProvider.jsx';
import { DebugOverlay } from './ui/DebugOverlay';
import { prefetchPanels } from './ui/panels/lazyPanels.js';
import { initSettingsPersistence } from './game/settingsPersist.js';
import { ONBOARDING_TIPS } from './game/onboardingTips.js';
import { PerfProbeRunner } from './devtest/PerfProbeRunner';
import { ContextLossPanel } from './ui/ContextLossPanel.jsx';
import { selectTier, readDeviceSignals } from './render/quality';
import { installAutosave } from './game/autosave';
import { savePosition } from './game/saveSchema.js';
import { useDayNightClock } from './game/useDayNightClock';
import { shouldOpenPauseOnUnlock } from './ui/panelState.js';
import { requestGameLock } from './input/pointerLock.js';

// DEV-only lazy import: in prod `import.meta.env.DEV` is statically false, so the
// whole PrimitivesShowcase subtree (incl. showcase-scene.png + baked game-icons)
// is tree-shaken out of the production bundle.
const PrimitivesShowcase = import.meta.env.DEV
  ? lazy(() => import('./ui/PrimitivesShowcase').then((m) => ({ default: m.PrimitivesShowcase })))
  : () => null;

function App() {
  // Load the panel chunk once the page has settled (ui/panels/lazyPanels.js), so the first panel a player opens is
  // normally already here. On idle, not at mount: boot is busy streaming the world.
  useEffect(() => {
    const ric = window.requestIdleCallback;
    const id = ric ? ric(prefetchPanels, { timeout: 8000 }) : setTimeout(prefetchPanels, 4000);
    return () => (ric ? window.cancelIdleCallback(id) : clearTimeout(id));
  }, []);
  return (
    <MotionProvider>
      <SoundProvider>
        <GameAppWrapper />
      </SoundProvider>
    </MotionProvider>
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
  const t = useT();
  const gameState = useGameStore(useShallow(selectHudState));
  // Capture-only HUD suppression (character-studio shots). Default false in gameplay.
  const hudHidden = useGameStore(s => s.hudHidden);
  const showcaseView = useGameStore(s => s.showcaseView);
  const { musicEnabled, playBackgroundMusic, resumeAudio } = useSounds();
  const { playAttack, playSwing, playHit, playDefeat } = useGameSounds();

  const [isWorldBuilt, setIsWorldBuilt] = useState(false);

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
              if (add) add(ONBOARDING_TIPS[0].text, ONBOARDING_TIPS[0].type);
            }, 1600);
            // S10: name the CAMPAIGN goal once (after the loop toast) so a new player knows the point. The
            // compass already shows the SHRINE + BLIGHT HEART markers this references. Capture-safe (inside
            // the !isCaptureMode + localStorage-once guard).
            setTimeout(() => {
              const add2 = useGameStore.getState().addNotification;
              if (add2) add2(ONBOARDING_TIPS[1].text, ONBOARDING_TIPS[1].type);
            }, 8600);
          }
        } catch { /* localStorage blocked -> skip onboarding (non-fatal) */ }
      }
      setTimeout(() => {
        const state = useGameStore.getState();
        // Dev capture mode: keep the menu overlay visible by NOT auto-locking the pointer;
        // the harness drives the menu->explore transition explicitly via the `start` hook.
        if (state.isCaptureMode) return;
        requestGameLock(state);
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
  useSurvivalMode(gameState.isDay);
  useEmberAccrual(); // day kills by the player's own hand fill the ember bar
  const bossSystem = useBossSystem(experienceSystem.playerLevel);

  const {
    showStats, setShowStats,
    showAchievements, setShowAchievements,
    showSpellUpgrades, setShowSpellUpgrades
  } = useInputManager(gameState, gameSystems);

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
  // The decision is panelState.js shouldOpenPauseOnUnlock, over the SINGLE canonical panel set — it replaced a
  // 4th hand-kept list (that was missing showCredits); the click-to-play overlay + title menu + key handlers all
  // gate on the same set. Show Stats is not in it (2026-10-27): with F3 on, an ESC opened no pause panel at all.
  // useLayoutEffect, NOT useEffect: between the unlock and this opening the pause panel there is one
  // committed render where the game has started, nothing is locked and no panel is open — which is
  // exactly the state the resume overlay is derived from, so with a post-paint effect the overlay
  // FLASHES for a frame before the pause menu replaces it. A layout effect runs before the browser
  // paints, so that intermediate state is never visible. (Same class as the C5 title-menu flash.)
  const prevLockedRef = useRef(false);
  useLayoutEffect(() => {
    const was = prevLockedRef.current;
    prevLockedRef.current = isPointerLocked;
    if (was && !isPointerLocked) {
      const s = useGameStore.getState();
      if (shouldOpenPauseOnUnlock({ ...s, showSpellUpgrades, showAchievements, isTouch: isTouchDevice() })) {
        s.setShowSettings(true);
      }
    }
  }, [isPointerLocked, showSpellUpgrades, showAchievements]);

  // Select the device quality tier once at startup (runs in prod + dev). On a coarse pointer the render distance is
  // pinned to this boot tier: a runtime step there must not re-stream the world (render/tierGovernor.js).
  useEffect(() => {
    const signals = readDeviceSignals();
    const tier = selectTier(signals);
    useGameStore.getState().setQualityTier(tier);
    useGameStore.setState({ renderDistancePin: signals.coarsePointer ? tier : null });
  }, []);

  // M6 settings-persistence: hydrate audio/feedback/look prefs from localStorage + persist on change.
  // ITS OWN EFFECT, and that is the fix. This call used to be the last statement of the DEV-only
  // test-bridge effect, behind `if (!import.meta.env.DEV) return;` — so in the build Vercel actually
  // ships, settings never hydrated and never persisted. Invisible everywhere the repo looks: the dev
  // server, the capture harness and the e2e suite all run with DEV true, where it works fine.
  // Returning the unsubscribe so React uses it as cleanup; it was previously discarded, leaking the
  // store subscription on unmount. Capture-guarded inside settingsPersist, so the visual harness still
  // never touches localStorage.
  useEffect(() => initSettingsPersistence(useGameStore, isCaptureMode), []);

  // Local-first autosave (game/autosave.js): a change to any field the save records schedules one, and hiding the tab or
  // closing it saves a pending one at once.
  useEffect(() => installAutosave(useGameStore, {
    save: () => {
      const st = useGameStore.getState();
      if (st.isCaptureMode) return;
      st.saveActiveWorld(savePosition(st));
    },
    delayMs: 5000,
  }), []);

  // The DEV test bridge (devtest/devBridge.js). The import sits inside a branch a production build drops, so the
  // shipped bundle holds no hook and no chunk for it.
  useEffect(() => {
    let live = true;
    if (import.meta.env.DEV) {
      import('./devtest/devBridge.js').then(({ installDevBridge }) => {
        if (live) installDevBridge({ setShowAchievements, setShowSpellUpgrades });
      });
    }
    return () => { live = false; };
  }, []);

  // Swallow the benign ResizeObserver loop errors some browsers emit (a harmless warning, not a real
  // error) so they don't spam the console or trip an error overlay.
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
    useGameStore.setState({ playAttackSounds: makeAttackSoundPlayer(playSwing, playAttack) });
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

  // M3 #3: respect the OS prefers-reduced-motion preference -> drive the feedback-intensity dial to 0
  // (kills screenshake + hitstop juice). Applies the OS default on mount + re-applies on change; the
  // Settings slider/toggle remain the manual override between change events. No-op in capture.
  useEffect(() => {
    if (isCaptureMode() || typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    // applyReducedMotion, NOT setJuiceIntensity(motionIntensity(matches, 1)). The literal 1 is what
    // overwrote a player's chosen 40% with 100% on every OS reduced-motion OFF transition, persisted --
    // and reading the live dial back in instead would have latched at 0 forever, because the ON
    // transition had already destroyed it. The store keeps the CHOICE in its own field now.
    const apply = () => useGameStore.getState().applyReducedMotion(mq.matches);
    if (mq.matches) apply(); // only force on mount when the OS asks for reduced motion
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  return (
    <div
      className="w-full h-screen bg-gradient-to-b from-blue-400 to-blue-600 overflow-hidden relative"
      style={{ width: '100vw', height: '100vh', position: 'fixed', top: 0, left: 0 }}
    >
      {/* gameState / showAchievements / showSpellUpgrades were passed here and DELETED 2026-08-11:
          GameScene's signature destructures exactly isWorldBuilt, the boss PRIMITIVES and showStats (the
          bossSystem object itself went 2026-09-23: a new object every render defeated GameScene's memo), has no rest
          element and no spread onto a child, and no identifier in the file reads the other three. Nothing
          broke -- the cost was the implication that the 3D scene reacts to an open panel, which it does
          not, and which is precisely the kind of thing a reader takes on trust from a prop list. */}
      <GameScene
        isWorldBuilt={isWorldBuilt}
        bossActive={bossSystem.bossActive}
        bossPositionRef={bossSystem.bossPositionRef}
        bossPhase={bossSystem.bossPhase}
        bossHealth={bossSystem.bossHealth}
        bossTier={bossSystem.bossTier}
        showStats={showStats}
      />

      {/* S2-B2-M2 perf probe (dev-only, self-nulls unless ?perf=A..E) — DOM layer, outside the Canvas */}
      {import.meta.env.DEV && <PerfProbeRunner />}

      {/* A lost WebGL context gets a way back: save, reload into the same world (ui/ContextLossPanel.jsx). */}
      <ContextLossPanel />

      {!isWorldBuilt && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm pointer-events-auto">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-green-500 mb-6 shadow-lg shadow-green-500/50"></div>
          <h2 className="text-3xl font-bold text-white mb-2 font-mono tracking-widest" style={{ textShadow: '0 0 10px rgba(74, 222, 128, 0.8)' }}>
            {t('world.generating')}
          </h2>
          <p className="text-green-400 font-mono text-sm animate-pulse">{t('world.buildingTerrain')}</p>
        </div>
      )}

      {!hudHidden && (
        <HUD
          isPointerLocked={isPointerLocked}
          isWorldBuilt={isWorldBuilt}
          gameState={gameState}
          gameSystems={gameSystems}
          experienceSystem={experienceSystem}
          questSystem={questSystem}
          treasureChests={treasureChests}
          bossSystem={bossSystem}
        />
      )}

      {/* Phase 0c (F9): the Talents panel's flag is App-local (useInputManager), so touch gets it as props — the
          locked ring sector opens it (nothing else on touch can), and tap-to-play stays off it while it is open. */}
      <TouchControls isWorldBuilt={isWorldBuilt} talentsOpen={showSpellUpgrades} otherPanelOpen={showAchievements}
        onOpenTalents={() => openTalents(useGameStore.getState(), { setShowSpellUpgrades, setShowAchievements })} />

      {/* MenuSystem's setIsPointerLocked prop is wired to setActive — the OPTIMISTIC
          active writer, used by the touch entry path (the prop NAME is kept to avoid
          churn in that component). Components.jsx's pointerlock listener is the
          AUTHORITATIVE active writer (the single source of truth). */}
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
      />

      {import.meta.env.DEV && !hudHidden && <DebugOverlay isWorldBuilt={isWorldBuilt} />}

      {import.meta.env.DEV && showcaseView && (<Suspense fallback={null}><PrimitivesShowcase /></Suspense>)}
    </div>
  );
}

export default App;
