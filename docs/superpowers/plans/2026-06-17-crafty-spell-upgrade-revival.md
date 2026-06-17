# Spell-Upgrade RPG-Pillar Revival (#51) — Implementation Plan

> **For agentic workers:** TDD red-first per slice; each slice is an independent committable unit. Kevin
> greenlit 2026-06-17 ("do all you decide best"). Designed via workflow wf_b3431111-877 (4 agents).

**Goal:** Make the built-but-dead-wired spell-upgrade system functional — upgrading a spell raises its
combat damage, the player can reach the upgrade UI, and saved levels survive a reload.

**Verified facts (verify-before-assert):**
- `spellUpgrades.js` `useSpellUpgrades()` (mounted App.jsx:184) has the SPELL_UPGRADES table (fire/ice/
  lightning/arcane ×3: damage/manaCost/xpCost), `getSpellStats`, `upgradeSpell` (LEVEL-gated, no XP spend),
  + a useEffect pushing local state into the store.
- BUG1: `EnhancedMagicSystem.jsx:180` casts with static `spell.damage` (SPELL_TYPES), never `getSpellStats`.
- BUG2: nothing calls `store.upgradeSpell` — no upgrade UI (unreachable). `SpellUpgradePanel.jsx` is the
  Aspect-talent panel (opened by `U`→showSpellUpgrades).
- BUG3: the hook inits local `spellLevels` to all-1s + pushes on mount → clobbers a save's restored levels.
- **BALANCE-SAFE:** base damages (fire50/ice40/lightning75/arcane60) == upgrade L1 EXACTLY → wiring is
  byte-identical at L1; only L2/L3 add power (~2.1–2.5× at max). Mana: cast gates on SPELL_MANA_COSTS
  (== L1 manaCost exactly), separate from the upgrade table.

## Slices (independent commits)

### S1 — cast-wire (damage-only, conservative)
- NEW `src/utils/spellCast.js`: pure `resolveCastBaseDamage(getSpellStats, spell, spellType)` →
  `getSpellStats?.(spellType)?.damage ?? spell.damage` (null-safe, gate-able).
- `EnhancedMagicSystem.jsx` gameplay castSpell (~180): `solveSpellDamage(effectiveStats, baseDamage, ...)`
  where `baseDamage = resolveCastBaseDamage(getState().getSpellStats, spell, spellType)`. DO NOT touch
  `spawnDeterministicCast` (keeps the spell-cast capture frame byte-stable).
- **Mana: left on SPELL_MANA_COSTS (untouched)** — upgrades are strictly-better (more damage, same mana),
  the most conservative default. Leveled-mana ramp = a Kevin-taste flip (surfaced #51).
- Tests: pure-helper test (null→base, leveled→leveled, unknown→base) + a static gate (castSpell uses
  resolveCastBaseDamage, NOT spell.damage; spawnDeterministicCast still on spell.damage). Gate: unit +
  build + visual 20/20 (byte-identical at L1; damage is never rendered) — no re-baseline.

### S2 — upgrade UI (net-new Spell Mastery section)
- Append a "Spell Mastery" section to `SpellUpgradePanel.jsx` (re-titled "Progression — Aspects & Spells";
  reuse the live `U`→showSpellUpgrades panel — makes the already-advertised "U = Upgrade Spells" true).
  One row per spell: SpellRing + level/dmg/mana + rank pips + an Upgrade button (mirror the talent node
  pattern) + the level-gate display (Requires Lv N) / Max Rank. Null-guard getSpellStats/upgradeSpell.
- `App.jsx` openModal hook: add a `spellUpgrades` branch (drive setShowSpellUpgrades like openAchievements).
- `capture.mjs`: add a 21st `progression-open` capture state → new baseline (LOOK-verify, deliberate).

### S3 — restore-fix (hydrate, no clobber)  [prereq for S1/S2 to reflect saved levels]
- `spellUpgrades.js`: one-shot mount hydration — adopt `getState().spellLevels` if non-empty (merge over
  the all-1s default; store default `{}` keeps L1). `useRef` once-guard; do NOT make it a two-way bind.
- Export SPELL_UPGRADES (for the L1-balance-invariant test). Tests: renderHook hydration cases + the L1
  invariant (getSpellStats L1 == SPELL_TYPES base + SPELL_MANA_COSTS). Gate: unit + build (data-only, no
  visual). FLAG: if save-load is async post-mount, the once-guard misses it — confirm load timing (Kevin).

## Kevin-surface (#51, non-blocking — ship the wiring autonomously)
- Economy: upgrades are FREE + level-gated only (the `xpCost` field is NOT spent; all spells max at Lv5);
  the gate ladder (xpCost<=100?2:<=200?3:5) is an inconsistent magic-number map. Confirm intended.
- Mana: shipped flat (strictly-better). Want the per-level mana ramp (a damage/cost tradeoff)? one-line flip.
- Damage curve ~2.1–2.5× at max — shipped as a standard ARPG default; flag for taste.
