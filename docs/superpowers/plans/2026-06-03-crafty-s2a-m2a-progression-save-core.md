# S2-A-M2a — Progression-Persistence Core + Save Consolidation Implementation Plan

> ✅ SHIPPED — this milestone is merged to `main`; historical plan-of-record (see CHANGELOG/ROADMAP for the build record).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Fresh Opus implementer per task + spec-compliance review + code-quality review. Tasks are SEQUENTIAL (they share `src/store/useGameStore.jsx`). NO "Generated with"/"Co-Authored-By: Claude" commit footer. Subagent fix-ups = NEW commits, never `--amend`/`reset`. AST-safe edits only on `.js/.jsx` (Edit/Write, never `sed`).

**Goal:** Make all RPG progression (level/XP/attributes/equipment/talents/spellLevels/chests) survive a reload via a single canonical serializable slice + a local-first autosave — and in doing so, tear out the save-system slop (two divergent save paths, a 4× duplicated payload literal, a 4× duplicated max-stat formula, a dual-source level/XP, a baked talent mutation).

**Architecture:** ONE canonical, JSON-serializable progression slice owned by the zustand store is the source of truth. **Persist BASE data only** (level, XP, base attributes, equipped item-names, talent ranks, spellLevels, inventory, chests, playerStats); **DERIVE everything else on read** (effective attributes = base + equipment-fold + talent-fold; maxHealth/maxMana = `deriveMaxStats(level, effective)`) so nothing double-counts across save/reload/respec. A single `buildSaveData(state, opts)` serializer is the schema source of truth (used by both the autosave and the WorldManager UI); a single extended `loadWorldData(saveData)` is the restore funnel. The dead axios backend save path is deleted; persistence is local-first (localStorage). Progression state is TRANSITION-state (changed on level-up/equip/talent-spend, never read per-frame) so the zustand store is the correct, Game-Loop-Isolation-safe home; `playerPosition` is the one high-freq exception — snapshot it via `getState()` at save-time, restore by teleporting the Rapier body, never subscribe.

**Tech Stack:** React 19, zustand 5, Three 0.172 / R3F 9.5, Rapier 2.2 (WASM KCC), Vitest 3.2.4 (`environment: 'node'`, include globs cover `tests/**` AND colocated `src/**/*.test.{js,jsx}`; jsdom is per-file via `// @vitest-environment jsdom`). Run all commands from `/Users/kz/Code/Crafty/frontend/`.

**Grounding (do not re-derive — verified this session):** S2 design spec `docs/superpowers/specs/2026-06-02-crafty-s2-game-design-design.md` §3 (A3); S1 audit `memory/REALITY-AUDIT-S1-2026-06-02.md` (A3 = comprehensive save); the 7-subsystem recon (verified file:line below). M2a is the first of three M2 sub-plans (M2b = build axis A7 + talent→4-Aspect-trees A4; M2c = InputManager `active`-gate migration). Kevin's standing slop-cleanup authority (2026-06-03) explicitly approves the deletions/consolidations here.

---

## Verified current reality (the seams these tasks touch)

- **Two save systems, one shape, both lossy.** `useGameStore.saveGame` (`src/store/useGameStore.jsx:694`, axios POST to `VITE_BACKEND_URL`) and `loadGame` (`:779`, axios GET) have **ZERO callers** (dead). `WorldManager.jsx` is the **only live path**: localStorage (`crafty_world_saves` index + `crafty_world_save_<id>` blobs), and its load calls `loadWorldData` (`MenuSystem.jsx:183 onWorldLoad={gameState.loadWorldData}`). The save payload literal is **duplicated 4×** (`useGameStore.jsx:697-713` + `WorldManager.jsx:72-89, 115-132, 159-174/217-233`) and in every copy serializes only `world_data.blocks` + `player_data{position(HARDCODED {0,18,0}), inventory, stats}` + `game_state{gameMode,selectedBlock,activeSpell,isDay,gameTime,achievements}`.
- **Progression NOT persisted.** `loadWorldData` (`:732-777`) restores only those 9 fields. Dropped on reload: level, XP, totalXP, attributes, equipment, talentPoints, unlockedTalents, spellLevels, chests, maxHealth/maxMana.
- **Level/XP live in component useState**, not the store: `SimpleExperienceSystem.jsx:9-11` (`useState(1/0/0)`), surfaced via injected getter lambdas (`useGameStore.jsx:344 getPlayerLevel:()=>1`, overwritten by `App.jsx:331` + `SimpleExperienceSystem.jsx:80-81`).
- **Attributes + equipment ARE already in the store** (`useGameStore.jsx:129-142`) and already affect combat (`getEffectiveAttributes` `:145-161` → `solveMeleeDamage`/`solveSpellDamage`/`mitigateDamage`). The **effective-attribute fold is duplicated 4×** (`:145-161` canonical + inline copies in `equipItem :197-207`, `unequipItem :247-257`, `allocateAttribute :287-296`) and the **maxHealth/maxMana formula is duplicated 4×** (`:210-211`, `:260-261`, `:299-300`, `GameSystems.jsx:88-89`).
- **`GameSystems.jsx:86-97`** is a redundant maxStats `useEffect` driven by a `playerLevel` PROP; it heals `+20`/`+10` on **every** attribute/equipment change → an HP ratchet bug (`:95`). It's the only thing that recomputes the store's maxHealth on a plain XP level-up (the level-up path itself doesn't).
- **`chests` is a `Map`** (`useGameStore.jsx:415`), never serialized (`JSON.stringify(Map)` → `{}`). `worldBlocks` (`:489`) is the existing `Map`→`Array.from(entries())` pattern to mirror.
- **`spendTalentPoint` (`:421-444`)** BAKES `+5` into `attributes.armor` for `frost_shield` (`:435-437`) — a non-idempotent mutation that breaks respec/reload; node limits are duplicated (`:424-428` map vs the panel's inline `branches` array at `AdvancedGameFeatures.jsx:1111-1138`). (Full A4 fix is M2b; M2a only persists `talentPoints`/`unlockedTalents` and de-bakes `frost_shield` to a DERIVED fold so the persisted base stays clean.)
- **No autosave / interval / beforeunload trigger exists** — saving is purely the manual WorldManager "Save Current World" button.
- **Test patterns:** store-action tests = `import { useGameStore }` + `getState().setX()` + assert `getState().field` (`tests/store/bossActive.test.js`); load tests = call `getState().loadWorldData(obj)` directly (pure, no network), reset `terrainWorker:null` in `beforeEach` (`tests/store/saveNormalizer.test.js`). Static gates = `readFileSync` + regex, hard-fail with `.toEqual([])`/`.toMatch` (`tests/gates/static-gates.test.js`, `input-abstraction-gates.test.js`).

---

## File Structure

- **Create** `src/game/progression.js` — pure, React-free progression math: `xpForLevel(level)`, `computeEffective(baseAttrs, equipment, statsTable)`, `deriveMaxStats(level, effectiveAttrs)`. The single home for the formulas now duplicated 4×. Node-testable.
- **Create** `src/game/progression.test.js` — colocated unit tests (exact-value).
- **Create** `src/game/saveSchema.js` — `SAVE_VERSION` const + `buildSaveData(state, { position })` (the one serializer) + `migrateSaveData(saveData)` (version-gated, wraps the existing inventory normalizer). Pure, node-testable.
- **Create** `src/game/saveSchema.test.js` — colocated serializer/migration unit tests.
- **Create** `src/game/worldSaves.js` — thin localStorage helper for the world-slot index + blobs (extracted from WorldManager so the store can autosave without importing React). `listWorlds()`, `readWorld(id)`, `writeWorld(id, meta, saveData)`, `deleteWorld(id)`, `ACTIVE_WORLD_KEY`/`getActiveWorldId`/`setActiveWorldId`.
- **Modify** `src/store/useGameStore.jsx` — repoint effective/maxStats math onto `progression.js`; add `level/currentXP/totalXP` + `grantXP`/internal level-up; extend `loadWorldData`; add `saveActiveWorld`/autosave wiring; delete dead `saveGame`/`loadGame`; de-bake `frost_shield`.
- **Modify** `src/SimpleExperienceSystem.jsx` — collapse `useSimpleExperience` to a thin VFX-only store reader.
- **Modify** `src/GameSystems.jsx` — delete the redundant maxStats `useEffect` + the `playerLevel` prop; keep mana-regen + hunger intervals.
- **Modify** `src/App.jsx` — drop the `getPlayerLevel` lambda re-push + the `playerLevel` prop threading into `GameSystemsProvider`; mount the autosave trigger.
- **Modify** `src/WorldManager.jsx` — route all 4 payload literals through `buildSaveData`; use `worldSaves.js`; mark cloud-axios as S4-deferred (local-first is the live path).
- **Modify** `tests/store/saveNormalizer.test.js` — extend (do NOT duplicate) with the full progression round-trip.
- **Create** `tests/gates/save-consolidation-gates.test.js` — static gates: no dead `saveGame`/`loadGame`; no inline save-payload literal in WorldManager; save serializes the new fields; one max-stat formula.

---

## Task 1: Pure progression math module (`progression.js`)

**Files:**
- Create: `src/game/progression.js`
- Create (test): `src/game/progression.test.js`

Net-new pure module. Zero behavior change to the app yet (Task 2 repoints the store onto it). Formulas copied verbatim from the verified current code so this is a faithful extraction.

- [ ] **Step 1: Write the failing test** — `src/game/progression.test.js`

```js
import { describe, it, expect } from 'vitest';
import { xpForLevel, computeEffective, deriveMaxStats } from './progression.js';

const STATS = {
  'Diamond Sword': { strength: 15, agility: 8 },
  'Iron Shield': { armor: 15, strength: 3 },
};
const BASE = { strength: 10, agility: 10, intellect: 10, armor: 0, attributePoints: 0 };

describe('xpForLevel', () => {
  it('matches the exponential curve floor(100 * 1.5^(level-1))', () => {
    expect(xpForLevel(1)).toBe(100);
    expect(xpForLevel(2)).toBe(150);
    expect(xpForLevel(3)).toBe(225);
    expect(xpForLevel(5)).toBe(506); // floor(100 * 1.5^4 = 506.25)
  });
  it('clamps a non-positive level to 1', () => {
    expect(xpForLevel(0)).toBe(100);
    expect(xpForLevel(-3)).toBe(100);
  });
});

describe('computeEffective', () => {
  it('returns a copy of base when no equipment', () => {
    const eff = computeEffective(BASE, {}, STATS);
    expect(eff).toEqual(BASE);
    expect(eff).not.toBe(BASE); // must not mutate the base object
  });
  it('folds equipment bonuses additively across all slots', () => {
    const eff = computeEffective(BASE, { weapon: 'Diamond Sword', offhand: 'Iron Shield' }, STATS);
    expect(eff.strength).toBe(10 + 15 + 3);
    expect(eff.agility).toBe(10 + 8);
    expect(eff.intellect).toBe(10);
    expect(eff.armor).toBe(0 + 15);
  });
  it('ignores null slots and unknown item names', () => {
    const eff = computeEffective(BASE, { weapon: null, head: 'Nonexistent' }, STATS);
    expect(eff).toEqual(BASE);
  });
});

describe('deriveMaxStats', () => {
  it('maxHealth = 100 + (level-1)*10 + STR*5; maxMana = 100 + (level-1)*5 + INT*2', () => {
    expect(deriveMaxStats(1, { strength: 10, intellect: 10 })).toEqual({ maxHealth: 150, maxMana: 120 });
    expect(deriveMaxStats(5, { strength: 20, intellect: 15 })).toEqual({ maxHealth: 100 + 40 + 100, maxMana: 100 + 20 + 30 });
  });
  it('treats a missing level as 1 and missing attrs as 0-contribution', () => {
    expect(deriveMaxStats(undefined, {})).toEqual({ maxHealth: 100, maxMana: 100 });
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/game/progression.test.js` → FAIL ("Failed to resolve import './progression.js'").

- [ ] **Step 3: Write the minimal implementation** — `src/game/progression.js`

```js
/**
 * progression.js — pure, React-free RPG progression math. The single home for the
 * three formulas that were duplicated across useGameStore + GameSystems. Persist BASE
 * data; DERIVE effective attributes + max stats on read (never bake), so save/reload
 * and respec never double-count. Node-testable (no THREE / store / React imports).
 */

/** XP required to advance FROM `level` to the next. floor(100 * 1.5^(level-1)). */
export function xpForLevel(level) {
  const lv = Math.max(1, level || 1);
  return Math.floor(100 * Math.pow(1.5, lv - 1));
}

/**
 * Base attributes + the sum of equipped items' EQUIPMENT_STATS bonuses. Returns a NEW
 * object (never mutates base). `equipment` is a slot->itemName map (null = empty).
 */
export function computeEffective(baseAttrs, equipment, statsTable) {
  const eff = { ...(baseAttrs || {}) };
  for (const itemName of Object.values(equipment || {})) {
    const bonuses = itemName && statsTable ? statsTable[itemName] : null;
    if (!bonuses) continue;
    if (bonuses.strength) eff.strength = (eff.strength || 0) + bonuses.strength;
    if (bonuses.agility) eff.agility = (eff.agility || 0) + bonuses.agility;
    if (bonuses.intellect) eff.intellect = (eff.intellect || 0) + bonuses.intellect;
    if (bonuses.armor) eff.armor = (eff.armor || 0) + bonuses.armor;
  }
  return eff;
}

/** Derived resource caps from level + EFFECTIVE attributes. */
export function deriveMaxStats(level, effectiveAttrs) {
  const lv = Math.max(1, level || 1);
  const str = (effectiveAttrs && effectiveAttrs.strength) || 0;
  const int = (effectiveAttrs && effectiveAttrs.intellect) || 0;
  return {
    maxHealth: 100 + (lv - 1) * 10 + str * 5,
    maxMana: 100 + (lv - 1) * 5 + int * 2,
  };
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run src/game/progression.test.js` → PASS.

- [ ] **Step 5: Commit** — `git add src/game/progression.js src/game/progression.test.js && git commit -m "feat(s2a-m2a): pure progression math module (xpForLevel/computeEffective/deriveMaxStats)"`

---

## Task 2: Repoint the store's effective/maxStats math onto `progression.js` (DRY, behavior-preserving)

**Files:**
- Modify: `src/store/useGameStore.jsx` (`getEffectiveAttributes` `:145-161`; `equipItem` `:163-226`; `unequipItem` `:228-276`; `allocateAttribute` `:278-309`)
- Modify (test): add a store-action test file `tests/store/equipBuildAxis.test.js`

This is a faithful DRY refactor — same formulas, single source. It removes the 3 inline effective-folds + 3 inline maxStats copies inside the store, replacing them with `computeEffective`/`deriveMaxStats` calls. (Note: `equipItem`/`unequipItem`/`allocateAttribute` compute effective from the *pending* equipment/attributes, so they must call `computeEffective(pendingBase, pendingEquip, EQUIPMENT_STATS)` directly — not `get().getEffectiveAttributes()` which reads committed state.)

- [ ] **Step 1: Write the failing test** — `tests/store/equipBuildAxis.test.js`

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';

const reset = () => useGameStore.setState({
  attributes: { strength: 10, agility: 10, intellect: 10, armor: 0, attributePoints: 0 },
  equipment: { head: null, chest: null, boots: null, weapon: null, offhand: null },
  inventory: { blocks: { 'Diamond Sword': 1 }, tools: {}, magic: {} },
  playerHealth: 100, maxHealth: 100, mana: 100, maxMana: 100,
  level: 1, currentXP: 0, totalXP: 0,
});

describe('equip build axis (DRY effective + maxStats)', () => {
  beforeEach(reset);

  it('getEffectiveAttributes folds equipped bonuses', () => {
    useGameStore.getState().equipItem('weapon', 'Diamond Sword');
    const eff = useGameStore.getState().getEffectiveAttributes();
    expect(eff.strength).toBe(25); // 10 base + 15
    expect(eff.agility).toBe(18);  // 10 base + 8
  });

  it('equip recomputes maxHealth via the shared formula (level 1, STR 25 -> 100 + 0 + 125)', () => {
    useGameStore.getState().equipItem('weapon', 'Diamond Sword');
    expect(useGameStore.getState().maxHealth).toBe(225);
  });

  it('equip/unequip is idempotent — no maxHealth ratchet across cycles', () => {
    const s = useGameStore.getState();
    s.equipItem('weapon', 'Diamond Sword');
    expect(useGameStore.getState().maxHealth).toBe(225); // L1, STR 25 -> 100 + 125
    s.unequipItem('weapon');
    const afterFirst = useGameStore.getState().maxHealth; // L1, STR 10 -> 100 + 50 = 150
    expect(afterFirst).toBe(150);
    s.equipItem('weapon', 'Diamond Sword');
    s.unequipItem('weapon');
    expect(useGameStore.getState().maxHealth).toBe(afterFirst); // identical — no accumulation
  });

  it('allocateAttribute spends a point and recomputes caps', () => {
    useGameStore.setState({ attributes: { ...useGameStore.getState().attributes, attributePoints: 1 } });
    useGameStore.getState().allocateAttribute('strength');
    expect(useGameStore.getState().attributes.strength).toBe(11);
    expect(useGameStore.getState().attributes.attributePoints).toBe(0);
    expect(useGameStore.getState().maxHealth).toBe(155); // 100 + 0 + 11*5
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/store/equipBuildAxis.test.js`. Expected: FAIL on the baseline value (`level`/`maxHealth` not yet level-aware via the shared formula) or pass-by-accident; the load-bearing assertion is the no-ratchet one. (If all pass pre-change because the formulas already agree, that is acceptable — this task is a refactor whose net is fewer formula copies; proceed and rely on the gate in Task 7 + the loot-characterization test staying green.)

- [ ] **Step 3: Implement** — in `src/store/useGameStore.jsx`:
  1. Add at top, after the existing imports: `import { computeEffective, deriveMaxStats } from '../game/progression.js';`
  2. Replace `getEffectiveAttributes` body (`:145-161`) with: `const state = get(); return computeEffective(state.attributes, state.equipment, EQUIPMENT_STATS);`
  3. In `equipItem` (`:197-211`) and `unequipItem` (`:247-261`): replace the inline `const base = state.attributes; const effective = {...base}; Object.entries(newEquipment).forEach(...)` + the two `const newMaxHealth/newMaxMana = ...` lines with:
     ```js
     const effective = computeEffective(state.attributes, newEquipment, EQUIPMENT_STATS);
     const level = state.level || 1;
     const { maxHealth: newMaxHealth, maxMana: newMaxMana } = deriveMaxStats(level, effective);
     ```
     (Use `state.level` — Task 3 adds it; until then it reads `undefined` → `deriveMaxStats` clamps to 1, identical to today's `getPlayerLevel()?.()||1` for a fresh game. Keep `state.getPlayerLevel ? state.getPlayerLevel() : 1` ONLY if Task 3 is not yet merged; since tasks are sequential and Task 3 follows, prefer `state.level`. The implementer: if `state.level` is not yet defined at this task, use `(state.getPlayerLevel ? state.getPlayerLevel() : 1)` and Task 3 will switch it to `state.level`.)
  4. In `allocateAttribute` (`:287-300`): same replacement, computing effective from `newAttributes` + `state.equipment`.

- [ ] **Step 4: Run to verify it passes** — `npx vitest run tests/store/equipBuildAxis.test.js tests/data/loot-characterization.test.js` → PASS (the loot-characterization EQUIPMENT_STATS snapshot must stay green — proves no stat-table drift).

- [ ] **Step 5: Commit** — `git add src/store/useGameStore.jsx src/game/progression.js tests/store/equipBuildAxis.test.js && git commit -m "refactor(s2a-m2a): DRY store effective-attrs + maxStats onto progression.js (kills 3 inline formula copies)"`

---

## Task 3: Lift level/XP into the store + native `grantXP`/level-up action

**Files:**
- Modify: `src/store/useGameStore.jsx` (add fields near `:340-347`; the `grantXP` action; repoint `getPlayerLevel`/`getPlayerXP` getters)
- Modify (test): `tests/store/progressionXp.test.js` (new)

The store becomes the source of truth for `level`/`currentXP`/`totalXP`. `grantXP` does the XP math + level-up (awards +5 attribute points, +1 talent point, recomputes maxStats via `deriveMaxStats`, heals to new max on level-up). `getPlayerLevel`/`getPlayerXP` become thin getters over the new fields so existing call-sites keep working. **Behavior change (intentional fix):** the old single-level-per-grant cap is replaced by a `while` loop so a large XP drop levels up fully (the old code only ever advanced one level per call).

- [ ] **Step 1: Write the failing test** — `tests/store/progressionXp.test.js`

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { xpForLevel } from '../../src/game/progression.js';

const reset = () => useGameStore.setState({
  level: 1, currentXP: 0, totalXP: 0,
  attributes: { strength: 10, agility: 10, intellect: 10, armor: 0, attributePoints: 0 },
  equipment: { head: null, chest: null, boots: null, weapon: null, offhand: null },
  talentPoints: 0, unlockedTalents: {},
  playerHealth: 50, maxHealth: 150, mana: 50, maxMana: 120,
});

describe('store grantXP / level-up', () => {
  beforeEach(reset);

  it('adds XP below the threshold without leveling', () => {
    useGameStore.getState().grantXP(50, 'test');
    const s = useGameStore.getState();
    expect(s.level).toBe(1);
    expect(s.currentXP).toBe(50);
    expect(s.totalXP).toBe(50);
  });

  it('levels up at the threshold, carries overflow, awards points', () => {
    useGameStore.getState().grantXP(xpForLevel(1) + 30, 'test'); // 100 + 30
    const s = useGameStore.getState();
    expect(s.level).toBe(2);
    expect(s.currentXP).toBe(30);
    expect(s.totalXP).toBe(130);
    expect(s.attributes.attributePoints).toBe(5);
    expect(s.talentPoints).toBe(1);
  });

  it('handles a multi-level grant in one call', () => {
    useGameStore.getState().grantXP(xpForLevel(1) + xpForLevel(2) + 10, 'big'); // 100 + 150 + 10
    const s = useGameStore.getState();
    expect(s.level).toBe(3);
    expect(s.currentXP).toBe(10);
    expect(s.attributes.attributePoints).toBe(10); // +5 per level x2
    expect(s.talentPoints).toBe(2);
  });

  it('recomputes maxHealth/maxMana and heals to new max on level-up', () => {
    useGameStore.getState().grantXP(xpForLevel(1), 'ding'); // -> level 2
    const s = useGameStore.getState();
    expect(s.maxHealth).toBe(100 + 10 + 50); // (level-1)*10 + STR*5 -> 160
    expect(s.playerHealth).toBe(s.maxHealth); // healed to full on ding
  });

  it('getPlayerLevel()/getPlayerXP() reflect the store fields', () => {
    useGameStore.getState().grantXP(120, 'x');
    expect(useGameStore.getState().getPlayerLevel()).toBe(2);
    const xp = useGameStore.getState().getPlayerXP();
    expect(xp.level).toBe(2);
    expect(xp.current).toBe(20);
    expect(xp.total).toBe(120);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/store/progressionXp.test.js` → FAIL (`grantXP` is currently `null`; `getPlayerLevel` returns the stub `1`).

- [ ] **Step 3: Implement** — in `src/store/useGameStore.jsx`:
  1. Add `import { computeEffective, deriveMaxStats, xpForLevel } from '../game/progression.js';` (extend the Task-2 import).
  2. Add canonical fields near the other progression state (e.g. just before `attributes` at `:129`): `level: 1, currentXP: 0, totalXP: 0,`.
  3. Replace the dead getter slots at `:342-347` (`grantXP: null, setGrantXP, getPlayerLevel:()=>1, setGetPlayerLevel, getPlayerXP:()=>(...), setGetPlayerXP`) with:
     ```js
     getPlayerLevel: () => get().level,
     getPlayerXP: () => ({ current: get().currentXP, total: get().totalXP, level: get().level, required: xpForLevel(get().level) }),
     grantXP: (amount, reason = 'Action') => set((state) => {
       let level = state.level;
       let currentXP = state.currentXP + (amount || 0);
       const totalXP = state.totalXP + (amount || 0);
       let attributePoints = state.attributes.attributePoints;
       let talentPoints = state.talentPoints;
       let leveledUp = false;
       while (currentXP >= xpForLevel(level)) {
         currentXP -= xpForLevel(level);
         level += 1;
         attributePoints += 5;
         talentPoints += 1;
         leveledUp = true;
       }
       const attributes = { ...state.attributes, attributePoints };
       const effective = computeEffective(attributes, state.equipment, EQUIPMENT_STATS);
       const { maxHealth, maxMana } = deriveMaxStats(level, effective);
       return {
         level, currentXP, totalXP, talentPoints, attributes, maxHealth, maxMana,
         ...(leveledUp ? { playerHealth: maxHealth, mana: maxMana } : {}),
       };
     }),
     ```
  4. Delete `setGrantXP`/`setGetPlayerLevel`/`setGetPlayerXP` (dead after this — verify zero remaining callers with `grep -rn "setGrantXP\|setGetPlayerLevel\|setGetPlayerXP" src tests`; if any caller remains it is from the old SimpleExperienceSystem injection which Task 4 removes — Task 4 follows, so it is safe to delete here AND fix the caller in Task 4; if grep shows a caller OUTSIDE SimpleExperienceSystem/App, STOP and report).
  5. NOW switch the Task-2 `equipItem`/`unequipItem`/`allocateAttribute` level reads to `const level = state.level;` (they were `state.getPlayerLevel ? ... : 1`).

- [ ] **Step 4: Run to verify it passes** — `npx vitest run tests/store/progressionXp.test.js tests/store/equipBuildAxis.test.js` → PASS.

- [ ] **Step 5: Commit** — `git add src/store/useGameStore.jsx tests/store/progressionXp.test.js && git commit -m "feat(s2a-m2a): lift level/XP into the store + native grantXP/level-up action (single source of truth)"`

---

## Task 4: Collapse SimpleExperienceSystem to VFX-only; delete the dual-source bridges

**Files:**
- Modify: `src/SimpleExperienceSystem.jsx` (`useSimpleExperience` `:8-95`)
- Modify: `src/GameSystems.jsx` (delete the maxStats `useEffect` `:86-97`; drop the `playerLevel` prop `:34,68-78`)
- Modify: `src/App.jsx` (drop the `getPlayerLevel` lambda re-push `:331`; drop the `playerLevel` prop into `GameSystemsProvider` `:49`)
- Create (gate): `tests/gates/progression-source-gates.test.js`

`useSimpleExperience` keeps ONLY the XP-gain + level-up VFX (`xpGains`/`levelUpEffects`), now driven by **reading the store** (level/XP) and diffing `totalXP` to produce the floating "+N" gain. The canonical `grantXP` is the store's; consumers (mob kill, quests, `GameMethods.grantXP`) call `useGameStore.getState().grantXP(...)`. The redundant `GameSystems` maxStats effect (which caused the +20 HP ratchet) is deleted — `grantXP`/`equipItem`/`allocateAttribute` already recompute caps.

- [ ] **Step 1: Write the failing gate** — `tests/gates/progression-source-gates.test.js`

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('progression single-source gates', () => {
  it('SimpleExperienceSystem no longer owns level/currentXP/totalXP useState', () => {
    const src = read('src/SimpleExperienceSystem.jsx');
    expect(src).not.toMatch(/useState\([^)]*\)\s*;?\s*\/\/?\s*(player[Ll]evel|currentXP|totalXP)/);
    expect(/const\s*\[\s*playerLevel\s*,/.test(src)).toBe(false);
    expect(/const\s*\[\s*currentXP\s*,/.test(src)).toBe(false);
    expect(/const\s*\[\s*totalXP\s*,/.test(src)).toBe(false);
  });
  it('App no longer re-pushes a getPlayerLevel lambda into the store', () => {
    const src = read('src/App.jsx');
    expect(/setGetPlayerLevel/.test(src)).toBe(false);
  });
  it('GameSystems no longer derives maxHealth/maxMana (store owns it)', () => {
    const src = read('src/GameSystems.jsx');
    expect(/newMaxHealth\s*=\s*100\s*\+/.test(src)).toBe(false);
  });
  it('the level-up max-stat formula exists in exactly one place (progression.js)', () => {
    const files = ['src/store/useGameStore.jsx', 'src/GameSystems.jsx', 'src/SimpleExperienceSystem.jsx'];
    for (const f of files) {
      expect(/100\s*\+\s*\(\s*level\s*-\s*1\s*\)\s*\*\s*10\s*\+/.test(read(f))).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/gates/progression-source-gates.test.js` → FAIL (all four still present).

- [ ] **Step 3: Implement.**
  - **`SimpleExperienceSystem.jsx`** — rewrite `useSimpleExperience` to:
    - Read `level`, `currentXP`, `totalXP` via a `useGameStore(useShallow(...))` selector (these are transition-state; reading them reactively for the HUD bar is correct — they are NOT in a useFrame loop).
    - Keep `xpGains`/`levelUpEffects` local `useState` + `xpGainId` ref.
    - Replace `addExperience` with a thin wrapper: `const addExperience = (amount, reason='Action') => { useGameStore.getState().grantXP(amount, reason); /* VFX handled by the totalXP-diff effect below */ };` — but the canonical grant is the store's, so prefer exposing `grantXP` directly.
    - Add a `useEffect` watching `totalXP`: on increase, push an `xpGain` VFX (`{id, amount: totalXP-prevTotalXP, reason, timestamp}`) and auto-remove after 3s; add a `useEffect` watching `level`: on increase, push a `levelUpEffect` + `window.playLevelUpSound?.()`. (Track previous values with a `useRef`.)
    - In the mount effect: `useGameStore.setState({ grantXP: useGameStore.getState().grantXP })` is NO LONGER needed (store owns it). Set `GameMethods.grantXP = (a, r) => useGameStore.getState().grantXP(a, r);` so legacy `GameMethods.grantXP` callers still work. DELETE the `setState({ getPlayerLevel: ... })` / `getPlayerXP` injections (store owns them).
    - Return the same shape App expects: `{ playerLevel: level, currentXP, totalXP, xpRequired: xpForLevel(level), xpProgress: (currentXP/xpForLevel(level))*100, xpGains, levelUpEffects, addExperience, setLevelUpEffects }` (import `xpForLevel` from `./game/progression.js`).
  - **`GameSystems.jsx`** — DELETE the maxStats `useEffect` (`:86-97`) entirely. Remove `getMaxHealthBonus`/`getManaBonus`/`getSpellDamageMultiplier`'s dependence on `playerLevel` (keep `getSpellDamageMultiplier`/`getMaxHealthBonus` in the context value IF any consumer reads them — grep first; `getSpellDamageMultiplier` is referenced by spell code, so keep it but base it on `useGameStore.getState().level`). Change the provider signature from `({ children, playerLevel = 1 })` to `({ children })` and read level via the store where needed. Keep the mana-regen + hunger `setInterval` effects unchanged.
  - **`App.jsx`** — delete the `useEffect` re-pushing `setGetPlayerLevel` (`:330-332`); change `<GameSystemsProvider playerLevel={experienceSystem.playerLevel}>` to `<GameSystemsProvider>`.

- [ ] **Step 4: Run to verify it passes** — `npx vitest run tests/gates/progression-source-gates.test.js tests/store/progressionXp.test.js && npm run build` → gates PASS, build clean.

- [ ] **Step 5: Visual parity check** — `npm run test:visual` → MUST remain **12/12** (this is a logic refactor; the XP bar / HUD render the same values). If any baseline shifts, STOP and report (it would mean a behavior change leaked).

- [ ] **Step 6: Commit** — `git add src/SimpleExperienceSystem.jsx src/GameSystems.jsx src/App.jsx tests/gates/progression-source-gates.test.js && git commit -m "refactor(s2a-m2a): collapse SimpleExperienceSystem to VFX-only; delete GameSystems maxStats ratchet + App level-lambda bridge"`

---

## Task 5: Single `buildSaveData` serializer + migration; delete dead `saveGame`/`loadGame`

**Files:**
- Create: `src/game/saveSchema.js`
- Create (test): `src/game/saveSchema.test.js`
- Modify: `src/store/useGameStore.jsx` (delete `saveGame` `:694-730` + `loadGame` `:779-809`; drop the now-unused `axios` import if no other store usage — grep first)

`buildSaveData(state, { position })` is the one serializer (the save-schema source of truth). It captures world + inventory + playerStats + game_state + the FULL progression slice + chests (Map→array) + real position + a `version`. `migrateSaveData` wraps the existing inventory normalizer + is the forward-compat seam.

- [ ] **Step 1: Write the failing test** — `src/game/saveSchema.test.js`

```js
import { describe, it, expect } from 'vitest';
import { SAVE_VERSION, buildSaveData, migrateSaveData } from './saveSchema.js';

const stateLike = {
  worldBlocks: new Map([['1_2_3', 'stone']]),
  chests: new Map([['10_0_10', { inventory: { 'Iron Sword': 1 } }]]),
  inventory: { blocks: { grass: 64 }, tools: { pickaxe: 1 }, magic: {} },
  playerStats: { blocksPlaced: 3, blocksDestroyed: 1, distanceTraveled: 0, timeplayed: 0 },
  attributes: { strength: 12, agility: 10, intellect: 10, armor: 0, attributePoints: 2 },
  equipment: { head: null, chest: null, boots: null, weapon: 'Diamond Sword', offhand: null },
  talentPoints: 1, unlockedTalents: { frost_shield: 2 }, spellLevels: { fireball: 3 },
  level: 4, currentXP: 25, totalXP: 400,
  gameMode: 'creative', selectedBlock: 'grass', activeSpell: 'fireball', isDay: true, gameTime: 12, achievements: ['first_block'],
};

describe('buildSaveData', () => {
  it('serializes the full progression slice + version', () => {
    const s = buildSaveData(stateLike, { position: { x: 5, y: 18, z: -3 } });
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.player_data.position).toEqual({ x: 5, y: 18, z: -3 });
    expect(s.progression).toEqual({
      level: 4, currentXP: 25, totalXP: 400,
      attributes: stateLike.attributes,
      equipment: stateLike.equipment,
      talentPoints: 1, unlockedTalents: { frost_shield: 2 }, spellLevels: { fireball: 3 },
    });
  });
  it('serializes Maps (worldBlocks + chests) as entry arrays', () => {
    const s = buildSaveData(stateLike, { position: { x: 0, y: 18, z: 0 } });
    expect(s.world_data.blocks).toEqual([['1_2_3', 'stone']]);
    expect(s.chests).toEqual([['10_0_10', { inventory: { 'Iron Sword': 1 } }]]);
  });
  it('is JSON-round-trippable (no Maps survive)', () => {
    const s = buildSaveData(stateLike, { position: { x: 0, y: 18, z: 0 } });
    expect(() => JSON.parse(JSON.stringify(s))).not.toThrow();
    expect(JSON.parse(JSON.stringify(s)).chests).toEqual([['10_0_10', { inventory: { 'Iron Sword': 1 } }]]);
  });
});

describe('migrateSaveData', () => {
  it('passes a current-version save through unchanged in shape', () => {
    const s = buildSaveData(stateLike, { position: { x: 0, y: 18, z: 0 } });
    const m = migrateSaveData(s);
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.progression.level).toBe(4);
  });
  it('tolerates a pre-A3 (versionless, progression-less) save without throwing', () => {
    const legacy = { world_data: { blocks: [] }, player_data: { inventory: { blocks: {} }, stats: {} }, game_state: {} };
    expect(() => migrateSaveData(legacy)).not.toThrow();
    const m = migrateSaveData(legacy);
    expect(m.progression).toBeUndefined(); // load path falls back to current state for missing slice
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/game/saveSchema.test.js` → FAIL (module missing).

- [ ] **Step 3: Implement** — `src/game/saveSchema.js`

```js
/**
 * saveSchema.js — the ONE save-payload serializer (schema source of truth) + a
 * version-gated migration seam. Local-first. Replaces the 4 duplicated inline payload
 * literals (store.saveGame + WorldManager x3). Pure: takes a state snapshot, returns a
 * JSON-safe object (Maps -> entry arrays). No store/React/axios imports.
 */
import { normalizeInventoryKeys } from './invNormalize.js';

export const SAVE_VERSION = 2; // 1 = pre-A3 (no progression); 2 = A3 progression slice

const mapEntries = (m) => (m instanceof Map ? Array.from(m.entries()) : Array.isArray(m) ? m : []);

export function buildSaveData(state, { position } = {}) {
  return {
    version: SAVE_VERSION,
    save_name: `Save_${new Date().toLocaleString()}`,
    world_data: { blocks: mapEntries(state.worldBlocks) },
    chests: mapEntries(state.chests),
    player_data: {
      position: position || { x: 0, y: 18, z: 0 },
      inventory: state.inventory,
      stats: state.playerStats,
    },
    progression: {
      level: state.level,
      currentXP: state.currentXP,
      totalXP: state.totalXP,
      attributes: state.attributes,
      equipment: state.equipment,
      talentPoints: state.talentPoints,
      unlockedTalents: state.unlockedTalents,
      spellLevels: state.spellLevels,
    },
    game_state: {
      gameMode: state.gameMode,
      selectedBlock: state.selectedBlock,
      activeSpell: state.activeSpell,
      isDay: state.isDay,
      gameTime: state.gameTime,
      achievements: state.achievements,
    },
  };
}

/** Forward-compat: normalize legacy inventory keys; tolerate versionless/progression-less saves. */
export function migrateSaveData(saveData) {
  if (!saveData || typeof saveData !== 'object') return saveData;
  const out = { ...saveData };
  if (out.player_data?.inventory) {
    out.player_data = { ...out.player_data, inventory: normalizeInventoryKeys(out.player_data.inventory) };
  }
  return out;
}
```

  Also **extract** the existing `normalizeInventoryKeys` (currently inline in `useGameStore.jsx:13-29`) into a new tiny pure module `src/game/invNormalize.js` (so both `saveSchema.js` and the store import it without a circular dep), and have the store import it from there. (Keep behavior byte-identical; the existing `tests/store/saveNormalizer.test.js` proves it.)

- [ ] **Step 4: Delete dead code** — in `src/store/useGameStore.jsx`: delete `saveGame` (`:694-730`) and `loadGame` (`:779-809`). Verify zero callers first: `grep -rn "\.saveGame\|\.loadGame\b\|saveGame:\|loadGame:" src tests` should show only the definitions (the recon confirmed dead; re-verify per fresh-state rule). If `axios` is now unused in the store (`grep -n axios src/store/useGameStore.jsx`), remove its import.

- [ ] **Step 5: Run to verify it passes** — `npx vitest run src/game/saveSchema.test.js tests/store/saveNormalizer.test.js && npm run build` → PASS + clean.

- [ ] **Step 6: Commit** — `git add src/game/saveSchema.js src/game/saveSchema.test.js src/game/invNormalize.js src/store/useGameStore.jsx && git commit -m "feat(s2a-m2a): single buildSaveData serializer + migration; delete dead axios saveGame/loadGame"`

---

## Task 6: Extend `loadWorldData` to restore the full slice (round-trip)

**Files:**
- Modify: `src/store/useGameStore.jsx` (`loadWorldData` `:732-777`)
- Modify (test): `tests/store/saveNormalizer.test.js` (extend with the round-trip)

`loadWorldData` restores the progression slice + chests (array→Map) + position. It runs `migrateSaveData` first, falls back to current state for any missing field (old saves load cleanly), and recomputes derived caps from the restored level+effective attributes so a loaded character has correct maxHealth/maxMana. Position restore: set the store `playerPosition` AND, if a `playerRigidBodyRef` exists, teleport the Rapier body (a load happens at a menu/transition, never mid-frame).

> **VFX-ref follow-up (from T3 review):** after restoring `totalXP`/`level` to (possibly large) saved values, `SimpleExperienceSystem`'s diff-refs (`prevTotal`/`prevLevel`) are stale → the next render would fire a spurious "+N XP" float / level-up burst. In practice the load happens behind the WorldManager modal (gameplay HUD hidden) and the float auto-removes in 3 s, so this is a MINOR cosmetic at most. If it surfaces in play-test, resync by bumping a store `loadedAt` tick in `loadWorldData` that the hook watches to reset its refs (set `prevTotal.current = totalXP; prevLevel.current = level` on `loadedAt` change). Not required for M2a green.

- [ ] **Step 1: Write the failing test** — append to `tests/store/saveNormalizer.test.js`

```js
import { buildSaveData } from '../../src/game/saveSchema.js';
import { deriveMaxStats, computeEffective } from '../../src/game/progression.js';
import { EQUIPMENT_STATS } from '../../src/store/useGameStore.jsx';

describe('A3 full progression round-trip (buildSaveData -> loadWorldData)', () => {
  beforeEach(() => useGameStore.setState({ terrainWorker: null, playerRigidBodyRef: null }));

  it('restores level/XP/attributes/equipment/talents/spellLevels/chests/position', () => {
    const snapshot = {
      worldBlocks: new Map([['0_10_0', 'dirt']]),
      chests: new Map([['5_0_5', { inventory: { 'Gold Coin': 9 } }]]),
      inventory: { blocks: { grass: 1 }, tools: {}, magic: {} },
      playerStats: { blocksPlaced: 0, blocksDestroyed: 0, distanceTraveled: 0, timeplayed: 0 },
      attributes: { strength: 14, agility: 11, intellect: 13, armor: 0, attributePoints: 3 },
      equipment: { head: null, chest: null, boots: null, weapon: 'Iron Sword', offhand: null },
      talentPoints: 2, unlockedTalents: { frost_shield: 1 }, spellLevels: { fireball: 2 },
      level: 6, currentXP: 40, totalXP: 900,
      gameMode: 'survival', selectedBlock: 'stone', activeSpell: 'iceball', isDay: false, gameTime: 4, achievements: [],
    };
    const save = JSON.parse(JSON.stringify(buildSaveData(snapshot, { position: { x: 7, y: 20, z: 8 } })));

    useGameStore.getState().loadWorldData(save);
    const s = useGameStore.getState();

    expect(s.level).toBe(6);
    expect(s.currentXP).toBe(40);
    expect(s.totalXP).toBe(900);
    expect(s.attributes).toEqual(snapshot.attributes);
    expect(s.equipment.weapon).toBe('Iron Sword');
    expect(s.talentPoints).toBe(2);
    expect(s.unlockedTalents).toEqual({ frost_shield: 1 });
    expect(s.spellLevels).toEqual({ fireball: 2 });
    expect(s.chests instanceof Map).toBe(true);
    expect(s.chests.get('5_0_5')).toEqual({ inventory: { 'Gold Coin': 9 } });
    expect(s.playerPosition).toEqual({ x: 7, y: 20, z: 8 });

    const eff = computeEffective(snapshot.attributes, snapshot.equipment, EQUIPMENT_STATS);
    expect(s.maxHealth).toBe(deriveMaxStats(6, eff).maxHealth);
  });

  it('a pre-A3 save (no progression slice) loads without crashing and keeps current progression', () => {
    useGameStore.setState({ level: 3, currentXP: 10, totalXP: 200 });
    expect(() => useGameStore.getState().loadWorldData({
      world_data: { blocks: [] }, player_data: { inventory: { blocks: {} }, stats: {} }, game_state: { gameMode: 'creative' },
    })).not.toThrow();
    expect(useGameStore.getState().level).toBe(3); // fell back, not wiped
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/store/saveNormalizer.test.js` → FAIL (progression/chests/position not restored).

- [ ] **Step 3: Implement** — rewrite `loadWorldData` (`:732-777`) to:
  1. `import { migrateSaveData } from '../game/saveSchema.js'; import { computeEffective, deriveMaxStats } from '../game/progression.js';` (extend imports).
  2. At the top of the function: `saveData = migrateSaveData(saveData);`
  3. Keep the existing world_data/inventory/playerStats/game_state restore + the terrainWorker replay (`:746-763`) verbatim.
  4. Add a `prog = saveData.progression` block: restore `level/currentXP/totalXP/attributes/equipment/talentPoints/unlockedTalents/spellLevels` each with `?? state.X` fallback. Rebuild `chests` as `saveData.chests ? new Map(saveData.chests) : state.chests`.
  5. Recompute derived caps: `const restoredAttrs = prog?.attributes ?? state.attributes; const restoredEquip = prog?.equipment ?? state.equipment; const restoredLevel = prog?.level ?? state.level; const eff = computeEffective(restoredAttrs, restoredEquip, EQUIPMENT_STATS); const { maxHealth, maxMana } = deriveMaxStats(restoredLevel, eff);` and include `maxHealth, maxMana` in the return; clamp `playerHealth: Math.min(state.playerHealth, maxHealth)` is wrong on load (should restore to a sensible value) — set `playerHealth: maxHealth, mana: maxMana` on load (a loaded character arrives at full; matches `respawn`).
  6. Restore position: `const position = saveData.player_data?.position; if (position) { /* in the returned set object */ playerPosition: position }`. AFTER the `set`, outside the reducer, teleport the body if present: read `get().playerRigidBodyRef`; if it has `.current?.setTranslation`, call `setTranslation({x,y,z}, true)`. (Do this in a `setTimeout(()=>{...},0)` or after the set returns, since `loadWorldData` is a `set((state)=>{...})` — restructure to capture the position then teleport after. The implementer: compute the return object, call `set(...)`, then teleport.)
  7. Include `level, currentXP, totalXP, attributes, equipment, talentPoints, unlockedTalents, spellLevels, chests, maxHealth, maxMana, playerHealth, mana, playerPosition` in the returned object.

- [ ] **Step 4: Run to verify it passes** — `npx vitest run tests/store/saveNormalizer.test.js tests/store/progressionXp.test.js tests/store/equipBuildAxis.test.js` → PASS.

- [ ] **Step 5: Commit** — `git add src/store/useGameStore.jsx tests/store/saveNormalizer.test.js && git commit -m "feat(s2a-m2a): loadWorldData restores full progression slice + chests + position + recomputed caps"`

---

## Task 7: Local-first autosave + WorldManager consolidation

**Files:**
- Create: `src/game/worldSaves.js` + `src/game/worldSaves.test.js`
- Create: `src/game/autosave.js` + `src/game/autosave.test.js` (pure debounce/flush scheduler)
- Modify: `src/store/useGameStore.jsx` (add `saveActiveWorld(position)` action)
- Modify: `src/WorldManager.jsx` (route all 4 payload literals through `buildSaveData` + `worldSaves.js`; mark cloud-axios S4-deferred)
- Modify: `src/App.jsx` (mount the autosave trigger)
- Create (gate): `tests/gates/save-consolidation-gates.test.js`

The store gains `saveActiveWorld(position)` → `buildSaveData(get(), {position})` → `worldSaves.writeWorld(activeId, meta, data)`. A pure `createAutosave({ save, delayMs })` scheduler debounces transition-triggered saves + exposes `flush()` for `beforeunload`/`visibilitychange`. App wires: on level-up/equip/chest-change → `schedule()`; on `beforeunload`/`visibilitychange:hidden` → `flush()` (capturing real position from `playerRigidBodyRef.current.translation()`).

- [ ] **Step 1: Write the failing tests.**

  `src/game/autosave.test.js`:
```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAutosave } from './autosave.js';

describe('createAutosave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounces multiple schedule() calls into one save', () => {
    const save = vi.fn();
    const a = createAutosave({ save, delayMs: 1000 });
    a.schedule(); a.schedule(); a.schedule();
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });
  it('flush() saves immediately and cancels the pending timer', () => {
    const save = vi.fn();
    const a = createAutosave({ save, delayMs: 1000 });
    a.schedule();
    a.flush();
    expect(save).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(1); // no double-save
  });
  it('flush() is a no-op when nothing is pending', () => {
    const save = vi.fn();
    createAutosave({ save, delayMs: 1000 }).flush();
    expect(save).not.toHaveBeenCalled();
  });
});
```

  `src/game/worldSaves.test.js` (jsdom for localStorage):
```js
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { listWorlds, readWorld, writeWorld, deleteWorld, getActiveWorldId, setActiveWorldId } from './worldSaves.js';

describe('worldSaves localStorage helper', () => {
  beforeEach(() => localStorage.clear());

  it('writeWorld adds to the index and round-trips the blob', () => {
    writeWorld('local_1', { name: 'W1' }, { version: 2, hello: 'world' });
    expect(listWorlds().map(w => w.id)).toContain('local_1');
    expect(readWorld('local_1').hello).toBe('world');
  });
  it('deleteWorld removes index entry + blob', () => {
    writeWorld('local_1', { name: 'W1' }, { version: 2 });
    deleteWorld('local_1');
    expect(listWorlds()).toEqual([]);
    expect(readWorld('local_1')).toBeNull();
  });
  it('active world id persists', () => {
    setActiveWorldId('local_42');
    expect(getActiveWorldId()).toBe('local_42');
  });
});
```

- [ ] **Step 2: Run to verify they fail** — `npx vitest run src/game/autosave.test.js src/game/worldSaves.test.js` → FAIL (modules missing).

- [ ] **Step 3: Implement.**
  - `src/game/autosave.js`:
```js
/** Debounced autosave scheduler (pure; injectable save fn + timers via globalThis). */
export function createAutosave({ save, delayMs = 5000 }) {
  let timer = null;
  const clear = () => { if (timer !== null) { clearTimeout(timer); timer = null; } };
  return {
    schedule() { clear(); timer = setTimeout(() => { timer = null; save(); }, delayMs); },
    flush() { if (timer !== null) { clear(); save(); } },
    cancel() { clear(); },
  };
}
```
  - `src/game/worldSaves.js`: localStorage helper (`crafty_world_saves` index array of `{id,name,created_at,is_owner}`; `crafty_world_save_<id>` blobs; `crafty_active_world` id). `writeWorld(id, meta, saveData)` upserts the index (most-recent-first) + writes the blob (`JSON.stringify({ ...meta, ...saveData })`); `readWorld(id)` → parsed blob or `null`; `deleteWorld(id)`; `getActiveWorldId`/`setActiveWorldId`. Guard all with try/catch (quota/parse).
  - `src/store/useGameStore.jsx`: add `saveActiveWorld: (position) => { const data = buildSaveData(get(), { position }); let id = getActiveWorldId(); if (!id) { id = 'local_' + Date.now(); setActiveWorldId(id); } writeWorld(id, { name: data.save_name, created_at: new Date().toISOString(), is_owner: true }, data); }` (import `buildSaveData` + worldSaves fns). (Snapshot is via `get()` — transient read, isolation-safe.)
  - `src/App.jsx`: create one autosave instance `const autosave = useMemo(() => createAutosave({ save: () => { const rb = useGameStore.getState().playerRigidBodyRef?.current; const t = rb?.translation?.(); useGameStore.getState().saveActiveWorld(t ? { x: t.x, y: t.y, z: t.z } : undefined); }, delayMs: 5000 }), []);`. Subscribe to transition events: a `useEffect` with `useGameStore.subscribe` on `level`/`equipment`/`chests` → `autosave.schedule()`; a `useEffect` adding `beforeunload` + `visibilitychange` (hidden) listeners → `autosave.flush()`. (Subscriptions here are at App scope, not in a useFrame loop — isolation-safe.)
  - `src/WorldManager.jsx`: replace the 4 inline `worldData = {...}` literals in `saveCurrentWorld`/`createWorld` with `buildSaveData(gameState, { position })` (createWorld can pass an empty-world variant or just call buildSaveData on the fresh state); route localStorage writes through `worldSaves.writeWorld`; keep `loadWorld` calling `onWorldLoad`. Wrap the `user`-gated `axios` cloud branches behind a clear `// S4: cloud sync — backend not yet implemented; local-first is the live path` comment (leave the structure, but the localStorage path is the one that runs). Reads via `worldSaves.listWorlds`/`readWorld`/`deleteWorld`.

- [ ] **Step 4: Write + run the consolidation gate** — `tests/gates/save-consolidation-gates.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('save consolidation gates', () => {
  it('the dead axios saveGame/loadGame are gone from the store', () => {
    const src = read('src/store/useGameStore.jsx');
    expect(/saveGame:\s*async/.test(src)).toBe(false);
    expect(/loadGame:\s*async/.test(src)).toBe(false);
  });
  it('WorldManager builds no inline save-payload literal (uses buildSaveData)', () => {
    const src = read('src/WorldManager.jsx');
    expect(/buildSaveData/.test(src)).toBe(true);
    // the old shape marker must be gone
    expect(/world_data:\s*\{\s*blocks:\s*Array\.from/.test(src)).toBe(false);
  });
  it('buildSaveData serializes the progression slice + chests', () => {
    const src = read('src/game/saveSchema.js');
    for (const f of ['progression', 'level', 'attributes', 'equipment', 'talentPoints', 'unlockedTalents', 'chests']) {
      expect(src.includes(f)).toBe(true);
    }
  });
});
```
  Run: `npx vitest run tests/gates/save-consolidation-gates.test.js src/game/autosave.test.js src/game/worldSaves.test.js && npm run build` → PASS + clean.

- [ ] **Step 5: Full suite + visual** — `npm run test:unit && npm run test:visual` → all unit green; visual **12/12** unchanged (WorldManager is not in any capture state; the autosave is dev-inert under capture — verify `isCaptureMode()` short-circuits any save if needed).

- [ ] **Step 6: Commit** — `git add src/game/worldSaves.js src/game/worldSaves.test.js src/game/autosave.js src/game/autosave.test.js src/store/useGameStore.jsx src/WorldManager.jsx src/App.jsx tests/gates/save-consolidation-gates.test.js && git commit -m "feat(s2a-m2a): local-first autosave + WorldManager consolidation onto buildSaveData/worldSaves"`

---

## Task 8: De-bake `frost_shield` (derive talent armor, don't mutate base)

**Files:**
- Modify: `src/store/useGameStore.jsx` (`spendTalentPoint` `:421-444`; `getEffectiveAttributes` `:145-161`)
- Modify (test): `tests/store/progressionXp.test.js` (add a talent-armor derivation case)

Today `spendTalentPoint` BAKES `+5` into `attributes.armor` for `frost_shield` — non-idempotent (a reload that restores base armor + re-derives would double-count; a respec can't cleanly subtract). M2a makes it DERIVED: `spendTalentPoint` only adjusts the rank; `getEffectiveAttributes` folds `frost_shield` rank → `+5*rank` armor. (The full data-driven 4-Aspect effect table is M2b; M2a fixes ONLY the persistence-correctness bug for the one live node.)

- [ ] **Step 1: Write the failing test** — append to `tests/store/progressionXp.test.js`:
```js
describe('frost_shield derived (not baked) armor', () => {
  beforeEach(() => useGameStore.setState({
    attributes: { strength: 10, agility: 10, intellect: 10, armor: 0, attributePoints: 0 },
    equipment: { head: null, chest: null, boots: null, weapon: null, offhand: null },
    talentPoints: 3, unlockedTalents: {},
  }));
  it('does not mutate base armor when spending frost_shield', () => {
    useGameStore.getState().spendTalentPoint('frost_shield');
    expect(useGameStore.getState().attributes.armor).toBe(0); // base stays clean
  });
  it('derives +5 armor per frost_shield rank in getEffectiveAttributes', () => {
    useGameStore.getState().spendTalentPoint('frost_shield');
    useGameStore.getState().spendTalentPoint('frost_shield');
    expect(useGameStore.getState().getEffectiveAttributes().armor).toBe(10); // 2 ranks * 5
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/store/progressionXp.test.js` → FAIL (base armor mutated to 5; effective not derived).

- [ ] **Step 3: Implement** — in `spendTalentPoint` (`:434-442`) delete the `if (talentId === 'frost_shield') { newAttributes.armor += 5 }` mutation and the `attributes: newAttributes` return key (return only `talentPoints` + `unlockedTalents`). In `getEffectiveAttributes`, after the `computeEffective` call, add the talent fold: `const frost = (state.unlockedTalents?.frost_shield) || 0; if (frost) eff.armor = (eff.armor || 0) + frost * 5; return eff;`. (Leave a `// M2b: replace this single hardcoded node with the data-driven ASPECT_TREES effect table` comment.)

- [ ] **Step 4: Run to verify it passes** — `npx vitest run tests/store/progressionXp.test.js && npm run build` → PASS + clean.

- [ ] **Step 5: Commit** — `git add src/store/useGameStore.jsx tests/store/progressionXp.test.js && git commit -m "fix(s2a-m2a): derive frost_shield armor (de-bake the base-attribute mutation) — persist-safe + respec-safe"`

---

## Exit criteria (M2a)

- `npm run test:unit` green (new: progression, saveSchema, worldSaves, autosave, equipBuildAxis, progressionXp + extended saveNormalizer + 2 gate files); `npm run build` clean; `npm run test:visual` **12/12** unchanged.
- Progression (level/XP/attributes/equipment/talents/spellLevels/chests/position) **round-trips** a save→reload (proven by the round-trip test) and **autosaves** on transitions + tab-close.
- Slop removed: dead `saveGame`/`loadGame` gone; ONE `buildSaveData` serializer (no inline payload literals); ONE max-stat formula (`progression.js`); the `GameSystems` HP-ratchet effect gone; `frost_shield` de-baked; level/XP single-sourced in the store.
- **Then:** final whole-branch code review (subagent-driven-development's final reviewer) + a phase-exit save/reload adversarial check (QA cadence §7 Layer-2, targeting blind-spot class 3 = save/load round-trips), update the 4-piece docs (resume pointer → S2-A-M2b), pre-compact-flush.

## Out of scope (deferred to M2b / M2c / later)
- **M2b:** the full data-driven 4-Aspect talent tree (A4 — extract `ASPECT_TREES` module, wire all node effects, the 4-tree panel), the build-axis UI completion (A7 — allocate-attribute "+" button, weapon-dmg ladder DRY, loot→bucket routing), items.js/EQUIPMENT_STATS reconciliation.
- **M2c:** the InputManager `active`-gate migration + gate.
- **M3:** the stakes loop (day→siege→dawn), `dangerLevel` bridge, loot juice.
- **M4 / S3:** "widen the gates" (forced-med/low baselines + tier-transition invariant), dead-tier-config wiring, perf number, cloud-save backend (S4).
