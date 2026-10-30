import { useGameStore } from './store/useGameStore';
import { isCaptureMode } from './devtest/captureMode';
import { bearingToMarker, bearingDeg } from './game/compass';
import { nearestLandmark } from './world/shrines.js';
import { blightHeartSite } from './world/blightHeart.js';
import { dayPhase } from './game/dayPhase.js';
import { useT } from './i18n/i18n.js';
import React, { useRef, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { GameUI } from './ui/GameHud';
import { CombatInstructions } from './ui/CombatInstructions';
import { isTouchUIMode } from './input/touchDevice';
import {
  PlayerHealthBar,
  PlayerManaBar,
  DamageOverlay,
  DeathScreen,
  VictoryOverlay
} from './GameSystems';
import { SimpleXPGainVisual, SimpleLevelUpEffect } from './SimpleExperienceSystem';
import { QuestTracker, NotificationStack, ChestIndicator } from './QuestSystem';
import { CombatLog } from './ui/CombatLog';
import { BossHealthBar } from './ui/BossHealthBar';
import DamageDirection from './ui/DamageDirection';
import LowHealthVignette from './ui/LowHealthVignette';
import HeartbeatAudio from './ui/HeartbeatAudio';
import DayNightAudio from './ui/DayNightAudio';
import DuskWarning from './ui/DuskWarning';
import MusicPlayer from './ui/MusicPlayer';
import UISounds from './ui/UISounds';
import AspectHintToast from './ui/AspectHintToast';
import { AbilityBar } from './ui/AbilityBar';
import { TargetFrame } from './ui/TargetFrame';
import { RadialMinimap } from './ui/RadialMinimap';
import { Compass } from './ui/Compass.jsx';
import { Panel, Icon } from './ui/primitives/index.js';
import { EmberBar } from './ui/EmberBar.jsx';
import { subscribeHudTick } from './ui/hudTicker.js';
import {
  useHudMode, useTallToastPlace, useWindowWidth, encounterTop, bossWidth, bossBelowCentre, toastsInEncounter, compactBoss,
  toastMaxWidth, bossCallLines, BELOW_CENTRE_TOP, COLUMN_TOAST_LINES, TOAST_LINES, KEYBOARD_TOAST_RIGHT,
  SHORT_VITALS_TOP, TOUCH_VITALS_TOP, TOUCH_COINS_TOP, PHONE_VITALS_TOP, PHONE_COINS_TOP,
} from './ui/hudLayout.js';
import { lineNotification } from './ui/notifications.js';
import { ON_WORLD_TEXT } from './ui/onWorldText.js';
import { PanelBoundary, onceRetrying } from './ui/panels/lazyPanels.js';

// The windup chevrons (combat-stance Task 7) load behind a lazy boundary: the combat-stance lane's share of the index
// chunk is +9,000 B (plan Global Constraints and Task 12 Step 3), and the build with it in the boot chunk measured
// +9,024 B. The layer is DOM-only and reads nothing until a windup is off screen, so it arriving a moment after the HUD
// mounts costs nothing a player can see.
const loadChevrons = onceRetrying(() => import('./ui/WindupChevrons'));
let ChevronsLazy = null;
/** After a failed load the slot asks again this many times, CHEVRON_RETRY_MS after the failure and doubling. */
export const CHEVRON_RETRIES = 4;
export const CHEVRON_RETRY_MS = 4000;
// A rejected React.lazy rethrows on every render, and the nearest boundary would be the app-wide one, which replaces
// the game with the reload screen; the panels' boundary (ui/panels/lazyPanels.js PanelBoundary) holds the failure in
// the slot instead. A React.lazy also keeps its rejection for good, so a failure drops that lazy, and the slot mounts
// a fresh one on a retry or a remount: one failed fetch at boot (flaky Wi-Fi) no longer drops the chevrons for the
// session. The retries are bounded, so a tab left open across a deploy, whose hashed chunk now 404s, stops asking.
export function WindupChevronsSlot() {
  const [attempt, setAttempt] = React.useState(0);
  const [failed, setFailed] = React.useState(false);
  useEffect(() => {
    if (!failed || attempt >= CHEVRON_RETRIES) return undefined;
    const t = setTimeout(() => { setFailed(false); setAttempt((a) => a + 1); }, CHEVRON_RETRY_MS * 2 ** attempt);
    return () => clearTimeout(t);
  }, [failed, attempt]);
  if (failed) return null;
  if (!ChevronsLazy) ChevronsLazy = React.lazy(loadChevrons);
  return (
    <PanelBoundary onFail={() => { ChevronsLazy = null; setFailed(true); }}>
      <React.Suspense fallback={null}><ChevronsLazy /></React.Suspense>
    </PanelBoundary>
  );
}

// The coin count: the coin and the number on the world, no panel (DECISIONS 2026-10-29 item 99). A store subscription
// is Game-Loop-Isolation-safe here (HUD is declarative, not a useFrame system). Gated on coins > 0 so the default-zero
// wallet renders NOTHING. On desktop it sits left of the Settings gear; on touch the Pause button takes that place
// (ui/TouchControls.jsx, right 64 px, 46 px wide), so it sits under the minimap (on a tall screen and on a phone), and
// on a short one in the top band between the compass and the minimap (ui/hudLayout.js).
const CoinReadout = React.memo(() => {
  const coins = useGameStore((s) => s.coins);
  const mode = useHudMode();
  if (!coins || coins <= 0) return null;
  const place = !mode.touch ? { top: 16, right: 68 }
    : mode.short ? { top: 12, right: 222 }
    : { top: mode.phone ? PHONE_COINS_TOP : TOUCH_COINS_TOP, right: 8 };
  return (
    <div data-testid="coin-readout" className="absolute z-20 pointer-events-none h-5 flex items-center gap-1" style={place}>
      <Icon name="coins" size={18} className="flex-none text-warn" />
      <span className="text-sm leading-none font-bold tabular-nums text-text" style={ON_WORLD_TEXT}>{coins}</span>
    </div>
  );
});

// M6 #10 day-phase dial: a persistent sun/moon clock so the player can read the day-night SIEGE cycle
// at a glance (night = the siege; DuskWarning is the transient toast, this is the ambient companion).
// A small bold-flat "sky" ring with a sun(day)/moon(night) marker that ORBITS it -- noon at top, sunrise
// left, sunset right, midnight bottom. ALL math is in the pure dayPhase() kernel; the component does zero
// arithmetic beyond a fixed display offset. Game-Loop-Isolation: gameTime mutates every tick, so the orbit
// is driven by a self-contained 1s interval (a clock needs ~1s granularity) reading getState() transiently
// + writing a ref transform -- NO per-frame React state; only the rare isDay flip re-renders (sun<->moon).
// Capture-SUPPRESSED (return null + interval never starts) -> the visual baselines stay byte-identical.
export const DayPhaseDial = React.memo(() => {
  const t = useT();
  const isDay = useGameStore((s) => s.isDay);
  // A short touch screen gives the right edge to the thumb cluster's fans: the dial goes under the minimap, in the top
  // band beside the Pause (ui/hudLayout.js).
  const short = useHudMode().short;
  const orbitRef = useRef(null);
  const labelRef = useRef(null);

  useEffect(() => {
    if (isCaptureMode()) return undefined; // never animate in capture -> zero baseline impact
    const apply = () => {
      const st = useGameStore.getState();
      const p = dayPhase(st.gameTime, st.isDay);
      if (orbitRef.current) orbitRef.current.style.transform = `rotate(${p.markerAngleDeg}deg)`;
      if (labelRef.current) {
        labelRef.current.textContent = p.duskApproaching ? t('hud.dusk') : (!p.isDay ? t('hud.night') : '');
        labelRef.current.style.color = p.duskApproaching ? 'rgb(var(--ui-warn))' : '';
      }
    };
    apply();
    const id = setInterval(apply, 1000); // ~1.2deg/s orbit -> 1s steps read smooth; clock-appropriate
    return () => clearInterval(id);
  }, [t]);

  if (isCaptureMode()) return null;

  // Initial values from the live clock so an isDay re-render never resets to a stale frame.
  const init = dayPhase(useGameStore.getState().gameTime, isDay);
  return (
    <div data-testid="day-phase-dial" className="absolute z-20 pointer-events-none" style={short ? { top: 106, right: 118 } : { top: 68, right: 16 }}>
      <Panel variant="base" shadow="shadow-none" className="px-1.5 py-1.5 flex flex-col items-center gap-1">
        <div className="relative w-9 h-9 rounded-full border-chrome border-ink bg-slot overflow-hidden">
          {/* horizon line: above = sky (sun/moon high), below = night/ground -> the orbit reads as a sky arc */}
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-ink opacity-50" />
          <div ref={orbitRef} className="absolute inset-0" style={{ transform: `rotate(${init.markerAngleDeg}deg)` }}>
            <div className="absolute left-1/2 top-0.5 -translate-x-1/2">
              {isDay
                ? <Icon name="sun" size={14} className="text-accent" />
                : <Icon name="moon" size={14} className="text-info" />}
            </div>
          </div>
        </div>
        <span
          ref={labelRef}
          className="text-[9px] font-bold tabular-nums text-text-muted h-3 leading-3"
          style={{ color: init.duskApproaching ? 'rgb(var(--ui-warn))' : undefined }}
        >
          {init.duskApproaching ? t('hud.dusk') : (!init.isDay ? t('hud.night') : '')}
        </span>
      </Panel>
    </div>
  );
});

// W3 M-HUD.9: the controls cheatsheet is DEMOTED from always-on to a toggle/auto-fade. A returning
// player no longer stares at a permanent keycap legend cluttering the top-right; it auto-shows for the
// first ~8s of play (onboarding), then fades, and H (InputManager) re-summons it on demand. The visible
// state is the store `showControls` flag; this wrapper owns the one-shot auto-fade timer. Game-Loop-
// Isolation-safe: a plain useEffect timer (not bound to useFrame), and capture-SUPPRESSED so the timer
// never fires under isCaptureMode() -> the deterministic baselines render a clean, sheet-free HUD
// (the explore frames lose the old always-on sheet, a deliberate re-baseline).
const ControlsSheet = React.memo(() => {
  const showControls = useGameStore((s) => s.showControls);
  useEffect(() => {
    if (isCaptureMode()) return undefined; // never auto-show/fade in capture -> deterministic frames
    const st = useGameStore.getState();
    st.setShowControls(true); // onboarding: show on enter
    const id = setTimeout(() => useGameStore.getState().setShowControls(false), 8000);
    return () => clearTimeout(id);
  }, []);
  if (!showControls) return null;
  return <CombatInstructions />;
});

// ObjectiveTracker -- the PERSISTENT spawn-direction cue (Kevin 2026-06-16: "I spawn with no guide; where
// do I go?"). Unlike the FOV-gated Compass markers (which vanish when you face away) and the localStorage-
// once onboarding toast (dead for a returning player), this ALWAYS shows on spawn: it NAMES the current
// objective + points to it with a FULL-CIRCLE rotating arrow (bearingToMarker at fov=2*PI -> facing-
// INDEPENDENT) + live distance. Game-Loop-Isolation: a self-contained rAF doing transient getState() reads
// + direct ref/DOM writes (no per-frame React state), copied from the Compass pattern. Capture-SUPPRESSED
// (rAF never starts + returns null in capture) so the deterministic visual baselines stay byte-identical.
export const ObjectiveTracker = React.memo(() => {
  const t = useT();
  // Under the compass: in the top band's second row where the compass is in the top band (a wide screen, a short touch
  // one), else under the compass at top 64 px (ui/Compass.jsx).
  const short = useHudMode().short;
  const rootRef = useRef(null);
  const arrowRef = useRef(null);
  const textRef = useRef(null);
  const distRef = useRef(null);
  const shrineCache = useRef({ t: 0, shrine: null });

  useEffect(() => {
    const tick = () => {
      // CAPTURE RESETS, it does not early-return (review 2026-10-27, steady-cool LOW 7). The harness enters capture AFTER
      // boot, so a check made once at mount let a tracker mounted in play keep turning in the gated frames, wherever it
      // had got to. Read every tick: under capture the tracker rests HIDDEN (as when it mounts in capture: null below),
      // and nothing is scanned or written; out of capture it shows again.
      const root = rootRef.current;
      if (isCaptureMode()) {
        if (root && root.style.visibility !== 'hidden') root.style.visibility = 'hidden';
        return;
      }
      if (root && root.style.visibility === 'hidden') root.style.visibility = '';
      const state = useGameStore.getState();
      const camera = state.gameCamera;
      const playerPos = state.playerPosition;
      if (!camera || !camera.matrixWorld || !playerPos) return;
      const arrow = arrowRef.current, txt = textRef.current, dist = distRef.current;
      if (!arrow || !txt || !dist) return;

      // Heading from the camera matrix (same derivation as Compass).
      const el = camera.matrixWorld.elements;
      const fx = -el[8];
      const fz = -el[10];
      const heading = Math.atan2(fx, -fz);

      // Objective: the nearest frontier shrine until one is reached, then the Blight Heart climax.
      let targetX, targetZ, label, color;
      if (!state.shrineReached) {
        const now = performance.now();
        if (now - shrineCache.current.t > 750) {
          shrineCache.current = { t: now, shrine: nearestLandmark(playerPos.x, playerPos.z) };
        }
        const s = shrineCache.current.shrine;
        if (s) { targetX = s.worldX; targetZ = s.worldZ; label = t('hud.objectiveShrine'); color = '#46E0FF'; }
      }
      if (targetX === undefined) {
        const bh = blightHeartSite();
        targetX = bh.x; targetZ = bh.z; label = t('hud.objectiveBlightHeart'); color = '#A24BFF';
      }

      // Full-circle bearing -> the arrow points to the objective regardless of which way the player faces.
      const b = bearingToMarker(targetX, targetZ, playerPos.x, playerPos.z, heading, Math.PI * 2);
      // Written only on change (plan 2026-10-27-crafty-steady-cool item f): standing still, nothing here moves.
      const rot = `rotate(${bearingDeg(b.pct)}deg)`, m = t('hud.distance', { m: Math.round(b.dist) });
      if (arrow.dataset.rot !== rot) { arrow.dataset.rot = rot; arrow.style.transform = rot; }
      if (arrow.dataset.color !== color) { arrow.dataset.color = color; arrow.style.background = color; }
      if (txt.textContent !== label) txt.textContent = label;
      if (dist.textContent !== m) dist.textContent = m;
    };
    tick();
    // One clock for the HUD (ui/hudTicker.js): the capped canvas's rendered frames, or rAF under Unlimited.
    return subscribeHudTick(tick);
  }, []);

  if (isCaptureMode()) return null;

  return (
    <div ref={rootRef} data-testid="objective-tracker" className={`absolute ${short ? 'top-12' : 'top-12 max-[900px]:top-[104px]'} left-1/2 transform -translate-x-1/2 z-20 pointer-events-none`}>
      <div className="flex items-center gap-2 px-2.5 py-1 bg-panel-raise border-chrome border-ink rounded-sm whitespace-nowrap">
        <span ref={arrowRef} className="inline-block w-2.5 h-2.5 flex-none" style={{ background: '#46E0FF', clipPath: 'polygon(50% 0,100% 100%,0 100%)' }}></span>
        <span ref={textRef} className="text-[11px] font-bold text-text">{t('hud.objectiveShrine')}</span>
        <span ref={distRef} className="text-[11px] text-text-muted tabular-nums">--</span>
      </div>
    </div>
  );
});

// S2-B4-M5: the IMBUE tell, a white-gold ring at screen centre while the latch is armed (it haloes the crosshair).
// imbueArmed is edge-written, so this re-renders only on the edge.
export const ImbueTell = React.memo(() => {
  const t = useT();
  const imbueArmed = useGameStore((s) => s.imbueArmed);
  if (!imbueArmed) return null;
  return (
    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none flex flex-col items-center">
      <div className="w-5 h-5 rounded-full border-2 border-resonance shadow-elev-sm"></div>
      <span className="mt-1 text-[10px] font-bold tracking-widest text-resonance">{t('hud.imbue')}</span>
    </div>
  );
});

// The vitals: a `flex flex-col` column (StatBar's root is `inline-flex`, each bar `w-full`), whose `w-44` (`w-32` on a
// phone) gives every bar one width. Desktop: the
// bottom-left corner, lifted above the hotbar's XP edge where the centred hotbar would reach it: under 808 px wide, the
// hotbar's 408 px plus, on each side, this stack's 176 px, its 16 px margin and HUD_GAP (tests/gates/hud-at-rest-gates
// recomputes it from the rendered classes). Touch: the joystick and the action buttons hold both bottom corners
// (ui/TouchControls.jsx), so the stack sits at the top left under the quest line and the objective line on a tall screen,
// on a short one between the tray's opener and the joystick, and on a phone beside the crosshair at 128 px, which
// clears it (ui/hudLayout.js PHONE_VITALS_TOP), since the encounter column holds the band under the objective line.
export const Vitals = ({ gameSystems }) => {
  const mode = useHudMode();
  const place = mode.touch ? { top: mode.short ? SHORT_VITALS_TOP : mode.phone ? PHONE_VITALS_TOP : TOUCH_VITALS_TOP } : undefined;
  return (
    <div data-testid="stat-stack" className={`absolute left-4 pointer-events-none z-20 flex flex-col gap-2 ${mode.phone ? 'w-32' : 'w-44'} ${mode.touch ? '' : 'bottom-4 max-[808px]:bottom-[88px]'}`} style={place}>
      <PlayerHealthBar health={gameSystems.playerHealth} maxHealth={gameSystems.maxHealth} />
      <PlayerManaBar mana={gameSystems.mana} maxMana={gameSystems.maxMana} />
      <EmberBar />
    </div>
  );
};

// The encounter: the aimed target's nameplate over the boss bar, one centred column, so the two never meet; on a phone
// and a short screen it holds the notices too, one at a time (ui/notifications.js lineNotification): in the boss bar's
// own line while the bar is up, else as the one toast in the bar's place, and on a short screen the boss bar and the
// toast take a column of their own under the crosshair. Where each sits and how wide the boss bar is follow the
// viewport (ui/hudLayout.js).
const ENCOUNTER_COLUMN = 'absolute left-1/2 -translate-x-1/2 z-20 pointer-events-none flex flex-col items-center gap-1.5';
export const Encounter = ({ bossSystem, notifications }) => {
  const mode = useHudMode();
  const column = toastsInEncounter(mode);
  const line = column ? lineNotification(notifications) : null;
  const inBar = column && bossSystem.bossActive;
  const boss = (
    <BossHealthBar
      bossActive={bossSystem.bossActive}
      bossHealth={bossSystem.bossHealth}
      bossMaxHealth={bossSystem.bossMaxHealth}
      bossPhase={bossSystem.bossPhase}
      bossTier={bossSystem.bossTier}
      width={bossWidth(mode)}
      compact={compactBoss(mode)}
      call={inBar ? line : null}
      callLines={bossCallLines(mode)}
    />
  );
  const toasts = column && !inBar
    ? <NotificationStack notifications={line ? [line] : NO_NOTICES} inline single maxWidth={toastMaxWidth(mode)} lines={COLUMN_TOAST_LINES} />
    : null;
  if (bossBelowCentre(mode)) {
    return (
      <>
        <div className={ENCOUNTER_COLUMN} style={{ top: encounterTop(mode) }}><TargetFrame /></div>
        <div className={ENCOUNTER_COLUMN} style={{ top: BELOW_CENTRE_TOP }}>{boss}{toasts}</div>
      </>
    );
  }
  return (
    <div className={ENCOUNTER_COLUMN} style={{ top: encounterTop(mode) }}>
      <TargetFrame />
      {boss}
      {toasts}
    </div>
  );
};
const NO_NOTICES = [];

// The toast stack where it stands on its own: on a keyboard at the right edge holding every notice up, and while the boss
// bar is up (`bossUp`) only as wide as the room the bar leaves on its right (ui/hudLayout.js toastMaxWidth); on a tall
// touch screen the newest it has room for, beside or left of the right fans' column (ui/hudLayout.js tallToastPlace).
// Elsewhere the encounter column holds the notices.
export const PlacedToasts = ({ notifications, bossUp = false }) => {
  const mode = useHudMode();
  const place = useTallToastPlace();
  const width = useWindowWidth();
  if (toastsInEncounter(mode)) return null;
  if (!mode.touch) {
    return <NotificationStack notifications={notifications} maxWidth={toastMaxWidth(mode, width, bossUp)} right={KEYBOARD_TOAST_RIGHT} />;
  }
  return <NotificationStack notifications={notifications.slice(-place.slots)} right={place.right} lines={TOAST_LINES} />;
};

// The minimap: bottom right on a keyboard; on a tall touch screen top right under the dial, clear of the thumb cluster
// and the quest line; on a phone under the dial at 60%, without its coordinates line, beside the encounter column
// (ui/hudLayout.js PHONE_MINIMAP_TOP); on a short one in the top band beside the Pause at three quarters, without its
// coordinates line, since the fans hold the right edge below it.
const PlacedMinimap = () => {
  const mode = useHudMode();
  if (!mode.touch) return <RadialMinimap />;
  if (mode.short) return <RadialMinimap position="top-2 right-[118px] scale-75 origin-top-right" coords={false} />;
  if (mode.phone) return <RadialMinimap position="top-[148px] right-2 scale-[0.6] origin-top-right" coords={false} />;
  return <RadialMinimap position="top-[164px] right-2" />;
};

export function HUD({
  isPointerLocked,
  isWorldBuilt,
  gameState,
  gameSystems,
  experienceSystem,
  questSystem,
  treasureChests,
  bossSystem
}) {
  // S9c: the post-climax victory beat is dismissed once ("Keep exploring" -> endless handoff).
  const victoryPending = useGameStore((s) => s.victoryPending); // a rare event, not a per-frame value
  return (
    <>
      <AnimatePresence>
        {isPointerLocked && gameSystems.isAlive && isWorldBuilt && (
          <>
            <GameUI gameState={gameState} level={experienceSystem.playerLevel} xpProgress={experienceSystem.xpProgress} />
            {!isTouchUIMode() && <ControlsSheet />}{/* W3 M-HUD.9: keyboard cheatsheet demoted to auto-fade + H-toggle (desktop-only; touch has on-screen controls) */}

            <Compass treasureChests={treasureChests} bossSystem={bossSystem} />
            <ImbueTell />

            <ObjectiveTracker />

            <CoinReadout />

            <DayPhaseDial />

            <Vitals gameSystems={gameSystems} />

            {/* W3 M-HUD.9: the standalone top-center "Spell: FIREBALL (15 MP)" band is REMOVED — it
                triple-stacked the top-center lane with the ObjectiveTracker + Compass. The active spell +
                MP cost read off the action bar / hotbar; removing the redundant band reclaims the lane. */}

            <SimpleXPGainVisual xpGains={experienceSystem.xpGains} />

            <SimpleLevelUpEffect
              levelUpEffects={experienceSystem.levelUpEffects}
              onEffectComplete={(id) => {
                experienceSystem.setLevelUpEffects(prev =>
                  prev.filter(effect => effect.id !== id)
                );
              }}
            />

            <PlacedMinimap />

            {!isTouchUIMode() && <AbilityBar />}{/* W3 M-HUD.3: bottom-center cooldown-sweep action bar; bottom-4 sits in the touch joystick/action-cluster band -> desktop-only for now (M-AMBIENT cleanup gives touch its own placement) */}

            <Encounter bossSystem={bossSystem} notifications={questSystem.notifications} />

            <QuestTracker quests={questSystem.quests} onClaim={questSystem.claimQuest} />

            <PlacedToasts notifications={questSystem.notifications} bossUp={bossSystem.bossActive} />

            {/* The quiet bottom-left ticker over the SAME live list as the toast stack; a keyboard's only (ui/CombatLog.jsx). */}
            <CombatLog notifications={questSystem.notifications} />

            <ChestIndicator
              chests={treasureChests.chests}
              openedChestIds={treasureChests.openedChestIds}
            />
          </>
        )}
      </AnimatePresence>

      <DamageOverlay active={gameSystems.damageFlash} intensity={gameSystems.screenShake} />
      <LowHealthVignette />
      <HeartbeatAudio />
      <DayNightAudio />
      <DuskWarning />
      <MusicPlayer />
      <DamageDirection />
      <WindupChevronsSlot />{/* combat-stance Task 7: a chevron at the edge for a windup off screen; ticker-driven, refs only */}
      <UISounds />
      <AspectHintToast live={isPointerLocked && gameSystems.isAlive && isWorldBuilt} />

      {!gameSystems.isAlive && (
        <DeathScreen onRespawn={() => {
          gameSystems.respawn();
          if (useGameStore.getState().onPlayerDeath) useGameStore.getState().onPlayerDeath();
          
          // Re-acquire pointer lock upon respawning
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
          // KEVIN-FIX C3: no optimistic setIsPointerLocked(true) — pointerlockchange is
          // the one authoritative writer; a failed lock falls back to click-to-play.
        }} />
      )}
      
      {/* VICTORY is an EVENT of the first dragon's death (world/bossSystem.js 'victory'), never derived from saved
          state — so a reload cannot resurrect it and a return kill never raises it (review #4, R5.5). */}
      {victoryPending && (
        <VictoryOverlay onDismiss={() => useGameStore.setState({ victoryPending: false })} />
      )}

      {isPointerLocked && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-30">
          <div className="w-6 h-6">
            <div className="absolute top-1/2 left-1/2 w-4 h-0.5 bg-white transform -translate-x-1/2 -translate-y-1/2 shadow-lg"></div>
            <div className="absolute top-1/2 left-1/2 w-0.5 h-4 bg-white transform -translate-x-1/2 -translate-y-1/2 shadow-lg"></div>
          </div>
        </div>
      )}
    </>
  );
}
