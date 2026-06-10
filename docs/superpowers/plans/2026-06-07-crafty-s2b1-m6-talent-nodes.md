# S2-B1-M6 — Signature talent nodes + the roar unlock-gate

> ✅ SHIPPED — part of WILDHEART, COMPLETE + MERGED to `main` (`458bbb5`, 2026-06-07). Historical plan-of-record (the milestone shipped); see CHANGELOG for the build record.


> Plan-of-record for WILDHEART milestone M6. Spec §3b (the guard) + §3e (the nodes) + the M6 gate row (~line 224). Branch `s2b1-m6-talents` off `main@dffd859`.

## Goal
Gate the roar behind a TALENT (it's currently ferocity-only — any character can roar). Add the signature wildheart nodes and make the shared `foldTalentEffects` tolerate effect-less nodes (it currently HARD-CRASHES on them).

## The crash to fix FIRST (load-bearing)
`foldTalentEffects` (`talentTree.js:58`) destructures `const { stat, perRank } = node.effect` UNCONDITIONALLY. The moment an effect-less node (the unlock) is in `unlockedTalents`, **every** `getEffectiveAttributes()` (combat + load + maxStats) throws `TypeError`. Fix: `if (!node || rank <= 0 || !node.effect) continue;`. Author the node-shape contract: signature/unlock/ability nodes MAY omit `.effect`; the fold SKIPS them; ability-tuning levers read their rank at THEIR OWN math site, never the fold.

## New nodes (`ASPECT_TREES[1].nodes` — wildheart)
- **`wildheart_roar` (Primal Roar)** — `limit: 1`, `prereq: 'wildheart_vigor'`, **no `.effect`** (a pure unlock). The roar guard reads `unlockedTalents['wildheart_roar'] > 0`. `unlockedTalents` already persists (`saveSchema.js:34`) — no schema change.
- **`wildheart_endurance` (Primal Endurance)** — `limit: 3`, `prereq: 'wildheart_roar'`, **no `.effect`** (an ability-LEVER). Each rank extends beast-form duration by `ENDURANCE_SEC_PER_RANK` (3s) — read at the DURATION site (`beastTransform.js` / the SM tick), NOT the fold. Demonstrates + validates the read-at-site contract. (Kevin Decision #4 — numbers tunable, node removable.)

## Wiring (derive-at-read; pure where possible)
- `beastTransform.js`: `export const ENDURANCE_SEC_PER_RANK = 3` + `export function formDurationFor(rank)` (= `FORM_DURATION_SEC + max(0,rank)*ENDURANCE_SEC_PER_RANK`). `decideTransform` enter: `out.activeUntil = ctx.now + (ctx.formDurationSec || FORM_DURATION_SEC)` (backward-compatible — existing tests pass no `formDurationSec` → fallback 14).
- `Components.jsx` SM tick (~476): `canEnter: canTransform(st.ferocityBanked) && (st.unlockedTalents?.['wildheart_roar'] > 0)`; `formDurationSec: formDurationFor(st.unlockedTalents?.['wildheart_endurance'] || 0)`. Import `formDurationFor`. (`canEnter` gates BOTH startCharge and commit — no unlock, no charge.)

## TDD
1. `talentTree.test.js`: fold does NOT throw with an effect-less unlock node present (the regression for the crash); the fold SKIPS effect-less nodes (stats unchanged); `wildheart_roar`/`wildheart_endurance` present, effect-less, correct prereqs/limits; `refundUnknownTalents` keeps known + the M6 nodes survive a round-trip; `TALENT_LIMITS` includes them.
2. `beastTransform.test.js`: `formDurationFor(0)===14`, `formDurationFor(3)===23`; `decideTransform` enter honors `ctx.formDurationSec` (longer activeUntil) and falls back to 14 without it (existing tests stay green).
3. Wire Components; verify MYSELF (unit + build + visual 13/13 — the talent gate doesn't change capture: the roar never fires in capture). Adversarial review → fix → merge → 4-piece → flush.

## Invariants
- **Effect-less-node contract:** the fold tolerates + skips; levers read at-site. A future signature-id rename would drop the unlock via `refundUnknownTalents` unless a remap is added — flag the seam (not needed now).
- **Shared-module edit:** `foldTalentEffects` is used by all 4 Aspects — the fix is additive (a guard), behavior-preserving for effect-ful nodes.
- **Backward-compat:** `decideTransform` without `ctx.formDurationSec` is byte-identical (fallback 14).
