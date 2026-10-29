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
import { SimpleExperienceBar, SimpleExperienceBarTouch, SimpleXPGainVisual, SimpleLevelUpEffect } from './SimpleExperienceSystem';
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
import { SurvivalWarning } from './ui/SurvivalWarning';
import { AbilityBar } from './ui/AbilityBar';
import { TargetFrame } from './ui/TargetFrame';
import { RadialMinimap } from './ui/RadialMinimap';
import { Panel, Toast, Icon } from './ui/primitives/index.js';
import { EmberBar } from './ui/EmberBar.jsx';
import { subscribeHudTick } from './ui/hudTicker.js';
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

// M3b coin readout: a small bold-flat currency token. Reads `coins` reactively
// (HUD is a plain declarative component, not a per-frame useFrame system, so a
// store subscription here is fine + Game-Loop-Isolation-safe). Gated on coins > 0
// so the default-zero wallet renders NOTHING -- the capture harness never grants
// coins, so the explore-day/night baselines stay byte-identical (no drift).
// shared empty-Set fallback so the per-frame compass loop doesn't allocate a new Set() each frame
const EMPTY_SET = new Set();

const CoinReadout = React.memo(() => {
  const coins = useGameStore((s) => s.coins);
  if (!coins || coins <= 0) return null;
  return (
    <div className="absolute top-3 right-4 z-20 pointer-events-none">
      <Panel variant="base" className="px-3 py-1.5 flex items-center gap-1.5">
        <Icon name="coins" size={18} className="flex-none text-warn" />
        <span className="font-bold tabular-nums text-text">{coins}</span>
      </Panel>
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
const DayPhaseDial = React.memo(() => {
  const isDay = useGameStore((s) => s.isDay);
  const orbitRef = useRef(null);
  const labelRef = useRef(null);

  useEffect(() => {
    if (isCaptureMode()) return undefined; // never animate in capture -> zero baseline impact
    const apply = () => {
      const st = useGameStore.getState();
      const p = dayPhase(st.gameTime, st.isDay);
      if (orbitRef.current) orbitRef.current.style.transform = `rotate(${p.markerAngleDeg}deg)`;
      if (labelRef.current) {
        labelRef.current.textContent = p.duskApproaching ? 'DUSK' : (!p.isDay ? 'NIGHT' : '');
        labelRef.current.style.color = p.duskApproaching ? 'rgb(var(--ui-warn))' : '';
      }
    };
    apply();
    const id = setInterval(apply, 1000); // ~1.2deg/s orbit -> 1s steps read smooth; clock-appropriate
    return () => clearInterval(id);
  }, []);

  if (isCaptureMode()) return null;

  // Initial values from the live clock so an isDay re-render never resets to a stale frame.
  const init = dayPhase(useGameStore.getState().gameTime, isDay);
  return (
    <div className="absolute top-14 right-4 z-20 pointer-events-none">
      <Panel variant="base" className="px-2 py-2 flex flex-col items-center gap-1">
        <div className="relative w-11 h-11 rounded-full border-chrome border-ink bg-slot overflow-hidden">
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
          {init.duskApproaching ? 'DUSK' : (!init.isDay ? 'NIGHT' : '')}
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
      const rot = `rotate(${bearingDeg(b.pct)}deg)`, m = `${Math.round(b.dist)}m`;
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
    <div ref={rootRef} data-testid="objective-tracker" className="absolute top-12 left-1/2 transform -translate-x-1/2 z-20 pointer-events-none">
      <div className="flex items-center gap-2 px-2.5 py-1 bg-panel-raise border-chrome border-ink rounded-sm whitespace-nowrap">
        <span ref={arrowRef} className="inline-block w-2.5 h-2.5 flex-none" style={{ background: '#46E0FF', clipPath: 'polygon(50% 0,100% 100%,0 100%)' }}></span>
        <span ref={textRef} className="text-[11px] font-bold text-text">{t('hud.objectiveShrine')}</span>
        <span ref={distRef} className="text-[11px] text-text-muted tabular-nums">--</span>
      </div>
    </div>
  );
});

const Compass = React.memo(({ treasureChests, bossSystem }) => {
  const containerRef = useRef(null);
  // S8b: throttle the nearest-shrine scan (nearestLandmark scans a chunk grid). The compass rAF runs
  // every frame; the player can't outrun a shrine in <1s, so recompute at most ~once a second.
  const shrineCache = useRef({ t: 0, shrine: null });
  // The markup last written, kept ACROSS effect runs. The effect re-runs whenever treasureChests or bossSystem change
  // identity, and a per-run `lastHtml = null` made every re-run rewrite markup identical to what was on screen: the
  // hud-churn e2e's identity run counted 2 such rewrites in 3 s standing still, and with the writer cut to "only the
  // first write of a run" it still counted 2 writes — one per re-run (2026-10-27).
  const lastHtml = useRef(null);

  useEffect(() => {
    let unsubscribe = null;

    const updateCompass = () => {
      // Dev capture-determinism: in capture mode the follow-cam is pinned, so the
      // compass markers are fully determined by the frozen camera + marker positions.
      // Render ONCE and then stop ticking — a continuously running loop
      // re-derives the float `left: %` each frame and rounds to sub-pixel-different
      // marker x-positions between runs (a ~500px top-of-frame flicker). Inert in
      // normal gameplay: the compass ticks on every HUD frame (ui/hudTicker.js — the capped
      // canvas's rendered frames, or rAF under Unlimited; plan 2026-10-27-crafty-steady-cool item f).
      if (isCaptureMode() && unsubscribe) { unsubscribe(); unsubscribe = null; }

      const container = containerRef.current;
      if (!container) return;

      const state = useGameStore.getState();
      const camera = state.gameCamera;
      const playerPos = state.playerPosition;
      if (!camera || !camera.matrixWorld || !playerPos) return;

      // Extract horizontal heading from the camera's matrixWorld
      const el = camera.matrixWorld.elements;
      const fx = -el[8];
      const fz = -el[10];
      const heading = Math.atan2(fx, -fz);

      // 180 degrees field of view (visible markers)
      const fov = Math.PI; 
      
      // Cardinal points definitions
      const cardinals = [
        { label: 'N', angle: 0 },
        { label: 'NE', angle: Math.PI / 4 },
        { label: 'E', angle: Math.PI / 2 },
        { label: 'SE', angle: 3 * Math.PI / 4 },
        { label: 'S', angle: Math.PI },
        { label: 'SW', angle: -3 * Math.PI / 4 },
        { label: 'W', angle: -Math.PI / 2 },
        { label: 'NW', angle: -Math.PI / 4 },
      ];

      const markersHtml = [];

      // 1. Render Cardinal Ticks
      cardinals.forEach(c => {
        let diff = c.angle - heading;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;

        if (Math.abs(diff) < fov / 2) {
          const pct = ((diff / (fov / 2)) * 50) + 50; // Map [-fov/2, fov/2] to [0, 100]
          markersHtml.push(`
            <div class="absolute top-0 transform -translate-x-1/2 flex flex-col items-center" style="left: ${pct}%">
              <span class="text-[10px] font-bold text-slate-200 tracking-wider">${c.label}</span>
              <div class="w-[1px] h-1.5 bg-slate-400/50 mt-0.5"></div>
            </div>
          `);
        }
      });

      // 2. Render Boss Marker
      const bossActive = bossSystem?.bossActive;
      const getBossPosition = state.getBossPosition;
      const bossPos = (bossActive && getBossPosition) ? getBossPosition() : null;
      if (bossPos) {
        const dx = bossPos[0] - playerPos.x;
        const dz = bossPos[2] - playerPos.z;
        const dist = Math.round(Math.sqrt(dx * dx + dz * dz));
        const targetAngle = Math.atan2(dx, -dz);
        
        let diff = targetAngle - heading;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;

        if (Math.abs(diff) < fov / 2) {
          const pct = ((diff / (fov / 2)) * 50) + 50;
          markersHtml.push(`
            <div class="absolute top-0.5 transform -translate-x-1/2 flex flex-col items-center z-10" style="left: ${pct}%">
              <span class="text-[9px] font-bold text-rose-500 animate-pulse drop-shadow-[0_0_4px_rgba(239,68,68,0.5)]">BOSS (${dist}m)</span>
              <div class="w-1.5 h-1.5 bg-rose-500 rounded-full mt-0.5 animate-ping"></div>
            </div>
          `);
        }
      }

      // 2b. Render HOME (Hearth) marker — always point back to the home anchor at world origin
      // (world/homeAnchor.js stamps the plinth at 0,0) so a built base is findable: get home before night.
      // Capture-suppressed (like the boss/chest markers) -> the explore frames stay byte-identical.
      if (!isCaptureMode()) {
        const home = bearingToMarker(0, 0, playerPos.x, playerPos.z, heading, fov);
        const homeDist = Math.round(home.dist);
        if (home.inView && homeDist > 6) { // hide while standing on the Hearth
          const pct = home.pct;
          markersHtml.push(`
            <div class="absolute top-0.5 transform -translate-x-1/2 flex flex-col items-center z-10" style="left: ${pct}%">
              <span class="text-[9px] font-bold text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.5)]">HOME (${homeDist}m)</span>
              <div class="w-1.5 h-1.5 bg-amber-400 rotate-45 mt-0.5"></div>
            </div>
          `);
        }
      }

      // 2c. Render nearest-SHRINE marker — the Ember-Frontier "go there" destination (the deterministic
      // landmarks are now navigable shrines). Cyan to match the in-world beacon (#46E0FF). Capture-
      // suppressed like HOME/boss/chest so explore frames stay byte-identical. The chunk-grid scan is
      // throttled to ~1s (shrineCache) so the every-frame compass stays cheap. Inline color avoids a
      // Tailwind JIT purge of a dynamic class.
      if (!isCaptureMode()) {
        const now = performance.now();
        if (now - shrineCache.current.t > 750) {
          shrineCache.current = { t: now, shrine: nearestLandmark(playerPos.x, playerPos.z) };
        }
        const s = shrineCache.current.shrine;
        if (s) {
          const sb = bearingToMarker(s.worldX, s.worldZ, playerPos.x, playerPos.z, heading, fov);
          const sDist = Math.round(sb.dist);
          if (sb.inView && sDist > 8) { // hide while standing at the shrine
            markersHtml.push(`
              <div class="absolute top-0.5 transform -translate-x-1/2 flex flex-col items-center z-10" style="left: ${sb.pct}%">
                <span class="text-[9px] font-bold" style="color:#46E0FF;text-shadow:0 0 4px rgba(70,224,255,0.6)">SHRINE (${sDist}m)</span>
                <div class="w-1.5 h-1.5 mt-0.5" style="background:#46E0FF;clip-path:polygon(50% 0,100% 100%,0 100%)"></div>
              </div>
            `);
          }
        }
      }

      // 2d. Render the BLIGHT HEART marker (S9) — the FIXED far-frontier climax lair, the campaign's
      // north star you see from early on (foreshadow). Obsidian-violet (#A24BFF) to read as ominous +
      // distinct from HOME(amber)/BOSS(rose)/SHRINE(cyan). Capture-suppressed like the others. Fixed
      // coord -> no throttle needed (one bearingToMarker call). Inline color avoids a Tailwind JIT purge.
      if (!isCaptureMode()) {
        const bh = blightHeartSite();
        const bm = bearingToMarker(bh.x, bh.z, playerPos.x, playerPos.z, heading, fov);
        const bDist = Math.round(bm.dist);
        if (bm.inView && bDist > 12) {
          markersHtml.push(`
            <div class="absolute top-0.5 transform -translate-x-1/2 flex flex-col items-center z-10" style="left: ${bm.pct}%">
              <span class="text-[9px] font-bold" style="color:#A24BFF;text-shadow:0 0 5px rgba(162,75,255,0.7)">BLIGHT HEART (${bDist}m)</span>
              <div class="w-1.5 h-1.5 mt-0.5 rotate-45" style="background:#A24BFF"></div>
            </div>
          `);
        }
      }

      // 3. Render Chest Markers.
      // Dev capture mode: skip chest markers entirely. Chests spawn at a RANDOM
      // angle/distance and the spawn effect can fire on mount BEFORE the capture flag
      // flips, so a stray chest leaks a run-varying "Chest (Nm)" label + marker x-pos
      // into the compass. No chest markers in capture = deterministic frame. The
      // character-closeup/boss-closeup fixtures hide the whole HUD, so this is purely
      // the explore-* compass. No-op in normal gameplay.
      const chests = isCaptureMode() ? [] : (treasureChests?.chests || []);
      const openedChestIds = treasureChests?.openedChestIds || EMPTY_SET;
      chests.forEach(chest => {
        const isOpened = openedChestIds instanceof Set ? openedChestIds.has(chest.id) : openedChestIds.includes(chest.id);
        if (isOpened) return;
        
        const dx = chest.position[0] - playerPos.x;
        const dz = chest.position[2] - playerPos.z;
        const dist = Math.round(Math.sqrt(dx * dx + dz * dz));
        if (dist > 80) return; // Hide distant chests

        const targetAngle = Math.atan2(dx, -dz);
        let diff = targetAngle - heading;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;

        if (Math.abs(diff) < fov / 2) {
          const pct = ((diff / (fov / 2)) * 50) + 50;
          markersHtml.push(`
            <div class="absolute top-0.5 transform -translate-x-1/2 flex flex-col items-center" style="left: ${pct}%">
              <span class="text-[8px] font-semibold text-amber-400 drop-shadow-[0_0_2px_rgba(251,191,36,0.3)]">Chest (${dist}m)</span>
              <div class="w-1 h-1 bg-amber-400 rounded-full mt-1"></div>
            </div>
          `);
        }
      });

      // 4. Render Villager NPC Markers
      const mobEntities = state.mobEntities || [];
      mobEntities.forEach(mob => {
        if (mob.type !== 'villager') return;
        const dx = mob.position[0] - playerPos.x;
        const dz = mob.position[2] - playerPos.z;
        const dist = Math.round(Math.sqrt(dx * dx + dz * dz));
        if (dist > 60) return; // Hide distant NPCs

        const targetAngle = Math.atan2(dx, -dz);
        let diff = targetAngle - heading;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;

        if (Math.abs(diff) < fov / 2) {
          const pct = ((diff / (fov / 2)) * 50) + 50;
          markersHtml.push(`
            <div class="absolute top-0.5 transform -translate-x-1/2 flex flex-col items-center" style="left: ${pct}%">
              <span class="text-[8px] font-semibold text-emerald-400 drop-shadow-[0_0_2px_rgba(52,211,153,0.3)]">NPC (${dist}m)</span>
              <div class="w-1 h-1 bg-emerald-400 rounded-full mt-1"></div>
            </div>
          `);
        }
      });

      // Written only when it changed: standing still, the markers are identical frame after frame, and rebuilding
      // them re-parsed ~20 elements and re-ran style and layout on every display frame (120 a second on a ProMotion
      // panel) for nothing (plan 2026-09-23-crafty-perf-heat-ipad, Task 6).
      const html = markersHtml.join('');
      if (html !== lastHtml.current) {
        lastHtml.current = html;
        container.innerHTML = html;
      }
    };

    updateCompass();
    if (!isCaptureMode()) unsubscribe = subscribeHudTick(updateCompass);
    return () => { if (unsubscribe) unsubscribe(); };
  }, [treasureChests, bossSystem]);

  const imbueArmed = useGameStore((s) => s.imbueArmed); // S2-B4-M5: the armed-reticle tell (edge-written)

  return (
    <>
    {/* S2-B4-M5: the IMBUE tell — a white-gold ring at screen center while the latch is armed
        (it haloes the pointer-locked plus crosshair below). imbueArmed is edge-written only and
        never set in capture, so the baselines are untouched. */}
    {imbueArmed && (
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none flex flex-col items-center">
        <div className="w-5 h-5 rounded-full border-2 border-resonance shadow-elev-sm"></div>
        <span className="mt-1 text-[10px] font-bold tracking-widest text-resonance">IMBUE</span>
      </div>
    )}
    <div className="absolute top-3 left-1/2 transform -translate-x-1/2 z-20 pointer-events-none flex flex-col items-center">
      <div data-testid="hud-compass" className="w-[320px] h-[34px] bg-panel-frame border-chrome border-ink rounded-md shadow-elev-md relative flex items-center justify-center overflow-hidden">
        {/* Alignment reticle line */}
        <div className="absolute top-0 bottom-0 w-[1.5px] bg-info z-20"></div>
        {/* Scrolling Marker track */}
        <div ref={containerRef} data-testid="compass-track" className="w-[280px] h-full relative overflow-hidden font-mono"></div>
      </div>
    </div>
    </>
  );
});

export function HUD({
  isPointerLocked,
  isWorldBuilt,
  gameState,
  gameSystems,
  experienceSystem,
  questSystem,
  treasureChests,
  survivalMode,
  bossSystem
}) {
  // S9c: the post-climax victory beat is dismissed once ("Keep exploring" -> endless handoff).
  const victoryPending = useGameStore((s) => s.victoryPending); // a rare event, not a per-frame value
  return (
    <>
      <AnimatePresence>
        {isPointerLocked && gameSystems.isAlive && isWorldBuilt && (
          <>
            <GameUI gameState={gameState} />
            {!isTouchUIMode() && <ControlsSheet />}{/* W3 M-HUD.9: keyboard cheatsheet demoted to auto-fade + H-toggle (desktop-only; touch has on-screen controls) */}

            <Compass treasureChests={treasureChests} bossSystem={bossSystem} />

            <ObjectiveTracker />

            <CoinReadout />

            <DayPhaseDial />

            {/* B5 (18-domain review, "HUD lies"): moved from `top-16 left-4` (buried under the QuestTracker
                panel — the health bar was 100% invisible) to the free bottom-left corner (conventional RPG
                placement). And the container is now a real `flex flex-col` column: StatBar's root is
                `inline-flex`, so the old `space-y-2` (margin-top on inline-level boxes) laid the bars out
                as a horizontal RIBBON — flex-col stacks them vertically. `w-44` gives all bars one width. */}
            <div data-testid="stat-stack" className="absolute bottom-4 left-4 pointer-events-none z-20 flex flex-col gap-2 w-44">
              <PlayerHealthBar health={gameSystems.playerHealth} maxHealth={gameSystems.maxHealth} />
              <PlayerManaBar mana={gameSystems.mana} maxMana={gameSystems.maxMana} />
              <EmberBar />
            </div>

            {/* W3 M-HUD.9: the standalone top-center "Spell: FIREBALL (15 MP)" band is REMOVED — it
                triple-stacked the top-center lane with the ObjectiveTracker + Compass. The active spell +
                MP cost read off the action bar / hotbar; removing the redundant band reclaims the lane. */}

            {/* the bottom-center XP bar (bottom-32, min-w-80) overlaps the touch joystick zone
                (left-7%/bottom-13%) -> desktop-only; touch gets the compact top-right readout below (M2b) */}
            {!isTouchUIMode() && <SimpleExperienceBar
              level={experienceSystem.playerLevel}
              currentXP={experienceSystem.currentXP}
              xpRequired={experienceSystem.xpRequired}
              xpProgress={experienceSystem.xpProgress}
            />}
            {isTouchUIMode() && <SimpleExperienceBarTouch
              level={experienceSystem.playerLevel}
              xpProgress={experienceSystem.xpProgress}
            />}

            <SimpleXPGainVisual xpGains={experienceSystem.xpGains} />

            <SimpleLevelUpEffect
              levelUpEffects={experienceSystem.levelUpEffects}
              onEffectComplete={(id) => {
                experienceSystem.setLevelUpEffects(prev =>
                  prev.filter(effect => effect.id !== id)
                );
              }}
            />

            {!isTouchUIMode() && <RadialMinimap />}{/* W3 M-HUD.8: circular radial minimap with HOME/SHRINE/BLIGHT/NPC destination blips clamped to the rim; desktop default position (bottom-right). */}
            {isTouchUIMode() && <RadialMinimap position="top-40 right-2" />}{/* touch placement: top-right BELOW the XP readout (top-28) — clear of the bottom joystick/action cluster + the top-left quest tracker. The map is the only wayfinding surface, so touch players need it (was desktop-only). Capture-suppressed (RadialMinimap returns null in capture), so no fixture drift. */}

            {!isTouchUIMode() && <AbilityBar />}{/* W3 M-HUD.3: bottom-center cooldown-sweep action bar; bottom-4 sits in the touch joystick/action-cluster band -> desktop-only for now (M-AMBIENT cleanup gives touch its own placement) */}

            <TargetFrame />{/* W3 M-HUD.7: top-center unit nameplate off the aim-cone seam; self-gates on store.targetEntity + isCaptureMode (touch-safe, top-center clear of the action cluster) */}

            <QuestTracker quests={questSystem.quests} onClaim={questSystem.claimQuest} />

            <NotificationStack notifications={questSystem.notifications} />

            {/* W3 M-HUD.4: quiet bottom-left combat-log ticker over the SAME addNotification stream as the
                corner toasts (classic-RPG "what just happened" read). Capture-suppressed; collapses on touch. */}
            <CombatLog notifications={questSystem.notifications} />

            <ChestIndicator
              chests={treasureChests.chests}
              openedChestIds={treasureChests.openedChestIds}
            />

            {/* The CONDITION has to be here, not inside the component. SurvivalWarning self-nulls on an
                empty message, and AnimatePresence cannot observe a component's own return value -- it
                diffs the ELEMENTS it is given, and this one was always a valid element with a stable key.
                So it could never enter the exiting set, and the toast's `exit` tween never once played:
                after survivalSystem's setTimeout cleared the message, it just blinked out while
                everything around it stayed mounted. */}
            <AnimatePresence>
              {survivalMode.survivalWarning && <SurvivalWarning message={survivalMode.survivalWarning} />}
            </AnimatePresence>

            <BossHealthBar
              bossActive={bossSystem.bossActive}
              bossHealth={bossSystem.bossHealth}
              bossMaxHealth={bossSystem.bossMaxHealth}
              bossPhase={bossSystem.bossPhase}
              bossName={bossSystem.bossName}
            />

            {bossSystem.bossNotification && (
              <div className="absolute top-48 left-1/2 transform -translate-x-1/2 z-30 pointer-events-none">
                <Toast status="danger">{bossSystem.bossNotification}</Toast>
              </div>
            )}
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
      <AspectHintToast />

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
