import { useGameStore } from './store/useGameStore';
import { isCaptureMode } from './devtest/captureMode';
import { bearingToMarker, bearingDeg } from './game/compass';
import { nearestLandmark } from './world/shrines.js';
import { blightHeartSite } from './world/blightHeart.js';
import { dayPhase } from './game/dayPhase.js';
import React, { useRef, useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { GameUI } from './ui/GameHud';
import { CombatInstructions } from './ui/CombatInstructions';
import { isTouchUIMode } from './input/touchDevice';
import {
  PlayerHealthBar,
  PlayerManaBar,
  PlayerHungerBar,
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
import { Panel, Toast, Icon, StatBar } from './ui/primitives/index.js';
import { FEROCITY_MAX, FEROCITY_THRESHOLD } from './game/ferocity.js';
import { KINETIC_MAX, GRAB_COST } from './game/kinetic.js';
import { SNARE_COST, SOUL_MAX } from './game/soul.js';
import { RESONANCE_MAX, ZONE_COST } from './game/resonance';

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
// Capture-SUPPRESSED (return null + interval never starts) -> the 20 visual baselines stay byte-identical.
const DayPhaseDial = React.memo(() => {
  const isDay = useGameStore((s) => s.isDay);
  const orbitRef = useRef(null);
  const labelRef = useRef(null);

  useEffect(() => {
    if (isCaptureMode()) return undefined; // never animate in capture -> zero baseline impact
    const apply = () => {
      const st = useGameStore.getState();
      const p = dayPhase(st.gameTime, st.isDay);
      if (orbitRef.current) orbitRef.current.style.transform = `rotate(${p.angleDeg - 180}deg)`;
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
          <div ref={orbitRef} className="absolute inset-0" style={{ transform: `rotate(${init.angleDeg - 180}deg)` }}>
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

// S2-B1-M4 Ferocity bar: bank-in-day / spend-in-siege fury. Gated on ferocityBanked > 0 (like
// CoinReadout) so the default-zero capture states stay byte-identical (no baseline drift). When the
// bank is full (>= threshold) it reads "ROAR!" -- the player can transform into an element-beast.
const FerocityBar = React.memo(() => {
  const ferocity = useGameStore((s) => s.ferocityBanked);
  if (!ferocity || ferocity <= 0) return null;
  const ready = ferocity >= FEROCITY_THRESHOLD;
  return (
    <StatBar kind="ferocity" value={ferocity} max={FEROCITY_MAX} icon="run"
      label={ready ? 'ROAR!' : null} showValue className="w-44" />
  );
});

// S2-B2-M4: the Kinetic bank (VOIDHAND grab charge). Same self-null-at-zero capture-safety as
// FerocityBar, PLUS the unlock gate — no meter is shown for a locked ability (and capture saves
// lack the talent, so the 13 baselines hold without a re-baseline). "GRAB!" reads when one
// grab is affordable. Violet = the shipped phantom-rim identity (one color per Aspect).
// S2-B3-M6: the Soul bank (SOULBIND) — the KineticBar twin: self-null at zero + the unlock
// gate keep all 13 capture baselines untouched. "SNARE!" reads when one bind is affordable.
// Jade = the tether/tint identity (one color per Aspect).
// S2-B4-M6: the Resonance bank (ELEMANCER) — the SoulBar twin: self-null at zero + the
// unlock gate keep all 13 capture baselines untouched. "IMBUE!" reads when a zone is
// affordable. White-gold = the player-side catalyst identity (one color per Aspect).
const ResonanceBar = React.memo(() => {
  const resonance = useGameStore((s) => s.resonanceBanked);
  const hasImbue = useGameStore((s) => (s.unlockedTalents?.['elemancer_imbue'] ?? 0) > 0);
  if (!hasImbue || !resonance || resonance <= 0) return null;
  const ready = resonance >= ZONE_COST;
  return (
    <StatBar kind="resonance" value={resonance} max={RESONANCE_MAX} icon="magic"
      label={ready ? 'IMBUE!' : null} showValue className="w-44" />
  );
});

const SoulBar = React.memo(() => {
  const soul = useGameStore((s) => s.soulBanked);
  const hasSnare = useGameStore((s) => (s.unlockedTalents?.['soulbind_snare'] ?? 0) > 0);
  if (!hasSnare || !soul || soul <= 0) return null;
  const ready = soul >= SNARE_COST;
  return (
    <StatBar kind="soul" value={soul} max={SOUL_MAX} icon="magic"
      label={ready ? 'SNARE!' : null} showValue className="w-44" />
  );
});

const KineticBar = React.memo(() => {
  const kinetic = useGameStore((s) => s.kineticBanked);
  const hasGrasp = useGameStore((s) => (s.unlockedTalents?.['voidhand_grasp'] ?? 0) > 0);
  if (!hasGrasp || !kinetic || kinetic <= 0) return null;
  const ready = kinetic >= GRAB_COST;
  return (
    <StatBar kind="kinetic" value={kinetic} max={KINETIC_MAX} icon="force"
      label={ready ? 'GRAB!' : null} showValue className="w-44" />
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
const ObjectiveTracker = React.memo(() => {
  const arrowRef = useRef(null);
  const textRef = useRef(null);
  const distRef = useRef(null);
  const shrineCache = useRef({ t: 0, shrine: null });

  useEffect(() => {
    if (isCaptureMode()) return; // never animate/scan in capture -> zero baseline impact
    let animFrame;
    const tick = () => {
      animFrame = requestAnimationFrame(tick);
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
        if (s) { targetX = s.worldX; targetZ = s.worldZ; label = 'Reach the frontier shrine'; color = '#46E0FF'; }
      }
      if (targetX === undefined) {
        const bh = blightHeartSite();
        targetX = bh.x; targetZ = bh.z; label = 'Shatter the Blight Heart'; color = '#A24BFF';
      }

      // Full-circle bearing -> the arrow points to the objective regardless of which way the player faces.
      const b = bearingToMarker(targetX, targetZ, playerPos.x, playerPos.z, heading, Math.PI * 2);
      arrow.style.transform = `rotate(${bearingDeg(b.pct)}deg)`;
      arrow.style.background = color;
      txt.textContent = label;
      dist.textContent = `${Math.round(b.dist)}m`;
    };
    tick();
    return () => cancelAnimationFrame(animFrame);
  }, []);

  if (isCaptureMode()) return null;

  return (
    <div className="absolute top-12 left-1/2 transform -translate-x-1/2 z-20 pointer-events-none">
      <div className="flex items-center gap-2 px-2.5 py-1 bg-panel-raise border-chrome border-ink rounded-sm whitespace-nowrap">
        <span ref={arrowRef} className="inline-block w-2.5 h-2.5 flex-none" style={{ background: '#46E0FF', clipPath: 'polygon(50% 0,100% 100%,0 100%)' }}></span>
        <span ref={textRef} className="text-[11px] font-bold text-text">Reach the frontier shrine</span>
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

  useEffect(() => {
    let animFrame;
    
    const updateCompass = () => {
      // Dev capture-determinism: in capture mode the follow-cam is pinned, so the
      // compass markers are fully determined by the frozen camera + marker positions.
      // Render ONCE and do NOT reschedule the rAF loop — a continuously running loop
      // re-derives the float `left: %` each frame and rounds to sub-pixel-different
      // marker x-positions between runs (a ~500px top-of-frame flicker). Inert in
      // normal gameplay: the loop runs every frame exactly as before.
      if (!isCaptureMode()) animFrame = requestAnimationFrame(updateCompass);

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

      container.innerHTML = markersHtml.join('');
    };

    updateCompass();
    return () => cancelAnimationFrame(animFrame);
  }, [treasureChests, bossSystem]);

  const imbueArmed = useGameStore((s) => s.imbueArmed); // S2-B4-M5: the armed-reticle tell (edge-written)

  return (
    <>
    {/* S2-B4-M5: the IMBUE tell — a white-gold ring at screen center while the latch is armed
        (it haloes the pointer-locked plus crosshair below). imbueArmed is edge-written only and
        never set in capture, so the 13 baselines are untouched. */}
    {imbueArmed && (
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none flex flex-col items-center">
        <div className="w-5 h-5 rounded-full border-2 border-resonance shadow-elev-sm"></div>
        <span className="mt-1 text-[10px] font-bold tracking-widest text-resonance">IMBUE</span>
      </div>
    )}
    <div className="absolute top-3 left-1/2 transform -translate-x-1/2 z-20 pointer-events-none flex flex-col items-center">
      <div className="w-[320px] h-[34px] bg-panel-frame border-chrome border-ink rounded-md shadow-elev-md relative flex items-center justify-center overflow-hidden">
        {/* Alignment reticle line */}
        <div className="absolute top-0 bottom-0 w-[1.5px] bg-info z-20"></div>
        {/* Scrolling Marker track */}
        <div ref={containerRef} className="w-[280px] h-full relative overflow-hidden font-mono"></div>
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
  bossSystem,
  spellUpgrades,
  showStats,
  setShowStats,
  setIsPointerLocked
}) {
  // S9c: the post-climax victory beat is dismissed once ("Keep exploring" -> endless handoff).
  const [victoryDismissed, setVictoryDismissed] = useState(false);
  return (
    <>
      <AnimatePresence>
        {isPointerLocked && gameSystems.isAlive && isWorldBuilt && (
          <>
            <GameUI
              gameState={gameState}
              showStats={showStats}
              setShowStats={setShowStats}
            />
            {!isTouchUIMode() && <ControlsSheet />}{/* W3 M-HUD.9: keyboard cheatsheet demoted to auto-fade + H-toggle (desktop-only; touch has on-screen controls) */}

            <Compass treasureChests={treasureChests} bossSystem={bossSystem} />

            <ObjectiveTracker />

            <CoinReadout />

            <DayPhaseDial />

            <div className="absolute top-16 left-4 pointer-events-none z-20 space-y-2">
              <PlayerHealthBar health={gameSystems.playerHealth} maxHealth={gameSystems.maxHealth} />
              <PlayerManaBar mana={gameSystems.mana} maxMana={gameSystems.maxMana} />
              {/* W3 M-HUD.9: the hunger bar is a SURVIVAL-mode mechanic — in creative it pinned a static
                  100/100 pill that read as a duplicate stat. Gate it on survival so non-survival stacks clean. */}
              {gameState.gameMode === 'survival' && <PlayerHungerBar hunger={gameSystems.hunger} />}
              <FerocityBar />
              <KineticBar />
              <SoulBar />
          <ResonanceBar />
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

            <AnimatePresence>
              <SurvivalWarning message={survivalMode.survivalWarning} />
            </AnimatePresence>

            <BossHealthBar
              bossActive={bossSystem.bossActive}
              bossHealth={bossSystem.bossHealth}
              bossMaxHealth={bossSystem.bossMaxHealth}
              bossPhase={bossSystem.bossPhase}
            />

            {bossSystem.bossNotification && (
              <div className="absolute top-48 left-1/2 transform -translate-x-1/2 z-30 pointer-events-none">
                <Toast status="danger">{bossSystem.bossNotification}</Toast>
              </div>
            )}
            {spellUpgrades.upgradeNotification && (
              <div className="absolute top-64 left-1/2 transform -translate-x-1/2 z-30 pointer-events-none">
                <Toast status="info">{spellUpgrades.upgradeNotification}</Toast>
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
      
      {bossSystem?.bossDefeated && !victoryDismissed && (
        <VictoryOverlay onDismiss={() => setVictoryDismissed(true)} />
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
