# Crafty — UX-Legibility Interleave (Honest-Controls pass) — design of record

> **Status (2026-06-13): DESIGN COMMITTED (loop self-gate per charter §4/§5, iter 96, ultracode).**
> Produced by a 3-candidate grounded design-gate workflow (`wf_48863356-432`: each candidate seam-mapped
> vs LIVE code, then adversarially ranked + grounded; 4 agents / 385k tokens). This is the experience
> interleave due at the S3-M3/M4 boundary (ledger: audio@34 · feel@61 · content@83 · motifs@93 — **UX is
> the one untouched axis**). Build contract = `docs/superpowers/plans/2026-06-13-crafty-ux-legibility-m1.md`.

> **Read-Before-Architect:** the design-gate agents READ (cited file:line, re-verified by me this iteration):
> `src/ui/CombatInstructions.jsx` (the 6-line panel), `src/InputManager.jsx:95-127` (the toggleUI E/C/B
> pattern; NO KeyM case), `src/store/useGameStore.jsx:547-548` (showMagic/setShowMagic), `src/HUD.jsx:397`
> (CombatInstructions render site, NOT capture-gated), `src/Components.jsx:151` (the only current Magic-open
> path = a HUD button), `src/EnhancedMagicSystem.jsx:154-156` (no-mana bare return), `src/game/aspectGuide.js`
> + `src/AdvancedGameFeatures.jsx:1210-1226` (the ASPECT_GUIDE keycap-badge idiom), `src/ui/panelState.js:14`
> (showMagic in the panel set), `tests/visual/diff.test.js:21` (the 13-state gate), `tests/visual/baseline/explore-day.png`
> (verified: the CONTROLS panel IS visible top-right in the gated capture). My proposal EXTENDS these by adding
> ONE pure SoT module (`game/keyMap.js`) the panel + an anti-drift test consume, wiring the missing KeyM case,
> and adding capture-safe denied-action feedback on the verified silent paths.

## 1. The pick (design-gate verdict)

| Candidate | Axis | Score | Verdict |
|---|---|---|---|
| **UX-LEGIBILITY (Honest-Controls)** | UX-legibility | **8.7** | ✅ **WINNER** |
| Night-Siege Juice (dusk sting + camera kick + nightCount music) | game-feel | 7.6 | strong fast-follow (next interleave) |
| Per-element projectile geometry | visual | 6.4 | deferred (deepens recent visual work; forces a spell-cast re-baseline + 3 new capture states) |

**Why UX-legibility wins:** highest (player-experience × axis-freshness)/(cost+risk). UX-legibility is the only
charter experience axis never interleaved; the four Aspects + de-monolith just landed (new mechanics, ZERO new
teaching) → legibility debt is at its structural peak. Lowest perf risk, ~110-150 LOC, one-iteration unit.

## 2. The three VERIFIED wounds a fresh broad-audience player hits in 60s

1. **The M-lie (a real bug):** `CombatInstructions.jsx:12` advertises **"M - Magic"** but **NO `KeyM` handler exists
   anywhere in `src/`** (verified: `grep -rn KeyM src/` = 0 hits; InputManager handles E/C/B/Digit1-4 only). The
   Magic panel is reachable ONLY by clicking a HUD button (`Components.jsx:151`). An advertised control does nothing.
2. **The signature Aspects are undiscoverable:** the four verbs **R/V/X/Z** (roar/grab/snare/imbue — the ENTIRE game
   identity: WILDHEART/VOIDHAND/SOULBIND/ELEMANCER) are taught on NEITHER teaching surface (CombatInstructions nor the
   title hint). The ASPECT_GUIDE that explains them (`AdvancedGameFeatures.jsx:1210-1226`) is reachable only via **U**
   — itself taught nowhere.
3. **Silent denied actions:** no-mana cast is a bare `return` (`EnhancedMagicSystem.jsx:154-156`); the four verb gates
   (canEnter/canGrab/canSnare/canIgnite, double-locked on banked-resource AND unlockedTalents) fail with ZERO feedback.
   The player presses a locked verb and concludes the game is broken.

## 3. Design of record (the four parts)

- **(A) `game/keyMap.js` — the single source of truth.** EN-first row data `{ key, label, group }` mirroring the
  `aspectGuide.js` idiom. Groups: **Move** (WASD/Space — informational), **Combat** (LMB/RMB router, F, 1-4 spell-select),
  **Aspects** (R/V/X/Z, each with a one-line meter cue), **Panels** (E inv · M magic · C craft · B build · U talents ·
  G trade/chest · T tame · Tab achievements · Esc settings · wheel block-cycle). **Anti-lie invariant:** every row's key
  MUST map to a live handler — enforced by a keyMap↔InputManager consistency test (the same anti-drift discipline as
  `panelState`/`aspectGuide` tests).
- **(B) Wire the missing KeyM toggle.** Add `if (event.code === 'KeyM') toggleUI(state.setShowMagic, state.showMagic);`
  at `InputManager.jsx:119` (mirrors the E/C/B block exactly, inside the same `active && !anyPanelOpen` guard;
  `toggleUI` + `setShowMagic` both in scope; `showMagic` is already in the panelState set). Makes `CombatInstructions:12` honest.
- **(C) Redesign CombatInstructions** (always-visible, tight, grouped) to render from `KEY_MAP`, keeping the bold-flat
  `<Panel variant="base">` top-right placement + `font-display` uppercase header, reusing the keycap-badge chip style from
  `AdvancedGameFeatures.jsx:1214` (`px-2 py-0.5 rounded border-chrome border-ink bg-slot`). Teaches the four Aspect verbs
  (the identity) + honest M. **Tight, not a wall-of-text** — group headers + compact rows; the FULL reference still lives
  in the U talent panel's ASPECT_GUIDE (the panel teaches identity+core and points to U).
- **(D) Denied-action feedback.** A pure `deniedReason(kind)` helper → toast text for `{no-mana, aspect-locked,
  aspect-underbanked}`. Wire `addNotification(text, 'warn')` BEHIND `if (!isCaptureMode())` + a shared ~1s debounce ref at
  `EnhancedMagicSystem.jsx:154` (no-mana) and the four verb gates in `Components.jsx` (distinguish locked vs under-banked by
  which half of the `&&` failed). The toast pipe (`addNotification` → `HUD.jsx` NotificationStack → `Toast` role=alert) is
  already built + already self-nulls under capture.

## 4. The taste decision (mine, per the charter's delegated authority)

**Always-visible redesigned panel → a DELIBERATE re-baseline** of the explore captures, NOT collapse-by-default.
Verified: `CombatInstructions` renders unconditionally at `HUD.jsx:397` and **IS visible top-right in the gated
`explore-day.png`** (and `explore-night.png`). The design-gate offered "collapse-by-default" to hold 13/13 with zero
gate churn — **rejected**: a legibility pass must keep controls SEEN; hiding them behind a chip undercuts the entire goal,
and the panel is already always-visible today, so staying visible is the consistent + better choice. The re-baseline is
charter-sanctioned (§4: "visual re-baselines are allowed and expected — the look is MEANT to improve") with the discipline:
render → **HD self-eyeball** (the gate is NOT the safety net for a self-set baseline) → commit baselines + rationale + a
KEVIN-REVIEW-BATCH before/after entry. Scope: `explore-day` + `explore-night` (gated) + the 3 forced-tier variants
(`explore-day-low/-med`, `explore-night-low` — baselined but omitted from STATES; regenerate for consistency).

## 5. Reference-lock

Builds TO the in-game teaching idiom ALREADY shipped — the ASPECT_GUIDE "HOW IT PLAYS" cards (`AdvancedGameFeatures.jsx:1210-1226`):
keycap chip + label + one-line cue in the bold-flat inset Panel. Controls legend and talent legend become ONE coherent
keycap-badge system (not two competing legends). Honest, complete, broad-audience-legible in <60s; EN-first + i18n-ready
(mirror `aspectGuide.js` field shape); NO emoji (zero-emoji hard gate); Toast `role=alert/status` = a11y for free.

## 6. Capture / perf / coherence

- **Perf:** zero per-frame cost. CombatInstructions is a `React.memo` panel (no useFrame); KEY_MAP is module-const data;
  KeyM is one keydown branch; denied toasts fire only on keypress, debounced ~1s.
- **Capture-determinism:** denied toasts copy the existing `if (isCaptureMode()) return` guard → byte-identical capture
  frames. The CombatInstructions redesign is the ONLY baseline-affecting change → the deliberate re-baseline above.
- **Coherence (P0-P3):** pure-additive copy in the LOCKED bold-flat Panel/Toast primitives; reuse the existing keycap-badge
  vocabulary so controls + talent surfaces read as one system. No new art direction.

## 7. Adversarial critique + mitigation (from the design-gate, retained)

**Strongest case against:** "a controls panel is hygiene, not a SOTA-feel moment; the night-siege juice pass delivers a
more visceral screen-felt moment with no forced re-baseline." **Mitigation:** (1) two-thirds of the value is NOT text — the
KeyM bug fix (a verified broken advertised control, indefensible to ship) + denied-action feedback (correctness +
responsiveness) read across all ages and aren't clutter. (2) The panel stays TIGHT (grouped, compact, keycap-badge) and
reuses the shipped idiom, so it can't read as bolted-on AI-generic. (3) A fresh player who can't find the four signature
Aspects (the whole game identity) + gets zero denial feedback is a RETENTION wound that outranks a dusk sting. (4) Night-Siege
is explicitly the ranked fast-follow — the felt-juice gap closes next interleave, not lost.

## 8. Scope + Kevin batch

ONE-ITERATION milestone (1 new pure file + 2 test files + 4 edited files; ~110-150 LOC; 3 logical systems — at/under the
anti-tunneling ceiling). The only Kevin-facing item: the deliberate explore re-baseline (before/after → KRB, non-blocking).
OUT of scope (fast-follow notes): the divergent title-screen control hint (`MenuSystem.jsx:315-323`) should also read from
keyMap later; do NOT touch it in this unit (keep it atomic).
