# S3 de-monolith — EnhancedMagicSystem: extract the spell-VFX render group Implementation Plan

> **✅ SHIPPED** — banner updated at close-out (see below / CHANGELOG).

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** De-god-file `EnhancedMagicSystem.jsx` (904 LOC) by extracting its 5 render sub-components — `EnhancedSpellProjectile` / `SpellProjectileCore` / `SpellImpactPop` / `CastTelegraph` / `MagicWand` (`:473-904`, ~432 LOC) — to `render/spellVfx.jsx` byte-exact, taking EMS **904 → ~480 LOC, UNDER the 900 threshold** (the last barely-over god-file from the original audit → only Components 1297 + GameScene 914 remain).

**Architecture (charter §2 #4 S3 de-monolith — extraction-only, NO behavior change):** the proven byte-exact slice (MobModel/CraftingTable precedent). The 5 components reference each other (`SpellProjectileCore` is used intra-group by `EnhancedSpellProjectile`) → moving them TOGETHER keeps those refs intra-module. The main system (`:17-472`) renders only `EnhancedSpellProjectile` + `SpellImpactPop` + `CastTelegraph` → EMS imports those 3 back. `MagicWand` is `export const` + imported by `Components.jsx:56` → EMS **re-exports** it (`export { MagicWand } from './render/spellVfx'`) so Components is unchanged. **Dep-completeness (the SPELL_UPGRADES lesson — from THIS very file): grep confirmed ZERO top-level module-local consts** (S3-M2 already pulled the data to `game/spellVisualProfiles`) → the only deps are imports. `ENERGY_PROFILE`/`_defaultEnergy`/`WAND_CONFIGS` are render-only (0 refs in the main system) → move to spellVfx + prune from EMS; `SPARK_PROFILE` stays (main uses it).

**Why capture-safe:** byte-exact → zero pixel change. The `spell-cast` baseline renders these VFX → it must stay byte-identical (the behavior-lock, like MobModel's character-closeup).

**New paths (src/render/ is one level deeper than src/):** `./game/spellVisualProfiles`→`../game/spellVisualProfiles`, `./devtest/captureMode`→`../devtest/captureMode`.

---

### Task 1: byte-exact extraction

**Files:** Create `frontend/src/render/spellVfx.jsx`; Modify `frontend/src/EnhancedMagicSystem.jsx`

- [ ] **Step 1:** create `render/spellVfx.jsx` = the import header + the VERBATIM `:473-904` slice + `export { EnhancedSpellProjectile, SpellImpactPop, CastTelegraph };` (MagicWand is already `export const`; SpellProjectileCore stays internal):
```jsx
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ENERGY_PROFILE, _defaultEnergy, WAND_CONFIGS } from '../game/spellVisualProfiles';
import { isCaptureMode } from '../devtest/captureMode';

// [byte-exact :473-904]

export { EnhancedSpellProjectile, SpellImpactPop, CastTelegraph };
```
- [ ] **Step 2:** in `EnhancedMagicSystem.jsx`: remove the `:473-904` block; add `import { EnhancedSpellProjectile, SpellImpactPop, CastTelegraph } from './render/spellVfx';` + `export { MagicWand } from './render/spellVfx';`; change the spellVisualProfiles import to `import { SPARK_PROFILE } from './game/spellVisualProfiles';` (drop ENERGY_PROFILE/_defaultEnergy/WAND_CONFIGS — now spellVfx-only). Grep-verify no other now-dead imports.

### Task 2: verify + close-out

- [ ] **Step 1: battery** (from `frontend/`): `npx vitest run` (1031 holds; extraction-only) · `npm run build` clean (the import-resolution gate — catches a missing back-import or the re-export) · `npx vitest run --config vitest.visual.config.js` → **18/18 byte-identical** (esp. `spell-cast`) · `wc -l src/EnhancedMagicSystem.jsx` → ~480 (< 900) · arrow-grep `render/spellVfx.jsx`.
- [ ] **Step 2: byte-equality proof:** diff the moved slice vs `HEAD:EnhancedMagicSystem.jsx:473-904` == identical.
- [ ] **Step 3: commit + close-out** — `refactor(s3): EMS -> extract spellVfx render group (byte-exact; EMS 904->~480, de-god-filed)` + ACTIVE_PLAN/CHANGELOG + SOTA + AGENTS.md god-file claim → 2 remain (Components 1297, GameScene 914).

## Self-Review
**Spec coverage:** S3 de-monolith (the god-file tax) ✓. **Placeholder scan:** import lists computed from the usage grep (concrete). **Type consistency:** Components' `import { EnhancedMagicSystem, MagicWand } from './EnhancedMagicSystem'` still resolves (EnhancedMagicSystem stays; MagicWand re-exported). **Capture-safety:** byte-exact → spell-cast baseline holds. **Risk:** ZERO module-local free-vars (grep-verified) — the SPELL_UPGRADES landmine from this file is already defused by S3-M2; build is the import-resolution gate.
