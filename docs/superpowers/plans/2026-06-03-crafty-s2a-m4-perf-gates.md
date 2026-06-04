# S2-A-M4 — Perf + widen-the-gates

> **Status:** PLAN (2026-06-03). Branch `s2a-m4a-perf-config` off `main` for M4a.
> **Method:** subagent-driven (Opus, TDD where logic exists; spec/quality review); NO Claude footer; verify MYSELF; **visual 12/12 must hold (M4a touches only low/med tiers + capture-guarded recovery → the forced-HIGH baselines are unchanged).**

## Decomposition

- **M4a (build now) — perf-config wiring + tier recovery.** AUTO-VERIFIABLE: wires the dead tier levers + adds tier recovery; the 12 forced-high baselines are unaffected (the changes apply at low/med, and recovery is capture-guarded). Unit + 12/12 visual.
- **M4b (after — HUMAN REVIEW) — forced-med/low visual baselines.** Adds med/low forced-capture states. NEW baselines DEFINE "correct", so they CANNOT be auto-blessed — I render + eyeball them, then surface to Kevin to ratify. This is the real "widen the gates" deliverable + its review artifact.
- **Perf NUMBER = S3.** A real FPS/frame-budget figure needs real-device profiling (S1-audit's #1 S3 item). M4 wires the config + recovery that ENABLE tier-based scaling; the measured number is S3. Do NOT fabricate a perf number.

## Reality grounding (verified)

- **`renderDistance` (TIERS in `src/render/quality.js:20-22`, low 2 / med 3 / high 4) is DEAD** — grep confirms ZERO consumers of `.renderDistance` outside quality.js. The chunk load/cull radius is currently a hardcoded constant somewhere in the terrain/chunk system, NOT driven by tier → low-end devices render the same distance as high (the perf lever is inert).
- **`weather` (TIERS, low 0.25 / med 0.6 / high 1.0) is DEAD** — grep confirms ZERO consumers of `q.weather`. `WeatherSystem` (GameScene.jsx) renders weather particles at a fixed density regardless of tier.
- **`onIncline` is ABSENT** — `PerformanceMonitor` (GameScene.jsx:757, capture-guarded `!isCaptureMode`) has only `onDecline` (high→med→low). So a transient FPS dip ratchets the tier DOWN permanently; it never recovers even when FPS rebounds (S1-audit residue).

## M4a tasks (TDD red-first where logic exists; visual 12/12 must hold)

### T1 — Wire `renderDistance` to the chunk radius
- FIND the chunk load/cull radius constant (terrain/chunk system — likely `src/world/` or the chunk manager; verify it's the ACTUAL render-distance gate, not a mining reach or similar — the M3c stale-grounding lesson: confirm before wiring). Make it read `TIERS[qualityTier].renderDistance` (transiently via `getState`, NOT a per-frame subscription — Game-Loop-Isolation).
- **Capture-safety:** capture forces `high` (renderDistance 4) — if 4 == the current hardcoded radius, the high-tier baselines are byte-identical (no change). VERIFY: if the current hardcoded radius differs from high's 4, either set high's renderDistance to match the current radius (so high is unchanged) OR confirm the gate still passes. visual 12/12 NO re-baseline is the gate.
- Unit/static test: the chunk radius derives from `TIERS[...].renderDistance` (locks the wiring).

### T2 — Wire `q.weather` to WeatherSystem density
- Scale `WeatherSystem`'s particle/precipitation count by `TIERS[qualityTier].weather` (low 0.25 ... high 1.0). Transient read.
- **Capture-safety:** high = 1.0 (full density) = unchanged → high-tier weather frames byte-identical. (Weather may not even be in the 12 capture states; verify 12/12 regardless.)
- Test: weather density derives from the tier multiplier.

### T3 — `onIncline` tier recovery (fix the one-way ratchet)
- Add `onIncline` to `PerformanceMonitor` mirroring `onDecline`: low→med→high on sustained FPS headroom. Use drei `PerformanceMonitor`'s built-in hysteresis (`flipflops`/`factor`/bounds) to prevent oscillation; conservative defaults (THRESHOLD tuning = S3 real-device). Keep it inside the existing `!isCaptureMode` guard (capture stays forced-high, untouched).
- Test: a logic/static gate that `onIncline` exists + steps low→med→high (symmetric to onDecline). The S1-audit "tier never recovers" residue is closed at the LOGIC level (calibration = S3).

### M4a verify
- `npm run test:unit` green · `npm run build` clean · `npm run test:visual` **12/12 NO re-baseline** (all three changes are low/med-tier or capture-guarded; forced-high baselines unchanged — if any drift, a change leaked into the high path → STOP).

## M4b (separate, HUMAN-REVIEW — do NOT auto-bless)
- Add forced-med + forced-low capture variants of the key in-world states (e.g. explore-day at med + low) via the `setQualityTier` dev hook + new capture entries. Generate the baselines, then **I render them at review-DPI + eyeball for correctness** (not-broken, tier-appropriate) and **surface to Kevin to ratify** before they become canonical gate baselines. Catches tier-specific render regressions the forced-high gate can't see. (Defer until M4a merged + Kevin available for the baseline eyeball.)

## Definition of done (M4a)
- `renderDistance` + `weather` tier levers WIRED (low-end actually renders less); `onIncline` recovery added (ratchet no longer one-way).
- unit green · build clean · `test:visual` 12/12 NO re-baseline.
- Review (spec/quality) no BLOCKING unaddressed; merged to `main`. M4b + the S3 perf-number noted in the resume + review-batch.

## Post-review (2026-06-03)

M4a built (3 commits): T1 `renderDistance` (the chunk radius was a hardcoded `RENDER_DISTANCE=4` in `Terrain.jsx`, now derives from `TIERS[tier].renderDistance`; high==4==legacy so the forced-high capture is byte-identical; low(2)/med(3) now render fewer chunks), T2 `weather` density scales by `TIERS[tier].weather`, T3 `onIncline` recovery added. `test:unit` **529** (+10 perf-config gates) · build clean · `test:visual` **12/12 NO re-baseline**. Capture parity proven structurally (high-tier no-ops + the monitor inside `!isCaptureMode`).

**2-lens review = MINOR ×3, ALL inside `!isCaptureMode` (cannot touch the gate) + ALL genuinely S3 (real-device — not CI-validatable). Fixed the honesty issue; deferred the device-tuning honestly (no overclaim):**
- **(fixed) misleading comment** — my `flipflops` comment wrongly said "reversals"; drei counts TOTAL incline+decline transitions, and there's no `onFallback`, so a normal warm-up climb + a dip can hit fallback and freeze adaptation. Corrected the comment to be accurate + flag all 3 residues.
- **(→ S3) `flipflops=3` too low** — a 2-step warm-up burns most of the budget; re-tune on real devices.
- **(→ S3) no `onFallback`** — a flipflop-exhausted device strands at its last tier (one-way ratchet can re-emerge post-fallback); S3 add an `onFallback` pinning a safe-middle tier.
- **(→ S3) weather is mount-time only** — `WeatherSystem` reads tier in a `useMemo([])`, so it doesn't re-thin/restore on runtime tier change (T1 chunk-radius DOES, per-tick). Asymmetric; S3 (touches capture-sensitive weather/firefly seeding — defer to where it can be device-validated).

**Honest scope:** `onIncline` ADDS recovery (the ratchet is no longer strictly one-way on the happy path) but is **not yet bulletproof** — the fallback-freeze + weather-mount-time residues are real and deferred to S3 real-device tuning (where the perf NUMBER also lives). M4a's durable win = the two dead perf levers are now wired (effective at load/mount, the dominant case). **M4b (forced-med/low baselines) still pending — human-review.**
