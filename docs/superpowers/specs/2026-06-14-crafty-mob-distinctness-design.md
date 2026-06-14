# Crafty — Mob Bestiary Distinctness (silhouette features) — design of record

> **Status (2026-06-14): ✅ SHIPPED (loop iters 169-171, ultracode self-gate per charter §4/§5).** T1 pure
> specs (`game/mobFeatures.js`, iter 169) → T2 `mob-bestiary` capture fixture (iter 170, gate 18→19) → T3
> render-wiring + in-world eyeball + per-type taste-tune (iter 171). All 5 featured types now read by
> silhouette (skeleton ribs / hound ears+tail / brute shoulders+crown / skitterling antennae / cow horns).
> T4 (color accents / zombie head-tilt) deferred as optional — the silhouette read landed without it.
> *(Historical design-gate text below.)*
>
> **Status (2026-06-14): DESIGN-GATE (loop iter 169, ultracode self-gate per charter §4/§5).** Authored
> directly (the roster + renderer are small + held in context — no Workflow needed). Build is the
> ranked-T1..Tn ladder below; each T re-validates taste IN-WORLD before the next. This is the §6 "mob
> bestiary distinctness (pull earlier if cheap)" item, pulled forward because mobs are the constant-combat
> subjects and the current models are the exact "generic-voxel" look the master plan §1 forbids.

## 0. Goal-frame (before any build)

- **L1 Goal:** every mob type reads as a DISTINCT creature at a glance — by SILHOUETTE, not just by color +
  box-proportion. Measurable: a fresh player can tell a brute from a hound from a skitterling from across
  the arena, in one frame, before reading any color. Today they cannot (all are box-body + box-head + box-legs;
  only dimensions + tint + leg-count vary — see `src/game/mobTypes.js` + `src/render/MobModel.jsx`).
- **L2 Adversarial (what could go wrong if "achieved"):** (a) **AI-slop / kitchen-sink** — bolting random
  horns/wings on box-mobs reads cheap + violates coherence pillar P-one-art-direction. Mitigation: features are
  the SAME bold-flat box/wedge vocabulary as the body (no organic meshes, no new materials), each a deliberate
  silhouette READ tied to the creature's role. (b) **Capture-nondeterminism** — animated features (ear-twitch,
  tail-wag) would flake the gate. Mitigation: features are STATIC geometry (no per-frame anim); they inherit the
  body's existing capture-frozen transform. (c) **Perf** — +N meshes per mob × many mobs. Mitigation: 1–3 extra
  boxes per type, gated by `q.charOutline`-tier like the body; brutes are rare (weight 0.25), skitterlings small.
  (d) **Taste regression on a SHIPPED look** — the current toon mob is clean. Mitigation: per-T in-world eyeball;
  revert any feature that doesn't clearly improve the read.
- **L3 Metric / verify:** a NEW `mob-bestiary` capture fixture (a row of the distinct types at a studio angle,
  like `loot-showcase`) is the gate + the eyeball surface. A type's feature SHIPS only if, in that frame, its
  silhouette is unmistakable with the color removed (mentally). `character-closeup` (the zombie) re-baselines
  for the zombie's feature; all other current frames stay byte-identical (mobs are capture-suppressed elsewhere).
- **L4 Strategy (derived from the metric, not pattern-matched):** add an OPTIONAL per-type `feature` descriptor
  to `MOB_TYPES` consumed by a new pure `mobFeatures(type, dims)` → a list of `{box:[w,h,d], pos:[x,y,z], color?}`
  accessory specs; `MobModel` maps them to `<mesh>`es (same `MobToonMaterial` + outline as the body). Pure data +
  a pure mapper = unit-lockable; the render is a thin map. No new art direction, no new material, no animation.

## 1. The bold-flat feature vocabulary (reference-lock)

All features are axis-aligned boxes/wedges in the body's local space, same toon material + inverted-hull outline
as the body (so they read as ONE creature, not glued-on props). Reference: chunky stylized-voxel creatures
(Hytale/Trove-adjacent) where a SILHOUETTE cue (horns, hunch, ears, tail, antennae) carries the species read at
low poly. NOT organic, NOT detailed — one or two deliberate boxes that change the OUTLINE.

## 2. Per-type feature map (the design decisions — reversible)

| Type | Role | Feature(s) → silhouette read |
|---|---|---|
| `moss_brute` | rare heavy tank | **hunched shoulder slabs** (2 wide boxes above the body top, angled out) + a **head moss-crown** (1 darker box) → a looming, top-heavy BRUTE |
| `duskhound` | fast quad hunter | **pointed ears** (2 small wedges on the head top) + a **tail** (1 box angled down-back) → unmistakably a HOUND |
| `skitterling` | tiny swarm | **antennae** (2 thin tall boxes on the head front-top) → an INSECT/skitterer |
| `skeleton` | fast ranged-ish | **rib slats** (2–3 thin horizontal boxes across the torso front) → a bony SKELETON |
| `cow` | passive herd | **stubby horns** (2 small boxes on head sides) → livestock |
| `spider` | low 8-leg | (legMode already distinct) **+ no body feature** — its leg-sprawl silhouette is already unique |
| `zombie` | baseline hostile | **slumped head tilt** (head pos nudged forward/down — a transform tweak, not a mesh) → a shambling read; minimal |
| `pig` / `villager` | passive | no feature (pig = the round body reads; villager intentionally plain humanoid) |

Each row is a loop taste-decision (charter §5); any reads wrong in-world → drop it (KEVIN-REVIEW note).

## 3. Build ladder (TDD + in-world taste gate per T)

- **T1 (capture-safe, pure):** `src/game/mobFeatures.js` — `mobFeatures(type, dims)` returns the accessory-box
  specs (pure, derives positions from the body dims so features scale with the type's size). Characterization
  tests (each featured type returns its expected boxes; unfeatured types return `[]`). NO render wiring yet →
  capture byte-identical → 18/18. (Ships the design as locked data.)
- **T2:** add the `mob-bestiary` capture fixture (a `mobBestiary` test hook spawning one of each distinct type in
  a studio row + a capture.mjs state, ordered BEFORE the boss/spell/beast fixtures per the iter-164 leak lesson).
  Baseline it (no features yet) — the eyeball surface.
- **T3:** wire `MobModel` to render `mobFeatures(...)` boxes (gated by `q.charOutline` tier like the body).
  Re-capture → eyeball the `mob-bestiary` frame: each type's silhouette unmistakable? Tune per-type. Re-baseline
  `mob-bestiary` + `character-closeup` (zombie tweak). All other frames byte-identical.
- **T4 (optional polish):** per-feature color accents (moss-crown darker green, ribs bone-white) if the eyeball
  wants more read; else skip.

## 4. Capture / perf / coherence

- **Capture:** features are static geometry on the body group → inherit the body's capture-frozen transform →
  deterministic. Only `mob-bestiary` (new) + `character-closeup` re-baseline; mobs are suppressed in all other
  capture states, so those stay byte-identical (the iter-163/165 gating discipline).
- **Perf:** +1–3 boxes/type, tier-gated; rare/small for the heavy ones. States its frame-cost story: negligible
  (a handful of extra static boxes; mobs are already instanced-light).
- **Coherence (P0–P5):** same box vocabulary + toon material + outline as the body → ONE art direction, no
  kitchen-sink. Features change the SILHOUETTE (the legible cue), not the surface treatment.

## 5. Kevin batch

The per-type feature map (§2) is loop-decided on the in-world eyeball; the `mob-bestiary` before/after frame is
the KEVIN-REVIEW surface (flag any species read that's wrong). No physically-Kevin items (no spend/account/device).
