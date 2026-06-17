# W3 — Living Frontier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (- [ ]) syntax.

**Goal:** Turn Crafty's empty procedural world into a populated solo-frontier outpost — a real Hearth settlement with static NPCs, ambient life, a narrative quest chain over the existing shrine→Blight-Heart spine, and a complete classic-RPG HUD (nametags, target frame, combat log, cooldown sweeps, radial minimap, decluttered chrome, spawn legibility).

**Architecture:** Reuse every existing backend seam — `addNotification` stream (QuestSystem.jsx), `entity.health/maxHealth` on the miniplex ECS, `voxelKit` `Cube`/`Emissive` toon primitives (`HomeAnchorRender`/`Landmark` pattern in Terrain.jsx), `nearestLandmark`/`blightHeartSite` compass data, `TradingInterface` + `claimQuest`/`QUEST_LIST` (QuestSystem.jsx), `mobKillBus`. The one genuinely-new architectural seam: Aspect/dodge cooldown timestamps live ONLY in component-local refs inside Components.jsx's `useFrame` (`voidhandSMRef`/`soulbindSMRef`/`beastSMRef`/`dodgeStateRef`) — the ability bar requires a transient store mirror (Game-Loop-Isolation: ref-read → throttled `setState`, never per-frame React state). NPCs are static `ecs.add` entities placed at fixed hub coords with `isNPC`/`isStatic` flags so the AI tick skips them; the hub is a deterministic voxelKit render group (zero save data, capture-suppressed) like `HomeAnchorRender`.

**Tech Stack:** React 19, R3F 9.5 (`useFrame`, drei `<Billboard>`/`<Html>`), Three 0.172, zustand 5 (transient `getState()`/`setState`), framer-motion 12, miniplex ECS, vitest, the locked bold-flat `ui/primitives` token system (`Panel`/`Slot`/`StatBar`/`Icon`/`Button`).

---

## File Structure (created / modified + responsibility)

### Created
- `frontend/src/game/cooldownMirror.js` — pure helper: given the 4 Aspect SM states + dodge ref, returns a JSON-safe `{ grab, snare, imbue, roar, dodge }` map of `{ readyAt, duration }` (or `null` if locked) for the store mirror. Pure → unit-testable.
- `frontend/src/ui/AbilityBar.jsx` — the cooldown-sweep action bar (conic-gradient radial sweep over the mirrored timestamps, rAF-driven DOM writes).
- `frontend/src/ui/CombatLog.jsx` — bottom-left scrolling combat-log ticker rendering the `addNotification` ring buffer.
- `frontend/src/ui/TargetFrame.jsx` — framed target/unit nameplate (name + HP + level) shown when aiming at a mob/NPC.
- `frontend/src/render/Nametags.jsx` — billboarded overhead labels over mobs/NPCs/boss (drei `<Billboard>` + canvas sprite, LOD-culled).
- `frontend/src/render/RadialMinimap.jsx` — circular clipped minimap with destination blips (HOME/SHRINE/BLIGHT/NPCs).
- `frontend/src/game/nametagData.js` — pure: `nametagFor(entity)` → `{ text, showBar, color }` from `MOB_TYPES` display names + `entity.health`.
- `frontend/src/world/hubLayout.js` — pure deterministic hub building/NPC coordinate table (forge / stall / watchtower + 4 NPC anchor coords) around the Hearth.
- `frontend/src/render/HubRender.jsx` — the voxelKit building group (forge, market stall, watchtower) stamped at the Hearth, mounted in Terrain.jsx.
- `frontend/src/world/npcSpawn.js` — pure: the NPC roster (`HUB_NPCS`: merchant/smith/guide/healer) + `spawnHubNPCs(ecs, nextId)` placement helper.
- `frontend/src/render/NpcModel.jsx` — static-NPC render wrapper (reuses villager MobModel body + idle bob + overhead `!`/`?` glyph).
- `frontend/src/game/npcRoutine.js` — pure ambient patrol/emote schedule math (day-active / night-retreat waypoint follow + emote timer).
- `frontend/src/game/questLore.js` — narrative chain data: lore/giver fields layered onto QUEST_LIST + the re-themed chain order.
- `frontend/src/ui/QuestLog.jsx` — the full quest LOG panel (lore + giver + objective), modeled on `AchievementsPanel`.
- New static gates under `frontend/tests/gates/`: `ability-bar-gates.test.js`, `combat-log-gates.test.js`, `target-frame-gates.test.js`, `nametags-gates.test.js`, `radial-minimap-gates.test.js`, `hud-declutter-gates.test.js`, `spawn-legibility-gates.test.js`, `hub-render-gates.test.js`, `npc-spawn-gates.test.js`, `npc-routine-gates.test.js`, `quest-lore-gates.test.js`, `quest-log-gates.test.js`.
- New characterization tests under `frontend/tests/data/`: `cooldownMirror.test.js`, `nametagData.test.js`, `hubLayout.test.js`, `npcSpawn.test.js`, `npcRoutine.test.js`, `questLore.test.js`.
- New probes under `frontend/scripts/visual/`: `hud-probe.mjs` (drive enterPlay, screenshot HUD with ability bar/combat log/minimap/nametags), `hub-probe.mjs` (POV of the populated hub + NPCs), `spawn-legibility-probe.mjs` (spawn-view beacon visibility).

### Modified
- `frontend/src/store/useGameStore.jsx` — add `abilityCooldowns` mirror field + setter (~after line 552 `selectedVillager`); add `restoreMana`/`setMana` if missing (used by target frame? no — leave economy to W1); add `npcEntities` mirror (like `mobEntities`) for minimap/nametag NPC blips.
- `frontend/src/Components.jsx` — write the cooldown mirror in the existing `useFrame` (after the SM ticks at ~639/709/573 + the dodge block ~889), throttled to ~150ms.
- `frontend/src/HUD.jsx` — mount `AbilityBar`, `CombatLog`, `TargetFrame`, `RadialMinimap`; gate `CombatInstructions` behind a toggle/auto-fade; dedupe stat pills; remove the standalone spell label band; swap `Minimap` → `RadialMinimap`; fix the `9px Orbitron` minimap font (covered by W2/Art but the new RadialMinimap must not reintroduce it).
- `frontend/src/render/MobModel.jsx` — gate hostile red eyes on `!entity.isAlly` (W1 overlaps; W3 only if not already done — verify); no nametag here (separate billboard layer).
- `frontend/src/game/mobTypes.js` — add `displayName` to mob types (for nametags) + an `npc` archetype block.
- `frontend/src/world/Terrain.jsx` — mount `<HubRender />` next to `<HomeAnchorRender />` (line ~987); stamp hub voxels deterministically if any are solid (reuse the `stampHomeAnchor` pattern — decorative-only here, no collision blocks needed beyond the existing plinth).
- `frontend/src/SimplifiedNPCSystem.jsx` — spawn hub NPCs once on world-ready (next to the mob spawn `useEffect` ~152); skip NPC entities in the AI/movement tick (~352) except the ambient-routine path; sync `npcEntities` in `MinimapSyncSystem` (~432).
- `frontend/src/QuestSystem.jsx` — layer lore/giver fields onto `QUEST_LIST` (from `questLore.js`); add a persistent goal cue (replace the 4s auto-dismiss for the spawn objective — actually owned by `ObjectiveTracker` which already persists; W3 adds the narrative naming).
- `frontend/src/InputManager.jsx` — add the QuestLog hotkey (L) + the CombatInstructions toggle (H); the G-interact already routes NPCs through `selectedVillager`/`TradingInterface` (reuse for merchant; route smith/guide/healer to their panels).
- `frontend/src/ui/TradingInterface.jsx` — accept an NPC `role` so the merchant panel header reflects the named NPC (cheap; the trade backend is unchanged).

---

## MILESTONE M-HUD — Classic-RPG HUD completeness (ships FIRST, independent of population)

Cheap, high-value, world-population-independent. Order within: cooldown mirror → ability bar → combat log → target frame → nametags → radial minimap → declutter → spawn legibility.

### Task M-HUD.1 — Pure cooldown-mirror helper (red-first)

**Files:** create `frontend/src/game/cooldownMirror.js`; test `frontend/tests/data/cooldownMirror.test.js`

- [ ] Write the failing test `frontend/tests/data/cooldownMirror.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { buildCooldownMirror } from '../../src/game/cooldownMirror.js';

// The 4 Aspect SMs expose `cooldownUntil` (seconds, game-clock `now`); dodge ref uses
// `lastDodgeTime` + `cooldown`. buildCooldownMirror maps them to a JSON-safe HUD model.
describe('buildCooldownMirror', () => {
  const base = { now: 10 };
  it('returns null for a locked/unowned ability', () => {
    const m = buildCooldownMirror({
      now: 10,
      voidhand: null, soulbind: null, beast: null,
      dodge: { lastDodgeTime: 0, cooldown: 0.8 },
      owned: { grab: false, snare: false, roar: false, imbue: false },
    });
    expect(m.grab).toBeNull();
    expect(m.snare).toBeNull();
    expect(m.roar).toBeNull();
    expect(m.imbue).toBeNull();
  });
  it('an owned ability with cooldownUntil in the future reports {readyAt,duration,remaining}', () => {
    const m = buildCooldownMirror({
      now: 10,
      voidhand: { cooldownUntil: 12 }, soulbind: null, beast: null,
      dodge: { lastDodgeTime: 9.5, cooldown: 0.8 },
      owned: { grab: true, snare: false, roar: false, imbue: false },
    });
    expect(m.grab.readyAt).toBe(12);
    expect(m.grab.remaining).toBeCloseTo(2);
    expect(m.grab.ready).toBe(false);
  });
  it('dodge is always present (no ownership gate); ready when now-lastDodge>=cooldown', () => {
    const ready = buildCooldownMirror({ now: 10, voidhand: null, soulbind: null, beast: null, dodge: { lastDodgeTime: 9.0, cooldown: 0.8 }, owned: {} }).dodge;
    expect(ready.ready).toBe(true);
    const cooling = buildCooldownMirror({ now: 10, voidhand: null, soulbind: null, beast: null, dodge: { lastDodgeTime: 9.6, cooldown: 0.8 }, owned: {} }).dodge;
    expect(cooling.ready).toBe(false);
    expect(cooling.remaining).toBeCloseTo(0.4);
  });
});
```
- [ ] Run it and watch it fail: `cd /Users/kz/Code/Crafty/frontend && npx vitest run tests/data/cooldownMirror.test.js` → expect `Cannot find module '.../cooldownMirror.js'`.
- [ ] Create `frontend/src/game/cooldownMirror.js` (minimal impl):
```js
// Pure HUD model for the ability-bar cooldown sweeps. The 4 Aspect SMs (voidhand/soulbind/beast)
// expose `cooldownUntil` in game-clock seconds; the dodge ref uses lastDodgeTime + cooldown. This
// maps them to a JSON-safe {readyAt,duration,remaining,ready} per slot so the HUD never reads the
// component-local refs directly (Game-Loop-Isolation: Components.jsx mirrors this into the store).
function slot(now, cooldownUntil, duration, owned) {
  if (!owned) return null;
  const readyAt = cooldownUntil || 0;
  const remaining = Math.max(0, readyAt - now);
  return { readyAt, duration, remaining, ready: remaining <= 0 };
}
export function buildCooldownMirror({ now, voidhand, soulbind, beast, dodge, owned = {} }) {
  return {
    grab: slot(now, voidhand?.cooldownUntil, 0.6, owned.grab),
    snare: slot(now, soulbind?.cooldownUntil, 1.5, owned.snare),
    roar: slot(now, beast?.cooldownUntil, 1.5, owned.roar),
    imbue: slot(now, 0, 1.0, owned.imbue), // ELEMANCER imbue has no SM cooldownUntil; resource-gated only
    dodge: (() => {
      const readyAt = (dodge?.lastDodgeTime || 0) + (dodge?.cooldown || 0.8);
      const remaining = Math.max(0, readyAt - now);
      return { readyAt, duration: dodge?.cooldown || 0.8, remaining, ready: remaining <= 0 };
    })(),
  };
}
```
- [ ] Run it and watch it pass: `npx vitest run tests/data/cooldownMirror.test.js` → all green.
- [ ] **Done-gate (verification-before-completion):** `npx vitest run tests/data/cooldownMirror.test.js` green; `npx eslint src/game/cooldownMirror.js` clean.
- [ ] Commit: `git add -A && git commit -F -` with message body `M-HUD.1 pure cooldown-mirror helper (buildCooldownMirror)`.

### Task M-HUD.2 — Store mirror field + Components.jsx writer

**Files:** modify `frontend/src/store/useGameStore.jsx` (~line 552, after `selectedVillager`), modify `frontend/src/Components.jsx` (after the SM ticks ~639/709 + dodge ~889); gate `frontend/tests/gates/ability-bar-gates.test.js` (cooldown-mirror-wiring section)

- [ ] Write the failing gate `frontend/tests/gates/ability-bar-gates.test.js` (mirror-wiring section only for now):
```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('ability-bar cooldown mirror wiring', () => {
  it('store defines abilityCooldowns + setter', () => {
    const store = read('store/useGameStore.jsx');
    expect(store).toMatch(/abilityCooldowns:/);
    expect(store).toMatch(/setAbilityCooldowns:/);
  });
  it('Components.jsx writes the mirror via buildCooldownMirror (throttled, not per-frame React state)', () => {
    const c = strip(read('Components.jsx'));
    expect(c).toMatch(/buildCooldownMirror/);
    expect(c).toMatch(/setAbilityCooldowns|abilityCooldowns:/);
    // Game-Loop-Isolation: must use a throttle ref, never a per-frame setState in the hot loop
    expect(c).toMatch(/_lastCdMirror|cdMirrorThrottle/);
  });
});
```
- [ ] Run it and watch it fail: `npx vitest run tests/gates/ability-bar-gates.test.js` → 3 fail.
- [ ] Add to `frontend/src/store/useGameStore.jsx` after the `selectedVillager`/`setSelectedVillager` pair (line ~552-553):
```js
    abilityCooldowns: { grab: null, snare: null, roar: null, imbue: null, dodge: { ready: true, remaining: 0, duration: 0.8 } },
    setAbilityCooldowns: (m) => set({ abilityCooldowns: m }),
```
- [ ] Add the import at the top of `frontend/src/Components.jsx` (with the other game imports): `import { buildCooldownMirror } from './game/cooldownMirror.js';`
- [ ] Add a throttle ref near the other refs in Components.jsx (next to `voidhandSMRef`/`soulbindSMRef` ~line 119-120): `const _lastCdMirror = useRef(0);`
- [ ] In the existing `useFrame` body, AFTER the dodge state-machine block updates `dodgeStateRef` (~line 909) and the SM refs are written (`voidhandSMRef.current`/`soulbindSMRef.current`/`beastSMRef.current`), append a throttled mirror write:
```js
    // Mirror the Aspect/dodge cooldown timers into the store ~6.7x/s so the HUD ability bar can sweep
    // them WITHOUT reading these component-local refs (Game-Loop-Isolation: a throttled setState, never
    // per-frame React state). owned flags come from unlockedTalents (the same gate the HUD meters use).
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
          roar: (t['ferocity_roar'] ?? t['beast_roar'] ?? 0) > 0,
          imbue: (t['elemancer_imbue'] ?? 0) > 0,
        },
      }));
    }
```
> NOTE TO IMPLEMENTER: verify the exact `nowTime` variable name in the useFrame scope (grep `nowTime` / `performance.now()` in the dodge block, line ~889-897 uses `nowTime`) and the exact roar talent key in `game/talentTree.js` (`grep -n roar src/game/talentTree.js`); use the real key. AST-safe Edit only.
- [ ] Run it and watch it pass: `npx vitest run tests/gates/ability-bar-gates.test.js` → green.
- [ ] **Done-gate:** `npx vitest run tests/gates/ability-bar-gates.test.js` green; `npm run build` clean; `npx eslint src/Components.jsx src/store/useGameStore.jsx` clean.
- [ ] Commit: `git add -A && git commit -F -` body `M-HUD.2 abilityCooldowns store mirror + throttled Components.jsx writer`.

### Task M-HUD.3 — AbilityBar component (conic-gradient radial sweep)

**Files:** create `frontend/src/ui/AbilityBar.jsx`; extend gate `frontend/tests/gates/ability-bar-gates.test.js`

- [ ] Extend `frontend/tests/gates/ability-bar-gates.test.js` with a render section:
```js
describe('AbilityBar component', () => {
  const bar = read('ui/AbilityBar.jsx');
  it('reads abilityCooldowns from the store (not the SM refs)', () => {
    expect(bar).toMatch(/abilityCooldowns/);
    expect(bar).not.toMatch(/voidhandSMRef|soulbindSMRef/);
  });
  it('uses a conic-gradient radial sweep + the Slot primitive', () => {
    expect(bar).toMatch(/conic-gradient/);
    expect(bar).toMatch(/Slot/);
  });
  it('is capture-suppressed (returns null under isCaptureMode)', () => {
    expect(bar).toMatch(/isCaptureMode\(\)/);
  });
  it('labels the 5 signature abilities', () => {
    for (const k of ['GRAB', 'SNARE', 'IMBUE', 'ROAR', 'DODGE']) expect(bar).toMatch(new RegExp(k));
  });
});
```
- [ ] Run it and watch it fail: `npx vitest run tests/gates/ability-bar-gates.test.js` → render section fails.
- [ ] Create `frontend/src/ui/AbilityBar.jsx`:
```jsx
import React, { useRef, useEffect } from 'react';
import { useGameStore } from '../store/useGameStore';
import { isCaptureMode } from '../devtest/captureMode';
import { Slot, Icon } from './primitives/index.js';

// The signature-ability action bar with CSS conic-gradient radial cooldown sweeps. Reads the
// store's abilityCooldowns mirror (written ~6.7x/s by Components.jsx) — never the component-local
// SM refs. Game-Loop-Isolation: a self-contained rAF reads getState() transiently and writes the
// sweep angle to a DOM ref; no per-frame React state. Capture-SUPPRESSED so the 20 visual baselines
// stay byte-identical (the bar is gated on owned abilities the capture saves never have anyway).
const SLOTS = [
  { key: 'grab', label: 'GRAB', icon: 'force', accent: '#9D4BFF' },
  { key: 'snare', label: 'SNARE', icon: 'magic', accent: '#3DFFB0' },
  { key: 'imbue', label: 'IMBUE', icon: 'magic', accent: '#F5E6A8' },
  { key: 'roar', label: 'ROAR', icon: 'run', accent: '#FF7A1A' },
  { key: 'dodge', label: 'DODGE', icon: 'shield', accent: '#46E0FF' },
];

export const AbilityBar = React.memo(() => {
  const sweepRefs = useRef({});
  useEffect(() => {
    if (isCaptureMode()) return undefined;
    let raf;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const cds = useGameStore.getState().abilityCooldowns || {};
      for (const s of SLOTS) {
        const el = sweepRefs.current[s.key];
        if (!el) continue;
        const cd = cds[s.key];
        if (!cd || cd.ready || !cd.duration) { el.style.opacity = '0'; continue; }
        const frac = Math.min(1, Math.max(0, cd.remaining / cd.duration));
        el.style.opacity = '1';
        // conic sweep from top, clockwise; the dark wedge shrinks as the cooldown elapses
        el.style.background = `conic-gradient(from 0deg, rgba(0,0,0,0.62) ${frac * 360}deg, transparent ${frac * 360}deg)`;
      }
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);

  if (isCaptureMode()) return null;
  const cds = useGameStore.getState().abilityCooldowns || {};
  const owned = SLOTS.filter((s) => s.key === 'dodge' || cds[s.key] != null);
  if (owned.length <= 1) return null; // only dodge -> no Aspect unlocked yet; keep HUD clean

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none flex gap-2">
      {owned.map((s) => (
        <div key={s.key} className="relative">
          <Slot className="w-12 h-12 flex flex-col items-center justify-center">
            <Icon name={s.icon} size={18} style={{ color: s.accent }} />
            <span className="text-[8px] font-bold tracking-wide text-text-muted leading-none mt-0.5">{s.label}</span>
          </Slot>
          <div
            ref={(el) => (sweepRefs.current[s.key] = el)}
            className="absolute inset-0 rounded-sm pointer-events-none"
            style={{ opacity: 0 }}
          />
        </div>
      ))}
    </div>
  );
});
```
> NOTE TO IMPLEMENTER: confirm the `Slot` primitive accepts `className`/children and the `Icon` names `force`/`magic`/`run`/`shield` exist (`grep -n "force\|run\|shield" src/ui/primitives/gameIcons.js`); substitute valid names if any are missing.
- [ ] Run it and watch it pass: `npx vitest run tests/gates/ability-bar-gates.test.js` → green.
- [ ] Mount it in `frontend/src/HUD.jsx`: add `import { AbilityBar } from './ui/AbilityBar';` and render `<AbilityBar />` inside the `isPointerLocked && isAlive && isWorldBuilt` block (after `<Minimap />`, ~line 664). Desktop+touch both (it's bottom-center, above the XP bar — verify no overlap with the touch joystick; if it collides on touch, gate `{!isTouchUIMode() && <AbilityBar />}` and add a touch placement in M-AMBIENT cleanup).
- [ ] **Done-gate + LIVE-LOOK:** create `frontend/scripts/visual/hud-probe.mjs` (model on `pov-probe.mjs`) that calls `start`, force-unlocks an Aspect via the store (`window.useGameStore.getState()` set `unlockedTalents` + bank a resource), casts the ability, then screenshots `/tmp/crafty-hud/ability-bar.png`. Run `node scripts/visual/hud-probe.mjs`, then **Read the PNG and LOOK**: confirm the bar shows the unlocked slots and a visible dark sweep wedge that shrinks. A green gate is necessary, not sufficient.
- [ ] Run the capture gate to confirm NO baseline drift (bar is capture-suppressed): `npm run visual:capture && npx vitest run --config vitest.visual.config.js` → all 24 frames within 6%.
- [ ] Commit: `git add -A && git commit -F -` body `M-HUD.3 AbilityBar with conic-gradient cooldown sweeps + hud-probe live-look`.

### Task M-HUD.4 — CombatLog corner ticker

**Files:** create `frontend/src/ui/CombatLog.jsx`; gate `frontend/tests/gates/combat-log-gates.test.js`

- [ ] Write the failing gate `frontend/tests/gates/combat-log-gates.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

describe('combat-log gates', () => {
  const log = read('ui/CombatLog.jsx');
  it('renders the notification stream prop (the addNotification feed)', () => {
    expect(log).toMatch(/notifications/);
  });
  it('caps the visible lines to a ring buffer (slice/-N)', () => {
    expect(log).toMatch(/slice\(-?\d+\)/);
  });
  it('is bottom-left + capture-suppressed', () => {
    expect(log).toMatch(/isCaptureMode\(\)/);
    expect(log).toMatch(/bottom-/);
    expect(log).toMatch(/left-/);
  });
  it('HUD wires CombatLog to questSystem.notifications + collapses on touch like QuestTracker', () => {
    const hud = read('HUD.jsx');
    expect(hud).toMatch(/<CombatLog[^>]*notifications=\{questSystem\.notifications\}/);
  });
});
```
- [ ] Run it and watch it fail: `npx vitest run tests/gates/combat-log-gates.test.js` → fail.
- [ ] Create `frontend/src/ui/CombatLog.jsx`:
```jsx
import React from 'react';
import { isCaptureMode } from '../devtest/captureMode';
import { isTouchUIMode } from '../input/touchDevice';
import { Icon } from './primitives/index.js';

// A compact bottom-left scrolling combat-log ticker. Renders the LAST N entries of the existing
// addNotification stream (QuestSystem.jsx) — the same data the corner toasts use — as a quiet,
// chat-style feed for the classic-RPG "what just happened" read. Capture-SUPPRESSED (returns null)
// so the 20 deterministic visual baselines stay byte-identical. Collapses to fewer lines on touch.
const TYPE_COLOR = {
  quest: 'text-success', achievement: 'text-accent', reward: 'text-success',
  loot: 'text-info', danger: 'text-danger', warn: 'text-warn', info: 'text-text-muted',
};
const TYPE_ICON = {
  quest: 'check', achievement: 'trophy', reward: 'gift', loot: 'gift',
  danger: 'skull', warn: 'warning', info: 'sparkles',
};

export const CombatLog = React.memo(({ notifications = [] }) => {
  if (isCaptureMode()) return null;
  const lines = notifications.slice(-(isTouchUIMode() ? 4 : 8));
  if (lines.length === 0) return null;
  return (
    <div className="absolute bottom-24 left-4 z-10 pointer-events-none space-y-0.5 max-w-[320px]">
      {lines.map((n) => (
        <div key={n.id} className="flex items-center gap-1.5 text-[11px] font-medium opacity-80">
          <Icon name={TYPE_ICON[n.type] || 'sparkles'} size={11} className={`flex-none ${TYPE_COLOR[n.type] || 'text-text-muted'}`} />
          <span className={TYPE_COLOR[n.type] || 'text-text'}>{n.text}</span>
        </div>
      ))}
    </div>
  );
});
```
- [ ] Run it and watch it fail still (HUD wiring assertion). Wire it in `frontend/src/HUD.jsx`: `import { CombatLog } from './ui/CombatLog';` and render `<CombatLog notifications={questSystem.notifications} />` in the gameplay block (near `<NotificationStack ... />` ~line 668).
- [ ] Run it and watch it pass: `npx vitest run tests/gates/combat-log-gates.test.js` → green.
- [ ] **Done-gate + LIVE-LOOK:** extend `hud-probe.mjs` to kill a mob (drive melee / `window.useGameStore.getState().addNotification('Defeated zombie','loot')`) and screenshot `/tmp/crafty-hud/combat-log.png`. **Read + LOOK**: confirm a quiet bottom-left feed of recent events, not overlapping the joystick. Run `npm run visual:capture && npx vitest run --config vitest.visual.config.js` → no baseline drift.
- [ ] Commit: `git add -A && git commit -F -` body `M-HUD.4 CombatLog corner ticker over the addNotification stream`.

### Task M-HUD.5 — Nametag data helper (pure, red-first)

**Files:** create `frontend/src/game/nametagData.js`; modify `frontend/src/game/mobTypes.js`; test `frontend/tests/data/nametagData.test.js`

- [ ] Write the failing test `frontend/tests/data/nametagData.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { nametagFor } from '../../src/game/nametagData.js';

describe('nametagFor', () => {
  it('hostile mob -> name + health bar + danger color, only within range', () => {
    const tag = nametagFor({ type: 'zombie', health: 30, maxHealth: 60, passive: false, isAlly: false }, 20);
    expect(tag.text).toBeTruthy();
    expect(tag.showBar).toBe(true);
    expect(tag.hpFrac).toBeCloseTo(0.5);
    expect(tag.visible).toBe(true);
  });
  it('beyond the LOD range -> not visible', () => {
    expect(nametagFor({ type: 'zombie', health: 30, maxHealth: 60, passive: false }, 999).visible).toBe(false);
  });
  it('NPC / passive -> name only (no health bar)', () => {
    const tag = nametagFor({ type: 'villager', health: 120, maxHealth: 120, passive: true, npcName: 'Bram the Trader' }, 10);
    expect(tag.showBar).toBe(false);
    expect(tag.text).toBe('Bram the Trader');
  });
  it('bound ally -> jade color, friendly read', () => {
    expect(nametagFor({ type: 'zombie', health: 50, maxHealth: 60, isAlly: true }, 10).color).toMatch(/3DFFB0|jade/i);
  });
});
```
- [ ] Run it and watch it fail: `npx vitest run tests/data/nametagData.test.js` → module not found.
- [ ] Create `frontend/src/game/nametagData.js`:
```js
import { MOB_TYPES } from './mobTypes.js';

// Pure nametag model: given an ECS entity + planar distance to the player, returns the billboard
// label model (text/color/health-bar). Hostiles show name+bar within ~30m; NPCs/passives show
// name-only; bound allies read jade (friendly). Keeps the render layer (render/Nametags.jsx) dumb.
const HOSTILE_RANGE = 30;
const NPC_RANGE = 24;

export function nametagFor(entity, dist) {
  if (!entity) return { visible: false };
  const cfg = MOB_TYPES[entity.type] || {};
  const isPassive = entity.passive ?? cfg.passive;
  const range = isPassive ? NPC_RANGE : HOSTILE_RANGE;
  const visible = dist <= range;
  const text = entity.npcName || cfg.displayName || (entity.type ? entity.type.charAt(0).toUpperCase() + entity.type.slice(1) : 'Unknown');
  if (entity.isAlly) return { visible, text, showBar: false, color: '#3DFFB0', hpFrac: 1 };
  if (isPassive) return { visible, text, showBar: false, color: '#E8E0C8', hpFrac: 1 };
  const hpFrac = Math.max(0, Math.min(1, (entity.health || 0) / (entity.maxHealth || 1)));
  const color = hpFrac > 0.5 ? '#F2F2F2' : hpFrac > 0.25 ? '#F5D76E' : '#FF6B6B';
  return { visible, text, showBar: true, color, hpFrac };
}
```
- [ ] Add `displayName` fields to `frontend/src/game/mobTypes.js` (AST-safe Edit each entry): e.g. `villager` → `displayName: 'Settler'`, `zombie` → `displayName: 'Husk'`, `spider` → `displayName: 'Frontier Spider'`, `skeleton` → `displayName: 'Bonepicker'`, `emberhusk` → `displayName: 'Ember Husk'`, `moss_brute` → `displayName: 'Moss Brute'` (and the rest — `grep -n "^  [a-z_]*:" src/game/mobTypes.js` to enumerate all keys; give each a frontier-flavored name).
- [ ] Run it and watch it pass: `npx vitest run tests/data/nametagData.test.js` → green.
- [ ] **Done-gate:** `npx vitest run tests/data/nametagData.test.js` green; `npx eslint src/game/nametagData.js src/game/mobTypes.js` clean.
- [ ] Commit: `git add -A && git commit -F -` body `M-HUD.5 nametagFor pure helper + MOB_TYPES displayName fields`.

### Task M-HUD.6 — Nametags render layer (billboard sprites)

**Files:** create `frontend/src/render/Nametags.jsx`; gate `frontend/tests/gates/nametags-gates.test.js`; mount in `frontend/src/GameScene.jsx`

- [ ] Write the failing gate `frontend/tests/gates/nametags-gates.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('nametags gates', () => {
  const nt = strip(read('render/Nametags.jsx'));
  it('billboards via drei <Billboard> (faces camera) and reads nametagFor', () => {
    expect(nt).toMatch(/Billboard/);
    expect(nt).toMatch(/nametagFor/);
  });
  it('iterates the ECS mobsQuery (live entities) not a stale prop array', () => {
    expect(nt).toMatch(/mobsQuery/);
  });
  it('capture-suppressed (no overlay in the deterministic baselines)', () => {
    expect(nt).toMatch(/isCaptureMode\(\)/);
  });
  it('LOD-culled by distance (uses the nametagFor visible flag)', () => {
    expect(nt).toMatch(/\.visible/);
  });
});
```
- [ ] Run it and watch it fail: `npx vitest run tests/gates/nametags-gates.test.js` → fail.
- [ ] Create `frontend/src/render/Nametags.jsx`:
```jsx
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import { ecs, mobsQuery } from '../ecs/world';
import { nametagFor } from '../game/nametagData.js';
import { useGameStore } from '../store/useGameStore';
import { isCaptureMode } from '../devtest/captureMode';

// Billboarded overhead nametags over mobs/NPCs/boss. Drives off the LIVE miniplex entities
// (mobsQuery) + entity.health/maxHealth — the data already exists; this is a pure render layer.
// drei <Billboard> faces the camera; <Text> is GPU SDF (cheap, no DOM cost unlike <Html>). LOD-
// culled by nametagFor's range gate (transient store read of the player pos in useFrame, the
// Game-Loop-Isolation pattern). Capture-SUPPRESSED so the 20 visual baselines stay byte-identical.
function Tag({ entity }) {
  const groupRef = useRef();
  const textRef = useRef();
  const barRef = useRef();
  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    const pp = useGameStore.getState().playerPosition;
    if (!pp) { g.visible = false; return; }
    const dx = entity.position.x - pp.x, dz = entity.position.z - pp.z;
    const dist = Math.hypot(dx, dz);
    const tag = nametagFor(entity, dist);
    g.visible = tag.visible && entity.health > 0;
    if (!g.visible) return;
    g.position.set(entity.position.x, entity.position.y + 2.4, entity.position.z);
    if (textRef.current) { textRef.current.text = tag.text; textRef.current.color = tag.color; }
    if (barRef.current) {
      barRef.current.visible = tag.showBar;
      barRef.current.scale.x = Math.max(0.001, tag.hpFrac);
      barRef.current.position.x = (tag.hpFrac - 1) * 0.5;
    }
  });
  return (
    <group ref={groupRef} visible={false}>
      <Billboard>
        <Text ref={textRef} fontSize={0.34} anchorX="center" anchorY="bottom" outlineWidth={0.02} outlineColor="#1A1206" position={[0, 0.2, 0]}>
          {entity.type}
        </Text>
        <mesh position={[0, 0, 0]} scale={[1, 0.12, 1]}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial color="#1A1206" />
        </mesh>
        <mesh ref={barRef} position={[0, 0, 0.01]} scale={[1, 0.1, 1]}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial color="#FF6B6B" />
        </mesh>
      </Billboard>
    </group>
  );
}

export const Nametags = React.memo(() => {
  if (isCaptureMode()) return null;
  const entities = mobsQuery.entities;
  return (
    <group>
      {entities.map((e) => (e && e.id != null ? <Tag key={e.id} entity={e} /> : null))}
    </group>
  );
});
```
> NOTE TO IMPLEMENTER: confirm drei `Text` + `Billboard` are already used elsewhere (`grep -rn "from '@react-three/drei'" src/ | grep -i "Text\|Billboard"`); the bar-color should track `tag.color` (set it on the bar material per-frame too). The component re-renders only when the entity set changes; per-entity `<Tag>` drives its own useFrame. Verify `mobsQuery` returns NPCs too (they're `isMob:true`? — NPCs in M-NPCS use `isNPC`; if so add an `npcsQuery` import here or extend in M-NPCS.7).
- [ ] Run it and watch it pass: `npx vitest run tests/gates/nametags-gates.test.js` → green.
- [ ] Mount in `frontend/src/GameScene.jsx`: `import { Nametags } from './render/Nametags';` and add `<Nametags />` inside the world `<Canvas>`/scene group (grep for where `<SimplifiedNPCSystem` or mob render mounts; place as a sibling).
- [ ] **Done-gate + LIVE-LOOK:** extend `hud-probe.mjs` to spawn a few mobs (`window.useGameStore.getState().spawnMob(5,5)`) then screenshot `/tmp/crafty-hud/nametags.png`. **Read + LOOK**: confirm readable billboard names + health bars hover over the cubes, cull at distance, don't z-fight. `npm run visual:capture && npx vitest run --config vitest.visual.config.js` → no drift.
- [ ] Commit: `git add -A && git commit -F -` body `M-HUD.6 billboarded nametags over live ECS entities`.

### Task M-HUD.7 — TargetFrame (unit nameplate)

**Files:** create `frontend/src/ui/TargetFrame.jsx`; gate `frontend/tests/gates/target-frame-gates.test.js`; store `targetEntity` mirror in Components.jsx

- [ ] Write the failing gate `frontend/tests/gates/target-frame-gates.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('target-frame gates', () => {
  it('store mirrors a targetEntity (id+name+health) for the looked-at mob/NPC', () => {
    expect(read('store/useGameStore.jsx')).toMatch(/targetEntity:/);
  });
  it('Components.jsx writes targetEntity from the nearest aim-cone mob (throttled)', () => {
    const c = strip(read('Components.jsx'));
    expect(c).toMatch(/targetEntity|setTargetEntity/);
  });
  it('TargetFrame renders a Panel nameplate gated on a live target + capture-suppressed', () => {
    const tf = read('ui/TargetFrame.jsx');
    expect(tf).toMatch(/Panel/);
    expect(tf).toMatch(/targetEntity/);
    expect(tf).toMatch(/isCaptureMode\(\)/);
  });
});
```
- [ ] Run it and watch it fail: `npx vitest run tests/gates/target-frame-gates.test.js` → fail.
- [ ] Add to `frontend/src/store/useGameStore.jsx` (after `abilityCooldowns`): `targetEntity: null, setTargetEntity: (t) => set({ targetEntity: t }),`
- [ ] In `frontend/src/Components.jsx` useFrame, reuse the existing aim/melee-cone seam (grep `checkMobsInMeleeCone` / the crosshair target derivation) to find the nearest mob in the look direction; throttle a mirror write (next to the cooldown mirror, ~every 150ms):
```js
    // Mirror the looked-at mob/NPC for the HUD target frame (reuses the aim-cone seam). Throttled
    // + JSON-safe; transient store write (Game-Loop-Isolation). null when nothing is aimed at.
    if (nowTime - _lastCdMirror.current === 0) { // piggyback the same throttle window
      const aimed = nearestAimedMob && nearestAimedMob(); // use the real aim-cone helper here
      useGameStore.getState().setTargetEntity(aimed
        ? { id: aimed.id, type: aimed.type, name: aimed.npcName || aimed.type, health: aimed.health, maxHealth: aimed.maxHealth, isAlly: !!aimed.isAlly }
        : null);
    }
```
> NOTE TO IMPLEMENTER: there is NO existing `nearestAimedMob` — derive the target from the existing crosshair/melee-cone logic (grep `meleeCone`/`checkMobsInMeleeCone` in Components.jsx; if it returns the cone hit, reuse it; else compute nearest mob within a small forward cone using the camera matrix like ObjectiveTracker does). Keep it on the SAME throttle ref as M-HUD.2.
- [ ] Create `frontend/src/ui/TargetFrame.jsx`:
```jsx
import React from 'react';
import { useGameStore } from '../store/useGameStore';
import { isCaptureMode } from '../devtest/captureMode';
import { Panel } from './primitives/index.js';

// A framed target/unit nameplate (top-center, under the ObjectiveTracker) shown when the player
// aims at a mob/NPC. Reuses the BossHealthBar visual grammar at a smaller scale; reads the store's
// targetEntity mirror (written by Components.jsx off the aim-cone). Capture-SUPPRESSED.
export const TargetFrame = React.memo(() => {
  const target = useGameStore((s) => s.targetEntity);
  if (isCaptureMode() || !target) return null;
  const frac = Math.max(0, Math.min(1, (target.health || 0) / (target.maxHealth || 1)));
  return (
    <div className="absolute top-24 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
      <Panel variant="raise" className="px-3 py-1.5 min-w-[180px]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-text capitalize">{target.name}</span>
          <span className="text-[10px] text-text-muted tabular-nums">{Math.ceil(target.health)}/{target.maxHealth}</span>
        </div>
        <div className="mt-1 h-1.5 bg-track rounded-sm border-chrome border-ink overflow-hidden">
          <div className="h-full" style={{ width: `${frac * 100}%`, background: target.isAlly ? '#3DFFB0' : frac > 0.5 ? '#4ade80' : frac > 0.25 ? '#F5D76E' : '#FF6B6B' }} />
        </div>
      </Panel>
    </div>
  );
});
```
- [ ] Mount in `frontend/src/HUD.jsx`: `import { TargetFrame } from './ui/TargetFrame';` → `<TargetFrame />` in the gameplay block.
- [ ] Run it and watch it pass: `npx vitest run tests/gates/target-frame-gates.test.js` → green.
- [ ] **Done-gate + LIVE-LOOK:** `hud-probe.mjs`: spawn a mob, walk up to it / aim, screenshot `/tmp/crafty-hud/target-frame.png`. **Read + LOOK**: confirm the nameplate appears when aiming, shows the right name + HP bar, disappears when looking away. `npm run visual:capture && npx vitest run --config vitest.visual.config.js` → no drift.
- [ ] Commit: `git add -A && git commit -F -` body `M-HUD.7 target/unit nameplate off the aim-cone seam`.

### Task M-HUD.8 — RadialMinimap with destination blips

**Files:** create `frontend/src/render/RadialMinimap.jsx` (UI, not 3D — naming kept under ui); gate `frontend/tests/gates/radial-minimap-gates.test.js`; swap in HUD.jsx

> Correction: create at `frontend/src/ui/RadialMinimap.jsx` (it is a HUD canvas component).

- [ ] Write the failing gate `frontend/tests/gates/radial-minimap-gates.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

describe('radial-minimap gates', () => {
  const mm = read('ui/RadialMinimap.jsx');
  it('is circular-clipped (border-radius/clip / arc full-circle mask)', () => {
    expect(mm).toMatch(/borderRadius|rounded-full|clip/);
  });
  it('plots destination blips for HOME + nearest SHRINE + BLIGHT HEART', () => {
    expect(mm).toMatch(/nearestLandmark/);
    expect(mm).toMatch(/blightHeartSite/);
  });
  it('plots mob + NPC blips from the store mirrors', () => {
    expect(mm).toMatch(/mobEntities/);
    expect(mm).toMatch(/npcEntities/);
  });
  it('does NOT use the off-brand Orbitron font (W2/Art lock)', () => {
    expect(mm).not.toMatch(/Orbitron/);
  });
  it('HUD mounts RadialMinimap instead of the legacy square Minimap', () => {
    const hud = read('HUD.jsx');
    expect(hud).toMatch(/RadialMinimap/);
  });
});
```
- [ ] Run it and watch it fail: `npx vitest run tests/gates/radial-minimap-gates.test.js` → fail.
- [ ] Create `frontend/src/ui/RadialMinimap.jsx` (adapt the legacy `Minimap` in HUD.jsx lines 182-265 into a circular canvas with destination blips, drop the Orbitron font, add SHRINE/HOME/BLIGHT/NPC blips clamped to the rim when out of range):
```jsx
import React, { useRef, useEffect, useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { isCaptureMode } from '../devtest/captureMode';
import { nearestLandmark } from '../world/shrines.js';
import { blightHeartSite } from '../world/blightHeart.js';
import { Panel } from './primitives/index.js';

// A circular clipped radial minimap with persistent destination blips. Reuses the seams the compass
// already consumes (nearestLandmark / blightHeartSite / HOME at origin) + the mobEntities + npcEntities
// store mirrors. A self-contained 250ms canvas redraw (Game-Loop-Isolation: transient getState reads,
// no per-frame React state). Out-of-range destination blips are clamped to the rim with a small arrow.
// Capture-SUPPRESSED (the canvas redraw never starts) so the 20 visual baselines stay byte-identical.
const SIZE = 132, RANGE = 64;

export const RadialMinimap = React.memo(() => {
  const canvasRef = useRef(null);
  const [coords, setCoords] = useState({ x: 0, z: 0 });
  useEffect(() => {
    if (isCaptureMode()) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const cx = SIZE / 2, cy = SIZE / 2, scale = SIZE / 2 / RANGE, R = SIZE / 2 - 2;
    const shrineCache = { t: 0, s: null };
    const blip = (wx, wz, px, pz, color, clamp) => {
      let dx = (wx - px) * scale, dz = (wz - pz) * scale;
      const d = Math.hypot(dx, dz);
      if (d > R) { if (!clamp) return; dx = (dx / d) * R; dz = (dz / d) * R; }
      ctx.beginPath(); ctx.arc(cx + dx, cy + dz, clamp ? 3.5 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
    };
    const draw = () => {
      const pp = useGameStore.getState().playerPosition; if (!pp) return;
      setCoords({ x: Math.round(pp.x), z: Math.round(pp.z) });
      // circular clip
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = 'rgba(12,10,18,0.88)'; ctx.fillRect(0, 0, SIZE, SIZE);
      // mobs
      (useGameStore.getState().mobEntities || []).forEach((m) => blip(m.position[0], m.position[2], pp.x, pp.z, m.passive ? '#4ade80' : '#ef4444', false));
      // NPCs
      (useGameStore.getState().npcEntities || []).forEach((n) => blip(n.position[0], n.position[2], pp.x, pp.z, '#F5D76E', false));
      // destinations (clamped to rim)
      blip(0, 0, pp.x, pp.z, '#FBBF24', true); // HOME
      const now = performance.now();
      if (now - shrineCache.t > 1000) shrineCache.s = nearestLandmark(pp.x, pp.z), shrineCache.t = now;
      if (shrineCache.s) blip(shrineCache.s.worldX, shrineCache.s.worldZ, pp.x, pp.z, '#46E0FF', true);
      const bh = blightHeartSite(); blip(bh.x, bh.z, pp.x, pp.z, '#A24BFF', true);
      // player
      ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.restore();
      // rim + N tick (token font, NOT Orbitron)
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '9px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('N', cx, 11);
    };
    const id = setInterval(draw, 250); draw();
    return () => clearInterval(id);
  }, []);
  if (isCaptureMode()) return null;
  return (
    <div className="absolute bottom-20 right-4 z-20 pointer-events-none">
      <Panel variant="base" className="overflow-hidden p-0 leading-none rounded-full" style={{ borderRadius: '50%' }}>
        <canvas ref={canvasRef} width={SIZE} height={SIZE} className="block" style={{ borderRadius: '50%' }} />
      </Panel>
      <div className="text-center text-xs mt-1 tabular-nums text-text-muted">{coords.x}, {coords.z}</div>
    </div>
  );
});
```
- [ ] In `frontend/src/HUD.jsx`: replace the legacy `Minimap` usage at line ~664 with `RadialMinimap` (`import { RadialMinimap } from './ui/RadialMinimap';` → `{!isTouchUIMode() && <RadialMinimap />}`), and DELETE the now-unused legacy `Minimap` component (HUD.jsx:182-265) — verify no other importer (`grep -rn "Minimap" src/ | grep -v RadialMinimap`).
- [ ] Run it and watch it pass: `npx vitest run tests/gates/radial-minimap-gates.test.js` → green.
- [ ] **Done-gate + LIVE-LOOK:** `hud-probe.mjs`: screenshot `/tmp/crafty-hud/minimap.png`. **Read + LOOK**: confirm a circular minimap, player dot center, colored destination blips clamped to the rim, mob/NPC blips inside. `npm run visual:capture && npx vitest run --config vitest.visual.config.js` → no drift; `npx eslint src/ui/RadialMinimap.jsx src/HUD.jsx` clean.
- [ ] Commit: `git add -A && git commit -F -` body `M-HUD.8 radial minimap with destination blips; retire square Minimap + Orbitron font`.

### Task M-HUD.9 — Demote CombatInstructions to a toggle/auto-fade + HUD declutter

**Files:** modify `frontend/src/HUD.jsx`, `frontend/src/ui/CombatInstructions.jsx`, `frontend/src/InputManager.jsx`; gate `frontend/tests/gates/hud-declutter-gates.test.js`

- [ ] Write the failing gate `frontend/tests/gates/hud-declutter-gates.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

describe('hud declutter gates', () => {
  it('CombatInstructions is gated on a showControls store flag (not always-on)', () => {
    const hud = read('HUD.jsx');
    expect(hud).toMatch(/showControls.*CombatInstructions|CombatInstructions.*showControls/s);
    expect(read('store/useGameStore.jsx')).toMatch(/showControls:/);
  });
  it('H toggles the controls sheet (InputManager)', () => {
    expect(read('InputManager.jsx')).toMatch(/KeyH/);
  });
  it('the standalone top-center spell label band is removed (folded into the action bar)', () => {
    const hud = read('HUD.jsx');
    // the old persistent band read "Spell: " in a centered Panel; assert it is gone
    expect(hud).not.toMatch(/Spell:\s*<\/span>/);
  });
  it('PlayerHungerBar is gated on survival mode (no duplicate 100/100 pill in non-survival)', () => {
    expect(read('HUD.jsx')).toMatch(/gameMode|survival.*Hunger|Hunger.*survival/s);
  });
});
```
- [ ] Run it and watch it fail: `npx vitest run tests/gates/hud-declutter-gates.test.js` → fail.
- [ ] Add `showControls: false, setShowControls: (v) => set({ showControls: v }),` to `frontend/src/store/useGameStore.jsx`.
- [ ] In `frontend/src/HUD.jsx`: change line 607 from `{!isTouchUIMode() && <CombatInstructions />}` to an auto-fade + toggle: render `<CombatInstructions />` only when `showControls` is true OR within the first ~8s of play (a small `useEffect` timer that flips `showControls` true on enter then false after 8s). Implement the auto-fade inside `CombatInstructions` (it already exists) OR a thin wrapper; keep keyMap as SoT.
- [ ] In `frontend/src/InputManager.jsx`: add a `KeyH` handler (near the `KeyG` block ~165) that toggles `state.setShowControls(!state.showControls)`.
- [ ] In `frontend/src/HUD.jsx`: DELETE the standalone top-center spell label band (lines 627-638) — the active spell + MP cost will read from the hotbar/action bar (the hotbar already shows the selected slot; if it doesn't show MP cost, add it in a follow-up — for now removing the redundant band reclaims the top-center stack shared with ObjectiveTracker + compass).
- [ ] In `frontend/src/HUD.jsx`: gate `<PlayerHungerBar ... />` (line 620) on survival mode: `{gameState.gameMode === 'survival' && <PlayerHungerBar hunger={gameSystems.hunger} />}` — confirm the store field name with `grep -n "gameMode" src/store/useGameStore.jsx`; this kills the duplicate-looking 100/100 pill in non-survival.
- [ ] Run it and watch it pass: `npx vitest run tests/gates/hud-declutter-gates.test.js` → green.
- [ ] **Done-gate + LIVE-LOOK:** `hud-probe.mjs`: screenshot `/tmp/crafty-hud/declutter.png` at spawn (controls visible) and again after 9s (controls faded). **Read + LOOK BOTH**: confirm the controls sheet fades, H re-summons it, top-center is no longer a 3-band stack, no duplicate stat pill. `npm run visual:capture && npx vitest run --config vitest.visual.config.js` → **EXPECT explore-day/night frames to change** (controls sheet now auto-faded). Review the diffs by eye; if intended, **re-baseline deliberately**: `npm run visual:baseline` then re-run the gate green. Document the re-baseline in the commit body.
- [ ] Commit: `git add -A && git commit -F -` body `M-HUD.9 demote CombatInstructions to H-toggle/auto-fade; declutter top-center + stat pills; deliberate re-baseline`.

### Task M-HUD.10 — Spawn legibility: far-LOD beacon + persistent goal cue

**Files:** modify `frontend/src/world/Terrain.jsx` (far-LOD shrine/blight beacon decoupled from chunk load); gate `frontend/tests/gates/spawn-legibility-gates.test.js`

- [ ] Write the failing gate `frontend/tests/gates/spawn-legibility-gates.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('spawn legibility gates', () => {
  const terrain = strip(read('world/Terrain.jsx'));
  it('a far-LOD beacon (light shaft) is driven off nearestLandmark + blightHeartSite, NOT chunk load', () => {
    expect(terrain).toMatch(/nearestLandmark/);
    expect(terrain).toMatch(/blightHeartSite/);
    // a tall vertical beam mesh (cylinder) decoupled from the LandmarksRender chunk gate
    expect(terrain).toMatch(/FarBeacon|LightShaft|beaconBeam/);
  });
  it('the far beacon is capture-suppressed (never in the 20 baselines)', () => {
    const start = terrain.indexOf('FarBeacon');
    expect(start).toBeGreaterThan(-1);
  });
  it('the objective cue is PERSISTENT (ObjectiveTracker, not the 4s onboarding toast)', () => {
    // ObjectiveTracker already persists; assert it is still mounted + names the narrative objective
    expect(read('HUD.jsx')).toMatch(/<ObjectiveTracker/);
  });
});
```
- [ ] Run it and watch it fail: `npx vitest run tests/gates/spawn-legibility-gates.test.js` → fail.
- [ ] In `frontend/src/world/Terrain.jsx`, add a `FarBeacon` render group (sibling of `LandmarksRender`, mounted at line ~988) that draws a tall, thin, additive vertical light-shaft cylinder at the NEAREST shrine (`nearestLandmark(playerPos)`) and a violet one at `blightHeartSite()` — these are positioned by a throttled `useFrame`/interval reading the player pos transiently, so they appear ON THE HORIZON from spawn even before that chunk's `Landmark` mounts (decoupled from chunk load):
```jsx
const FarBeacon = () => {
  const shrineRef = useRef();
  const blightRef = useRef();
  useFrame(() => {
    if (isCaptureMode()) return;
    const pp = useGameStore.getState().playerPosition;
    if (!pp) return;
    const s = nearestLandmark(pp.x, pp.z, 16);
    if (shrineRef.current) {
      if (s) { shrineRef.current.visible = true; shrineRef.current.position.set(s.worldX, 90, s.worldZ); }
      else shrineRef.current.visible = false;
    }
    if (blightRef.current) { const bh = blightHeartSite(); blightRef.current.position.set(bh.x, 110, bh.z); }
  });
  if (isCaptureMode()) return null;
  return (
    <group>
      <mesh ref={shrineRef} visible={false}>
        <cylinderGeometry args={[1.2, 1.2, 180, 8, 1, true]} />
        <meshBasicMaterial color="#46E0FF" transparent opacity={0.22} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={blightRef}>
        <cylinderGeometry args={[1.6, 1.6, 220, 8, 1, true]} />
        <meshBasicMaterial color="#A24BFF" transparent opacity={0.2} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
};
```
and mount `<FarBeacon />` after `<BlightHeartRender chunks={chunks} />` (line ~989). Confirm `THREE`, `useFrame`, `nearestLandmark`, `blightHeartSite`, `useGameStore` are imported in Terrain.jsx (grep; add imports if missing — `nearestLandmark` from `./shrines.js`, `blightHeartSite` from `./blightHeart.js`).
- [ ] The persistent goal cue: ObjectiveTracker (HUD.jsx:274) ALREADY persists and names the objective. Confirm it is mounted (it is, line 611). No 4s-dismiss change needed beyond confirming the narrative label lands (wired in M-NARRATIVE).
- [ ] Run it and watch it pass: `npx vitest run tests/gates/spawn-legibility-gates.test.js` → green.
- [ ] **Done-gate + LIVE-LOOK:** create `frontend/scripts/visual/spawn-legibility-probe.mjs` (model on `pov-probe.mjs`): `start`, midday, settle, look toward the nearest shrine bearing, screenshot `/tmp/crafty-spawn/beacon.png`. **Read + LOOK**: confirm a visible light shaft on the horizon FROM SPAWN (before walking to that chunk) + the violet blight beam far out. `npm run visual:capture && npx vitest run --config vitest.visual.config.js` → no drift (FarBeacon is capture-suppressed).
- [ ] Commit: `git add -A && git commit -F -` body `M-HUD.10 far-LOD shrine/blight light-shaft beacons decoupled from chunk load`.

---

## MILESTONE M-HUB — The Hearth becomes a frontier outpost

### Task M-HUB.1 — Pure hub layout table (red-first)

**Files:** create `frontend/src/world/hubLayout.js`; test `frontend/tests/data/hubLayout.test.js`

- [ ] Write the failing test `frontend/tests/data/hubLayout.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { HUB_BUILDINGS, HUB_NPC_ANCHORS } from '../../src/world/hubLayout.js';
import { HEARTH_RADIUS } from '../../src/world/homeAnchor.js';

describe('hub layout', () => {
  it('defines 3-4 buildings (forge, stall, watchtower) with kind + position + a footprint', () => {
    expect(HUB_BUILDINGS.length).toBeGreaterThanOrEqual(3);
    expect(HUB_BUILDINGS.length).toBeLessThanOrEqual(4);
    const kinds = HUB_BUILDINGS.map((b) => b.kind);
    expect(kinds).toContain('forge');
    expect(kinds).toContain('stall');
    expect(kinds).toContain('watchtower');
    for (const b of HUB_BUILDINGS) { expect(Array.isArray(b.pos)).toBe(true); expect(b.pos).toHaveLength(2); }
  });
  it('buildings sit OUTSIDE the standable Hearth pad core but within a walkable ring (no spawn-on-roof)', () => {
    for (const b of HUB_BUILDINGS) {
      const r = Math.hypot(b.pos[0], b.pos[1]);
      expect(r).toBeGreaterThan(HEARTH_RADIUS - 2); // not under the player's feet at origin
      expect(r).toBeLessThan(26); // a tight outpost, not sprawling
    }
  });
  it('defines 4 NPC anchor coords keyed by role, none colliding with a building footprint', () => {
    const roles = HUB_NPC_ANCHORS.map((n) => n.role);
    for (const r of ['merchant', 'smith', 'guide', 'healer']) expect(roles).toContain(r);
    for (const n of HUB_NPC_ANCHORS) expect(n.pos).toHaveLength(2);
  });
});
```
- [ ] Run it and watch it fail: `npx vitest run tests/data/hubLayout.test.js` → module not found.
- [ ] Create `frontend/src/world/hubLayout.js`:
```js
// Deterministic frontier-outpost layout around the Hearth (world origin). Pure data (no RNG, no
// state) so it regenerates identically every load — zero save data, capture-safe (the render group
// + NPC spawns are capture-suppressed). Buildings ring the raised plinth so the spawn vista reads as
// "a small settlement at the edge of the frontier", not a generic MMO town. Coords are world X/Z
// offsets from origin; the render group (render/HubRender.jsx) sits them on the HEARTH_Y grade.
export const HUB_BUILDINGS = [
  { kind: 'forge', pos: [10, -8], rot: 0.4 },        // the smith's forge (NE)
  { kind: 'stall', pos: [-11, -6], rot: -0.5 },      // the merchant's market stall (NW)
  { kind: 'watchtower', pos: [-9, 12], rot: 0 },     // the guide's watchtower over the frontier (SW)
  { kind: 'cabin', pos: [12, 9], rot: -0.3 },        // the healer's herb cabin (SE)
];
export const HUB_NPC_ANCHORS = [
  { role: 'merchant', pos: [-9, -5], facing: -0.5 }, // by the stall
  { role: 'smith', pos: [8, -7], facing: 0.4 },      // by the forge
  { role: 'guide', pos: [-7, 10], facing: 0.2 },     // by the watchtower
  { role: 'healer', pos: [10, 8], facing: -0.3 },    // by the cabin
];
```
- [ ] Run it and watch it pass: `npx vitest run tests/data/hubLayout.test.js` → green.
- [ ] **Done-gate:** test green; `npx eslint src/world/hubLayout.js` clean.
- [ ] Commit: `git add -A && git commit -F -` body `M-HUB.1 pure deterministic hub layout (buildings + NPC anchors)`.

### Task M-HUB.2 — HubRender voxelKit buildings + mount in Terrain.jsx

**Files:** create `frontend/src/render/HubRender.jsx`; gate `frontend/tests/gates/hub-render-gates.test.js`; modify `frontend/src/world/Terrain.jsx`

- [ ] Write the failing gate `frontend/tests/gates/hub-render-gates.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('hub render gates', () => {
  const hub = strip(read('render/HubRender.jsx'));
  it('renders via voxelKit Cube (locked toon art direction, NOT PBR)', () => {
    expect(hub).toMatch(/<Cube\b/);
    expect(hub).not.toMatch(/metalness|roughness/);
  });
  it('iterates HUB_BUILDINGS (the deterministic layout)', () => {
    expect(hub).toMatch(/HUB_BUILDINGS/);
  });
  it('any glow self-nulls under capture (the brazier/beacon pattern)', () => {
    if (hub.includes('<Emissive')) expect(hub).toMatch(/!isCaptureMode\(\)/);
  });
  it('Terrain.jsx mounts HubRender next to HomeAnchorRender', () => {
    const terrain = read('world/Terrain.jsx');
    expect(terrain).toMatch(/<HubRender\b/);
  });
});
```
- [ ] Run it and watch it fail: `npx vitest run tests/gates/hub-render-gates.test.js` → fail.
- [ ] Create `frontend/src/render/HubRender.jsx` (model on `HomeAnchorRender` in Terrain.jsx:444-472 — voxelKit `Cube`/`Emissive`, `HEARTH_TOP` base, capture-null glow):
```jsx
import React from 'react';
import { Cube, Emissive } from './mascots/voxelKit';
import { isCaptureMode } from '../devtest/captureMode';
import { HUB_BUILDINGS } from '../world/hubLayout.js';

const HEARTH_TOP = 56; // mirrors HEARTH_Y in world/homeAnchor.js
const PAL = { wood: '#6B4A2F', stone: '#8A8A8A', roof: '#7A3B2E', dark: '#3A2A1C', iron: '#4A4A52' };

function Forge() {
  return (
    <group>
      <Cube position={[0, 0.4, 0]} size={[3.4, 0.8, 3.0]} color={PAL.stone} castShadow={false} />
      <Cube position={[0, 1.4, -0.4]} size={[2.4, 1.6, 1.6]} color={PAL.dark} castShadow={false} />
      <Cube position={[0, 2.6, -0.4]} size={[0.7, 1.0, 0.7]} color={PAL.iron} castShadow={false} />{/* chimney */}
      {!isCaptureMode() && <Emissive position={[0, 1.0, 0.8]} size={0.4} color="#FF7A1A" intensity={2.6} />}{/* forge fire */}
    </group>
  );
}
function Stall() {
  return (
    <group>
      <Cube position={[0, 1.4, 0]} size={[0.25, 2.8, 0.25]} color={PAL.wood} castShadow={false} />
      <Cube position={[2.4, 1.4, 0]} size={[0.25, 2.8, 0.25]} color={PAL.wood} castShadow={false} />
      <Cube position={[1.2, 0.5, 0]} size={[2.8, 1.0, 1.4]} color={PAL.wood} castShadow={false} />{/* counter */}
      <Cube position={[1.2, 2.9, 0]} size={[3.2, 0.3, 1.8]} color="#B23A48" castShadow={false} />{/* striped awning */}
    </group>
  );
}
function Watchtower() {
  return (
    <group>
      <Cube position={[0, 3.0, 0]} size={[2.2, 6.0, 2.2]} color={PAL.wood} castShadow={false} />
      <Cube position={[0, 6.3, 0]} size={[2.8, 0.6, 2.8]} color={PAL.stone} castShadow={false} />{/* platform */}
      <Cube position={[0, 7.0, 0]} size={[2.4, 0.8, 2.4]} color={PAL.roof} castShadow={false} />{/* roof */}
      {!isCaptureMode() && <Emissive position={[0, 6.8, 0]} size={0.5} color="#F5D76E" intensity={2.2} />}{/* lookout lantern */}
    </group>
  );
}
function Cabin() {
  return (
    <group>
      <Cube position={[0, 0.9, 0]} size={[3.0, 1.8, 2.6]} color={PAL.wood} castShadow={false} />
      <Cube position={[0, 2.1, 0]} size={[3.4, 0.5, 3.0]} color={PAL.roof} castShadow={false} />
      <Cube position={[-1.0, 0.5, 1.4]} size={[0.5, 0.5, 0.5]} color="#3E7D32" castShadow={false} />{/* herb box */}
    </group>
  );
}
const KIND = { forge: Forge, stall: Stall, watchtower: Watchtower, cabin: Cabin };

export const HubRender = React.memo(() => {
  return (
    <group position={[0, HEARTH_TOP + 0.5, 0]}>
      {HUB_BUILDINGS.map((b, i) => {
        const C = KIND[b.kind];
        return C ? <group key={i} position={[b.pos[0], 0, b.pos[1]]} rotation={[0, b.rot || 0, 0]}><C /></group> : null;
      })}
    </group>
  );
});
```
> NOTE TO IMPLEMENTER: confirm the Hearth pad is large enough / the buildings sit on the y=56 grade — if a building's footprint extends past the stamped plinth radius it will float over natural terrain. Option A (simplest, decorative): keep buildings near the plinth and accept they sit at HEARTH_TOP. Option B (robust): extend `stampHomeAnchor` in `world/homeAnchor.js` to flatten a larger outpost footprint (raise `HEARTH_RADIUS` to ~14 OR add a separate `stampHub` that flattens the building footprints). If you choose B, that is a SEPARATE sub-task with its own gate (assert the stamp flattens the hub footprint) and a re-baseline of the `hearth` capture frame. Default to B for visual correctness; verify in the live-look.
- [ ] In `frontend/src/world/Terrain.jsx`: `import { HubRender } from '../render/HubRender';` and mount `<HubRender />` right after `<HomeAnchorRender />` (line ~987).
- [ ] Run it and watch it pass: `npx vitest run tests/gates/hub-render-gates.test.js` → green.
- [ ] **Done-gate + LIVE-LOOK:** create `frontend/scripts/visual/hub-probe.mjs` (model on `pov-probe.mjs`): `start`, midday, settle, look around 360deg, screenshot `/tmp/crafty-hub/hub-{1,2,3,4}.png`. **Read + LOOK ALL**: confirm a forge / stall / watchtower / cabin ring the Hearth, sit FLUSH on the grade (no floating buildings), read as a frontier outpost, no z-fighting. `npm run visual:capture && npx vitest run --config vitest.visual.config.js` → **the `hearth` baseline likely changes** (buildings now visible). Review by eye; **re-baseline deliberately** (`npm run visual:baseline`) and document in the commit body.
- [ ] Commit: `git add -A && git commit -F -` body `M-HUB.2 voxelKit frontier-outpost buildings + Terrain mount; deliberate hearth re-baseline`.

---

## MILESTONE M-NPCS — Static interactive NPCs at the hub

### Task M-NPCS.1 — Pure NPC roster + spawn helper (red-first)

**Files:** create `frontend/src/world/npcSpawn.js`; test `frontend/tests/data/npcSpawn.test.js`

- [ ] Write the failing test `frontend/tests/data/npcSpawn.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { HUB_NPCS, makeNpcEntity } from '../../src/world/npcSpawn.js';

describe('hub NPCs', () => {
  it('defines merchant + smith + guide + healer with name + role + color', () => {
    const roles = HUB_NPCS.map((n) => n.role);
    for (const r of ['merchant', 'smith', 'guide', 'healer']) expect(roles).toContain(r);
    for (const n of HUB_NPCS) { expect(n.name).toBeTruthy(); expect(n.color).toMatch(/^#/); }
  });
  it('makeNpcEntity stamps a STATIC, non-hostile, AI-skipped entity at the anchor', () => {
    const e = makeNpcEntity(HUB_NPCS[0], 42, 56.5);
    expect(e.isNPC).toBe(true);
    expect(e.isStatic).toBe(true);
    expect(e.passive).toBe(true);
    expect(e.damage).toBe(0);
    expect(e.id).toBe(42);
    expect(e.npcName).toBe(HUB_NPCS[0].name);
    expect(e.role).toBe(HUB_NPCS[0].role);
    expect(e.position.y).toBeCloseTo(56.5);
  });
});
```
- [ ] Run it and watch it fail: `npx vitest run tests/data/npcSpawn.test.js` → module not found.
- [ ] Create `frontend/src/world/npcSpawn.js`:
```js
import * as THREE from 'three';
import { HUB_NPC_ANCHORS } from './hubLayout.js';

// The frontier-outpost NPC roster. Each maps to a HUB_NPC_ANCHORS coord by role. These are STATIC
// ecs entities (isNPC+isStatic) the AI/movement tick skips — they stand at their post, idle-bob, and
// interact via the existing G-seam (merchant -> TradingInterface; others -> their panels). Named +
// flavored to the solo-frontier fiction (a tiny outpost at the edge of the Blight).
export const HUB_NPCS = [
  { role: 'merchant', name: 'Bram the Trader', color: '#8b5a2b', glyph: '?' },
  { role: 'smith', name: 'Mara the Smith', color: '#7A5230', glyph: '!' },
  { role: 'guide', name: 'Old Pike the Warden', color: '#6B5A3A', glyph: '!' },
  { role: 'healer', name: 'Sister Wren', color: '#9A6A4A', glyph: '+' },
];

export function anchorFor(role) {
  return HUB_NPC_ANCHORS.find((a) => a.role === role) || { pos: [0, 6], facing: 0 };
}

export function makeNpcEntity(npc, id, groundY) {
  const a = anchorFor(npc.role);
  return {
    isMob: true,        // reuse the MobModel render + mobsQuery; the AI tick gates on !isStatic
    isNPC: true,
    isStatic: true,
    id,
    type: 'villager',   // reuse the villager body/eyes/nose render
    role: npc.role,
    npcName: npc.name,
    glyph: npc.glyph,
    position: new THREE.Vector3(a.pos[0], groundY, a.pos[1]),
    color: npc.color,
    health: 200, maxHealth: 200,
    speed: 0, passive: true, damage: 0, xp: 0,
    rotation: a.facing,
    homeX: a.pos[0], homeZ: a.pos[1],
    moveTimer: 0, isMoving: false, isAggro: false, lastAttackTime: 0, knockback: null, lastHit: 0,
  };
}
```
> NOTE TO IMPLEMENTER: NPCs reuse `type: 'villager'` so the existing MobModel villager render (green eyes + nose) + the `mobsQuery` minimap sync + the G-interact (`mob.type === 'villager'`) all work unchanged. The `isStatic` flag is the new AI-skip gate.
- [ ] Run it and watch it pass: `npx vitest run tests/data/npcSpawn.test.js` → green.
- [ ] **Done-gate:** test green; `npx eslint src/world/npcSpawn.js` clean.
- [ ] Commit: `git add -A && git commit -F -` body `M-NPCS.1 static hub NPC roster + makeNpcEntity helper`.

### Task M-NPCS.2 — Spawn NPCs once on world-ready + AI-skip static entities

**Files:** modify `frontend/src/SimplifiedNPCSystem.jsx`; gate `frontend/tests/gates/npc-spawn-gates.test.js`

- [ ] Write the failing gate `frontend/tests/gates/npc-spawn-gates.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('npc spawn + AI-skip gates', () => {
  const npc = strip(read('SimplifiedNPCSystem.jsx'));
  it('spawns the hub NPCs from the roster (makeNpcEntity / HUB_NPCS)', () => {
    expect(npc).toMatch(/HUB_NPCS|makeNpcEntity/);
  });
  it('the AI/movement tick SKIPS static NPCs (continue/return on isStatic)', () => {
    // the per-entity AI loop must guard on isStatic so NPCs never wander
    expect(npc).toMatch(/isStatic/);
  });
  it('spawns NPCs exactly once (guarded ref, not every world-ready)', () => {
    expect(npc).toMatch(/npcsSpawned|_npcSpawned/);
  });
});
```
- [ ] Run it and watch it fail: `npx vitest run tests/gates/npc-spawn-gates.test.js` → fail.
- [ ] In `frontend/src/SimplifiedNPCSystem.jsx`: add imports `import { HUB_NPCS, makeNpcEntity } from './world/npcSpawn.js';`. Add a `const _npcSpawned = useRef(false);` near the other refs. In the world-ready `useEffect` (where the mob `spawnMob` loop runs, ~152-168), after the chunks-loaded condition, spawn the NPCs once:
```js
        if (!_npcSpawned.current) {
          _npcSpawned.current = true;
          for (const npc of HUB_NPCS) {
            const a = makeNpcEntity(npc, nextId.current++, 0);
            // place on the Hearth grade (the plinth top); raycast ground if available, else HEARTH_TOP
            const gy = (state.getMobGroundLevel && state.getMobGroundLevel(a.homeX, a.homeZ));
            a.position.y = (gy != null && !isNaN(gy)) ? gy + 0.5 : 56.5;
            ecs.add(a);
          }
        }
```
- [ ] In the AI/movement `useFrame` tick (~352), add an early skip for static NPCs at the top of the per-entity loop:
```js
      if (entity.isStatic) continue; // static hub NPCs stand at their post (ambient routine handled separately)
```
> NOTE TO IMPLEMENTER: find the exact per-entity `for (const entity of mobsQuery.entities)` loop (line ~356) and insert the `continue` after the null/health guard. Confirm `ecs` + `nextId` are in scope in the spawn `useEffect`.
- [ ] Run it and watch it pass: `npx vitest run tests/gates/npc-spawn-gates.test.js` → green.
- [ ] **Done-gate + LIVE-LOOK:** `hub-probe.mjs`: after spawn + settle, screenshot the NPC posts `/tmp/crafty-hub/npcs.png`. **Read + LOOK**: confirm 4 villager-bodied NPCs stand at fixed posts by their buildings, do NOT wander, are at ground level. Walk to the merchant, press G — confirm the TradingInterface opens. `npm run visual:capture && npx vitest run --config vitest.visual.config.js` → no drift (NPCs spawn only outside capture — verify the spawn `useEffect` is gated by the same `isCaptureMode()` clear that the mob loop uses, line 157).
- [ ] Commit: `git add -A && git commit -F -` body `M-NPCS.2 spawn 4 static hub NPCs once; AI tick skips isStatic`.

### Task M-NPCS.3 — NPC interact panels (merchant/smith/guide/healer) + nametags + minimap blips

**Files:** modify `frontend/src/InputManager.jsx`, `frontend/src/ui/TradingInterface.jsx`, `frontend/src/SimplifiedNPCSystem.jsx` (npcEntities mirror), `frontend/src/store/useGameStore.jsx`; gate `frontend/tests/gates/npc-spawn-gates.test.js` (extend)

- [ ] Extend `frontend/tests/gates/npc-spawn-gates.test.js`:
```js
describe('npc interaction + mirror', () => {
  it('store mirrors npcEntities for the minimap/nametags', () => {
    expect(read('store/useGameStore.jsx')).toMatch(/npcEntities:/);
  });
  it('MinimapSyncSystem syncs npcEntities (static NPC positions)', () => {
    expect(read('SimplifiedNPCSystem.jsx')).toMatch(/npcEntities/);
  });
  it('the G-interact routes a role to its panel (merchant -> trading, others by role)', () => {
    expect(read('InputManager.jsx')).toMatch(/role/);
  });
});
```
- [ ] Run it and watch it fail: `npx vitest run tests/gates/npc-spawn-gates.test.js` → new section fails.
- [ ] Add `npcEntities: [], setNpcEntities: (e) => set({ npcEntities: e }),` to `frontend/src/store/useGameStore.jsx`.
- [ ] In `frontend/src/SimplifiedNPCSystem.jsx` `MinimapSyncSystem` (~432-448), also mirror NPCs (they're in `mobsQuery` with `isNPC`): inside the throttled block, add
```js
      store.setNpcEntities(mobsQuery.entities.filter((e) => e && e.isNPC).map((e) => ({
        id: e.id, role: e.role, npcName: e.npcName, position: [e.position.x, e.position.y, e.position.z],
      })));
```
- [ ] In `frontend/src/InputManager.jsx` G-block (~185): the merchant already opens `TradingInterface`. Route by role — if `nearestVillager.role === 'merchant'` (or no role = legacy villager) → trading; `smith` → open the crafting/upgrade panel (`state.setShowCrafting?.(true)` or the spell-upgrade panel `setShowSpellUpgrade`); `guide` → open the QuestLog (M-NARRATIVE); `healer` → a heal interaction (`state.heal?.(state.maxHealth)` or open a simple heal panel). Use the existing panel setters (grep `setShow` in the store for the real names). Keep `setSelectedVillager(nearestVillager)` so the TradingInterface header can show the name.
- [ ] In `frontend/src/ui/TradingInterface.jsx` (line 7, `({ villager, onClose })`): use `villager?.npcName` for the panel title if present (line ~90 `label="Villager Merchant"` → the NPC name); the trade backend is unchanged.
- [ ] Run it and watch it pass: `npx vitest run tests/gates/npc-spawn-gates.test.js` → green.
- [ ] **Done-gate + LIVE-LOOK:** `hub-probe.mjs`: walk to each NPC, press G, screenshot each panel `/tmp/crafty-hub/npc-{merchant,smith,guide,healer}.png`. **Read + LOOK ALL**: confirm each NPC opens its themed panel + shows its name; nametags (M-HUD.6) hover over the NPCs with the right names; minimap (M-HUD.8) shows gold NPC blips at the hub. `npm run visual:capture && npx vitest run --config vitest.visual.config.js` → no drift.
- [ ] Commit: `git add -A && git commit -F -` body `M-NPCS.3 role-routed NPC interactions + npcEntities mirror + named TradingInterface`.

---

## MILESTONE M-AMBIENT — Ambient life (the "max" tier)

### Task M-AMBIENT.1 — Pure ambient-routine math (red-first)

**Files:** create `frontend/src/game/npcRoutine.js`; test `frontend/tests/data/npcRoutine.test.js`

- [ ] Write the failing test `frontend/tests/data/npcRoutine.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { routinePosition, shouldRetreatAtNight, nextEmote } from '../../src/game/npcRoutine.js';

describe('npc ambient routine', () => {
  it('routinePosition follows a small loop around the home anchor over time (day)', () => {
    const home = { x: 10, z: 8 };
    const p0 = routinePosition(home, 0, true);
    const p1 = routinePosition(home, 5, true);
    expect(p0.x).not.toBe(p1.x); // moves along the patrol over time
    expect(Math.hypot(p0.x - home.x, p0.z - home.z)).toBeLessThan(5); // stays near home
  });
  it('at night townsfolk retreat to home (stationary at the anchor)', () => {
    const home = { x: 10, z: 8 };
    expect(shouldRetreatAtNight(true)).toBe(false); // isDay=true -> no retreat
    expect(shouldRetreatAtNight(false)).toBe(true);
    const night = routinePosition(home, 10, false);
    expect(night.x).toBeCloseTo(home.x);
    expect(night.z).toBeCloseTo(home.z);
  });
  it('nextEmote cycles deterministically on a timer', () => {
    expect(nextEmote(0)).toBeTruthy();
    expect(typeof nextEmote(0)).toBe('string');
  });
});
```
- [ ] Run it and watch it fail: `npx vitest run tests/data/npcRoutine.test.js` → module not found.
- [ ] Create `frontend/src/game/npcRoutine.js`:
```js
// Pure ambient-routine math for hub NPCs + the occasional wandering traveler. NO state/Three. A small
// looping patrol around a home anchor by day; retreat-to-home at night (ties to the siege day/night
// loop). Deterministic from (home, time) so it is unit-testable + the render layer (NpcModel) just
// reads it in a throttled useFrame (Game-Loop-Isolation). Keeps the "max" tier ambient life cheap.
const PATROL_R = 2.5;
const EMOTES = ['…', '*hums*', '*sweeps*', '*nods*', '*stretches*'];

export function shouldRetreatAtNight(isDay) { return !isDay; }

export function routinePosition(home, t, isDay) {
  if (!isDay) return { x: home.x, z: home.z }; // retreat home at night
  const a = (t * 0.25) % (Math.PI * 2);        // slow loop
  return { x: home.x + Math.cos(a) * PATROL_R, z: home.z + Math.sin(a) * PATROL_R };
}

export function nextEmote(seq) { return EMOTES[Math.floor(Math.abs(seq)) % EMOTES.length]; }

// A wandering traveler: appears occasionally, walks a line across the hub edge, then despawns. Pure
// schedule — given a phase 0..1 returns the lerped world pos along the crossing (or null when away).
export function travelerPosition(phase, from, to) {
  if (phase <= 0 || phase >= 1) return null;
  return { x: from.x + (to.x - from.x) * phase, z: from.z + (to.z - from.z) * phase };
}
```
- [ ] Run it and watch it pass: `npx vitest run tests/data/npcRoutine.test.js` → green.
- [ ] **Done-gate:** test green; `npx eslint src/game/npcRoutine.js` clean.
- [ ] Commit: `git add -A && git commit -F -` body `M-AMBIENT.1 pure NPC patrol/retreat/emote/traveler routine math`.

### Task M-AMBIENT.2 — Wire the ambient routine into the NPC tick + emotes + traveler

**Files:** modify `frontend/src/SimplifiedNPCSystem.jsx` (ambient tick for `isNPC` entities), `frontend/src/render/MobModel.jsx` (emote glyph for NPCs); gate `frontend/tests/gates/npc-routine-gates.test.js`

- [ ] Write the failing gate `frontend/tests/gates/npc-routine-gates.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('npc ambient routine wiring', () => {
  const npc = strip(read('SimplifiedNPCSystem.jsx'));
  it('isNPC entities follow routinePosition (patrol by day, retreat at night)', () => {
    expect(npc).toMatch(/routinePosition/);
  });
  it('the ambient tick is capture-suppressed (NPCs freeze for byte-stable baselines)', () => {
    expect(npc).toMatch(/isCaptureMode\(\)/);
  });
  it('respects the day/night signal (isDay) for retreat', () => {
    expect(npc).toMatch(/isDay/);
  });
});
```
- [ ] Run it and watch it fail: `npx vitest run tests/gates/npc-routine-gates.test.js` → fail.
- [ ] In `frontend/src/SimplifiedNPCSystem.jsx`: `import { routinePosition } from './game/npcRoutine.js';`. Add a dedicated ambient tick (a small `useFrame` or extend the existing one) that, for each `isNPC` entity (which the main AI loop now `continue`s past), updates `entity.position` toward `routinePosition({x:entity.homeX,z:entity.homeZ}, gameTime, isDay)` — but ONLY when `!isCaptureMode()` (NPCs freeze in capture). Keep it cheap: 4 NPCs, lerp toward the routine target each frame.
```js
  useFrame(() => {
    if (isCaptureMode()) return;
    const { gameTime, isDay } = useGameStore.getState();
    for (const e of mobsQuery.entities) {
      if (!e || !e.isNPC) continue;
      const target = routinePosition({ x: e.homeX, z: e.homeZ }, gameTime || 0, isDay);
      e.position.x += (target.x - e.position.x) * 0.04;
      e.position.z += (target.z - e.position.z) * 0.04;
    }
  });
```
- [ ] In `frontend/src/render/MobModel.jsx`: for NPC entities (`entity.isNPC`), render the overhead `entity.glyph` (`!`/`?`/`+`) — reuse the existing `Html`/`Panel` dialogue slot (lines 348-361) but show the static glyph icon instead of/in addition to the proximity greeting; or add a small billboarded glyph. Keep it capture-suppressed (the dialogue already is gated by proximity which won't fire in capture).
- [ ] Run it and watch it pass: `npx vitest run tests/gates/npc-routine-gates.test.js` → green.
- [ ] **Done-gate + LIVE-LOOK:** `hub-probe.mjs`: settle ~10s, capture two frames a few seconds apart `/tmp/crafty-hub/ambient-{1,2}.png`. **Read + LOOK BOTH**: confirm NPCs gently shift along their patrol between frames (alive), have an overhead glyph, and the merchant/smith/etc still stand near their post. Set night (`setTimeOfDay`) and confirm they return home. `npm run visual:capture && npx vitest run --config vitest.visual.config.js` → no drift.
- [ ] Commit: `git add -A && git commit -F -` body `M-AMBIENT.2 NPC patrol/retreat ambient tick + overhead emote glyph`.

> The occasional wandering traveler (travelerPosition) is OPTIONAL polish: if time allows, add one traveler entity spawned on a long interval that crosses the hub edge via travelerPosition then despawns — its own micro-task with a gate asserting `travelerPosition` is consumed. Lower priority than the static-NPC life above.

---

## MILESTONE M-NARRATIVE — Quest chain + quest log over the shrine→Blight-Heart spine

### Task M-NARRATIVE.1 — Quest lore/giver data layer (red-first)

**Files:** create `frontend/src/game/questLore.js`; test `frontend/tests/data/questLore.test.js`; gate `frontend/tests/gates/quest-lore-gates.test.js`

- [ ] Write the failing test `frontend/tests/data/questLore.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { CHAIN_ORDER, loreFor, themedDescription } from '../../src/game/questLore.js';
import { QUEST_LIST } from '../../src/QuestSystem.jsx';

describe('quest lore chain', () => {
  it('CHAIN_ORDER threads the existing spine: an opener -> shrine pilgrimage -> climax', () => {
    expect(CHAIN_ORDER[0]).toBeTruthy();
    expect(CHAIN_ORDER).toContain('pilgrim'); // the reach_shrine quest is on the chain
  });
  it('loreFor returns giver + lore for a chain quest, null for a non-chain bounty', () => {
    const l = loreFor('pilgrim');
    expect(l.giver).toBeTruthy();
    expect(l.lore).toMatch(/shrine|frontier|Blight/i);
    expect(loreFor('bounty_3')).toBeNull();
  });
  it('themedDescription re-themes a generic chore into story flavor without changing the type/target', () => {
    const q = QUEST_LIST.find((x) => x.id === 'hunter');
    const themed = themedDescription(q);
    expect(themed).not.toBe(q.description); // re-themed
    expect(themed.length).toBeGreaterThan(0);
  });
});
```
- [ ] Run it and watch it fail: `npx vitest run tests/data/questLore.test.js` → module not found.
- [ ] Create `frontend/src/game/questLore.js`:
```js
// Narrative layer over the EXISTING QUEST_LIST (QuestSystem.jsx) + the reach_shrine -> Blight-Heart
// spine. Pure data + helpers (no new quest SYSTEM): lore/giver fields + a re-theming map that turns
// generic chores ("Defeat 5 mobs") into frontier story beats, WITHOUT changing each quest's type/
// target (so the existing drivers + claim flow are untouched). The hub NPCs are the givers.
export const CHAIN_ORDER = ['first_blood', 'hunter', 'pilgrim', 'nightwatch', 'champion'];

const LORE = {
  first_blood: { giver: 'Old Pike the Warden', lore: 'The Blight pushes monsters to our gate. Draw first blood, and prove you can hold the frontier.' },
  hunter: { giver: 'Mara the Smith', lore: 'Five more, and I will forge you something worth carrying past the shrines.' },
  pilgrim: { giver: 'Old Pike the Warden', lore: 'Light the frontier shrine. Each one we reclaim weakens the Blight Heart at the world’s edge.' },
  nightwatch: { giver: 'Sister Wren', lore: 'When the sun falls the siege comes. Survive three nights and the outpost will trust you with the road.' },
  champion: { giver: 'Bram the Trader', lore: 'Clear the frontier of fifty horrors and the path to the Blight Heart lies open.' },
};

const THEMED = {
  first_blood: 'Cut down the first horror at the gate',
  hunter: 'Thin the frontier pack — defeat 5',
  builder: 'Raise the outpost walls — place 20 blocks',
  miner: 'Quarry stone for the forge — break 30 blocks',
  spellcaster: 'Practice the old wardings — cast 10 spells',
  pilgrim: 'Walk the pilgrim road to a frontier shrine',
  nightwatch: 'Hold the wall through 3 nights of siege',
  champion: 'Break the frontier horde — defeat 50',
};

export function loreFor(questId) { return LORE[questId] || null; }
export function themedDescription(quest) { return (quest && THEMED[quest.id]) || (quest && quest.description) || ''; }
```
- [ ] Run it and watch it pass: `npx vitest run tests/data/questLore.test.js` → green.
- [ ] Write the gate `frontend/tests/gates/quest-lore-gates.test.js` asserting QuestSystem consumes `loreFor`/`themedDescription` (it will fail until M-NARRATIVE.2; create it now and leave failing, OR fold into M-NARRATIVE.2):
```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
describe('quest lore wiring', () => {
  it('QuestSystem applies lore/giver + themed descriptions', () => {
    const qs = read('QuestSystem.jsx');
    expect(qs).toMatch(/loreFor|themedDescription/);
  });
});
```
- [ ] **Done-gate:** `npx vitest run tests/data/questLore.test.js` green; `npx eslint src/game/questLore.js` clean. (The wiring gate stays red until M-NARRATIVE.2 — note it in the commit body.)
- [ ] Commit: `git add -A && git commit -F -` body `M-NARRATIVE.1 quest lore/giver chain data + re-theming helpers`.

### Task M-NARRATIVE.2 — Apply lore to QUEST_LIST + thread the ObjectiveTracker narrative label

**Files:** modify `frontend/src/QuestSystem.jsx`, `frontend/src/HUD.jsx` (ObjectiveTracker narrative label); gate `frontend/tests/gates/quest-lore-gates.test.js`

- [ ] Run the M-NARRATIVE.1 wiring gate to confirm it fails: `npx vitest run tests/gates/quest-lore-gates.test.js` → fail.
- [ ] In `frontend/src/QuestSystem.jsx`: `import { loreFor, themedDescription } from './game/questLore.js';`. Where the active quest objects are built (the initial `QUEST_LIST.filter(...).map(...)` at line 94 + the next-quest pick in `claimQuest` ~245), enrich each with `lore`/`giver` (from `loreFor`) + replace `description` with `themedDescription(q)` (keep `type`/`target`/`xpReward` untouched so all drivers + the claim flow are unchanged). Verify the QuestTracker (line 419-456) still renders fine with the themed description.
- [ ] In `frontend/src/HUD.jsx` ObjectiveTracker (lines 298-311): the labels `'Reach the frontier shrine'` / `'Shatter the Blight Heart'` are already narrative — confirm they match the lore voice; optionally pull the active chain quest's giver into the cue. Minimal change — the persistent cue already exists; this just aligns the wording with the lore.
- [ ] Run it and watch it pass: `npx vitest run tests/gates/quest-lore-gates.test.js tests/gates/pilgrim-quest-gates.test.js` → green (confirm the existing pilgrim gate still passes — the type/target are unchanged).
- [ ] **Done-gate + LIVE-LOOK:** `hud-probe.mjs`: screenshot the QuestTracker `/tmp/crafty-hud/quests-themed.png`. **Read + LOOK**: confirm the quest descriptions read as frontier story beats (not "Defeat 5 mobs"). Run the full unit suite to confirm no quest driver broke: `npx vitest run` → green (count grows or holds).
- [ ] Commit: `git add -A && git commit -F -` body `M-NARRATIVE.2 apply lore/giver + themed descriptions to the quest chain`.

### Task M-NARRATIVE.3 — QuestLog panel

**Files:** create `frontend/src/ui/QuestLog.jsx`; modify `frontend/src/HUD.jsx` + `frontend/src/InputManager.jsx` + `frontend/src/store/useGameStore.jsx`; gate `frontend/tests/gates/quest-log-gates.test.js`

- [ ] Write the failing gate `frontend/tests/gates/quest-log-gates.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

describe('quest log gates', () => {
  const ql = read('ui/QuestLog.jsx');
  it('uses the shared Modal primitive (focus-trap/Escape parity, like AchievementsPanel)', () => {
    expect(ql).toMatch(/Modal/);
  });
  it('renders lore + giver + objective per active quest', () => {
    expect(ql).toMatch(/lore/);
    expect(ql).toMatch(/giver/);
  });
  it('store has a showQuestLog flag + L opens it', () => {
    expect(read('store/useGameStore.jsx')).toMatch(/showQuestLog:/);
    expect(read('InputManager.jsx')).toMatch(/KeyL/);
  });
  it('HUD mounts QuestLog inside the panel AnimatePresence block', () => {
    expect(read('HUD.jsx')).toMatch(/QuestLog/);
  });
});
```
- [ ] Run it and watch it fail: `npx vitest run tests/gates/quest-log-gates.test.js` → fail.
- [ ] Add `showQuestLog: false, setShowQuestLog: (v) => set({ showQuestLog: v }),` to `frontend/src/store/useGameStore.jsx`.
- [ ] Create `frontend/src/ui/QuestLog.jsx` (model on `AchievementsPanel` in QuestSystem.jsx:524+ — a Modal with a scrollable list; each row shows the quest icon, themed title/description, the giver + lore, and the progress bar):
```jsx
import React from 'react';
import { Modal, Panel, Icon, Button } from './primitives/index.js';

// The full quest LOG panel (L). Reuses the AchievementsPanel Modal grammar. Each active quest shows
// its giver + lore (questLore.js, applied in QuestSystem) + the themed objective + progress. Read-only
// narrative surface (claiming still happens via Q in the QuestTracker). Capture-irrelevant (a modal,
// never in the world baselines).
export const QuestLog = React.memo(({ quests = [], onClose }) => {
  return (
    <Modal className="fixed inset-0 z-modal flex items-center justify-center bg-ink/75" label="Quest Log" onClose={onClose}>
      <Panel variant="raise" className="w-[440px] max-h-[70vh] overflow-y-auto p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="flex items-center gap-2 font-display uppercase tracking-wide text-accent">
            <Icon name="scroll" size={18} /> Quest Log
          </span>
          <Button variant="ghost" size="sm" aria-label="Close" onClick={onClose} className="w-9 h-9 p-0 text-text-muted"><Icon name="close" size={16} /></Button>
        </div>
        <div className="space-y-3">
          {quests.map((q) => (
            <div key={q.id} className="border-t-chrome border-ink pt-2">
              <div className="flex items-center gap-2 text-text font-bold text-sm">
                {q.icon && <Icon name={q.icon} size={14} className="text-accent" />}{q.title}
              </div>
              {q.giver && <div className="text-[11px] text-text-muted italic">— {q.giver}</div>}
              {q.lore && <div className="text-xs text-text mt-1 leading-snug">{q.lore}</div>}
              <div className="text-[11px] text-text-muted mt-1">{q.description} · {q.progress}/{q.target}</div>
            </div>
          ))}
          {quests.length === 0 && <div className="text-text-muted text-sm text-center py-4">No active quests.</div>}
        </div>
      </Panel>
    </Modal>
  );
});
```
> NOTE TO IMPLEMENTER: confirm the `Icon` names `scroll`/`close` exist (grep gameIcons.js / the lucide chrome set); substitute valid names.
- [ ] In `frontend/src/InputManager.jsx`: add a `KeyL` handler (near `KeyG`) toggling `state.setShowQuestLog(!state.showQuestLog)` (unlock pointer like the other panels).
- [ ] In `frontend/src/HUD.jsx`: `import { QuestLog } from './ui/QuestLog';` and mount it (read `showQuestLog` from the store, render inside the panel `AnimatePresence`/modal area near the other panels) passing `quests={questSystem.quests}` + `onClose={() => useGameStore.getState().setShowQuestLog(false)}`. The guide NPC's G-interact (M-NPCS.3) also opens it.
- [ ] Run it and watch it pass: `npx vitest run tests/gates/quest-log-gates.test.js` → green.
- [ ] **Done-gate + LIVE-LOOK:** `hud-probe.mjs`: press L (or interact with the guide), screenshot `/tmp/crafty-hud/quest-log.png`. **Read + LOOK**: confirm the log opens as a bold-flat modal, shows giver + lore + objective + progress per active quest, closes on Escape/click. `npx vitest run` → green; `npm run build` clean.
- [ ] Commit: `git add -A && git commit -F -` body `M-NARRATIVE.3 quest log panel (L) with lore/giver/objective`.

---

## Final W3 verification (run before declaring the workstream complete)

- [ ] Full unit suite: `cd /Users/kz/Code/Crafty/frontend && npx vitest run` → all green (count grows or holds vs the pre-W3 baseline; record the delta).
- [ ] Build: `npm run build` → clean.
- [ ] Lint: `npx eslint src` → clean.
- [ ] Visual gate: `npm run visual:capture && npx vitest run --config vitest.visual.config.js` → all frames within 6%; the ONLY intended baseline changes are `hearth` (hub buildings) + `explore-day`/`explore-night` (decluttered controls). Confirm those were RE-BASELINED deliberately (M-HUD.9, M-HUB.2) and reviewed by eye; every OTHER frame byte-stable.
- [ ] **Holistic LIVE-LOOK pass:** run `hud-probe.mjs` + `hub-probe.mjs` + `spawn-legibility-probe.mjs`, then Read + LOOK at every PNG in `/tmp/crafty-hud/`, `/tmp/crafty-hub/`, `/tmp/crafty-spawn/`. Confirm the lived result: a populated outpost (4 NPCs at posts, 4 buildings, ambient motion), a complete HUD (nametags, target frame, combat log, ability-bar sweeps, radial minimap, decluttered chrome), a visible beacon from spawn, and a narrative quest log. A green pinned gate is necessary, not sufficient.
- [ ] Run `superpowers:verification-before-completion` as the done-gate and `plan-verify-kz` to reconcile every spec item against execution evidence.
