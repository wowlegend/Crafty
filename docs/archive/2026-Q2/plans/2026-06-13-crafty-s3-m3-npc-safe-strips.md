# S3-M3 — The NPC Safe Shell Strips Implementation Plan

> **✅ SHIPPED (2026-06-13, loop iters 94-95):** T1 the ui/ panels (TradingInterface + CombatInstructions; 2 consumer repoints; dead framer-motion/Button/Toast imports dropped) · T2 MOB_TYPES → game/mobTypes.js (mobVariety textual→live) · T3 the 5 leaf VFX renderers → render/combatVfx + render/pickupVfx (byte-exact anchored slice; the trap-1 loot-juice repoint + a new capture-freeze gate). SimplifiedNPCSystem −10,984 chars. A 4-lens adversarial-review workflow verified the delta CLEAN (byte-equality / imports / gate-integrity / runtime-wiring — zero blocking/high/medium). 866 unit (103 files) · build · visual 13/13.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Loop note:** design-of-record = `docs/superpowers/specs/2026-06-11-crafty-s3-demonolith-design.md` (the S3-M3 row + the 5-trap catalog). This is the NPC lens's M1-M3 — the **lowest-blast-radius cuts on the most-pinned file** (SimplifiedNPCSystem 1736 LOC, 8 gates + 1 live import + the mobVariety textual characterization). It proves multi-gate repointing before M4 (AGF) and M6 (the NPC deep cuts). **Prime directive: extraction-only — NO behavior change.** The behavior locks: the 13-frame visual gate, 861 unit tests, 23 static-gate files.

**Goal:** Three low-risk strips peel off the NPC god-file: the two UI panels (TradingInterface + CombatInstructions) → `ui/`; the MOB_TYPES registry → `game/mobTypes.js` (and the mobVariety characterization upgrades textual→live); the five leaf VFX renderers → `render/`. Verbatim moves, pixel-locked by the visual gate; SimplifiedNPCSystem shrinks ~1736 → ~1400 LOC.

**Architecture:** Target-module convention (S3-established): UI panels → `src/ui/`, pure data → `src/game/*.js`, render components → `src/render/`. Each moved symbol keeps its exact body; only `audioContext.current`-class closure rewrites don't apply here (these close over imports/props, not host-file locals). The NPC file becomes the consumer (adds imports). One gate repoints same-commit (trap 1: the loot-juice gate's LootDropRender look assertion follows the component out); one NEW gate locks the extraction + the capture-determinism invariant the visual gate cannot see (no baseline renders a loot drop).

**Tech Stack:** React 19 / R3F 9.5 components (verbatim moves); `game/mobTypes.js` as a plain data export; vitest static gates (path-addressed `readFileSync` regex gates — the established Crafty style); the visual gate (puppeteer+pixelmatch, 13/13) is the render-side behavior lock.

---

## File structure (locked at plan time vs LIVE code)

```
NEW  src/ui/TradingInterface.jsx       ← export const TradingInterface (was NPC :1554-1736)
NEW  src/ui/CombatInstructions.jsx     ← export const CombatInstructions (was NPC :1539-1552)
NEW  src/game/mobTypes.js              ← export const MOB_TYPES (was NPC :76-87)
NEW  src/render/combatVfx.jsx          ← DamageNumber (:406-533) + ImpactShockwave (:536-577)
NEW  src/render/pickupVfx.jsx          ← XPOrbRender (:1211-1227) + LootDropRender (:1318-1387) + LootPopRender (:1395-1431)
NEW  tests/gates/vfx-extraction-gates.test.js   ← locks the move + the capture-freeze invariant
MOD  src/SimplifiedNPCSystem.jsx       ← delete the moved blocks; add 4 import lines
MOD  src/MenuSystem.jsx:13             ← TradingInterface import path → './ui/TradingInterface'
MOD  src/HUD.jsx:6                     ← CombatInstructions import path → './ui/CombatInstructions'
MOD  tests/data/mobVariety.test.js     ← registry asserts textual → LIVE import; wiring asserts stay textual
MOD  tests/gates/loot-juice-gates.test.js  ← the LootDropRender look assertion repoints to render/pickupVfx.jsx (TRAP 1)
```

> **Verified at plan time (vs LIVE SimplifiedNPCSystem.jsx, 2026-06-13):**
> - **`getItemRarity` is NOT NPC-internal** — imported at NPC :18 from `./data/items.js`, re-exported at :1235 (the loot-characterization test imports it from this module). So `render/pickupVfx.jsx` imports `getItemRarity` from `../data/items.js` → **NO circular import**. KEEP both the :18 import (LootSystem :1306 still uses it) and the :1235 re-export (a test depends on it). DO NOT touch them.
> - **`rarityBeam`** (NPC :19, from `./game/lootJuice.js`) stays imported in the NPC file after the move — the LootSystem collection branch (:1306) uses `rarityBeam(getItemRarity(entity.item)).color`. So loot-juice-gate line 16 (`import rarityBeam`) STILL passes against the NPC src; only line 18 (`rarityBeam(rarity)`, unique to LootDropRender) follows the component out.
> - **MOB_TYPES** (NPC :76) has ONE consumer file (the NPC file itself: :103 MobModel, :596/:603/:605/:611 the spawner). `game/spawnWeights.js` takes `entries` as params (does NOT import MOB_TYPES). No other importer. The `weight` field lives ON the registry entries (villager 0.6, skitterling 1.2, duskhound 0.9, moss_brute 0.25; absent → `?? 1` at :603).
> - **The 5 leaf renderers** are un-exported `const`s; NPCSystem (:1496-1534) is their ONLY consumer (5 JSX usage sites stay; only the definitions move; add imports).
> - **Trap-3 anchors UNTOUCHED:** the two braceless `if (isCaptureMode()) return;` are at :824 (AIWorkerSystem worker-tick — M6) and :1248 (LootSystem — M6). Neither system moves in M3. The 5 moved renderers use BRACED `if (isCaptureMode()) {` (LootDropRender :1347, LootPopRender :1406) or none (XPOrbRender/DamageNumber/ImpactShockwave) → the indexOf anchor on :824 is unmoved. SAFE.
> - **The integration test** `tests/integration/menu-panel-interaction.test.jsx` does NOT import TradingInterface/CombatInstructions — it toggles the `showTradingInterface` store flag (a string). Moving the components does not touch it.
> - **Import headers per new file** (enumerated below per task — no `THREE` import for XPOrbRender; `isCaptureMode` only in pickupVfx).

---

### T1 — the UI strips → `ui/` (zero gates, 2 import updates)

**Files:** Create `frontend/src/ui/TradingInterface.jsx` + `frontend/src/ui/CombatInstructions.jsx`; Modify `frontend/src/SimplifiedNPCSystem.jsx`, `frontend/src/MenuSystem.jsx`, `frontend/src/HUD.jsx`

- [ ] **Step 1:** Create `src/ui/CombatInstructions.jsx`: header `import React from 'react';` + `import { Panel } from './primitives/index.js';` then the `export const CombatInstructions = React.memo(() => ( ... ));` block VERBATIM from NPC :1539-1552 (the `<Panel variant="base" ...>` controls card).
- [ ] **Step 2:** Create `src/ui/TradingInterface.jsx`: header
  ```js
  import React, { useState } from 'react';
  import { motion } from 'framer-motion';
  import { useGameStore } from '../store/useGameStore';
  import { useGameSounds } from '../SoundManager';
  import { Panel, Button, Icon, Toast } from './primitives/index.js';
  ```
  then the `export const TradingInterface = React.memo(({ villager, onClose }) => { ... });` block VERBATIM from NPC :1554-1736.
- [ ] **Step 3:** In `SimplifiedNPCSystem.jsx`: DELETE the two `export const` blocks (:1539-1736). Both were exported only for external consumers (now relocated); nothing else in the NPC file references them.
- [ ] **Step 4:** Repoint the two import sites:
  - `MenuSystem.jsx:13` → `import { TradingInterface } from './ui/TradingInterface';`
  - `HUD.jsx:6` → `import { CombatInstructions } from './ui/CombatInstructions';`
- [ ] **Step 5:** Full battery from `frontend/` — `npx vitest run` (count holds — the menu-panel integration test must stay green: it uses the store flag, not the component), `npm run build` clean, `npx vitest run --config vitest.visual.config.js` (13/13). Commit `refactor(s3-m3): the trading + controls panels extract to ui/`

### T2 — `game/mobTypes.js` (MOB_TYPES) + the mobVariety characterization upgrade

**Files:** Create `frontend/src/game/mobTypes.js`; Modify `frontend/src/SimplifiedNPCSystem.jsx`, `frontend/tests/data/mobVariety.test.js`

- [ ] **Step 1:** Create `src/game/mobTypes.js` with a module docstring (`// mobTypes.js — the mob registry (extracted from SimplifiedNPCSystem S3-M3: same stats, byte-identical). The single consumer is the NPC spawner/renderer; spawnWeights.js takes entries as params and does not import this.`) then `export const MOB_TYPES = { ... };` — the :76-87 object VERBATIM (the 9 entries incl. the variety-pass trio + their `weight`/`legMode` fields).
- [ ] **Step 2:** In `SimplifiedNPCSystem.jsx`: delete the `const MOB_TYPES = {...}` block (:76-87); add `import { MOB_TYPES } from './game/mobTypes';` to the import header (beside the other `./game/*` imports). The 5 read sites (:103, :596, :603, :605, :611) are unchanged.
- [ ] **Step 3:** Upgrade `tests/data/mobVariety.test.js` — the REGISTRY-CONTRACT assertions go from textual regex to LIVE structural assertions (strictly stronger), the WIRING assertions stay textual (they pin NPC-file spawner code, not the registry object):
  ```js
  import { describe, it, expect } from 'vitest';
  import { readFileSync } from 'node:fs';
  import { resolve, dirname } from 'node:path';
  import { fileURLToPath } from 'node:url';
  import { MOB_TYPES } from '../../src/game/mobTypes.js';

  const HERE = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(resolve(HERE, '../../src/SimplifiedNPCSystem.jsx'), 'utf8');

  describe('the mob-variety pass: the registry contract (LIVE)', () => {
    it('the three new types exist with their design stats', () => {
      expect(MOB_TYPES.skitterling).toMatchObject({ color: '#5B4FA8', health: 30, speed: 3.8 });
      expect(MOB_TYPES.duskhound).toMatchObject({ color: '#4A3A50', health: 70, speed: 3.2 });
      expect(MOB_TYPES.moss_brute).toMatchObject({ color: '#3D5A3A', health: 220, speed: 1.2 });
    });
    it('the skitterling carries spider legs; spawnMob copies legMode to the entity (wiring stays textual)', () => {
      expect(MOB_TYPES.skitterling.legMode).toBe('spider');
      expect(src).toMatch(/\.\.\.\(mobConfig\.legMode \? \{ legMode: mobConfig\.legMode \} : \{\}\)/);
    });
    it('spawning is WEIGHTED — the brute carries a low weight + the spawner uses weightedPick', () => {
      expect(MOB_TYPES.moss_brute.weight).toBe(0.25);
      expect(src).toMatch(/weightedPick\(entriesFor\(hostileTypes\)/);
    });
  });
  ```
  (3 `it`s preserved; each gains a live structural assertion. Count holds; strength grows.)
- [ ] **Step 4:** Full battery → commit `refactor(s3-m3): MOB_TYPES extracts to game/mobTypes.js — the variety characterization goes live`

### T3 — the leaf VFX renderers → `render/` (+ the trap-1 gate repoint + the new extraction gate)

**Files:** Create `frontend/src/render/combatVfx.jsx` + `frontend/src/render/pickupVfx.jsx` + `frontend/tests/gates/vfx-extraction-gates.test.js`; Modify `frontend/src/SimplifiedNPCSystem.jsx`, `frontend/tests/gates/loot-juice-gates.test.js`

- [ ] **Step 1:** Create `src/render/combatVfx.jsx`: header
  ```js
  import React, { useRef, useMemo } from 'react';
  import { useFrame } from '@react-three/fiber';
  import * as THREE from 'three';
  ```
  then `export const DamageNumber = ({ damage, position, id, onComplete, isXP, isAnvil, type }) => { ... };` VERBATIM from NPC :406-533, and `export const ImpactShockwave = ({ position, id, onComplete, type }) => { ... };` VERBATIM from NPC :536-577. (Both use only React hooks + useFrame + THREE + canvas/`Date.now`/`performance.now` globals — NO host-file locals, NO isCaptureMode.)
- [ ] **Step 2:** Create `src/render/pickupVfx.jsx`: header
  ```js
  import React, { useRef, useMemo } from 'react';
  import { useFrame } from '@react-three/fiber';
  import * as THREE from 'three';
  import { getItemRarity } from '../data/items.js';
  import { rarityBeam } from '../game/lootJuice.js';
  import { isCaptureMode } from '../devtest/captureMode';
  ```
  then VERBATIM: `export const XPOrbRender = React.memo(({ entity }) => { ... });` (NPC :1211-1227), `export const LootDropRender = React.memo(({ entity }) => { ... });` (NPC :1318-1387 — keep its `isCaptureMode() ? 0` freeze + `rarityBeam(rarity)`), `export const LootPopRender = ({ position, color, id, onComplete }) => { ... };` (NPC :1395-1431 — keep its capture mid-pop freeze).
- [ ] **Step 3:** In `SimplifiedNPCSystem.jsx`: DELETE the 5 component definitions (:406-533, :536-577, :1211-1227, :1318-1387, :1395-1431). Add two imports to the header: `import { DamageNumber, ImpactShockwave } from './render/combatVfx';` and `import { XPOrbRender, LootDropRender, LootPopRender } from './render/pickupVfx';`. The 5 JSX usage sites (:1496-1534) and the LootSystem (:1238-1315, uses rarityBeam/getItemRarity — STAYS) and `GameMethods.spawnLootPop` registration in NPCSystem (STAYS) are unchanged. VERIFY at build: `getItemRarity` (:18 import + :1235 re-export) and `rarityBeam` (:19 import) remain — LootSystem :1306 still uses both.
- [ ] **Step 4 (TRAP 1 — same commit):** Repoint `tests/gates/loot-juice-gates.test.js`. The first `describe('loot drop-beam ... wiring')` block's `it('LootDropRender derives its look from the pure rarityBeam helper ...')` currently reads `src` (the NPC file) for the `rarityBeam` import + `rarityBeam(rarity)`. LootDropRender now lives in `render/pickupVfx.jsx` with a `'../game/lootJuice.js'` import path. Repoint that `it` to read the new file:
  ```js
  it('LootDropRender derives its look from the pure rarityBeam helper (rarity color source)', () => {
    const render = read('src/render/pickupVfx.jsx');
    expect(/import\s*\{\s*rarityBeam\s*\}\s*from\s*'\.\.\/game\/lootJuice\.js'/.test(render)).toBe(true);
    expect(/rarityBeam\(\s*rarity\s*\)/.test(render)).toBe(true);
  });
  ```
  The remaining asserts stay against `src` (the NPC file): `RARITY_FILL` palette (reads lootJuice.js — unchanged), the collection-branch `playPickup`/`spawnLootPop`/`rarityBeam(getItemRarity(...))` (LootSystem stays in NPC), and `GameMethods.spawnLootPop =` + `<LootPopRender` (NPCSystem stays). Justify the repoint in the commit body (trap-1 class — the gate's intent is preserved, only the file the look-source lives in moved).
- [ ] **Step 5:** Create `tests/gates/vfx-extraction-gates.test.js` — locks the move + the capture invariant the visual gate can't see (no baseline renders a loot drop):
  ```js
  import { describe, it, expect } from 'vitest';
  import { readFileSync } from 'node:fs';
  import { resolve } from 'node:path';

  const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

  describe('S3-M3: the leaf VFX renderers extracted to render/', () => {
    const npc = read('src/SimplifiedNPCSystem.jsx');
    const combat = read('src/render/combatVfx.jsx');
    const pickup = read('src/render/pickupVfx.jsx');

    it('NPCSystem imports the 5 renderers from render/ (extracted, not duplicated)', () => {
      expect(/import\s*\{[^}]*DamageNumber[^}]*ImpactShockwave[^}]*\}\s*from\s*'\.\/render\/combatVfx'/.test(npc)).toBe(true);
      expect(/import\s*\{[^}]*XPOrbRender[^}]*LootDropRender[^}]*LootPopRender[^}]*\}\s*from\s*'\.\/render\/pickupVfx'/.test(npc)).toBe(true);
    });

    it('the renderer DEFINITIONS no longer live in the NPC file (no leave-behind duplication)', () => {
      expect(npc).not.toMatch(/const\s+DamageNumber\s*=/);
      expect(npc).not.toMatch(/const\s+LootDropRender\s*=/);
      expect(npc).not.toMatch(/const\s+LootPopRender\s*=/);
    });

    it('the moved loot renderers KEEP their capture-determinism freeze (the visual gate cannot see this — no baseline drops loot)', () => {
      // LootDropRender + LootPopRender bob/pop off the wall clock; the isCaptureMode()
      // branch pins a fixed pose so a fixture-injected drop is byte-stable. Locked here.
      expect(pickup).toMatch(/isCaptureMode\(\)\s*\?\s*0\s*:\s*state\.clock\.getElapsedTime\(\)/); // LootDropRender
      expect((pickup.match(/if \(isCaptureMode\(\)\)/g) || []).length).toBeGreaterThanOrEqual(2); // both loot renderers gated
    });

    it('the combat VFX renderers export cleanly (DamageNumber + ImpactShockwave)', () => {
      expect(combat).toMatch(/export const DamageNumber/);
      expect(combat).toMatch(/export const ImpactShockwave/);
    });
  });
  ```
- [ ] **Step 6:** Full battery → **the visual gate is the load-bearing check here** (these are render components; 13/13 confirms the moves are pixel-identical — XPOrb/DamageNumber/ImpactShockwave do appear in the spell/loot showcase baselines). Commit `refactor(s3-m3): the leaf VFX renderers extract to render/ (+ the loot-juice gate repoint + a capture-determinism lock)`

### T4 — close-out

- [ ] Banner THIS plan `✅ SHIPPED` at the top with the final LOC/test/frame counts.
- [ ] Mark the spec's S3-M3 row ✅ in `docs/superpowers/specs/2026-06-11-crafty-s3-demonolith-design.md`.
- [ ] Update `memory/ACTIVE_PLAN.md` → NEXT UNIT = the EXPERIENCE INTERLEAVE is due (interleave ledger: content @83, audio @93 — the charter's every-2-3-milestones cadence puts the next interleave at the M3/M4 boundary; candidates: a night-siege juice pass, a per-element projectile-geometry variety pass, or a UI-legibility sweep) THEN S3-M4 (the AdvancedGameFeatures dissolve, part 1 — 6 gate files incl. 2 position-sensitive indexOf gates, the lens's unit map governs). `CHANGELOG.md` gets the S3-M3 milestone entry.

## Self-review

- **Spec coverage (S3-M3 row):** TradingInterface + CombatInstructions → ui/ ✓ T1 · MOB_TYPES → game/mobTypes.js + mobVariety textual→live ✓ T2 · the leaf VFX renderers → render/ + loot-juice gate repoint ✓ T3. Full row covered.
- **Trap catalog (all 5):**
  1. **Gate path-lists don't follow moves** — FIRES at T3 (the loot-juice LootDropRender look assertion); repointed Step 4 SAME COMMIT to `render/pickupVfx.jsx`. The mobVariety registry asserts also follow MOB_TYPES (T2, via live import). Every other gate that names `SimplifiedNPCSystem.jsx` by path (character-render/element-impact/siege/kill-attribution/elemancer-noremesh/spell-vfx/allegiance/static) targets code that STAYS (systems, MobModel, spawner) — verified none reference the 7 moved symbols.
  2. **Inverse GATED-list trap** — N/A: no `postMessage`/no-re-mesh code moves; the new files (ui/render/game) contain no worker posts; none must join the elemancer FORBIDDEN list.
  3. **Stale-anchor (indexOf)** — verified SAFE: the character-render-gate anchors on the FIRST braceless `if (isCaptureMode()) return;` at :824 (worker-tick, M6, unmoved); the 5 moved renderers use braced/no capture guards. The new vfx-extraction gate's capture assert reads `render/pickupVfx.jsx` directly (not indexOf into the NPC file).
  4. **SM-blocks-as-sibling-components** — N/A: nothing extracts a Player-loop SM block; the moved renderers are already standalone components invoked from NPCSystem's JSX (their useFrame order is unchanged — same render tree position).
  5. **Vite worker-URL seam** — N/A: the worker host (AIWorkerSystem) does not move in M3; `npm run build` in every task's battery confirms the bundle.
- **Placeholder scan:** none — every block names its exact source line range, every new-file import header is enumerated, both test bodies are written in full, the gate repoint is the exact replacement `it`.
- **Type/path consistency:** new files in `src/ui/` import primitives via `./primitives/index.js`, store/sound via `../`; new files in `src/render/` import data/game/devtest via `../`; the loot-juice gate reads `render/pickupVfx.jsx` (the path T3-Step 2 creates); `getItemRarity` resolves from `../data/items.js` in pickupVfx (NOT from the NPC re-export → no circular import). `MOB_TYPES` import path `./game/mobTypes` matches the file `src/game/mobTypes.js`.
- **Ratchet:** T2 grows test strength (textual→live structural); T3 adds a new gate file (+4 assertions) and repoints (not weakens) one. No test deleted/skipped. Count holds-or-grows every commit.
