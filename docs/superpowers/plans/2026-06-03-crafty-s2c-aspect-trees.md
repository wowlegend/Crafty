# S2-A-M2c — Talent → 4-Aspect-Trees (A4) Implementation Plan

> ✅ SHIPPED — this milestone is merged to `main`; historical plan-of-record (see CHANGELOG/ROADMAP for the build record).

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Fresh Opus implementer per task + spec + quality review. SEQUENTIAL (T2/T3 share `useGameStore.jsx` / `AdvancedGameFeatures.jsx`). NO Claude commit footer. AST-safe edits only. Fix-ups = NEW commits. After each implementer reports, the controller runs `test:unit`+`test:visual` itself before review (subagent result claims are unreliable — a prior subagent fabricated failures).

**Goal:** Turn the inert talent tree (10 of 11 nodes do nothing — S1-audit confirmed) into a **live, meaningful, persisted** progression surface structured as the **four Aspect trees** (Voidhand / Wildheart / Soulbind / Elemancer) — the S2-B scaffold. Every node grants a REAL effect; the structure + a data-driven effect table replace the hardcoded inline array + the dual-limits map.

**Architecture:** a module-level `src/game/talentTree.js` is the single source of truth for the tree DATA + a pure effect-fold. Each node's effect is `{ stat, perRank }` where `stat ∈ {strength, agility, intellect, armor}` — the four EFFECTIVE attributes the combat solvers (`utils/combat.js`) and `deriveMaxStats` already consume. So talent effects **fold through `getEffectiveAttributes`** (DERIVE on read, never bake — generalizing the M2a `frost_shield` fix) and every downstream system (melee/spell damage, crit, mitigation, maxHealth/maxMana) picks them up for free, with ZERO solver/system changes. The deeper per-Aspect SIGNATURE abilities (beast-transform, gravity-grab, capture, terrain) are **S2-B** — A4 is the foundational stat-node scaffold + the live mechanism + the 4-tree structure.

**Tech Stack:** React 19, zustand 5, Vitest 3.2.4 (run from `frontend/`). Grounding: M2a recon (talent-tree reader) + verified file:line below.

## Verified current reality
- The tree is a hardcoded `const branches = [...]` (3 spell-themed branches / 11 nodes) INSIDE `SpellUpgradePanel`'s render body (`AdvancedGameFeatures.jsx:1104-1140`). The render iterates `branches.map → nodes.map` (`:1191-1198+`), reading `node.{id,name,desc,limit,prereq}` + tree `{title,icon,accent,dot}`. Grid is `md:grid-cols-3`.
- `unlockedTalents` ({id:rank}) + `talentPoints` live in the store; `spendTalentPoint` (`useGameStore.jsx`) enforces a rank limit from an **inline duplicate limits map** (`:424-428`) and (post-M2a-T8) returns ONLY `{talentPoints, unlockedTalents}` (no base mutation).
- `getEffectiveAttributes` (post-M2a) = `computeEffective(base, equipment, EQUIPMENT_STATS)` + a `frost_shield`-specific armor fold (`const frostRank = unlockedTalents?.frost_shield||0; if(frostRank) eff.armor += frostRank*5`). **A4 replaces that one-off fold with the general data-driven fold.**
- Talents already PERSIST (M2a: `unlockedTalents`/`talentPoints` are in `buildSaveData` → `loadWorldData`). A4 keeps them persisted.
- The talent panel (`SpellUpgradePanel`) is NOT in any of the 12 visual capture states → A4 UI changes do NOT affect the visual gate (it stays 12/12).
- Spell secondary effects (burn/slow/chain/pierce) are intrinsic + always-on (`EnhancedMagicSystem`), NOT talent-gated. **A4 does NOT gate them** (that's S2-B per-Aspect signature work) — A4's effects are stat-only (str/agi/int/armor).

## The 4-Aspect taxonomy (BEST-JUDGMENT v1 — TASTE DECISION, batch to KEVIN-REVIEW-BATCH)
All effects are `+perRank` to one of the 4 effective attributes (so they're real + fold cleanly; numbers tunable). Each tree ~3 nodes with a short prereq chain. Re-themes the existing 11 nodes' INTENT (damage/crit/armor/mana) onto the Aspect fantasies. **The per-Aspect SIGNATURE ability nodes (S2-B) will extend these trees later.**

| Aspect (icon, accent) | Nodes (id · name · effect · limit · prereq) |
|---|---|
| 🜂 **Voidhand** — kinetic/gravity bruiser (icon `force`, accent fire→ `text-stat-atk`, dot `bg-stat-atk`) | `voidhand_force` **Kinetic Force** +3 STR/rank (3, —) · `voidhand_ward` **Gravity Ward** +6 armor/rank (3, —) · `voidhand_crush` **Crushing Pull** +2 STR/rank (2, `voidhand_force`) |
| 🐾 **Wildheart** — primal vitality/speed (icon `run`, accent `text-stat-spd`, dot `bg-stat-spd`) | `wildheart_vigor` **Beast Vigor** +3 STR/rank (3, —) [STR → +maxHealth via deriveMaxStats] · `wildheart_swift` **Feral Swiftness** +4 AGI/rank (3, —) [crit] · `wildheart_frenzy` **Blood Frenzy** +3 AGI/rank (2, `wildheart_swift`) |
| 🔗 **Soulbind** — warden/support (icon `shield`, accent `text-stat-def`, dot `bg-stat-def`) | `soulbind_bond` **Soul Bond** +3 INT/rank (3, —) · `soulbind_aegis` **Warden's Aegis** +5 armor/rank (3, —) · `soulbind_link` **Spirit Link** +2 INT/rank (2, `soulbind_bond`) |
| 🜔 **Elemancer** — elemental caster (icon `magic`, accent `text-spell-arcane`, dot `bg-spell-arcane`) | `elemancer_focus` **Elemental Focus** +4 INT/rank (3, —) [spell dmg + maxMana] · `elemancer_volatile` **Volatile Edge** +3 AGI/rank (3, —) [spell crit] · `elemancer_cataclysm` **Cataclysm** +3 INT/rank (2, `elemancer_focus`) |

(12 nodes. Icons/accents reuse existing token classes. If an icon name doesn't exist in the registry, the implementer falls back to an existing one + notes it.)

## Migration note (dev-stage, acceptable)
Pre-A4 saves carry old talent ids (`frost_shield`, `ember_core`, …) that no longer exist. On load they simply won't match any node → render as 0 allocations (the points were already spent; not refunded). No real players yet, so this is acceptable. **`migrateSaveData` SHOULD refund**: if `unlockedTalents` contains any id not in `ASPECT_TREES`, sum those ranks back into `talentPoints` and drop the stale ids — a clean, no-loss migration. (Implemented in T2.)

---

## Task 1: `talentTree.js` — ASPECT_TREES data + pure effect-fold + limits

**Files:** create `src/game/talentTree.js` + `src/game/talentTree.test.js`.

- [ ] **Step 1 — failing test** `src/game/talentTree.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { ASPECT_TREES, TALENT_LIMITS, foldTalentEffects, refundUnknownTalents } from './talentTree.js';

const allNodes = ASPECT_TREES.flatMap((t) => t.nodes);

describe('ASPECT_TREES shape', () => {
  it('has exactly 4 aspect trees', () => {
    expect(ASPECT_TREES).toHaveLength(4);
    expect(ASPECT_TREES.map((t) => t.aspect)).toEqual(['voidhand', 'wildheart', 'soulbind', 'elemancer']);
  });
  it('every node has id/name/desc/limit and an effect {stat, perRank}', () => {
    for (const n of allNodes) {
      expect(typeof n.id).toBe('string');
      expect(typeof n.name).toBe('string');
      expect(n.limit).toBeGreaterThan(0);
      expect(['strength', 'agility', 'intellect', 'armor']).toContain(n.effect.stat);
      expect(n.effect.perRank).toBeGreaterThan(0);
    }
  });
  it('node ids are unique', () => {
    const ids = allNodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('every prereq references a real node id', () => {
    const ids = new Set(allNodes.map((n) => n.id));
    for (const n of allNodes) if (n.prereq) expect(ids.has(n.prereq)).toBe(true);
  });
  it('TALENT_LIMITS is derived from the trees (single source — no dual map)', () => {
    for (const n of allNodes) expect(TALENT_LIMITS[n.id]).toBe(n.limit);
  });
});

describe('foldTalentEffects (derive, never mutate base)', () => {
  it('adds perRank * rank to the matching effective stat', () => {
    const base = { strength: 10, agility: 10, intellect: 10, armor: 0 };
    const out = foldTalentEffects(base, { voidhand_force: 2 }); // +3 STR/rank
    expect(out.strength).toBe(16);
    expect(base.strength).toBe(10); // base untouched
  });
  it('sums multiple talents + ignores unknown ids', () => {
    const out = foldTalentEffects({ strength: 10, agility: 10, intellect: 10, armor: 0 },
      { voidhand_ward: 3, wildheart_swift: 1, bogus_id: 5 }); // +18 armor, +4 agi
    expect(out.armor).toBe(18);
    expect(out.agility).toBe(14);
  });
  it('is read-idempotent (folding twice off the same base gives the same result)', () => {
    const base = { strength: 10, agility: 10, intellect: 10, armor: 0 };
    expect(foldTalentEffects(base, { soulbind_aegis: 2 }).armor).toBe(10);
    expect(foldTalentEffects(base, { soulbind_aegis: 2 }).armor).toBe(10);
  });
});

describe('refundUnknownTalents (migration)', () => {
  it('refunds ranks of stale (non-ASPECT_TREES) ids back into points + drops them', () => {
    const { unlockedTalents, talentPoints } = refundUnknownTalents({ frost_shield: 2, voidhand_force: 1 }, 0);
    expect(unlockedTalents).toEqual({ voidhand_force: 1 }); // stale frost_shield dropped
    expect(talentPoints).toBe(2); // 2 refunded
  });
  it('no-op when all ids are valid', () => {
    const r = refundUnknownTalents({ voidhand_force: 1 }, 3);
    expect(r.unlockedTalents).toEqual({ voidhand_force: 1 });
    expect(r.talentPoints).toBe(3);
  });
});
```
- [ ] **Step 2 — run, FAIL.**
- [ ] **Step 3 — implement** `src/game/talentTree.js`: the `ASPECT_TREES` array (the taxonomy table above — each tree `{ aspect, title, icon, accent, dot, nodes:[{id,name,desc,limit,prereq,effect:{stat,perRank}}] }`), then:
```js
/** All node ids -> limit (single source; the store imports this, killing its inline map). */
export const TALENT_LIMITS = Object.fromEntries(
  ASPECT_TREES.flatMap((t) => t.nodes).map((n) => [n.id, n.limit])
);

const NODE_BY_ID = Object.fromEntries(ASPECT_TREES.flatMap((t) => t.nodes).map((n) => [n.id, n]));

/** Derive talent stat bonuses onto an effective-attrs object. Returns a NEW object; never mutates base. */
export function foldTalentEffects(eff, unlockedTalents) {
  const out = { ...eff };
  for (const id in (unlockedTalents || {})) {
    const node = NODE_BY_ID[id];
    const rank = unlockedTalents[id] || 0;
    if (!node || rank <= 0) continue;
    const { stat, perRank } = node.effect;
    out[stat] = (out[stat] || 0) + perRank * rank;
  }
  return out;
}

/** Migration: refund ranks of ids not in the current trees back into points; drop the stale ids. */
export function refundUnknownTalents(unlockedTalents, talentPoints) {
  const kept = {};
  let refunded = 0;
  for (const id in (unlockedTalents || {})) {
    if (NODE_BY_ID[id]) kept[id] = unlockedTalents[id];
    else refunded += unlockedTalents[id] || 0;
  }
  return { unlockedTalents: kept, talentPoints: (talentPoints || 0) + refunded };
}
```
- [ ] **Step 4 — run, PASS.** Step 5 — commit `feat(s2c): talentTree.js — ASPECT_TREES (4 trees) + data-driven foldTalentEffects + limits + migration`.

## Task 2: wire the store onto `talentTree.js` (general fold + limits + migration)

**Files:** modify `src/store/useGameStore.jsx` (`getEffectiveAttributes`, `spendTalentPoint`, `loadWorldData`); extend `tests/store/progressionXp.test.js` (the frost_shield block → general talent fold).

- [ ] **Step 1 — update the failing tests:** in `tests/store/progressionXp.test.js`, REPLACE the `frost_shield derived` describe with one using a real ASPECT_TREES node, e.g.:
```js
import { foldTalentEffects } from '../../src/game/talentTree.js';
describe('talent effects derived (not baked) via ASPECT_TREES', () => {
  beforeEach(() => useGameStore.setState({
    attributes: { strength: 10, agility: 10, intellect: 10, armor: 0, attributePoints: 0 },
    equipment: { head: null, chest: null, boots: null, weapon: null, offhand: null },
    talentPoints: 5, unlockedTalents: {},
  }));
  it('does not mutate base attributes when spending a talent', () => {
    useGameStore.getState().spendTalentPoint('voidhand_ward'); // +6 armor/rank
    expect(useGameStore.getState().attributes.armor).toBe(0); // base clean
  });
  it('derives the talent stat bonus in getEffectiveAttributes', () => {
    useGameStore.getState().spendTalentPoint('voidhand_ward');
    useGameStore.getState().spendTalentPoint('voidhand_ward');
    expect(useGameStore.getState().getEffectiveAttributes().armor).toBe(12); // 2 ranks * 6
  });
  it('enforces the per-node limit from ASPECT_TREES', () => {
    for (let i = 0; i < 9; i++) useGameStore.getState().spendTalentPoint('voidhand_crush'); // limit 2
    expect(useGameStore.getState().unlockedTalents.voidhand_crush).toBe(2);
  });
});
```
- [ ] **Step 2 — run, FAIL** (old frost_shield fold + inline limits).
- [ ] **Step 3 — implement:**
  - `getEffectiveAttributes`: replace the `frost_shield` fold with `return foldTalentEffects(computeEffective(state.attributes, state.equipment, EQUIPMENT_STATS), state.unlockedTalents);` (import `foldTalentEffects` from `../game/talentTree.js`).
  - `spendTalentPoint`: replace the inline `limits` map with `import { TALENT_LIMITS } from '../game/talentTree.js'` and `const limit = TALENT_LIMITS[talentId] || 0; if (!limit || currentVal >= limit) return {};` (an unknown id now has limit 0 → can't be spent — correct). Keep returning `{talentPoints, unlockedTalents}`.
  - `loadWorldData`: after restoring `unlockedTalents`/`talentPoints`, run `const refund = refundUnknownTalents(unlockedTalents, talentPoints);` and use `refund.unlockedTalents`/`refund.talentPoints` in the returned object (import `refundUnknownTalents`). This refunds pre-A4 saves' stale talent ranks.
- [ ] **Step 4 — verify** `npx vitest run tests/store/progressionXp.test.js tests/store/equipBuildAxis.test.js tests/store/saveNormalizer.test.js && npm run test:unit && npm run build` → green. Step 5 — commit `feat(s2c): wire store onto ASPECT_TREES (general talent fold + single limits source + stale-talent refund on load)`.

## Task 3: render the 4 Aspect trees in the panel

**Files:** modify `src/AdvancedGameFeatures.jsx` (`SpellUpgradePanel`: import `ASPECT_TREES`, delete the inline `branches`, render the 4 trees); create gate `tests/gates/aspect-trees-gates.test.js`.

- [ ] **Step 1 — gate (failing)** `tests/gates/aspect-trees-gates.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ASPECT_TREES } from '../../src/game/talentTree.js';
const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');
describe('aspect-trees panel gates', () => {
  const src = read('src/AdvancedGameFeatures.jsx');
  it('SpellUpgradePanel imports ASPECT_TREES (no inline branches array)', () => {
    expect(/ASPECT_TREES/.test(src)).toBe(true);
    expect(/const\s+branches\s*=\s*\[/.test(src)).toBe(false);
  });
  it('there are 4 aspect trees with the canonical aspects', () => {
    expect(ASPECT_TREES.map((t) => t.aspect)).toEqual(['voidhand', 'wildheart', 'soulbind', 'elemancer']);
  });
});
```
- [ ] **Step 2 — implement:** in `AdvancedGameFeatures.jsx` add `import { ASPECT_TREES } from './game/talentTree.js';` (top). In `SpellUpgradePanel`: DELETE the inline `const branches = [...]` (`:1104-1140`); render `ASPECT_TREES.map(...)` instead of `branches.map(...)` (the node render body is unchanged — `ASPECT_TREES` trees have the same `{title,icon,accent,dot,nodes}` shape). Change the grid `md:grid-cols-3` → `md:grid-cols-2 lg:grid-cols-4` (4 trees). The `branch.nodes.find(...)` prereq-name lookup (`:1241`) keeps working (rename the loop var `branch`→`tree` if you wish, or leave it). Keep all rank-pip / lock / upgrade-button logic.
- [ ] **Step 3 — verify** `npx vitest run tests/gates/aspect-trees-gates.test.js && npm run test:unit && npm run build && npm run test:visual` → green; **visual 12/12** (the talent panel is not a capture state). Step 4 — commit `feat(s2c): render the 4 Aspect trees (Voidhand/Wildheart/Soulbind/Elemancer) from ASPECT_TREES`.

## Exit criteria (M2c / A4)
- `test:unit` green (new: talentTree + 2 gates + updated progressionXp); build clean; visual 12/12.
- Every talent node grants a REAL, persisted, derived (never-baked) stat effect; the tree is structured as the 4 Aspects; limits single-sourced; pre-A4 saves refund stale talent points on load.
- Final whole-branch review + 4-piece docs (resume → M2d = InputManager `active`-gate migration) + pre-compact-flush + **batch the 4-tree node taxonomy (names/numbers) to KEVIN-REVIEW-BATCH** (taste decision — reversible data table).

## Out of scope (later)
- Per-Aspect SIGNATURE ability nodes (beast-transform / gravity-grab / capture / terrain) — **S2-B** (each Aspect's own spec→plan→build).
- Talent-gating spell secondary effects (burn/slow/chain/pierce) — S2-B.
- Effects beyond the 4 effective attributes (mana-regen tick, dodge-cooldown, splash) — S2-B per-Aspect signature work (would need new derived fields + system wiring).
