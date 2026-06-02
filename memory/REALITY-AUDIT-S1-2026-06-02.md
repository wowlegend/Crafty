# S1 Reality Audit — stream-boundary sweep (2026-06-02)

> The S1→S2 "stream-boundary reality audit" the QA cadence prescribes (spec §7). Ran a 10-dimension parallel audit of everything S1 introduced (S1-A foundation · S1-B render · S1-C UI · S1-D signatures), targeting the **gate blind-spot classes** the mob-outline bug exposed, then **adversarially verified every high/critical finding** (an independent skeptic defaulting to false-positive). 26 agents, 80 raw findings, 16 high/critical verified → **4 confirmed · 3 false-positive · 9 severity-adjusted**.
>
> **Method note (eat-our-own-dogfood):** the verify pass paid for itself — it caught 3 plausible-but-wrong findings and one **stale-fact correction I had propagated** (see "Correction" below). Negative/clean results were recorded too (save-key parsing safe, normalizer idempotent, hitstop resolved, mascot canvas clean) so the ledger isn't all-alarm.

## Headline verdict
S1 is **solid where the per-task gates could see** (render look, UI system, the locked signatures at the captured tier) but has a **coherent cluster of real gaps in exactly the classes the forced-high visual gate is blind to**: (1) the **save system is broadly incomplete** (progression + world state silently lost on reload), (2) **two of the heaviest perf levers are dead config** (low tier doesn't actually shed them), (3) the **boss-obsidian signature atmosphere never fires in real gameplay**, and (4) a **tier-calibration cluster** (real but mostly deferred to S3). None are crashes; the failure mode is silent loss / dead config / a signature that never triggers — the same shape as the outline bug. **Most fix-now items are doc-accuracy corrections; the substantive code work folds cleanly into S2-A (which is the foundation/hardening phase) and S3.**

---

## ⚠️ Correction (verify-before-assert lapse this session — flagged honestly)
Earlier this session I asserted "Chrome clamps `navigator.deviceMemory` to ≤8, so `selectTier`'s `>=12` high branch is unreachable" and put it in the docs + KEVIN-REVIEW-BATCH as an S3 flag. **That was an over-assertion from a stale WebSearch result, contradicting MDN — which I had also fetched this session and which lists possible values `2, 4, 8, 16, 32`.** Multiple independent audit verifiers re-confirmed (MDN + W3C + Chrome Platform Status #6330376953921536, Jan 2026): **modern desktop Chrome now reports 16/32**, so `>=12` (the `16` bucket) **IS reachable** on a 16GB+/8-core desktop — exactly Crafty's pointer-lock-gated mouse+keyboard audience. **Corrected truth:** `high` is reachable on capable modern desktop Chrome; **Safari/Firefox don't implement the API → undefined → start at `low`**; the one-way `onDecline` ratchet (no `onIncline`) is real (a transient FPS dip doesn't recover within a session). Net disposition unchanged — **tier calibration is S3 + needs real-device profiling** — but the "high is unreachable / baselines match no real user" framing was wrong and is corrected across the docs. *Lesson: don't over-weight a single WebSearch over the T1 MDN value-list.*

---

## ✅ Fix-now (doc-accuracy only — corrected this pass; no code)
1. **`TIERS.outlineWorldEdge` is fictional.** The flag exists + docs claim forced-high baselines "show world-edge outlines," but **the feature was never built** (zero readers of `q.outlineWorldEdge`; the only block-outline is the cursor target wireframe). → CHANGELOG/ACTIVE_PLAN claim corrected; the dead flag deletion folds into S2-A.
2. **The stale deviceMemory/high-unreachable claim** (see Correction) → corrected in CHANGELOG + ACTIVE_PLAN + KEVIN-REVIEW-BATCH to the version-dependent / profile-in-S3 framing.
3. **`ARCHITECTURE.md` says `charOutline` is "med+"** — stale after the tier-independence fix → it's now all-tiers.
4. (Code-comment over-claims — `quality.js:27` "can incline up", `capture.mjs:215` stale title-mascot note, Bloom "threshold 0.85 emissive-only", "0ms CPU" particles — folded into S2-A as trivial comment corrections.)

## 🔧 Fold-into-S2-A (the audit *sharpened* the foundation plan — now explicit, evidence-backed scope)
- **A3 → a COMPREHENSIVE save fix (was "fix the save bug").** Confirmed broken: `saveGame`/`loadWorldData` serialize **none** of level/XP/totalXP (component-local `useState`), attributes, equipment, talents/spellLevels, **chest inventories** (Map never serialized), or maxHealth/maxMana (derived); position is hardcoded `{0,18,0}`; and **`saveGame` has no live caller** (the save *trigger* is unbuilt — only load is wired). → A3 becomes: a complete, **local-first, live-triggered autosave** covering all progression + world state (incl. chests) + recompute derived caps on load. *(3 of these were the audit's confirmed/high findings.)*
- **NEW S2-A item — dead tier config = unbounded perf (serves A9, the perf number).** `TIERS.renderDistance` is **dead** (Terrain hardcodes `RENDER_DISTANCE=4` → low renders the same 81 chunks as high — the heaviest lever is a no-op) and `TIERS.weather` is **dead** (WeatherSystem hardcodes 400 rain/200 snow/30 firefly, ignores tier, **allocates a `new THREE.Object3D()` every frame**, iterates all 630 instances unconditionally, and fires up to ~600 Rapier raycasts/frame during a storm). → wire both to the tier + hoist the alloc + early-out when clear. **You can't get a meaningful low-tier FPS until low actually sheds these.**
- **A5 (stakes loop) → bridge `dangerLevel`.** Confirmed: the **boss-obsidian mood never fires in prod** — nothing in gameplay writes `dangerLevel` (only DEV test-hooks, all set 0); the boss exists (`isBossActive`) but isn't bridged. → the night-SIEGE / boss-active / HP-pressure should drive `setDangerLevel(1..2)` → the obsidian atmosphere. Cheap, and it ties the signature atmosphere *to the core loop*.
- **Widen the gates (the cadence's Layer-4, now concrete).** Add **forced-med + forced-low visual baselines** (the suite only captures forced-high) + a **tier-transition invariant test** (drive high→med→low, assert signatures survive) + **"config-key is actually consumed" static gates** (so a dead key like `renderDistance` can't pass a monotonicity test while being unwired). Closes the exact blind spot that hid the outline bug.
- **Medium fixes:** BloomSpikeDriver/MoodGradeDriver cache a stale effect-ref after a tier downgrade (re-resolve per frame); damage-number CanvasTexture leaks on unmount-before-expiry (dispose-on-unmount); HUD compass markers + NPC trade-recipe colors use raw-Tailwind palette (migrate to tokens + extend the single-UI-language gate to ban raw tailwind color utilities on shipped surfaces).

## ⏭️ Defer-S3 (engine/perf — needs real-device profiling; don't retune blind)
- **Tier calibration (deduped cluster):** recalibrate `selectTier` thresholds + treat `deviceMemory===undefined` as mid (not 0) so Safari/FF aren't forced to low; **add an `onIncline`** recovery (with hysteresis) so transient dips don't permanently strip fidelity; decide per-signature what should be tier-independent (like `charOutline` now is) vs progressive-enhancement (`charRim`).
- **`shadowMapSize` live-downgrade is a no-op** (only applies at the mount tier — needs a shadow.map dispose on change).
- **`GameMethods.js` "never store fns in Zustand" violation** (S1-D added a new reader) + dead store setters + dead ECS queries → de-monolith cleanup.
- **Main-thread 81-raycast/mob heightGrid build** (throttle / move to worker).
- **Bundle 4.24MB un-split** (vendor-chunk + dynamic-import postprocessing; add a gzip-budget CI gate).
- **qualityTier reactive re-render storm** on the downgrade (read transiently).

## ❌ False-positives caught by the verify pass (3) — recorded so they aren't re-litigated
1. *"Visual gate is structurally blind to post-downgrade states"* → the cross-tier signature invariant is covered by a **dedicated static config gate** (`character-render-gates.test.js:62-66` asserts `charOutline===true` at every tier) — the pixel gate forcing high is deterministic-by-design.
2. *"PerformanceMonitor downgrade kills the whole effect stack"* → that's the **intended tier-shedding** (the perf budget is deliberately recovered from ao/godRays/shadows/dpr at low); the cheap outline was made tier-independent precisely because it shouldn't be a casualty.
3. *"Forced-high baselines match no real user"* → **false** (high IS reachable on modern desktop Chrome; the forced tier is deterministic-by-design). Residual low: med/low have no pixel baseline → the "widen the gates" item above.

## ✓ Clean / wontfix (negative results — confirmed fine)
Save-key negative-coordinate parsing safe · normalizer genuinely idempotent · S1 state-pollution clean (transient flags stay out of saves) · busy-wait hitstop resolved · mascot lazy-canvas mount/unmount clean · explore-night flake resolved · zh-body font is the real Alibaba PuHuiTi · hit-flash `name!=="eye"` guard redundant-but-harmless · fog ShaderChunk global patch acceptable.

---

## How this changes the S2-A plan
The audit **validated foundation-first** (S1 has real foundation gaps that S2 would otherwise build on) and made S2-A precise: **A3** is now a comprehensive save spec, **A9** gains the dead-tier-config + weather-perf prerequisite (low must actually shed load before an FPS number means anything), **A5** gains the `dangerLevel` bridge, and the **QA cadence's "widen the gates"** becomes a concrete S2-A deliverable (forced-med/low baselines + tier-transition invariant). The `writing-plans` pass for S2-A should fold these in by reference to this audit.

**Net:** no S1 blocker that must be hot-fixed before S2 *design* is approved; the substantive items are now explicit S2-A/S3 scope rather than latent surprises. Foundation-first + this audit = building S2 on a known, not assumed, foundation.
