# S3-M2 — The EnhancedMagicSystem Data Pulls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Loop note:** design-of-record = `docs/superpowers/specs/2026-06-11-crafty-s3-demonolith-design.md` (S3-M2 row + the trap catalog). **The lens verdict stands: the projectile LOOP does NOT move this milestone.** Pixel-lock = the spell-cast baseline (the data moves are value-verbatim, so the frame must hold byte-identical).
> **Verified at plan time:** SPELL_TYPES is a component `useMemo` at :29 (module-constant-ify swaps a stable ref for a stabler one — behavior-identical; sweep its dep-array mentions); SPARK_PROFILE `useMemo` :182; ENERGY_PROFILE + `_defaultEnergy` ALREADY module consts :585+; WAND_CONFIGS ~:1031; `applyChainLightning` useCallback :123 (closure deps: useGameStore mobEntities read + GameMethods.damageMob + spark calls — the pure half is target-selection); `utils/combat.test.js` MISSING (solveSpellDamage/solveMeleeDamage at utils/combat.js:1-41 — the damage-path characterization gap).

**Goal:** ~400 LOC of spell DATA + the chain-lightning ALGORITHM go pure and tested; the damage solvers get their first characterization; EnhancedMagicSystem keeps only the live systems (projectiles/telegraphs/impacts).

### T0 — the damage-path characterization (test-only, FIRST — the charter's rule)
**Files:** Create `frontend/src/utils/combat.test.js`
- [ ] Read utils/combat.js:1-41 at build; pin: the base formulas at crit=0 (mock Math.random → 1.0), the crit branches (mock → 0.0; the multiplier + the chance source from attackerStats), the spellType variations if any, and the default args (baseWeaponDmg 5, baseSpellDmg 20). Battery → commit `test(s3-m2): the damage solvers' first characterization`.

### T1 — `game/spells.js` (SPELL_TYPES)
**Files:** Create `frontend/src/game/spells.js` + test; Modify `frontend/src/EnhancedMagicSystem.jsx`
- [ ] Move the :29-105 object VERBATIM as `export const SPELL_TYPES`; delete the useMemo; import; REMOVE `SPELL_TYPES` from every dep array that listed it (grep `SPELL_TYPES]` + `, SPELL_TYPES`); the test pins the 4 spell keys + each spell's {damage, speed, manaCost-relevant fields} (read the literal at build — a shape lock, not a rewrite).
- [ ] Battery (the spell-cast baseline must hold) → commit `refactor(s3-m2): SPELL_TYPES extracts to game/spells.js`

### T2 — `game/spellVisualProfiles.js` (ENERGY/SPARK/WAND)
**Files:** Create `frontend/src/game/spellVisualProfiles.js` + test; Modify `frontend/src/EnhancedMagicSystem.jsx`
- [ ] Move ENERGY_PROFILE + _defaultEnergy (:585+, already module consts — verbatim) + SPARK_PROFILE (:182 useMemo → const) + WAND_CONFIGS (~:1031) into one profiles module (export all four names); update the ~6 read sites; the test: the four spell keys exist in each profile + _defaultEnergy is complete (the fallback contract at :720/:849/:933).
- [ ] Battery → commit `refactor(s3-m2): the spell visual profiles extract pure`

### T3 — `game/chainLightning.js` (the algorithm's pure half)
**Files:** Create `frontend/src/game/chainLightning.js` + test; Modify `frontend/src/EnhancedMagicSystem.jsx`
- [ ] Extract `solveChainTargets(mobs, startPos, { maxChains, range, damageReduction })` → the ordered `[{ id, position, damage }]` list (the :123-168 selection/falloff math verbatim, the store read + damageMob/spark application staying in the component's thin wrapper). TDD: chain ordering (nearest-next), the range cutoff, the per-hop damage falloff, the exclude-id, the empty-mobs case.
- [ ] Battery → commit `refactor(s3-m2): chain lightning's targeting goes pure`

### T4 — close-out: the spec row ✅ · plan SHIPPED · ACTIVE_PLAN → the EXPERIENCE INTERLEAVE (due — content @83; candidates: music-motif v2 [per-Aspect stingers — the audio/ dir now makes this clean], a night-siege juice pass) THEN S3-M3.

## Self-review
- Traps: 1 — element-impact-gates greps EnhancedMagicSystem? (verify at build: the gate pins `case '<spell>':` switches in the NPC file + maybe EMS; if EMS is referenced, repoint same-commit); 2-5 n/a (no gated tokens move — CHECK at build that none of the moved blocks contain the forbidden literals).
- No placeholders; every site verified above; the one open verify (element-impact + any other gate greps of EnhancedMagicSystem) is a named build step.
